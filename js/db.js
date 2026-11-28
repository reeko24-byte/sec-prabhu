/* IndexedDB -- every report the phone has written, photographs included.
 *
 * One store for all teams. Each record carries `team` ('security', later
 * 'patrol' and 'walkthrough') and `kind` ('check', 'incident', 'shift' for
 * Security), so one phone can hold more than one kind without them mixing.
 *
 * Two marks, and they mean different things:
 *   sentAt      the report went to WhatsApp
 *   exportedAt  it was included in a spreadsheet
 */

(function (SA) {
  var DB_NAME = 'superapp-laporan';
  /* 2: adds the bySession index, so the main screen reads one shift's
     reports instead of every report the phone has ever stored. */
  var DB_VERSION = 2;
  var RECORDS = 'records';
  var PREFS = 'prefs';

  var dbPromise = null;

  /* The connection can be closed under the app: Chrome closes it when the phone is short of storage or the
     site's data is cleared, and another copy of the app opening a newer version asks it to close. It used to be
     kept forever, so every save after that failed ("The database connection is closing", WT TIM 6, 28 Nov
     2026) until the app was reopened. Now a closed connection is forgotten and the next call opens a new one. */
  function forget(db) {
    if (dbPromise && dbPromise.db === db) dbPromise = null;
  }

  function open() {
    if (dbPromise) return dbPromise;
    var promise = new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        var store = db.objectStoreNames.contains(RECORDS)
          ? event.target.transaction.objectStore(RECORDS)
          : db.createObjectStore(RECORDS, { keyPath: 'id', autoIncrement: true });
        if (!store.indexNames.contains('byDate')) {
          store.createIndex('byDate', 'date', { unique: false });
        }
        if (!store.indexNames.contains('bySession')) {
          store.createIndex('bySession', 'sessionId', { unique: false });
        }
        if (!db.objectStoreNames.contains(PREFS)) {
          db.createObjectStore(PREFS, { keyPath: 'key' });
        }
      };
      request.onsuccess = function () {
        var db = request.result;
        // Given up on (blocked) while it waited: never left open beside the next connection
        if (dbPromise !== promise) { db.close(); return; }
        promise.db = db;
        db.onclose = function () { forget(db); };
        db.onversionchange = function () { db.close(); forget(db); };
        resolve(db);
      };
      // A failed open is not kept either: the next call tries again.
      request.onerror = function () { dbPromise = null; reject(request.error); };
      request.onblocked = function () {
        if (dbPromise === promise) dbPromise = null;
        reject(new Error('Database is blocked by another open copy of the app'));
      };
    });
    dbPromise = promise;
    return promise;
  }

  function tx(storeName, mode, work, retried) {
    return open().then(function (db) {
      var transaction;
      try {
        transaction = db.transaction(storeName, mode);
      } catch (e) {
        // Closed since it was opened (onclose comes late, or not at all): open again, once.
        if (retried || !e || e.name !== 'InvalidStateError') throw e;
        forget(db);
        return tx(storeName, mode, work, true);
      }
      return new Promise(function (resolve, reject) {
        var store = transaction.objectStore(storeName);
        var result;
        // Resolve on commit, not on the request: a write is durable only then.
        transaction.oncomplete = function () { resolve(result); };
        // A failed request aborts its transaction, and onabort below decides: retry or reject. (Rejecting here
        // came first, with an empty error, when the connection closed mid-write.)
        transaction.onabort = function () {
          // Aborted with no error of its own: the connection was closed under it (Chrome closing the
          // database mid-write). Nothing was committed, so it runs once more on a new connection.
          var error = transaction.error;
          if (!retried && (!error || error.name === 'AbortError')) {
            forget(db);
            resolve(tx(storeName, mode, work, true));
            return;
          }
          reject(error || new Error('Transaction aborted'));
        };
        result = work(store, function (value) { result = value; });
      });
    });
  }

  function stamp(ids, field, when) {
    return tx(RECORDS, 'readwrite', function (store) {
      ids.forEach(function (id) {
        var request = store.get(id);
        request.onsuccess = function () {
          var record = request.result;
          if (record && !record[field]) {
            record[field] = when;
            store.put(record);
          }
        };
      });
    });
  }

  /* Told whenever reports are added or removed (the version line's count). */
  var listeners = [];
  function changed(result) {
    listeners.forEach(function (fn) { fn(); });
    return result;
  }

  SA.db = {
    onChange: function (fn) { listeners.push(fn); },

    add: function (record) {
      return tx(RECORDS, 'readwrite', function (store, set) {
        var request = store.add(record);
        request.onsuccess = function () { record.id = request.result; set(record); };
      }).then(changed);
    },

    remove: function (id) {
      return tx(RECORDS, 'readwrite', function (store) { store.delete(id); }).then(changed);
    },

    removeMany: function (ids) {
      return tx(RECORDS, 'readwrite', function (store) {
        ids.forEach(function (id) { store.delete(id); });
      }).then(changed);
    },

    /** Every record, oldest first. */
    all: function () {
      return tx(RECORDS, 'readonly', function (store, set) {
        var request = store.getAll();
        request.onsuccess = function () {
          set(request.result.sort(function (a, b) { return a.id - b.id; }));
        };
      });
    },

    /** How many reports this copy of the app holds (the version line says it). */
    count: function () {
      return tx(RECORDS, 'readonly', function (store, set) {
        var request = store.count();
        request.onsuccess = function () { set(request.result); };
      });
    },

    /** One shift's reports, oldest first. */
    bySession: function (sessionId) {
      return tx(RECORDS, 'readonly', function (store, set) {
        var request = store.index('bySession').getAll(sessionId);
        request.onsuccess = function () {
          set(request.result.sort(function (a, b) { return a.id - b.id; }));
        };
      });
    },

    markSent: function (ids, when) { return stamp(ids, 'sentAt', when); },
    markExported: function (ids, when) { return stamp(ids, 'exportedAt', when); },
    /** An Open finding closed later by an UPDATE TEMUAN report (findings.js). */
    markClosed: function (id, when) { return stamp([id], 'closedAt', when); },

    getPref: function (key, fallback) {
      return tx(PREFS, 'readonly', function (store, set) {
        var request = store.get(key);
        request.onsuccess = function () {
          set(request.result ? request.result.value : fallback);
        };
      });
    },

    setPref: function (key, value) {
      return tx(PREFS, 'readwrite', function (store) {
        store.put({ key: key, value: value });
      });
    }
  };
}(window.SA));
