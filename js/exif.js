/* Reading a photograph's own place and time out of its Exif metadata.
 *
 * This exists for one reason: a picture chosen from the gallery was taken
 * somewhere else, at some other time. Stamping the phone's current position and
 * clock onto it would put a straightforward falsehood into the one part of the
 * record nothing downstream can check — the burned-in pixels. So a gallery
 * photo carries its own coordinates or none at all.
 *
 * Written by hand rather than pulled in, like everything else here: the app has
 * to keep working offline forever with nothing to fetch. Only four tags are
 * needed, so this reads those and ignores the rest of the format.
 *
 * Every failure path returns null. Metadata is missing far more often than it
 * is malformed — a phone with location turned off, an image already stripped by
 * a messaging app, a screenshot — and none of those are errors worth
 * interrupting a survey for.
 */

(function (SA) {

  /* Exif lives in an APP1 segment near the front of a JPEG, while the photo
     itself runs to several megabytes. Reading the head keeps a gallery pick
     from pulling whole images into memory just to find six numbers. */
  var HEAD_BYTES = 131072;

  /* Bytes per component, indexed by Exif type. */
  var TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

  var TAG_EXIF_IFD = 0x8769;
  var TAG_GPS_IFD = 0x8825;
  var TAG_DATE_ORIGINAL = 0x9003;
  var TAG_GPS_LAT_REF = 0x0001;
  var TAG_GPS_LAT = 0x0002;
  var TAG_GPS_LON_REF = 0x0003;
  var TAG_GPS_LON = 0x0004;

  function readHead(file) {
    var slice = file.slice(0, Math.min(HEAD_BYTES, file.size));
    if (slice.arrayBuffer) return slice.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsArrayBuffer(slice);
    });
  }

  /**
   * Walks the JPEG marker segments to the start of the Exif TIFF header.
   *
   * Returns -1 when there is no Exif to find, which includes PNG, HEIC and
   * anything already stripped of its metadata.
   */
  function findTiffStart(view) {
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xFFD8) return -1;

    var offset = 2;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xFF) return -1;      // lost the framing
      var marker = view.getUint8(offset + 1);

      // Start of scan: the pixels begin, so there is no Exif ahead of us.
      if (marker === 0xDA) return -1;
      // Standalone markers carry no length field.
      if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD9)) {
        offset += 2;
        continue;
      }

      var size = view.getUint16(offset + 2, false);
      if (size < 2) return -1;

      if (marker === 0xE1 && offset + 10 <= view.byteLength &&
          view.getUint32(offset + 4, false) === 0x45786966 &&   // "Exif"
          view.getUint16(offset + 8, false) === 0x0000) {
        return offset + 10;
      }
      offset += 2 + size;
    }
    return -1;
  }

  function readHeader(view, tiffStart) {
    if (tiffStart + 8 > view.byteLength) return null;
    var order = view.getUint16(tiffStart, false);
    var little;
    if (order === 0x4949) little = true;
    else if (order === 0x4D4D) little = false;
    else return null;
    if (view.getUint16(tiffStart + 2, little) !== 42) return null;
    return {
      little: little,
      start: tiffStart,
      ifd0: tiffStart + view.getUint32(tiffStart + 4, little)
    };
  }

  function readValue(view, tiff, type, count, at) {
    if (at < 0 || at >= view.byteLength) return null;

    if (type === 2) {                                    // ASCII
      var text = '';
      for (var i = 0; i < count && at + i < view.byteLength; i++) {
        var code = view.getUint8(at + i);
        if (!code) break;
        text += String.fromCharCode(code);
      }
      return text;
    }

    if (type === 5 || type === 10) {                     // RATIONAL
      var values = [];
      for (var j = 0; j < count; j++) {
        var p = at + j * 8;
        if (p + 8 > view.byteLength) return null;
        var numerator = type === 5 ? view.getUint32(p, tiff.little) : view.getInt32(p, tiff.little);
        var denominator = type === 5 ? view.getUint32(p + 4, tiff.little) : view.getInt32(p + 4, tiff.little);
        values.push(denominator ? numerator / denominator : 0);
      }
      return values;
    }

    if (type === 4 || type === 9) {
      return at + 4 <= view.byteLength ? view.getUint32(at, tiff.little) : null;
    }
    if (type === 3) {
      return at + 2 <= view.byteLength ? view.getUint16(at, tiff.little) : null;
    }
    return null;
  }

  /** Collects the wanted tags out of one IFD, ignoring everything else. */
  function readIfd(view, tiff, ifdAt, wanted) {
    var found = {};
    if (ifdAt < 0 || ifdAt + 2 > view.byteLength) return found;

    var count = view.getUint16(ifdAt, tiff.little);
    for (var i = 0; i < count; i++) {
      var entry = ifdAt + 2 + i * 12;
      if (entry + 12 > view.byteLength) break;

      var tag = view.getUint16(entry, tiff.little);
      if (wanted.indexOf(tag) === -1) continue;

      var type = view.getUint16(entry + 2, tiff.little);
      var components = view.getUint32(entry + 4, tiff.little);
      var size = (TYPE_SIZES[type] || 0) * components;
      if (!size) continue;

      // Four bytes or fewer live in the entry itself; anything larger is an
      // offset from the start of the TIFF header.
      var at = size <= 4 ? entry + 8 : tiff.start + view.getUint32(entry + 8, tiff.little);
      found[tag] = readValue(view, tiff, type, components, at);
    }
    return found;
  }

  /** Three rationals plus a hemisphere letter, to signed decimal degrees. */
  function toDegrees(dms, ref) {
    if (!dms || dms.length < 3) return null;
    var value = dms[0] + dms[1] / 60 + dms[2] / 3600;
    if (!isFinite(value)) return null;
    if (ref === 'S' || ref === 'W') value = -value;
    return value;
  }

  /** Exif writes "2026:08:15 12:49:34" — not a format Date parses. */
  function toDate(text) {
    var parts = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text || '');
    if (!parts) return null;
    var date = new Date(+parts[1], +parts[2] - 1, +parts[3], +parts[4], +parts[5], +parts[6]);
    return isNaN(date.getTime()) ? null : date;
  }

  SA.exif = {

    /**
     * Resolves to { latitude, longitude, takenAt }, any of which may be null,
     * or to null when the file carries no Exif at all.
     */
    read: function (file) {
      return readHead(file).then(function (buffer) {
        var view = new DataView(buffer);
        var tiffStart = findTiffStart(view);
        if (tiffStart < 0) return null;

        var tiff = readHeader(view, tiffStart);
        if (!tiff) return null;

        var root = readIfd(view, tiff, tiff.ifd0, [TAG_EXIF_IFD, TAG_GPS_IFD]);
        var result = { latitude: null, longitude: null, takenAt: null };

        if (root[TAG_GPS_IFD]) {
          var gps = readIfd(view, tiff, tiff.start + root[TAG_GPS_IFD],
            [TAG_GPS_LAT_REF, TAG_GPS_LAT, TAG_GPS_LON_REF, TAG_GPS_LON]);
          var latitude = toDegrees(gps[TAG_GPS_LAT], gps[TAG_GPS_LAT_REF]);
          var longitude = toDegrees(gps[TAG_GPS_LON], gps[TAG_GPS_LON_REF]);
          /* Exactly zero on both axes is Null Island, which no survey has ever
             visited. Cameras write it when they have a GPS block but no fix. */
          if (latitude != null && longitude != null && (latitude !== 0 || longitude !== 0)) {
            result.latitude = latitude;
            result.longitude = longitude;
          }
        }

        if (root[TAG_EXIF_IFD]) {
          var sub = readIfd(view, tiff, tiff.start + root[TAG_EXIF_IFD], [TAG_DATE_ORIGINAL]);
          result.takenAt = toDate(sub[TAG_DATE_ORIGINAL]);
        }

        return result;
      }).catch(function () { return null; });
    }
  };
}(window.SA));
