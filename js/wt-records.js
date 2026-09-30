/* Walkthrough: the two WhatsApp reports, what goes on the photo, what the seal
 * binds, and the Excel sheets.
 *
 * A Walkthrough record looks like:
 *   team 'walkthrough', kind 'wtkp' | 'lds'
 *   sessionId, teamNo, zone, routeId, officers [..], reporter
 *   date, time, timestamp
 *   wtkp: segment, kp ("25+666"), condition, other
 *   lds:  ldsTime, ldsSegment, ldsKp, landmark, radius, result ('none'|'found'), finding
 *   photos [..]
 *
 * The LDS report is written for any team ("Tim WT 5" here, "Tim Patrol 3" when
 * Patrol is built) -- SA.lds.caption takes the team's label.
 */

(function (SA) {

  var W = SA.WT;

  function ticks(names) { return (names || []).map(function (n) { return '✅ ' + n; }); }

  function conditionOf(label) {
    var found = null;
    W.conditions.forEach(function (c) { if (c.label === label) found = c; });
    return found;
  }

  /** The Note sentence: the canned one, or what was typed for "Lainnya". */
  function noteOf(record) {
    var c = conditionOf(record.condition);
    if (!c) return '';
    return c.label === W.CONDITION_OTHER ? String(record.other || '').trim() : c.note;
  }

  function zoneOfSegment(id, fallback) {
    var seg = SA.wtSegment(id);
    return seg ? seg.zone : (fallback || '');
  }

  /* ── LDS, shared by every team that answers leak-detection tickets ─────── */

  SA.lds = {
    /**
     * The approved LDS shape (Billy, 2026-10-01). The @-tags are NOT created
     * here: WhatsApp only makes a real tag when it is picked from its own list,
     * so "@SPO ORA" is plain text for the guard to replace, and Cc is left for
     * the guard to fill in WhatsApp before sending.
     */
    caption: function (record, teamLabel) {
      var line = SA.aligner(['Hari/Tgl', 'Jam', 'Loc', 'Segment']);
      var kp = SA.kpPrint(record.ldsKp);
      var seg = record.ldsSegment || '-';
      var landmark = String(record.landmark || '').trim();
      // As typed: saving is blocked without a radius, so no default is invented here.
      var radius = String(record.radius || '').trim() || '-';
      var lines = [
        'Izin lapor Pak @SPO ORA, ' + teamLabel,
        '',
        'LAPORAN ' + teamLabel.toUpperCase()
      ];
      (record.officers || []).forEach(function (name, i) { lines.push(SA.keycap(i + 1) + ' ' + name); });
      lines.push('');
      lines.push(line('Hari/Tgl', SA.longDate(SA.parseDate(record.date))));
      lines.push(line('Jam', (record.ldsTime || '-') + ' WIB'));
      lines.push(line('Loc', zoneOfSegment(record.ldsSegment, record.zone).toUpperCase()));
      lines.push(line('Segment', seg + ' KP ' + (kp || '-') + (landmark ? ' (' + landmark + ')' : '')));
      lines.push('');
      lines.push('Melaporkan:');
      lines.push('- Team menanggapi adanya laporan notifikasi LDS di Segment ' + seg + ' KP ' + (kp || '-') + '.');
      lines.push('- Team melakukan penyisiran radius ' + radius + ' m dari titik deteksi di area Segment ' +
        seg + ' (KP ' + (kp || '-') + ').');
      if (record.result === 'found') {
        // One full stop at the end, whether or not the guard typed one.
        lines.push('- Team menemukan indikasi: ' +
          (String(record.finding || '').trim().replace(/[.\s]+$/, '') || '-') + '.');
      } else {
        lines.push('- Team tidak menemukan adanya crude atau kebocoran pada pipa PTG.');
        lines.push('- Area ROW PTG saat ini terpantau aman dan tidak ada indikasi hal-hal yang mencurigakan.');
      }
      lines.push('');
      lines.push('Cc :');
      lines.push('');
      lines.push('Terima kasih');
      return lines.join('\n');
    },

    resultText: function (record) {
      return record.result === 'found' ? 'Ditemukan indikasi' : 'Tidak ditemukan kebocoran';
    }
  };

  SA.wtRecords = {

    teamLabel: function (record) { return 'Tim WT ' + record.teamNo; },

    caption: function (record) {
      if (record.kind === 'lds') return SA.lds.caption(record, SA.wtRecords.teamLabel(record));
      var seg = SA.wtSegment(record.segment);
      var line = SA.aligner(['Location', 'Segment', 'KP', 'Size Pipe', 'Note']);
      return ['LAPORAN TEAM WT']
        .concat(ticks(record.officers))
        .concat([
          line('Location', zoneOfSegment(record.segment, record.zone)),
          line('Segment', SA.wtSegmentText(record.segment)),
          line('KP', SA.kpPrint(record.kp)),
          line('Size Pipe', seg ? SA.sizeText(seg.size) : ''),
          line('Note', noteOf(record))
        ]).join('\n');
    },

    label: function (record) {
      if (record.kind === 'lds') return 'LDS · Seg ' + record.ldsSegment + ' KP ' + SA.kpPrint(record.ldsKp);
      return 'KP ' + SA.kpPrint(record.kp) + ' · Seg ' + record.segment;
    },

    /** The band's lines, minus time and place (the photo pipeline adds those). */
    stampLines: function (report) {
      var crew = (report.officers || []).length ? 'Tim: ' + report.officers.join(', ') : '';
      if (report.kind === 'lds') {
        var landmark = String(report.landmark || '').trim();
        return [
          'LAPORAN LDS · Tim WT ' + report.teamNo + ' · Pukul ' + (report.ldsTime || '') + ' WIB',
          'Segment ' + (report.ldsSegment || '') + ' · KP ' + SA.kpPrint(report.ldsKp) +
            (landmark ? ' (' + landmark + ')' : ''),
          SA.lds.resultText(report),
          crew
        ];
      }
      var seg = SA.wtSegment(report.segment);
      var c = conditionOf(report.condition);
      return [
        'LAPORAN TEAM WT · TIM ' + report.teamNo + ' · ' + zoneOfSegment(report.segment, report.zone),
        'Segment ' + SA.wtSegmentText(report.segment) + (seg ? ' · ' + SA.sizeText(seg.size) : ''),
        'KP ' + SA.kpPrint(report.kp),
        c && c.label === W.CONDITION_OTHER ? String(report.other || '').trim().slice(0, 96) : report.condition,
        crew
      ];
    },

    /** What the seal is bound to, in a fixed order. Append only. */
    sealFacts: function (report, timestamp, fix) {
      var where = report.kind === 'lds'
        ? [report.ldsSegment, report.ldsKp, report.ldsTime, report.result]
        : [report.segment, report.kp, report.condition, ''];
      return ['WT2', timestamp, report.kind, 'T' + report.teamNo].concat(where).concat([
        (report.officers || []).join('+'),
        fix ? fix.latitude.toFixed(6) : '', fix ? fix.longitude.toFixed(6) : ''
      ]);
    },

    /** Two sheets: the KP reports and the LDS responses. */
    sheets: function (records) {
      var theme = SA.EXCEL_THEMES.walkthrough;
      var col = SA.sheets.col;
      var teams = SA.sheets.unique(records.map(function (r) { return 'Tim WT ' + r.teamNo; }));
      var period = SA.sheets.period(records.map(function (r) { return r.date; }));
      var now = new Date();
      var names = function (r) { return (r.officers || []).join(', '); };

      var kpSheet = SA.sheets.build('Laporan KP', records.filter(function (r) { return r.kind === 'wtkp'; }), [
        col('Tanggal', 12, 'center', 'date'),
        col('Waktu', 10, 'center', 'time'),
        col('Tim', 7, 'center', 'teamNo'),
        col('Location', 12, 'center', function (r) { return zoneOfSegment(r.segment, r.zone); }),
        col('Rute', 26, 'text', function (r) { return (W.routes[r.routeId] || {}).label || ''; }),
        col('Segment', 9, 'center', 'segment'),
        col('Nama Segment', 18, 'text', function (r) { var s = SA.wtSegment(r.segment); return s ? s.name : ''; }),
        col('KP', 11, 'center', function (r) { return SA.kpPrint(r.kp); }),
        col('Size Pipe', 11, 'center', function (r) { var s = SA.wtSegment(r.segment); return s ? SA.sizeText(s.size) : ''; }),
        col('Kondisi', 22, 'text', 'condition'),
        col('Note', 44, 'text', noteOf),
        col('Petugas', 34, 'text', names),
        col('Pelapor', 20, 'text', 'reporter')
      ], { label: SA.wtRecords.label, freeze: 3, minPhotos: 3 });

      var ldsSheet = SA.sheets.build('LDS', records.filter(function (r) { return r.kind === 'lds'; }), [
        col('Tanggal', 12, 'center', 'date'),
        col('Jam', 9, 'center', 'ldsTime'),
        col('Tim', 7, 'center', 'teamNo'),
        col('Loc', 12, 'center', function (r) { return zoneOfSegment(r.ldsSegment, r.zone); }),
        col('Segment', 9, 'center', 'ldsSegment'),
        col('KP', 11, 'center', function (r) { return SA.kpPrint(r.ldsKp); }),
        col('Patokan', 20, 'text', 'landmark'),
        col('Radius (m)', 10, 'center', 'radius'),
        col('Hasil', 22, 'text', SA.lds.resultText),
        col('Keterangan', 36, 'text', 'finding'),
        col('Petugas', 34, 'text', names),
        col('Pelapor', 20, 'text', 'reporter'),
        col('Waktu Simpan', 19, 'center', 'timestamp')
      ], { label: SA.wtRecords.label, freeze: 3, minPhotos: 4 });

      var titles = { 'Laporan KP': 'LAPORAN KP', LDS: 'LAPORAN LDS' };
      return [kpSheet, ldsSheet].map(function (sheet) {
        sheet.title = theme.title + ' — ' + titles[sheet.name];
        sheet.subtitle = 'PT Prabhu · ' + (teams.join(', ') || '-');
        sheet.meta = [
          ['Periode', period],
          ['Tim', teams.join(', ') || '-'],
          ['Jumlah', sheet.rows.length + ' laporan'],
          ['Diexport', SA.dateOf(now) + ' ' + SA.timeOf(now).slice(0, 5)]
        ];
        sheet.note = SA.sheets.PHOTO_NOTE;
        return sheet;
      });
    }
  };
}(window.SA));
