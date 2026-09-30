/* Writes a real .xlsx -- photographs embedded, not linked -- with no library.
 *
 * Taken from the WT app's writer and widened from one sheet to several: the
 * Security file has one sheet per report type (Pengecekan, Kejadian, Shift),
 * because the three have different columns and the office filters each on its
 * own terms.
 *
 * THE LOOK follows Prabhu's own "Daily Report Dashboard Patroli" workbook
 * (Billy, 2026-10-01), so the office receives files that match the reports it
 * already makes:
 *
 *   rows 1-2   the Prabhu logo
 *   row 3      title band      -- the TEAM colour, white bold 14
 *   row 4      subtitle band   -- Prabhu green #6FB92C, white
 *   row 6      info row        -- bold labels, values on light green #E7F4E0
 *   row 8      column headers  -- the TEAM colour, white bold
 *   row 9+     data            -- every other row #F2F2F2, thin #BFBFBF borders
 *   last       a small grey note saying how to read the photo codes
 *
 * Arial 10, gridlines off. Each team has its own colour (see SA.EXCEL_THEMES)
 * so the three reports can be told apart at a glance and still read as one
 * family. THE HEADER IS ON ROW 8, not row 1: a script reading these files
 * needs header=7 (pandas) or to skip the first seven rows.
 *
 * What is kept from WT on purpose:
 *   - every photograph at exactly 5.00 x 3.75 cm, whatever shape it was taken
 *     in (Billy wants uniform pictures in a report -- asked for twice);
 *   - four columns per photograph (Waktu / Kode / Lat / Long);
 *   - coordinates as NUMBERS on General, so Format Cells reads "General";
 *   - zip entries stored, not deflated -- the photos are already JPEG.
 *
 * A sheet is described as:
 *   { name, freeze, title, subtitle, meta: [[label, value] x4], note,
 *     columns: [{ header, width, type }], rows: [{ cells, pictures }] }
 * where type is 'text' | 'center' | 'number' | 'index' (a centred number) | 'photo', cells holds one value
 * per column, and pictures is [{ column, blob, description }].
 */

