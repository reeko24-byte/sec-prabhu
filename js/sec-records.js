/* Security Officer: what goes on the photograph, what the seal binds, and the
 * sheets of the spreadsheet.
 *
 * A Security record looks like:
 *   team 'security', kind 'check' | 'incident' | 'access' | 'body' | 'shift'
 *   sessionId, post, shift, shiftDate, officers [..], bko, reporter
 *   date, time, timestamp            when it was saved
 *   check:    hour                   the scheduled hour, 0..24
 *   incident: incidentType, otherText, answers {apa..bagaimana, 5W1H; Kapan is 'bilamana'}, tindakan
 *   body:     bodyTime, bodyResult ('none'|'found'), bodyFinding
 *   shift:    checkLines [{hour, done}], incidentSummary {type: text},
 *             handover, nextOfficers [..], nextBko, finalSituation
 *   photos [{ blob, thumb, takenAt, sealCode, sealDigest, sealAlgo, lat, long }]
 */

(function (SA) {

  var S = SA.SECURITY;

  var KIND_TITLE = {
    check: 'LAPORAN PENGECEKAN',
    incident: 'LAPORAN KEJADIAN',
    shift: 'LAPORAN SHIFT',
    access: 'LAPORAN ACCESS CONTROL',
    body: 'LAPORAN BODY CHECK'
  };

  function bodyResult(record) { return record.bodyResult === 'found' ? 'Ada temuan' : 'Nihil temuan'; }

  function crewLine(report) {
    var names = (report.officers || []).join(', ');
    var bko = report.bko && String(report.bko).trim();
    return (names ? 'Petugas: ' + names : '') + (bko ? ' · BKO TNI: ' + bko : '');
  }

  SA.secRecords = {

    KIND_TITLE: KIND_TITLE,

    /** Short label for lists: "Pengecekan 02:00", "Kejadian · VANDALISME". */
    label: function (record) {
      if (record.kind === 'check') return 'Pengecekan ' + SA.hourText(record.hour) + ' WIB';
      if (record.kind === 'incident') return 'Kejadian · ' + SA.secCaption.incidentName(record);
      if (record.kind === 'access') return 'Access Control ' + (record.accessTime || '');
      if (record.kind === 'body') return 'Body Check ' + (record.bodyTime || '');
      return 'Laporan Shift ' + record.shift;
    },

    /**
     * The band's lines, minus time and place (the photo pipeline adds those).
     * `report` is the draft on screen, shaped like a record.
     */
    stampLines: function (report) {
      var first;
      var place = report.post + ' · Shift ' + report.shift;
      if (report.kind === 'check') {
        first = KIND_TITLE.check + ' · Pukul ' + SA.hourText(report.hour) + ' WIB';
      } else if (report.kind === 'incident') {
        first = KIND_TITLE.incident + ' · ' + SA.secCaption.incidentName(report);
      } else if (report.kind === 'access') {
        first = KIND_TITLE.access + ' · Pukul ' + (report.accessTime || '') + ' WIB';
        return [first, place, crewLine(report),
          (report.direction || '') + ': ' + (report.from || report.post) + ' → ' + (report.to || '')];
      } else if (report.kind === 'body') {
        first = KIND_TITLE.body + ' · Pukul ' + (report.bodyTime || '') + ' WIB';
        return [first, place, crewLine(report), 'Metal detector · ' + bodyResult(report)];
      } else {
        first = KIND_TITLE.shift + ' · ' + SA.shiftText(report.shift);
        place = report.post;
      }
      return [first, place, crewLine(report),
        report.kind === 'check' ? 'Situasi aman dan terkendali' : ''];
    },

    /** What the seal is bound to, in a fixed order. Append only. */
    sealFacts: function (report, timestamp, fix) {
      var detail = report.kind === 'check' ? SA.hourText(report.hour)
        : report.kind === 'incident' ? SA.secCaption.incidentName(report)
        : report.kind === 'access' ? report.accessTime + ' ' + report.direction + ' ' + report.to
        : report.kind === 'body' ? report.bodyTime + ' ' + report.bodyResult : '';
      return [
        'SEC1', timestamp, report.kind, report.post, report.shift, report.shiftDate,
        detail, (report.officers || []).join('+'), report.bko || '',
        fix ? fix.latitude.toFixed(6) : '', fix ? fix.longitude.toFixed(6) : ''
      ];
    },

    /**
     * The workbook: one sheet per kind, always all of them, in report order, each
     * headed the way Prabhu's own daily report is (see xlsx.js).
     */
    sheets: function (records) {
      var theme = SA.EXCEL_THEMES.security;
      var posts = SA.sheets.unique(records.map(function (r) { return r.post; }));
      var period = SA.sheets.period(records.map(function (r) { return r.shiftDate; }));
      var now = new Date();
      var titles = { Pengecekan: 'PENGECEKAN PER JAM', Kejadian: 'LAPORAN KEJADIAN',
        'Access Control': 'ACCESS CONTROL', 'Body Check': 'BODY CHECK', Shift: 'LAPORAN SHIFT' };

      var incidents = records.filter(function (r) { return r.kind === 'incident'; });
      /* Until v12 an incident had a seventh question, "Dengan apa". 5W1H dropped
         it; incidents saved before still carry the answer, so the column comes
         back whenever one of them is exported. */
      var legacy = incidents.some(function (r) { return ((r.answers || {}).denganApa || '').trim(); })
        ? [col('Dengan apa (lama)', 20, 'text', function (r) { return (r.answers || {}).denganApa || ''; })]
        : [];

      return build().map(function (sheet) {
        sheet.title = theme.title + ' — ' + titles[sheet.name];
        sheet.subtitle = 'PT Prabhu · Pos ' + (posts.join(', ') || '-');
        sheet.meta = [
          ['Periode', period],
          ['Pos', posts.join(', ') || '-'],
          ['Jumlah', sheet.rows.length + ' laporan'],
          ['Diexport', SA.dateOf(now) + ' ' + SA.timeOf(now).slice(0, 5)]
        ];
        sheet.note = SA.sheets.PHOTO_NOTE;
        return sheet;
      });

      function build() { return [
        sheet('Pengecekan', records.filter(function (r) { return r.kind === 'check'; }), [
          col('Tanggal', 12, 'center', function (r) {
            return SA.dateOf(SA.shiftHourDate(r.shiftDate, r.hour));
          }),
          col('Pukul', 9, 'center', function (r) { return SA.hourText(r.hour); }),
          col('Pos', 22, 'center', 'post'),
          col('Shift', 9, 'center', 'shift'),
          col('Tanggal Shift', 13, 'center', 'shiftDate'),
          col('Petugas', 34, 'text', function (r) { return (r.officers || []).join(', '); }),
          col('BKO TNI', 18, 'text', 'bko'),
          col('Situasi', 26, 'text', function () { return 'Aman dan terkendali'; }),
          col('Pelapor', 20, 'text', 'reporter'),
          col('Waktu Simpan', 19, 'center', 'timestamp')
        ], 2),

        sheet('Kejadian', incidents, [
          col('Tanggal', 12, 'center', 'date'),
          col('Waktu', 10, 'center', 'time'),
          col('Pos', 22, 'center', 'post'),
          col('Shift', 9, 'center', 'shift'),
          col('Tanggal Shift', 13, 'center', 'shiftDate'),
          col('Kejadian', 16, 'center', 'incidentType'),
          col('Keterangan Other', 22, 'text', 'otherText')
        ].concat(S.questions.map(function (q) {
          return col(q.label, 24, 'text', function (r) { return (r.answers || {})[q.key] || ''; });
        })).concat(legacy).concat([
          col('Tindakan', 30, 'text', 'tindakan'),
          col('Petugas', 34, 'text', function (r) { return (r.officers || []).join(', '); }),
          col('BKO TNI', 18, 'text', 'bko'),
          col('Pelapor', 20, 'text', 'reporter')
        ]), 2),

        sheet('Access Control', records.filter(function (r) { return r.kind === 'access'; }), [
          col('Tanggal', 12, 'center', 'date'),
          col('Pukul', 9, 'center', 'accessTime'),
          col('Pos', 22, 'center', 'post'),
          col('Shift', 9, 'center', 'shift'),
          col('Tanggal Shift', 13, 'center', 'shiftDate'),
          col('Arah', 15, 'center', 'direction'),
          col('Dari', 20, 'text', 'from'),
          col('Menuju', 20, 'text', 'to'),
          col('ACC oleh', 18, 'text', 'approvedBy'),
          col('Petugas', 34, 'text', function (r) { return (r.officers || []).join(', '); }),
          col('BKO TNI', 18, 'text', 'bko'),
          col('Pelapor', 20, 'text', 'reporter'),
          col('Waktu Simpan', 19, 'center', 'timestamp')
        ], 2, S.accessPhotos, S.accessPhotosShort),

        sheet('Body Check', records.filter(function (r) { return r.kind === 'body'; }), [
          col('Tanggal', 12, 'center', 'date'),
          col('Pukul', 9, 'center', 'bodyTime'),
          col('Pos', 22, 'center', 'post'),
          col('Shift', 9, 'center', 'shift'),
          col('Tanggal Shift', 13, 'center', 'shiftDate'),
          col('Hasil', 14, 'center', bodyResult),
          col('Temuan', 36, 'text', 'bodyFinding'),
          col('Petugas', 34, 'text', function (r) { return (r.officers || []).join(', '); }),
          col('BKO TNI', 18, 'text', 'bko'),
          col('Pelapor', 20, 'text', 'reporter'),
          col('Waktu Simpan', 19, 'center', 'timestamp')
        ], 2),

        sheet('Shift', records.filter(function (r) { return r.kind === 'shift'; }), [
          col('Tanggal Shift', 13, 'center', 'shiftDate'),
          col('Pos', 22, 'center', 'post'),
          col('Shift', 9, 'center', 'shift'),
          col('Petugas', 34, 'text', function (r) { return (r.officers || []).join(', '); }),
          col('BKO TNI', 18, 'text', 'bko'),
          col('Pengecekan Terkirim', 26, 'text', function (r) { return hours(r, true); }),
          col('Pengecekan Kosong', 26, 'text', function (r) { return hours(r, false); })
        ].concat(S.incidentTypes.map(function (type) {
          return col(type, 22, 'text', function (r) {
            return (r.incidentSummary || {})[type] || 'None';
          });
        })).concat([
          col('Jam Serah Terima', 12, 'center', 'handover'),
          col('Shift Lanjut', 34, 'text', function (r) { return (r.nextOfficers || []).join(', '); }),
          col('BKO Lanjut', 18, 'text', 'nextBko'),
          col('Situasi Akhir', 34, 'text', 'finalSituation'),
          col('Pelapor', 20, 'text', 'reporter'),
          col('Waktu Simpan', 19, 'center', 'timestamp')
        ]), 3)
      ]; }
    }
  };

  function hours(record, done) {
    return (record.checkLines || [])
      .filter(function (c) { return !!c.done === done; })
      .map(function (c) { return SA.hourText(c.hour); })
      .join(', ');
  }

  var col = SA.sheets.col;

  function sheet(name, records, fixed, freeze, photoNames, shortNames) {
    return SA.sheets.build(name, records, fixed, {
      label: SA.secRecords.label, freeze: freeze,
      photoNames: photoNames, shortNames: shortNames
    });
  }
}(window.SA));
