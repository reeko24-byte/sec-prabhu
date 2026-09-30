/* Building one Excel sheet from stored reports -- shared by every team.
 *
 * A sheet is: a "No" column, the team's own fixed columns, then the photo
 * columns, then Waktu / Kode / Lat / Long for each photo. The layout around it
 * (logo, bands, info row) is xlsx.js's; the team supplies titles and colours.
 */

(function (SA) {

  SA.sheets = {

    /** A column: header, width, type ('text' | 'center' | 'number'), and the
        field name or function that reads its value off a record. */
    col: function (header, width, type, value) {
      return {
        header: header, width: width, type: type,
        value: typeof value === 'function' ? value
          : function (r) { return r[value] == null ? '' : r[value]; }
      };
    },

    /**
     * One sheet.
     *   options.label       record -> short name, for each picture's description
     *   options.freeze      how many fixed columns stay put when scrolling
     *   options.photoNames  fixed photo subjects (Access Control); otherwise the
     *                       busiest row decides how many photo columns there are
     *   options.shortNames  shorter subjects for the narrow Waktu/Kode/Lat/Long
     *   options.minPhotos   at least this many photo columns
     */
    build: function (name, records, fixed, options) {
      options = options || {};
      var photoNames = options.photoNames;
      var shortNames = options.shortNames;
      var slots = photoNames ? photoNames.length : records.reduce(function (most, r) {
        return Math.max(most, (r.photos || []).length);
      }, options.minPhotos || 1);
      function photoName(i) { return photoNames ? photoNames[i] : String(i + 1); }
      function shortName(i) { return shortNames ? shortNames[i] : photoName(i); }

      var columns = [{ header: 'No', width: 5, type: 'index' }].concat(fixed);
      var firstPhoto = columns.length;
      var i;
      for (i = 0; i < slots; i++) columns.push({ header: 'Foto ' + photoName(i), type: 'photo' });
      for (i = 0; i < slots; i++) {
        columns.push({ header: 'Waktu Foto ' + shortName(i), width: 19, type: 'center' });
        columns.push({ header: 'Kode Foto ' + shortName(i), width: 17, type: 'center' });
        columns.push({ header: 'Lat ' + shortName(i), width: 12, type: 'number' });
        columns.push({ header: 'Long ' + shortName(i), width: 12, type: 'number' });
      }

      var rows = records.map(function (record, rowIndex) {
        var cells = [rowIndex + 1].concat(fixed.map(function (c) { return c.value(record); }));
        for (var s = 0; s < slots; s++) cells.push('');
        var pictures = [];
        for (var p = 0; p < slots; p++) {
          var photo = (record.photos || [])[p];
          cells.push(photo ? photo.takenAt || '' : '');
          cells.push(photo ? photo.sealCode || '' : '');
          cells.push(photo ? photo.latitude : null);
          cells.push(photo ? photo.longitude : null);
          if (photo && photo.blob) {
            pictures.push({
              column: firstPhoto + p, blob: photo.blob,
              description: (options.label ? options.label(record) : name) + ' — foto ' + photoName(p)
            });
          }
        }
        return { cells: cells, pictures: pictures };
      });

      return { name: name, columns: columns, rows: rows, freeze: (options.freeze || 0) + 1 };
    },

    /** The grey note under every sheet: how to use the photo codes. */
    PHOTO_NOTE: 'Kode Foto adalah kode verifikasi yang tercetak di pojok kanan bawah foto. ' +
      'Bila waktu yang tercetak di foto berbeda dengan Waktu Foto di sini, foto itu diubah setelah diambil.',

    /** Distinct non-empty values, in first-seen order. */
    unique: function (list) {
      var out = [];
      list.forEach(function (v) { if (v && out.indexOf(v) === -1) out.push(v); });
      return out;
    },

    /** "2026-10-01" or "2026-09-28 s/d 2026-10-01". */
    period: function (dates) {
      var sorted = SA.sheets.unique(dates).sort();
      return !sorted.length ? '-' : sorted.length === 1 ? sorted[0]
        : sorted[0] + ' s/d ' + sorted[sorted.length - 1];
    }
  };
}(window.SA));
