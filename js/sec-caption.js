/* The Security Officer's three WhatsApp reports.
 *
 * These are the deliverable. Their wording was agreed line by line with Billy
 * on 2026-10-01 and is recorded in the README; change it there first.
 *
 * Rules shared by all three:
 *
 *   - Names are the full names from the personnel list, no ID numbers.
 *   - The BKO is always the LAST numbered line of an officer list, and reads
 *     "-" when there is none. The number is counted, never typed: two officers
 *     make it 3., three make it 4.
 *   - Colons line up within each block. The padding is computed from the
 *     labels, so no width is written down anywhere.
 *   - The post is the Excel post name, everywhere in the text.
 */

(function (SA) {

  var S = SA.SECURITY;

  /** "1. RAFILINDO", "2. YONDA RAFANA", "3. BKO TNI : -" */
  function numbered(names, bkoLabel, bko, indent) {
    var lead = indent || '';
    var lines = (names || []).map(function (name, index) {
      return lead + (index + 1) + '. ' + name;
    });
    lines.push(lead + ((names || []).length + 1) + '. ' + bkoLabel + ' : ' +
      (bko && String(bko).trim() ? String(bko).trim() : '-'));
    return lines;
  }

  /** To / Cc / Hal, then a blank line. */
  function header(hal) {
    var line = SA.aligner(['To', 'Cc', 'Hal']);
    return [line('To', S.TO), line('Cc', S.CC), line('Hal', hal), ''];
  }

  function officerBlock(record) {
    return ['NAMA PETUGAS SECURITY :']
      .concat(numbered(record.officers, 'BKO TNI', record.bko));
  }

  function hasBko(record) { return !!(record.bko && String(record.bko).trim()); }

  SA.secCaption = {

    numbered: numbered,

    /** The hourly check. The date is the date of the scheduled hour, so the
        00:00 check of a Sore shift is dated the next day, as it happened. */
    check: function (record) {
      var when = SA.shiftHourDate(record.shiftDate, record.hour);
      var line = SA.aligner(['Hari/Tgl', 'Shift']);
      var post = record.post;

      var sentence =
        'Pukul ' + SA.hourText(record.hour) + ' WIB, Petugas Security Pos ' + post +
        (hasBko(record) ? ' bersama BKO TNI' : '') +
        ' mohon izin untuk melaporkan situasi ' + post + ' saat ini. ' +
        'Petugas standby di pos penjagaan setelah melaksanakan patroli dan ' +
        'Guard Tour Point. Situasi dan kondisi ' + post + ' saat ini terpantau ' +
        'dalam keadaan aman dan terkendali.';

      return header('LAPORAN PETUGAS ' + post)
        .concat([
          line('Hari/Tgl', SA.longDate(when)),
          line('Shift', SA.shiftText(record.shift)),
          ''
        ])
        .concat(officerBlock(record))
        .concat([
          '',
          sentence,
          '',
          'Demikian Komandan, laporan dari Petugas Pos ' + post + '.',
          '',
          'Salam hormat,'
        ])
        .concat(record.officers || [])
        .join('\n');
    },

    /**
     * Access Control: goods going in or out, checked against the Cargo Manifest.
     * "Pukul" is the actual time the check happened, typed or picked -- not a
     * scheduled hour. "Dari" defaults to the post; "menuju" and the approver are
     * typed.
     */
    access: function (record) {
      var line = SA.aligner(['Hari/Tgl', 'Shift']);
      var direction = String(record.direction || S.accessDirections[0]).toLowerCase();
      var sentence =
        'Pukul ' + (record.accessTime || '-') + ' WIB, petugas melakukan access control ' +
        direction + ' dari ' + (record.from || record.post).trim() + ' menuju ' +
        ((record.to || '').trim() || '-') + '. Barang tertera di Cargo Manifest dan telah di-ACC oleh ' +
        ((record.approvedBy || '').trim() || '-') + '.';

      return header('LAPORAN ACCESS CONTROL ' + record.post)
        .concat([
          line('Hari/Tgl', SA.longDate(SA.parseDate(record.date))),
          line('Shift', SA.shiftText(record.shift)),
          ''
        ])
        .concat(officerBlock(record))
        .concat(['', sentence, S.ACCESS_SITUATION, '', 'Salam,'])
        .concat(record.officers || [])
        .join('\n');
    },

    /** One incident, sent the moment it is written. */
    incident: function (record) {
      var labels = ['Hari/Tgl', 'Shift', 'Kejadian', 'Tindakan'];
      S.questions.forEach(function (q) { labels.push(q.label); });
      var line = SA.aligner(labels);
      var answers = record.answers || {};

      var lines = header('LAPORAN KEJADIAN ' + record.post).concat([
        line('Hari/Tgl', SA.longDate(SA.parseDate(record.date))),
        line('Shift', SA.shiftText(record.shift)),
        line('Kejadian', SA.secCaption.incidentName(record)),
        ''
      ]);

      S.questions.forEach(function (q) {
        lines.push(line(q.label, (answers[q.key] || '').trim()));
      });

      lines.push('');
      lines.push(line('Tindakan', (record.tindakan || '').trim()));
      lines.push('');
      lines.push('Pelapor :');
      lines = lines.concat(numbered(record.officers, 'BKO TNI', record.bko));
      lines.push('');
      lines.push('Salam..');
      return lines.join('\n');
    },

    /** "VANDALISME", or "OTHER - pagar dirusak" when it was typed. */
    incidentName: function (record) {
      var type = String(record.incidentType || '').toUpperCase();
      var other = (record.otherText || '').trim();
      return record.incidentType === S.OTHER && other ? type + ' - ' + other : type;
    },

    /** The end-of-shift report. Sections A and B were frozen onto the record
        when it was saved, so re-sending it later prints the same thing. */
    shift: function (record) {
      var line = SA.aligner(['Hari/Tgl', 'Shift']);
      var lines = header('LAPORAN PETUGAS ' + record.post).concat([
        line('Hari/Tgl', SA.longDate(SA.parseDate(record.shiftDate))),
        line('Shift', SA.shiftText(record.shift)),
        ''
      ]).concat(officerBlock(record));

      lines.push('');
      lines.push('A. PEMERIKSAAN DAN CEK LIST :');
      var checks = record.checkLines || [];
      if (!checks.length) lines.push('   -');
      checks.forEach(function (check) {
        lines.push('   - Pukul ' + SA.hourText(check.hour) + ' WIB' +
          (check.done ? ' ✓' : ' — tidak ada laporan'));
      });

      lines.push('');
      lines.push('B. KEJADIAN (apa, siapa, kapan, dimana, mengapa, bagaimana) :');
      var incidentLine = SA.aligner(S.incidentTypes);
      var summary = record.incidentSummary || {};
      S.incidentTypes.forEach(function (type) {
        lines.push('   ' + incidentLine(type, summary[type] || 'None'));
      });

      lines.push('');
      lines.push('C. SITUASI AKHIR SERAH TERIMA :');
      var cLine = SA.aligner(['Jam serah terima', 'Shift lanjut']);
      lines.push('   - ' + cLine('Jam serah terima', record.handover ? record.handover + ' WIB' : '-'));
      lines.push('   - ' + cLine.head('Shift lanjut'));
      lines = lines.concat(numbered(record.nextOfficers, 'BKO', record.nextBko, '     '));
      lines.push('   - ' + (record.finalSituation || S.FINAL_SITUATION).trim());

      lines.push('');
      lines.push('Salam..');
      return lines.join('\n');
    }
  };
}(window.SA));