(function (SA) {

  var EMU_PER_CM = 360000;
  var EMU_PER_PX = 9525;
  var PHOTO_WIDTH_CM = 5.0;
  var PHOTO_HEIGHT_CM = 3.75;
  var PHOTO_WIDTH_EMU = Math.round(PHOTO_WIDTH_CM * EMU_PER_CM);
  var PHOTO_HEIGHT_EMU = Math.round(PHOTO_HEIGHT_CM * EMU_PER_CM);
  var INSET_EMU = 19050;
  var ROW_HEIGHT_PT = Math.ceil((PHOTO_HEIGHT_CM / 2.54) * 72 + 4);
  var PHOTO_COLUMN_WIDTH = Math.round(
    ((PHOTO_WIDTH_CM + 0.15) / 2.54 * 96 - 5) / 7 * 10) / 10;

  /* The layout rows, 1-based as Excel numbers them. */
  var ROW_TITLE = 3, ROW_SUBTITLE = 4, ROW_META = 6, ROW_HEADER = 8;
  var FIRST_DATA_ROW = ROW_HEADER + 1;

  /* Logo: two rows of 33.75 pt = 90 px tall, width kept to its own shape. */
  var LOGO_HEIGHT_PX = 84;

  var ACCENT = '6FB92C';       // Prabhu green: subtitle band
  var META_FILL = 'E7F4E0';    // light green: info values
  var ZEBRA = 'F2F2F2';
  var GRID = 'BFBFBF';

  /* cellXfs indices -- the order in styles() below. */
  var X = {
    plain: 0, header: 1, text: 2, center: 3, number: 4,
    textZ: 5, centerZ: 6, numberZ: 7,
    title: 8, subtitle: 9, metaLabel: 10, metaValue: 11, note: 12
  };

  function styleOf(type, zebra) {
    if (type === 'center') return zebra ? X.centerZ : X.center;
    if (type === 'number') return zebra ? X.numberZ : X.number;
    return zebra ? X.textZ : X.text;
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
      '<Default Extension="png" ContentType="image/png"/>' +
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
    xml += '</sheets><definedNames>';
    // Excel expects the autofilter's hidden name; without it the filter works
    // but Excel "repairs" the file on some versions.
    sheets.forEach(function (sheet, i) {
      xml += '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">' +
        xmlEscape("'" + sheet.name + "'!" + sheet.filterRef) + '</definedName>';
    });
    return xml + '</definedNames></workbook>';
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

  function border() {
    var side = '<color rgb="FF' + GRID + '"/>';
    return '<border><left style="thin">' + side + '</left><right style="thin">' + side +
      '</right><top style="thin">' + side + '</top><bottom style="thin">' + side +
      '</bottom><diagonal/></border>';
  }

  function styles(primary) {
    function fill(rgb) {
      return '<fill><patternFill patternType="solid"><fgColor rgb="FF' + rgb +
        '"/><bgColor indexed="64"/></patternFill></fill>';
    }
    function xf(font, fillId, borderId, align) {
      return '<xf numFmtId="0" fontId="' + font + '" fillId="' + fillId + '" borderId="' +
        borderId + '" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
        '<alignment ' + align + '/></xf>';
    }
    var C = 'horizontal="center" vertical="center" wrapText="1"';
    var L = 'vertical="center" wrapText="1"';
    var R = 'horizontal="right" vertical="center"';

    return XML_DECL +
      '<styleSheet xmlns="' + NS_MAIN + '">' +
      /* No <numFmts>: numbers stay on General, which Format Cells files under
         "General" rather than "Custom". */
      '<fonts count="6">' +
        '<font><sz val="10"/><color rgb="FF1F1F1F"/><name val="Arial"/><family val="2"/></font>' +   // 0 body
        '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>' + // 1 header
        '<font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>' + // 2 title
        '<font><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>' +     // 3 subtitle
        '<font><b/><sz val="10"/><color rgb="FF1F1F1F"/><name val="Arial"/><family val="2"/></font>' + // 4 label
        '<font><sz val="8"/><color rgb="FF808080"/><name val="Arial"/><family val="2"/></font>' +      // 5 note
      '</fonts>' +
      '<fills count="6">' +
        '<fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        fill(primary) + fill(ACCENT) + fill(ZEBRA) + fill(META_FILL) +
      '</fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' + border() + '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="13">' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +   // 0 plain
        xf(1, 2, 1, C) +      // 1 header
        xf(0, 0, 1, L) +      // 2 text
        xf(0, 0, 1, C) +      // 3 center
        xf(0, 0, 1, R) +      // 4 number
        xf(0, 4, 1, L) +      // 5 text, zebra
        xf(0, 4, 1, C) +      // 6 center, zebra
        xf(0, 4, 1, R) +      // 7 number, zebra
        xf(2, 2, 0, C) +      // 8 title band
        xf(3, 3, 0, C) +      // 9 subtitle band
        xf(4, 0, 0, 'vertical="center"') +   // 10 info label
        xf(0, 5, 1, 'vertical="center"') +   // 11 info value
        xf(5, 0, 0, 'vertical="center" wrapText="1"') + // 12 note
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

  /** A whole row of one style, first cell carrying the text (for merged bands). */
  function bandRow(r, height, last, style, text) {
    var xml = '<row r="' + r + '" ht="' + height + '" customHeight="1">';
    for (var i = 0; i <= last; i++) {
      xml += i === 0 ? inlineCell('A' + r, style, text) : '<c r="' + columnLetter(i) + r + '" s="' + style + '"/>';
    }
    return xml + '</row>';
  }

  /**
   * The info row: "Label :" in bold, then its value on light green, as the
   * dashboard does it. Each part spans as many columns as it needs to reach a
   * minimum width, because column widths differ per sheet (a 5-wide "No"
   * column would otherwise print "Perio"). Pairs stop where the columns do.
   */
  var META_LABEL_WIDTH = 11, META_VALUE_WIDTH = 18;

  function metaRow(meta, columns, merges) {
    var r = ROW_META;
    var widths = columns.map(function (c) { return c.type === 'photo' ? PHOTO_COLUMN_WIDTH : (c.width || 14); });
    var cells = {};
    var col = 0;

    function span(minWidth) {
      var from = col, total = 0;
      while (col < widths.length && total < minWidth) { total += widths[col]; col += 1; }
      return total >= minWidth ? [from, col - 1] : null;
    }
    function place(range, style, text) {
      for (var i = range[0]; i <= range[1]; i++) {
        cells[i] = i === range[0] ? inlineCell(columnLetter(i) + r, style, text)
          : '<c r="' + columnLetter(i) + r + '" s="' + style + '"/>';
      }
      if (range[1] > range[0]) merges.push(columnLetter(range[0]) + r + ':' + columnLetter(range[1]) + r);
    }

    (meta || []).forEach(function (pair) {
      var start = col;
      var label = span(META_LABEL_WIDTH);
      var value = label && span(META_VALUE_WIDTH);
      if (!value) { col = start; return; }
      place(label, X.metaLabel, pair[0] + ' :');
      place(value, X.metaValue, pair[1]);
      col += 1;                                   // a gap before the next pair
    });

    var xml = '<row r="' + r + '" ht="18" customHeight="1">';
    Object.keys(cells).map(Number).sort(function (x, y) { return x - y; })
      .forEach(function (i) { xml += cells[i]; });
    return xml + '</row>';
  }

  function worksheet(sheet) {
    var columns = sheet.columns;
    var last = columns.length - 1;
    var lastColumn = columnLetter(last);
    var lastDataRow = ROW_HEADER + sheet.rows.length;
    var noteRow = lastDataRow + 2;
    var hasPhotos = columns.some(function (c) { return c.type === 'photo'; });
    var freeze = sheet.freeze || 0;
    var merges = [
      'A1:' + lastColumn + '2',
      'A' + ROW_TITLE + ':' + lastColumn + ROW_TITLE,
      'A' + ROW_SUBTITLE + ':' + lastColumn + ROW_SUBTITLE,
      'A' + noteRow + ':' + lastColumn + noteRow
    ];
    sheet.filterRef = '$A$' + ROW_HEADER + ':$' + lastColumn + '$' + Math.max(lastDataRow, ROW_HEADER);

    var xml = XML_DECL +
      '<worksheet xmlns="' + NS_MAIN + '" xmlns:r="' + NS_REL + '">' +
      '<dimension ref="A1:' + lastColumn + noteRow + '"/>' +
      '<sheetViews><sheetView showGridLines="0" workbookViewId="0">' +
      '<pane' + (freeze ? ' xSplit="' + freeze + '"' : '') + ' ySplit="' + ROW_HEADER +
        '" topLeftCell="' + columnLetter(freeze) + FIRST_DATA_ROW + '" activePane="bottomRight" state="frozen"/>' +
      '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/><cols>';

    columns.forEach(function (column, i) {
      var width = column.type === 'photo' ? PHOTO_COLUMN_WIDTH : (column.width || 14);
      xml += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + width + '" customWidth="1"/>';
    });
    xml += '</cols><sheetData>';

    // Rows 1-2 hold the logo (a picture over empty cells).
    xml += '<row r="1" ht="33.75" customHeight="1"/><row r="2" ht="33.75" customHeight="1"/>';
    xml += bandRow(ROW_TITLE, 25.5, last, X.title, sheet.title);
    xml += bandRow(ROW_SUBTITLE, 18, last, X.subtitle, sheet.subtitle);
    xml += metaRow(sheet.meta, columns, merges);

    xml += '<row r="' + ROW_HEADER + '" ht="31.5" customHeight="1">';
    columns.forEach(function (column, i) {
      xml += inlineCell(columnLetter(i) + ROW_HEADER, X.header, column.header);
    });
    xml += '</row>';

    sheet.rows.forEach(function (row, index) {
      var r = FIRST_DATA_ROW + index;
      var zebra = index % 2 === 1;
      xml += '<row r="' + r + '" ht="' + (hasPhotos ? ROW_HEIGHT_PT : 30) + '" customHeight="1">';
      columns.forEach(function (column, i) {
        var reference = columnLetter(i) + r;
        var value = row.cells[i];
        xml += column.type === 'number'
          ? numberCell(reference, styleOf('number', zebra), value)
          : column.type === 'index'
          ? numberCell(reference, styleOf('center', zebra), value)
          : inlineCell(reference, styleOf(column.type, zebra), column.type === 'photo' ? '' : value);
      });
      xml += '</row>';
    });

    if (sheet.note) {
      xml += '<row r="' + noteRow + '" ht="24" customHeight="1">' +
        inlineCell('A' + noteRow, X.note, sheet.note) + '</row>';
    }

    xml += '</sheetData>';
    xml += '<autoFilter ref="' + sheet.filterRef.replace(/\$/g, '') + '"/>';
    xml += '<mergeCells count="' + merges.length + '">' + merges.map(function (m) {
      return '<mergeCell ref="' + m + '"/>';
    }).join('') + '</mergeCells>';
    xml += '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>';
    xml += '<pageSetup orientation="landscape" paperSize="9" fitToHeight="0"/>';
    if (sheet.hasDrawing) xml += '<drawing r:id="rId1"/>';
    return xml + '</worksheet>';
  }

  function sheetRels(index) {
    return XML_DECL + '<Relationships xmlns="' + NS_PKG + '">' +
      '<Relationship Id="rId1" Type="' + NS_REL + '/drawing" Target="../drawings/drawing' +
      index + '.xml"/></Relationships>';
  }

  /** placements: [{ row, column, description, cx, cy, inset }] (row 0-based). */
  function drawing(placements) {
    var xml = XML_DECL +
      '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"' +
      ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">';
    placements.forEach(function (p, index) {
      var cx = p.cx || PHOTO_WIDTH_EMU;
      var cy = p.cy || PHOTO_HEIGHT_EMU;
      var inset = p.inset == null ? INSET_EMU : p.inset;
      xml +=
        '<xdr:oneCellAnchor>' +
          '<xdr:from><xdr:col>' + p.column + '</xdr:col><xdr:colOff>' + inset +
          '</xdr:colOff><xdr:row>' + p.row + '</xdr:row><xdr:rowOff>' + inset +
          '</xdr:rowOff></xdr:from>' +
          '<xdr:ext cx="' + cx + '" cy="' + cy + '"/>' +
          '<xdr:pic><xdr:nvPicPr>' +
            '<xdr:cNvPr id="' + (index + 2) + '" name="Picture ' + (index + 1) +
              '" descr="' + xmlEscape(p.description) + '"/>' +
            '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>' +
          '</xdr:nvPicPr>' +
          '<xdr:blipFill><a:blip xmlns:r="' + NS_REL + '" r:embed="rId' + (index + 1) + '"/>' +
            '<a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
          '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
            '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>' +
          '</xdr:pic><xdr:clientData/>' +
        '</xdr:oneCellAnchor>';
    });
    return xml + '</xdr:wsDr>';
  }

  function drawingRels(targets) {
    var xml = XML_DECL + '<Relationships xmlns="' + NS_PKG + '">';
    targets.forEach(function (target, i) {
      xml += '<Relationship Id="rId' + (i + 1) + '" Type="' + NS_REL +
        '/image" Target="../media/' + target + '"/>';
    });
    return xml + '</Relationships>';
  }

  SA.xlsx = {
    PHOTO_WIDTH_CM: PHOTO_WIDTH_CM,
    PHOTO_HEIGHT_CM: PHOTO_HEIGHT_CM,

    /**
     * sheets -> Promise<Blob>. Photos are read one at a time to spare memory.
     *
     * options = { primary: 'RRGGBB' (the team colour), logo: { blob, width, height } }
     * The logo is optional; without it rows 1-2 are simply empty.
     */
    build: function (sheets, onProgress, options) {
      options = options || {};
      var primary = options.primary || '0090C8';
      var logo = options.logo && options.logo.blob ? options.logo : null;
      var media = [];                 // photo blobs, numbered across the whole file
      var entries = [];

      sheets.forEach(function (sheet, sheetIndex) {
        var placements = [];
        var targets = [];

        if (logo) {
          var h = LOGO_HEIGHT_PX;
          var w = Math.round(h * logo.width / logo.height);
          placements.push({ row: 0, column: 0, inset: 38100, description: 'Prabhu',
            cx: w * EMU_PER_PX, cy: h * EMU_PER_PX });
          targets.push('logo.png');
        }

        sheet.rows.forEach(function (row, rowIndex) {
          (row.pictures || []).forEach(function (picture) {
            if (!picture || !picture.blob) return;
            media.push(picture.blob);
            targets.push('image' + media.length + '.jpeg');
            placements.push({
              row: ROW_HEADER + rowIndex,      // 0-based: header is row ROW_HEADER - 1
              column: picture.column,
              description: picture.description || ''
            });
          });
        });
        sheet.hasDrawing = placements.length > 0;

        var n = sheetIndex + 1;
        entries.push({ name: 'xl/worksheets/sheet' + n + '.xml', data: utf8(worksheet(sheet)) });
        if (sheet.hasDrawing) {
          entries.push({ name: 'xl/worksheets/_rels/sheet' + n + '.xml.rels', data: utf8(sheetRels(n)) });
          entries.push({ name: 'xl/drawings/drawing' + n + '.xml', data: utf8(drawing(placements)) });
          entries.push({ name: 'xl/drawings/_rels/drawing' + n + '.xml.rels', data: utf8(drawingRels(targets)) });
        }
      });

      // worksheet() fills in each sheet's filter range, which workbook() names.
      entries = [
        { name: '[Content_Types].xml', data: utf8(contentTypes(sheets)) },
        { name: '_rels/.rels', data: utf8(rootRels()) },
        { name: 'xl/workbook.xml', data: utf8(workbook(sheets)) },
        { name: 'xl/_rels/workbook.xml.rels', data: utf8(workbookRels(sheets)) },
        { name: 'xl/styles.xml', data: utf8(styles(primary)) }
      ].concat(entries);

      var start = logo
        ? bytesOf(logo.blob).then(function (data) { entries.push({ name: 'xl/media/logo.png', data: data }); })
        : Promise.resolve();

      return media.reduce(function (chain, blob, index) {
        return chain.then(function () {
          if (onProgress) onProgress(index, media.length);
          return bytesOf(blob).then(function (data) {
            entries.push({ name: 'xl/media/image' + (index + 1) + '.jpeg', data: data });
          });
        });
      }, start).then(function () {
        if (onProgress) onProgress(media.length, media.length);
        return zip(entries);
      });
    }
  };
}(window.SA));
