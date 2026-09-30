/* Writes a real .xlsx -- photographs embedded, not linked -- with no library.
 *
 * Taken from the WT app's writer and widened from one sheet to several: the
 * Security file has one sheet per report type (Pengecekan, Kejadian, Shift),
 * because the three have different columns and the office filters each on its
 * own terms.
 *
 * What is kept from WT on purpose:
 *   - every photograph at exactly 5.00 x 3.75 cm, whatever shape it was taken
 *     in (Billy wants uniform pictures in a report -- asked for twice);
 *   - four columns per photograph (Waktu / Kode / Lat / Long), because the
 *     photos of one report are taken minutes apart and a gallery pick may carry
 *     another time or no position at all;
 *   - coordinates as NUMBERS on General, so Format Cells reads "General";
 *   - zip entries stored, not deflated -- the photos are already JPEG.
 *
 * A sheet is described as:
 *   { name, freeze, columns: [{ header, width, type }], rows: [{ cells, pictures }] }
 * where type is 'text' | 'center' | 'number' | 'photo', cells holds one value
 * per column, and pictures is [{ column, blob, description }].
 */

(function (SA) {

  var EMU_PER_CM = 360000;
  var PHOTO_WIDTH_CM = 5.0;
  var PHOTO_HEIGHT_CM = 3.75;
  var PHOTO_WIDTH_EMU = Math.round(PHOTO_WIDTH_CM * EMU_PER_CM);
  var PHOTO_HEIGHT_EMU = Math.round(PHOTO_HEIGHT_CM * EMU_PER_CM);
  var INSET_EMU = 19050;
  var ROW_HEIGHT_PT = Math.ceil((PHOTO_HEIGHT_CM / 2.54) * 72 + 4);
  var PHOTO_COLUMN_WIDTH = Math.round(
    ((PHOTO_WIDTH_CM + 0.15) / 2.54 * 96 - 5) / 7 * 10) / 10;

  var STYLE_HEADER = 1, STYLE_TEXT = 2, STYLE_CENTER = 3, STYLE_NUMBER = 4;

  function styleOf(type) {
    return type === 'center' ? STYLE_CENTER
      : type === 'number' ? STYLE_NUMBER
      : STYLE_TEXT;
  }

  function columnLetter(index) {
    var letter = '';
    index += 1;
    while (index > 0) {
      var remainder = (index - 1) % 26;
      letter = String.fromCharCode(65 + remainder) + letter;
      index = Math.floor((index - 1) / 26);
    }
    return letter;
  }

  function xmlEscape(value) {
    return String(value == null ? '' : value)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function utf8(text) { return new TextEncoder().encode(text); }

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

  /* -- ZIP (stored) ------------------------------------------------------ */

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  }());

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(date) {
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
      date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  function zip(entries) {
    var stamp = dosDateTime(new Date());
    var prepared = entries.map(function (entry) {
      return { nameBytes: utf8(entry.name), data: entry.data, crc: crc32(entry.data) };
    });

    var total = 22;
    prepared.forEach(function (e) {
      total += 30 + e.nameBytes.length + e.data.length + 46 + e.nameBytes.length;
    });

    var buffer = new ArrayBuffer(total);
    var view = new DataView(buffer);
    var bytes = new Uint8Array(buffer);
    var offset = 0;

    prepared.forEach(function (e) {
      e.offset = offset;
      view.setUint32(offset, 0x04034B50, true); offset += 4;
      view.setUint16(offset, 20, true); offset += 2;
      view.setUint16(offset, 0x0800, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint16(offset, stamp.time, true); offset += 2;
      view.setUint16(offset, stamp.date, true); offset += 2;
      view.setUint32(offset, e.crc, true); offset += 4;
      view.setUint32(offset, e.data.length, true); offset += 4;
      view.setUint32(offset, e.data.length, true); offset += 4;
      view.setUint16(offset, e.nameBytes.length, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      bytes.set(e.nameBytes, offset); offset += e.nameBytes.length;
      bytes.set(e.data, offset); offset += e.data.length;
    });

    var centralStart = offset;
    prepared.forEach(function (e) {
      view.setUint32(offset, 0x02014B50, true); offset += 4;
      view.setUint16(offset, 20, true); offset += 2;
      view.setUint16(offset, 20, true); offset += 2;
      view.setUint16(offset, 0x0800, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint16(offset, stamp.time, true); offset += 2;
      view.setUint16(offset, stamp.date, true); offset += 2;
      view.setUint32(offset, e.crc, true); offset += 4;
      view.setUint32(offset, e.data.length, true); offset += 4;
      view.setUint32(offset, e.data.length, true); offset += 4;
      view.setUint16(offset, e.nameBytes.length, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint32(offset, 0, true); offset += 4;
      view.setUint32(offset, e.offset, true); offset += 4;
      bytes.set(e.nameBytes, offset); offset += e.nameBytes.length;
    });

    var centralSize = offset - centralStart;
    view.setUint32(offset, 0x06054B50, true); offset += 4;
    view.setUint16(offset, 0, true); offset += 2;
    view.setUint16(offset, 0, true); offset += 2;
    view.setUint16(offset, prepared.length, true); offset += 2;
    view.setUint16(offset, prepared.length, true); offset += 2;
    view.setUint32(offset, centralSize, true); offset += 4;
    view.setUint32(offset, centralStart, true); offset += 4;
    view.setUint16(offset, 0, true);

    return new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  /* -- Workbook parts ---------------------------------------------------- */

  var XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
  var NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  var NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var NS_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';

  function contentTypes(sheets) {
    var xml = XML_DECL +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    sheets.forEach(function (sheet, i) {
      xml += '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
        '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      if (sheet.hasDrawing) {
        xml += '<Override PartName="/xl/drawings/drawing' + (i + 1) +
          '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
      }
    });
    return xml + '</Types>';
  }

  function rootRels() {
    return XML_DECL + '<Relationships xmlns="' + NS_PKG + '">' +
      '<Relationship Id="rId1" Type="' + NS_REL + '/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';
  }

  function workbook(sheets) {
    var xml = XML_DECL + '<workbook xmlns="' + NS_MAIN + '" xmlns:r="' + NS_REL + '"><sheets>';
    sheets.forEach(function (sheet, i) {
      xml += '<sheet name="' + xmlEscape(sheet.name) + '" sheetId="' + (i + 1) +
        '" r:id="rId' + (i + 1) + '"/>';
    });
    return xml + '</sheets></workbook>';
  }

  function workbookRels(sheets) {
    var xml = XML_DECL + '<Relationships xmlns="' + NS_PKG + '">';
    sheets.forEach(function (sheet, i) {
      xml += '<Relationship Id="rId' + (i + 1) + '" Type="' + NS_REL +
        '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
    });
    xml += '<Relationship Id="rId' + (sheets.length + 1) + '" Type="' + NS_REL +
      '/styles" Target="styles.xml"/>';
    return xml + '</Relationships>';
  }

  function styles() {
    return XML_DECL +
      '<styleSheet xmlns="' + NS_MAIN + '">' +
      '<fonts count="2">' +
        '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' +
        '<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' +
      '</fonts>' +
      '<fills count="3">' +
        '<fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="2">' +
        '<border><left/><right/><top/><bottom/><diagonal/></border>' +
        '<border>' +
          '<left style="thin"><color rgb="FFBFBFBF"/></left>' +
          '<right style="thin"><color rgb="FFBFBFBF"/></right>' +
          '<top style="thin"><color rgb="FFBFBFBF"/></top>' +
          '<bottom style="thin"><color rgb="FFBFBFBF"/></bottom>' +
          '<diagonal/></border>' +
      '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="5">' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
          '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">' +
          '<alignment vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">' +
          '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">' +
          '<alignment horizontal="right" vertical="center"/></xf>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  function inlineCell(reference, style, text) {
    if (text === '' || text == null) return '<c r="' + reference + '" s="' + style + '"/>';
    return '<c r="' + reference + '" s="' + style + '" t="inlineStr">' +
      '<is><t xml:space="preserve">' + xmlEscape(text) + '</t></is></c>';
  }

  /* An empty number stays empty rather than 0: a photo with no position must
     not read as one taken at the equator. */
  function numberCell(reference, style, value) {
    if (value == null || value === '' || isNaN(value)) {
      return '<c r="' + reference + '" s="' + style + '"/>';
    }
    return '<c r="' + reference + '" s="' + style + '"><v>' + String(Number(value)) + '</v></c>';
  }

  function worksheet(sheet) {
    var columns = sheet.columns;
    var lastColumn = columnLetter(columns.length - 1);
    var lastRow = sheet.rows.length + 1;
    var hasPhotos = columns.some(function (c) { return c.type === 'photo'; });
    var freeze = sheet.freeze || 0;

    var xml = XML_DECL +
      '<worksheet xmlns="' + NS_MAIN + '" xmlns:r="' + NS_REL + '">' +
      '<dimension ref="A1:' + lastColumn + lastRow + '"/>' +
      '<sheetViews><sheetView workbookViewId="0">' +
      '<pane' + (freeze ? ' xSplit="' + freeze + '"' : '') + ' ySplit="1" topLeftCell="' +
        columnLetter(freeze) + '2" activePane="bottomRight" state="frozen"/>' +
      '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/><cols>';

    columns.forEach(function (column, i) {
      var width = column.type === 'photo' ? PHOTO_COLUMN_WIDTH : (column.width || 14);
      xml += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + width + '" customWidth="1"/>';
    });
    xml += '</cols><sheetData><row r="1" ht="26" customHeight="1">';
    columns.forEach(function (column, i) {
      xml += inlineCell(columnLetter(i) + '1', STYLE_HEADER, column.header);
    });
    xml += '</row>';

    sheet.rows.forEach(function (row, rowIndex) {
      var r = rowIndex + 2;
      xml += '<row r="' + r + '"' +
        (hasPhotos ? ' ht="' + ROW_HEIGHT_PT + '" customHeight="1"' : '') + '>';
      columns.forEach(function (column, i) {
        var reference = columnLetter(i) + r;
        var value = row.cells[i];
        xml += column.type === 'number'
          ? numberCell(reference, STYLE_NUMBER, value)
          : inlineCell(reference, styleOf(column.type), column.type === 'photo' ? '' : value);
      });
      xml += '</row>';
    });

    xml += '</sheetData><autoFilter ref="A1:' + lastColumn + lastRow + '"/>';
    if (sheet.hasDrawing) xml += '<drawing r:id="rId1"/>';
    return xml + '</worksheet>';
  }

  function sheetRels(index) {
    return XML_DECL + '<Relationships xmlns="' + NS_PKG + '">' +
      '<Relationship Id="rId1" Type="' + NS_REL + '/drawing" Target="../drawings/drawing' +
      index + '.xml"/></Relationships>';
  }

  function drawing(placements) {
    var xml = XML_DECL +
      '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"' +
      ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">';
    placements.forEach(function (p, index) {
      xml +=
        '<xdr:oneCellAnchor>' +
          '<xdr:from><xdr:col>' + p.column + '</xdr:col><xdr:colOff>' + INSET_EMU +
          '</xdr:colOff><xdr:row>' + p.row + '</xdr:row><xdr:rowOff>' + INSET_EMU +
          '</xdr:rowOff></xdr:from>' +
          '<xdr:ext cx="' + PHOTO_WIDTH_EMU + '" cy="' + PHOTO_HEIGHT_EMU + '"/>' +
          '<xdr:pic><xdr:nvPicPr>' +
            '<xdr:cNvPr id="' + (index + 2) + '" name="Photo ' + (index + 1) +
              '" descr="' + xmlEscape(p.description) + '"/>' +
            '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>' +
          '</xdr:nvPicPr>' +
          '<xdr:blipFill><a:blip xmlns:r="' + NS_REL + '" r:embed="rId' + (index + 1) + '"/>' +
            '<a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
          '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + PHOTO_WIDTH_EMU +
            '" cy="' + PHOTO_HEIGHT_EMU + '"/></a:xfrm>' +
            '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>' +
          '</xdr:pic><xdr:clientData/>' +
        '</xdr:oneCellAnchor>';
    });
    return xml + '</xdr:wsDr>';
  }

  function drawingRels(mediaNumbers) {
    var xml = XML_DECL + '<Relationships xmlns="' + NS_PKG + '">';
    mediaNumbers.forEach(function (media, i) {
      xml += '<Relationship Id="rId' + (i + 1) + '" Type="' + NS_REL +
        '/image" Target="../media/image' + media + '.jpeg"/>';
    });
    return xml + '</Relationships>';
  }

  SA.xlsx = {
    PHOTO_WIDTH_CM: PHOTO_WIDTH_CM,
    PHOTO_HEIGHT_CM: PHOTO_HEIGHT_CM,

    /** sheets -> Promise<Blob>. Photos are read one at a time to spare memory. */
    build: function (sheets, onProgress) {
      var media = [];                 // blobs, numbered across the whole file
      var entries = [];

      sheets.forEach(function (sheet, sheetIndex) {
        var placements = [];
        var numbers = [];
        sheet.rows.forEach(function (row, rowIndex) {
          (row.pictures || []).forEach(function (picture) {
            if (!picture || !picture.blob) return;
            media.push(picture.blob);
            numbers.push(media.length);
            placements.push({
              row: rowIndex + 1, column: picture.column, description: picture.description || ''
            });
          });
        });
        sheet.hasDrawing = placements.length > 0;

        var n = sheetIndex + 1;
        entries.push({ name: 'xl/worksheets/sheet' + n + '.xml', data: utf8(worksheet(sheet)) });
        if (sheet.hasDrawing) {
          entries.push({ name: 'xl/worksheets/_rels/sheet' + n + '.xml.rels', data: utf8(sheetRels(n)) });
          entries.push({ name: 'xl/drawings/drawing' + n + '.xml', data: utf8(drawing(placements)) });
          entries.push({ name: 'xl/drawings/_rels/drawing' + n + '.xml.rels', data: utf8(drawingRels(numbers)) });
        }
      });

      entries = [
        { name: '[Content_Types].xml', data: utf8(contentTypes(sheets)) },
        { name: '_rels/.rels', data: utf8(rootRels()) },
        { name: 'xl/workbook.xml', data: utf8(workbook(sheets)) },
        { name: 'xl/_rels/workbook.xml.rels', data: utf8(workbookRels(sheets)) },
        { name: 'xl/styles.xml', data: utf8(styles()) }
      ].concat(entries);

      return media.reduce(function (chain, blob, index) {
        return chain.then(function () {
          if (onProgress) onProgress(index, media.length);
          return bytesOf(blob).then(function (data) {
            entries.push({ name: 'xl/media/image' + (index + 1) + '.jpeg', data: data });
          });
        });
      }, Promise.resolve()).then(function () {
        if (onProgress) onProgress(media.length, media.length);
        return zip(entries);
      });
    }
  };
}(window.SA));
