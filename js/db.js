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

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
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
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
      request.onblocked = function () {
        reject(new Error('Database is blocked by another open copy of the app'));
      };
    });
    return dbPromise;
  }

  function tx(storeName, mode, work) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction(storeName, mode);
        var store = transaction.objectStore(storeName);
        var result;
        // Resolve on commit, not on the request: a write is durable only then.
        transaction.oncomplete = function () { resolve(result); };
        transaction.onerror = function () { reject(transaction.error); };
        transaction.onabort = function () { reject(transaction.error); };
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

  SA.db = {
    add: function (record) {
      return tx(RECORDS, 'readwrite', function (store, set) {
        var request = store.add(record);
        request.onsuccess = function () { record.id = request.result; set(record); };
      });
    },

    remove: function (id) {
      return tx(RECORDS, 'readwrite', function (store) { store.delete(id); });
    },

    removeMany: function (ids) {
      return tx(RECORDS, 'readwrite', function (store) {
        ids.forEach(function (id) { store.delete(id); });
      });
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
