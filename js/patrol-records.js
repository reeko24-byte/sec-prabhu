/* Patrol: the WhatsApp reports, what goes on the photo, what the seal binds,
 * and the Excel sheets (Billy, 2026-10-01).
 *
 * A Patrol record looks like:
 *   team 'patrol', kind 'patrol' | 'pend' | 'incident' | 'lds' | 'close'
 *   sessionId, patrolId ('PATROL 5'), zone ('North Area'), segments ('SEG 6, 11B, 11A'),
 *   shift, shiftDate, officers [..], tni, vehicle, reporter, date, time, timestamp
 *   patrol (one guard-tour checkpoint):
 *     area, check, weather, road, traffic, crash, gangguanSummary {type: text},
 *     patrolResult ('none'|'found'), patrolFinding, followUp, status, fieldInterview
 *   pend (end of shift):
 *     kmStart, kmEnd, facilities {name: 'Aktif'|'Tidak Aktif'},
 *     tours [{time, area, check}], findingList [{time, label, status}],
 *     nextOfficers [..], nextTni        the incoming crew (required)
 *   incident: incidentType, otherText, answers {5W1H}, tindakan, status
 *   lds, close: as Walkthrough's / findings.js
 *   photos [..]
 */

(function (SA) {

  var P = SA.PATROL;
  var S = SA.SECURITY;

  function trim(value) { return String(value || '').trim(); }

  function teamLabel(record) {
    var u = SA.patrolUnit(record.patrolId);
    return 'Patrol ' + (u ? u.n : record.patrolId || '');
  }

  /** HARI / TANGGAL / JAM / PATROL [/ AREA], aligned. */
  function head(title, record, area) {
    var long = SA.longDate(SA.parseDate(record.shiftDate || record.date));   // "KAMIS, 1 OKTOBER 2026"
    var comma = long.indexOf(',');
    var day = long.slice(0, comma);
    var rest = long.slice(comma + 2).split(' ');
    rest[0] = SA.pad2(Number(rest[0]));
    var shift = SA.shiftById(record.shift);
    var labels = ['HARI', 'TANGGAL', 'JAM', 'PATROL'].concat(area === undefined ? [] : ['AREA']);
    var line = SA.aligner(labels);
    var lines = [title, '',
      line('HARI', day),
      line('TANGGAL', rest.join(' ')),
      line('JAM', shift ? SA.hourText(shift.start) + ' WIB s/d ' + SA.hourText(shift.end) + ' WIB' : '-'),
      line('PATROL', (record.patrolId || '-') + (record.segments ? ' · ' + record.segments : ''))
    ];
    if (area !== undefined) lines.push(line('AREA', trim(area).toUpperCase() || '-'));
    return lines.concat(['']);
  }

  /** A. TOTAL PERSONIL: the TNI is the last numbered line and is counted. */
  function personnel(record) {
    var count = (record.officers || []).length + (trim(record.tni) ? 1 : 0);
    return ['A. TOTAL PERSONIL : ' + SA.countWords(count)]
      .concat(SA.secCaption.numbered(record.officers, 'TNI', record.tni, '   '));
  }

  function bullets(pairs) {
    var line = SA.aligner(pairs.map(function (p) { return p[0]; }));
    return pairs.map(function (p) { return '   - ' + line(p[0], p[1]); });
  }

  SA.patrolRecords = {

    teamLabel: teamLabel,

    caption: function (record) {
      if (record.kind === 'lds') return SA.lds.caption(record, teamLabel(record));
      if (record.kind === 'close') {
        return SA.findings.closeCaption(record,
          ['UPDATE TEMUAN ' + teamLabel(record).toUpperCase(), ''],
          ['Pelapor :'].concat(SA.secCaption.numbered(record.officers, 'TNI', record.tni))
            .concat(['', P.CLOSING]));
      }
      if (record.kind === 'incident') return SA.patrolRecords.incident(record);
      if (record.kind === 'pend') return SA.patrolRecords.end(record);
      return SA.patrolRecords.tour(record);
    },

    /** One guard-tour checkpoint: the agreed monitoring report. */
    tour: function (record) {
      var summary = record.gangguanSummary || {};
      var lines = head(P.TITLE, record, record.area)
        .concat(personnel(record))
        .concat(['', 'B. KENDARAAN : ' + (trim(record.vehicle) || '-'), ''])
        // The check replaces "Nihil" (Billy).
        .concat(['C. GUARD TOUR : ' + (trim(record.check) || P.NIHIL), ''])
        .concat(['D. CUACA DAN KONDISI JALAN :'])
        .concat(bullets([
          ['Cuaca', record.weather || '-'],
          ['Jalan', record.road || '-'],
          ['Kemacetan', trim(record.traffic) || P.NIHIL],
          ['Tabrakan', trim(record.crash) || P.NIHIL]
        ]))
        .concat(['', 'E. GANGGUAN :'])
        .concat(bullets(P.gangguan.map(function (type) { return [type, summary[type] || P.NIHIL]; })))
        .concat(['']);
      if (record.patrolResult === 'found') {
        lines = lines.concat(['F. TEMUAN / KEJADIAN :']).concat(bullets([
          ['Temuan', SA.sentence(record.patrolFinding)],
          ['Tindak lanjut', SA.sentence(record.followUp)],
          ['Status', SA.findings.status(record)]
        ]));
      } else {
        lines.push('F. TEMUAN / KEJADIAN : ' + P.NIHIL);
      }
      lines.push('');
      lines.push('G. FIELD INTERVIEW :');
      String(record.fieldInterview || '').split(/\r?\n/).map(trim).filter(Boolean).forEach(function (l) {
        lines.push('   - ' + l);
      });
      lines.push('');
      lines.push(P.CLOSING);
      return lines.join('\n');
    },

    /** End of shift: kilometres, the checkpoints, the facilities, the findings. */
    end: function (record) {
      var km = SA.patrolRecords.distance(record);
      var tours = record.tours || [];
      var found = record.findingList || [];
      var lines = head('LAPORAN AKHIR SHIFT PATROLI SECURITY PT PRABHU', record)
        .concat(personnel(record))
        .concat(['', 'B. KENDARAAN : ' + (trim(record.vehicle) || '-'), '', 'C. KILOMETER :'])
        .concat(bullets([
          ['KM awal', trim(record.kmStart) || '-'],
          ['KM akhir', trim(record.kmEnd) || '-'],
          ['Jarak tempuh', km === null ? '-' : km + ' km']
        ]))
        .concat(['', 'D. GUARD TOUR : ' + (tours.length ? tours.length + ' titik' : P.NIHIL)]);
      tours.forEach(function (t) {
        lines.push('   - Pukul ' + t.time + ' WIB · ' + (trim(t.area).toUpperCase() || '-') +
          (trim(t.check) ? ' — ' + trim(t.check) : ''));
      });
      lines.push('');
      lines.push('E. FASILITAS :');
      lines = lines.concat(bullets(P.facilities.map(function (name) {
        return [name, (record.facilities || {})[name] || '-'];
      })));
      lines.push('');
      lines.push('F. TEMUAN / KEJADIAN : ' + (found.length ? '' : P.NIHIL));
      found.forEach(function (f) {
        lines.push('   - Pukul ' + f.time + ' WIB · ' + f.label + ' (' + f.status + ')');
      });
      // G. Who takes over (Billy, 2026-10-02), as in Security's shift report.
      // Reports saved before v24 have no incoming crew: no empty G for them.
      if (Array.isArray(record.nextOfficers)) {
        var shift = SA.shiftById(record.shift);
        var g = SA.aligner(['Jam serah terima', 'Shift lanjut']);
        lines.push('');
        lines.push('G. SERAH TERIMA :');
        lines.push('   - ' + g('Jam serah terima', shift ? SA.hourText(shift.end) + ' WIB' : '-'));
        lines.push('   - ' + g.head('Shift lanjut'));
        lines = lines.concat(SA.secCaption.numbered(record.nextOfficers, 'TNI', record.nextTni, '     '));
      }
      lines.push('');
      lines.push(P.CLOSING);
      return lines.join('\n').replace(/ : \n/g, ' :\n');
    },

    /** E. Gangguan: its own report, 5W1H like Security's. */
    incident: function (record) {
      var labels = ['Kejadian', 'Tindakan', 'Status'];
      S.questions.forEach(function (q) { labels.push(q.label); });
      var line = SA.aligner(labels);
      var answers = record.answers || {};
      var lines = head('LAPORAN KEJADIAN PATROLI SECURITY PT PRABHU', record)
        .concat([line('Kejadian', SA.secCaption.incidentName(record)), '']);
      S.questions.forEach(function (q) {
        lines = lines.concat(SA.secCaption.block(line, q.label, answers[q.key]));
      });
      lines.push('');
      lines = lines.concat(SA.secCaption.block(line, 'Tindakan', record.tindakan));
      lines.push(line('Status', SA.findings.status(record)));
      lines.push('');
      lines.push('Pelapor :');
      lines = lines.concat(SA.secCaption.numbered(record.officers, 'TNI', record.tni));
      lines.push('');
      lines.push(P.CLOSING);
      return lines.join('\n');
    },

    /** Km driven, or null when either reading is missing or they go backwards. */
    distance: function (record) {
      var a = Number(String(record.kmStart || '').replace(/\D/g, ''));
      var b = Number(String(record.kmEnd || '').replace(/\D/g, ''));
      if (!trim(record.kmStart) || !trim(record.kmEnd) || b < a) return null;
      return b - a;
    },

    label: function (record) {
      if (record.kind === 'patrol') return 'Guard Tour · ' + (trim(record.area) || '-');
      if (record.kind === 'pend') return 'Akhir Shift ' + record.shift;
      if (record.kind === 'incident') return 'Kejadian · ' + SA.secCaption.incidentName(record);
      if (record.kind === 'lds') return 'LDS · Seg ' + record.ldsSegment + ' KP ' + SA.kpPrint(record.ldsKp);
      if (record.kind === 'close') return 'Tutup Temuan · ' + ((record.ref || {}).label || '');
      return record.kind;
    },

    /** The band's lines, minus time and place (the photo pipeline adds those). */
    stampLines: function (report) {
      var crew = (report.officers || []).length ? 'Patroli: ' + report.officers.join(', ') +
        (trim(report.tni) ? ' · TNI: ' + trim(report.tni) : '') : '';
      // "SECURITY PATROL - PATROL 5" on every photo (Billy), under the badge.
      var where = 'SECURITY PATROL - ' + teamLabel(report).toUpperCase() + ' · ' + (report.zone || '') +
        ' · Shift ' + report.shift;
      if (report.kind === 'patrol') {
        return ['GUARD TOUR · ' + (trim(report.area).toUpperCase() || '-'), where,
          trim(report.check).slice(0, 96), crew];
      }
      if (report.kind === 'pend') {
        return ['AKHIR SHIFT PATROLI · ' + (trim(report.vehicle) || ''), where,
          'KM ' + (trim(report.kmStart) || '-') + ' → ' + (trim(report.kmEnd) || '-'), crew];
      }
      if (report.kind === 'incident') {
        return ['KEJADIAN PATROLI · ' + SA.secCaption.incidentName(report), where, crew, ''];
      }
      if (report.kind === 'lds') {
        return ['LAPORAN LDS · Pukul ' + (report.ldsTime || '') + ' WIB', where,
          'Segment ' + (report.ldsSegment || '') + ' · KP ' + SA.kpPrint(report.ldsKp),
          SA.lds.resultText(report), crew];
      }
      return ['UPDATE TEMUAN · Pukul ' + (report.closeTime || '') + ' WIB', where,
        'Menutup: ' + ((report.ref || {}).label || ''), crew];
    },

    /** What the seal is bound to, in a fixed order. Append only. */
    sealFacts: function (report, timestamp, fix) {
      var detail = report.kind === 'patrol' ? trim(report.area) + ' ' + trim(report.check)
        : report.kind === 'pend' ? trim(report.kmStart) + '-' + trim(report.kmEnd)
        : report.kind === 'incident' ? SA.secCaption.incidentName(report)
        : report.kind === 'lds' ? [report.ldsSegment, report.ldsKp, report.ldsTime, report.result].join(' ')
        : report.kind === 'close' ? report.closeTime + ' ' + ((report.ref || {}).label || '') : '';
      return ['PAT1', timestamp, report.kind, report.patrolId, report.shift, report.shiftDate,
        detail, (report.officers || []).join('+'), report.tni || '',
        fix ? fix.latitude.toFixed(6) : '', fix ? fix.longitude.toFixed(6) : ''];
    },

    /** Five sheets: guard tour, incidents, LDS, end of shift, closed findings. */
    sheets: function (records) {
      var theme = SA.EXCEL_THEMES.patrol;
      var col = SA.sheets.col;
      var units = SA.sheets.unique(records.map(function (r) { return r.patrolId; }).filter(Boolean));
      var period = SA.sheets.period(records.map(function (r) { return r.shiftDate || r.date; }));
      var now = new Date();
      var names = function (r) { return (r.officers || []).join(', '); };
      var base = [
        col('Tanggal', 12, 'center', 'date'),
        col('Waktu', 10, 'center', 'time'),
        col('Patrol', 10, 'center', 'patrolId'),
        col('Wilayah', 12, 'center', 'zone'),
        col('Shift', 9, 'center', 'shift'),
        col('Tanggal Shift', 13, 'center', 'shiftDate')
      ];
      var crew = [
        col('Petugas', 34, 'text', names),
        col('TNI', 18, 'text', 'tni'),
        col('Kendaraan', 26, 'text', 'vehicle'),
        col('Pelapor', 20, 'text', 'reporter')
      ];
      function of(kind) { return records.filter(function (r) { return r.kind === kind; }); }
      function build(name, kind, cols, extra) {
        return SA.sheets.build(name, of(kind), base.concat(cols).concat(crew),
          Object.assign({ label: SA.patrolRecords.label, freeze: 3 }, extra || {}));
      }

      var sheets = [
        build('Guard Tour', 'patrol', [
          col('Lokasi', 22, 'text', 'area'),
          col('Pengecekan', 36, 'text', 'check'),
          col('Cuaca', 10, 'center', 'weather'),
          col('Jalan', 10, 'center', 'road'),
          col('Kemacetan', 16, 'text', function (r) { return trim(r.traffic) || P.NIHIL; }),
          col('Tabrakan', 16, 'text', function (r) { return trim(r.crash) || P.NIHIL; }),
          col('Temuan', 30, 'text', function (r) { return r.patrolResult === 'found' ? trim(r.patrolFinding) : P.NIHIL; }),
          col('Tindak Lanjut', 30, 'text', 'followUp'),
          col('Status', 10, 'center', SA.findings.status)
        ]),
        build('Kejadian', 'incident', [
          col('Kejadian', 16, 'center', 'incidentType'),
          col('Keterangan Dll', 22, 'text', 'otherText')
        ].concat(S.questions.map(function (q) {
          return col(q.label, 24, 'text', function (r) { return (r.answers || {})[q.key] || ''; });
        })).concat([
          col('Tindakan', 30, 'text', 'tindakan'),
          col('Status', 10, 'center', SA.findings.status)
        ])),
        build('LDS', 'lds', [col('Jam', 9, 'center', 'ldsTime')].concat(SA.lds.columns()), { minPhotos: 4 }),
        build('Akhir Shift', 'pend', [
          col('KM Awal', 11, 'center', 'kmStart'),
          col('KM Akhir', 11, 'center', 'kmEnd'),
          col('Jarak (km)', 10, 'center', function (r) {
            var d = SA.patrolRecords.distance(r); return d === null ? '' : String(d);
          }),
          col('Titik Guard Tour', 16, 'center', function (r) { return String((r.tours || []).length); })
        ].concat(P.facilities.map(function (name) {
          return col(name, 12, 'center', function (r) { return (r.facilities || {})[name] || ''; });
        })).concat([
          col('Temuan', 36, 'text', function (r) {
            return (r.findingList || []).map(function (f) { return f.label + ' (' + f.status + ')'; }).join('; ');
          }),
          col('Shift Lanjut', 34, 'text', function (r) { return (r.nextOfficers || []).join(', '); }),
          col('TNI Lanjut', 18, 'text', 'nextTni')
        ])),
        build('Update Temuan', 'close', [col('Pukul', 9, 'center', 'closeTime')].concat(SA.findings.closeColumns()))
      ];

      var titles = { 'Guard Tour': 'GUARD TOUR', Kejadian: 'LAPORAN KEJADIAN', LDS: 'LAPORAN LDS',
        'Akhir Shift': 'LAPORAN AKHIR SHIFT', 'Update Temuan': 'UPDATE TEMUAN' };
      return sheets.map(function (sheet) {
        sheet.title = theme.title + ' — ' + titles[sheet.name];
        sheet.subtitle = 'PT Prabhu · ' + (units.join(', ') || '-');
        sheet.meta = [
          ['Periode', period],
          ['Patrol', units.join(', ') || '-'],
          ['Jumlah', sheet.rows.length + ' laporan'],
          ['Diexport', SA.dateOf(now) + ' ' + SA.timeOf(now).slice(0, 5)]
        ];
        sheet.note = SA.sheets.PHOTO_NOTE;
        return sheet;
      });
    }
  };
}(window.SA));
