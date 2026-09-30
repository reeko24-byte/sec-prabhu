/* The verification seal -- what makes an edited timestamp detectable.
 *
 * Taken from the WT app unchanged in method; only the facts it binds are now
 * handed in by each team's module instead of being WT's fixed list.
 *
 * Before anything is drawn on a photograph, the raw bytes that came off the
 * camera are hashed together with the facts of the report. The first 48 bits
 * are printed in the photo's corner as a short code and the code is written
 * into the spreadsheet beside the time the app recorded. Repainting the time on
 * the picture does not change the code, so the edit shows up as a disagreement
 * between the picture and the register.
 *
 * It is NOT a signature: the phone holds no secret. It detects a photograph
 * altered after the app wrote it; forging a fresh report end to end needs a
 * server, and there is none.
 */

(function (SA) {

  var CODE_HEX_CHARS = 12;

  function hex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].toString(16);
      out += h.length === 1 ? '0' + h : h;
    }
    return out;
  }

  function bytesOf(blob) {
    if (blob.arrayBuffer) {
      return blob.arrayBuffer().then(function (buffer) { return new Uint8Array(buffer); });
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(new Uint8Array(reader.result)); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsArrayBuffer(blob);
    });
  }

  /* The fallback for a browser with no WebCrypto (plain http only). Records
     made this way say so on the photo and in the sheet. */
  function weakDigest(bytes) {
    var lanes = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
    for (var i = 0; i < bytes.length; i++) {
      var lane = i & 3;
      lanes[lane] = (lanes[lane] ^ bytes[i]) >>> 0;
      lanes[lane] = (((lanes[lane] << 24) + (lanes[lane] << 8) +
        (lanes[lane] << 7) + (lanes[lane] << 4) + (lanes[lane] << 1) +
        lanes[lane]) >>> 0);
      lanes[(lane + 1) & 3] = (lanes[(lane + 1) & 3] ^ (lanes[lane] >>> 13)) >>> 0;
    }
    var out = new Uint8Array(16);
    for (var l = 0; l < 4; l++) {
      out[l * 4] = (lanes[l] >>> 24) & 0xFF;
      out[l * 4 + 1] = (lanes[l] >>> 16) & 0xFF;
      out[l * 4 + 2] = (lanes[l] >>> 8) & 0xFF;
      out[l * 4 + 3] = lanes[l] & 0xFF;
    }
    return out;
  }

  SA.seal = {

    /**
     * Hashes one capture against a fixed list of facts.
     *
     * `facts` is an array of strings in a fixed order; the module decides what
     * goes in it. Adding to the end later is safe, reordering is not.
     *
     * Resolves to { digest, code, algo }. Never rejects: a seal that could not
     * be computed comes back empty and the photograph simply has no corner block.
     */
    compute: function (file, facts) {
      var line = (facts || []).join('|');

      return bytesOf(file).then(function (photoBytes) {
        var factBytes = new TextEncoder().encode(line + ' ');
        var payload = new Uint8Array(factBytes.length + photoBytes.length);
        payload.set(factBytes, 0);
        payload.set(photoBytes, factBytes.length);

        var subtle = window.crypto && (window.crypto.subtle || window.crypto.webkitSubtle);
        if (subtle && subtle.digest) {
          return subtle.digest('SHA-256', payload).then(function (buffer) {
            return { bytes: new Uint8Array(buffer), algo: 'SHA-256' };
          }).catch(function () {
            return { bytes: weakDigest(payload), algo: 'BASIC' };
          });
        }
        return { bytes: weakDigest(payload), algo: 'BASIC' };
      }).then(function (result) {
        var digest = hex(result.bytes);
        return { digest: digest, code: SA.seal.format(digest), algo: result.algo };
      }).catch(function () {
        return { digest: '', code: '', algo: '' };
      });
    },

    /** "a31f90c42e7b..." -> "A31F-90C4-2E7B" */
    format: function (digest) {
      if (!digest) return '';
      return String(digest).slice(0, CODE_HEX_CHARS).toUpperCase()
        .replace(/(.{4})(?=.)/g, '$1-');
    },

    /** "SEC-VERIFY", or "SEC-BASIC" when WebCrypto was withheld. */
    labelFor: function (algo, prefix) {
      return (prefix || 'SA') + (algo === 'SHA-256' ? '-VERIFY' : '-BASIC');
    }
  };
}(window.SA));
