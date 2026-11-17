/* Manajemen: the Area Coordinators (ARCO North, ARCO South) and the Project
 * Manager (Billy, 2026-11-17). Their own reports, built from the samples they
 * already send in WhatsApp (FITUR TAMBAHAN\Contoh Laporan ARCO dan PM.txt):
 *
 *   giat   LAPORAN GIAT -- the day's supervision, items A-J as the ARCOs write
 *          them: Nama, Hari/Tgl, Supervisi, Lokasi, Personil, Kegiatan, Temuan,
 *          Event dll, Kejadian AGHT, Kendala
 *   event  LAPORAN KEGIATAN -- one event (MWT, ERP drill, wet drill...) in 5W1H:
 *          When, Where, What, Who listed BY PARTY (PTG, PHR, PDC, Security, BKO),
 *          Why, and How as a timeline
 *
 * Billy chose: the PM uses the same two forms; Who is grouped by party so the
 * tool can count attendees; stamped photos (never required) and an Excel export.
 * WhatsApp @-mentions cannot be made from shared text, so the header names the
 * readers in words and the sender adds the tags in WhatsApp, as everywhere else.
 *
 * A record looks like:
 *   team 'mgmt', kind 'giat' | 'event'
 *   sessionId, unit ('ARCO NORTH'), zone, officers [names], reporter, date, time, timestamp
 *   timeStart, timeEnd        'HH:MM' or ''
 *   giat:  supervisi, lokasi, personil, kegiatan, temuan, eventNote, aght, kendala
 *   event: where, what, why, groups [{ party, names: [..] }], steps [{ time, text }], closing
 *   photos [..]
 */

(function (SA) {

  SA.MGMT = {
    /* role   the word the reports use for the people ("Nama Arco", "Nama PM")
       cc     who else reads it: the PM's own report is not copied to the PM */
    units: [
      { name: 'ARCO NORTH', zone: 'North Area', role: 'Arco', members: ['DENI MAULANA', 'DADANG KURNIA'],
        cc: 'PM, Data Analyst' },
      { name: 'ARCO SOUTH', zone: 'South Area', role: 'Arco', members: ['YUDI HARDIANTO', 'DINO JULIVAN'],
        cc: 'PM, Data Analyst' },
      { name: 'PM', zone: '', role: 'PM', members: ['ARI SEPTIA T'], cc: 'Data Analyst' }
    ],
    TO: 'Junior Officer Security',
    NIHIL: 'Nihil',
    /* The parties offered for the Who list; anything else is typed. */
    parties: ['PTG', 'PHR', 'PDC', 'Security', 'BKO TNI', 'Pamovitnas', 'Rifansi', 'OSCT'],
    CLOSING: 'Kegiatan berjalan lancar, situasi aman dan kondusif.'
  };

  var M = SA.MGMT;

  function unitOf(name) {
    return M.units.filter(function (u) { return u.name === name; })[0] || null;
  }

  function lines(text) {
    return String(text || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function orNihil(text) { return String(text || '').trim() || M.NIHIL; }

  /** "09:30–16:00 WIB", "08:45 WIB s/d selesai", or '' when no time was given. */
  function hours(r) {
    if (!r.timeStart) return '';
    return r.timeEnd ? r.timeStart + '–' + r.timeEnd + ' WIB' : r.timeStart + ' WIB s/d selesai';
  }

  function header(record, hal) {
    var unit = unitOf(record.unit);
    var line = SA.aligner(['To', 'Cc', 'Hal']);
    return [line('To', M.TO), line('Cc', unit ? unit.cc : 'Data Analyst'), line('Hal', hal), ''];
  }

  /** "1. NAME" lines, or "- item" lines with `bullet`. */
  function listed(items, bullet) {
    return items.map(function (s, i) { return bullet ? '- ' + s : (i + 1) + '. ' + s; });
  }

  function signOff(record) {
    return ['', 'Salam,', record.unit];
  }

  function giatTitle(r) { return 'LAPORAN GIAT ' + r.unit; }
  function eventTitle(r) { return 'LAPORAN KEGIATAN ' + r.unit; }

  /** The Who list with each party's names as a list. On the form (the draft the
      preview reads) they are one block of text, one name per line; saved, a list. */
  function groupsOf(r) {
    return (r.groups || []).map(function (g) {
      return { party: String(g.party || '').trim(), names: Array.isArray(g.names) ? g.names : lines(g.names) };
    }).filter(function (g) { return g.names.length; });
  }

  /** People in the Who list, all parties together. */
  function attendees(r) {
    return groupsOf(r).reduce(function (n, g) { return n + g.names.length; }, 0);
  }

  function whoText(r) {
    return groupsOf(r).map(function (g) {
      return (g.party || '-') + ': ' + (g.names || []).join(', ');
    }).join('\n');
  }

  function howLines(r) {
    return (r.steps || []).filter(function (s) { return String(s.text || '').trim(); }).map(function (s) {
      return s.time ? 'Pukul ' + s.time + ' WIB, ' + String(s.text).trim() : String(s.text).trim();
    });
  }

  SA.mgmtRecords = {

    unitOf: unitOf,
    lines: lines,
    attendees: attendees,

    caption: function (r) {
      return r.kind === 'event' ? SA.mgmtRecords.eventCaption(r) : SA.mgmtRecords.giatCaption(r);
    },

    giatCaption: function (r) {
      var unit = unitOf(r.unit);
      var role = unit ? unit.role : 'Arco';
      var date = SA.longDate(SA.parseDate(r.date));
      // "Pukul" sits under "Hari/Tgl", its colon in line: the indent is part of the label measured.
      var line = SA.aligner(['B. Hari/Tgl', '    Pukul']);
      var lokasi = lines(r.lokasi);
      var personil = lines(r.personil);
      var out = header(r, giatTitle(r)).concat(['Izin melaporkan,', '', 'A. Nama ' + role + ' :'])
        .concat(listed(r.officers || []))
        .concat(['', line('B. Hari/Tgl', date)]);
      if (hours(r)) out.push(line('    Pukul', hours(r)));
      out.push('', 'C. Supervisi : ' + orNihil(r.supervisi), '');
      if (lokasi.length > 1) out = out.concat(['D. Lokasi :'], listed(lokasi, true));
      else out.push('D. Lokasi : ' + (lokasi[0] || '-'));
      out.push('', 'E. Nama Personil :');
      out = out.concat(personil.length ? listed(personil) : ['-']);
      out.push('', 'F. Kegiatan Supervisi :');
      out = out.concat(lines(r.kegiatan).length ? lines(r.kegiatan) : ['-']);
      out.push('',
        'G. Temuan : ' + orNihil(r.temuan), '',
        'H. Event dll : ' + orNihil(r.eventNote), '',
        'I. Kejadian AGHT : ' + orNihil(r.aght), '',
        'J. Kendala : ' + orNihil(r.kendala));
      return out.concat(signOff(r)).join('\n');
    },

    eventCaption: function (r) {
      var date = SA.longDate(SA.parseDate(r.date));
      var line = SA.aligner(['Hari/Tgl', 'Pukul']);
      var out = header(r, eventTitle(r)).concat(['Izin melaporkan,', '', 'WHEN', line('Hari/Tgl', date)]);
      if (hours(r)) out.push(line('Pukul', hours(r)));
      out.push('', 'WHERE');
      out = out.concat(listed(lines(r.where).length ? lines(r.where) : ['-'], true));
      out.push('', 'WHAT');
      out = out.concat(lines(r.what).length ? lines(r.what) : ['-']);
      out.push('', 'WHO');
      var groups = groupsOf(r);
      if (!groups.length) out.push('-');
      groups.forEach(function (g, i) {
        if (i) out.push('');
        out.push(g.party || '-');
        out = out.concat(listed(g.names, true));
      });
      out.push('', 'WHY');
      out = out.concat(lines(r.why).length ? lines(r.why) : ['-']);
      out.push('', 'HOW');
      out = out.concat(howLines(r).length ? listed(howLines(r), true) : ['-']);
      out.push('', SA.sentence(r.closing || M.CLOSING), '',
        'Demikian Komandan laporan kegiatan ini.', 'Dokumentasi terlampir.');
      return out.concat(signOff(r)).join('\n');
    },

    label: function (r) {
      if (r.kind === 'event') return 'Kegiatan · ' + (lines(r.what)[0] || '-');
      return 'Giat · ' + (String(r.supervisi || '').trim() || '-');
    },

    /** The report's facts on the photo, set before the first one is taken. */
    stampLines: function (d) {
      var what = d.kind === 'event' ? 'Kegiatan: ' + (lines(d.what)[0] || '-')
        : 'Supervisi: ' + (String(d.supervisi || '').trim() || '-');
      return ['MANAJEMEN · ' + d.unit, what.length > 70 ? what.slice(0, 69) + '…' : what,
        (d.officers || []).length ? 'Oleh: ' + d.officers.join(', ') : '', ''];
    },

    /** What the seal is bound to, in a fixed order. Append only. */
    sealFacts: function (d, timestamp, fix) {
      return ['MGT1', timestamp, d.kind, d.unit, d.date, (d.officers || []).join('+'),
        fix ? fix.latitude.toFixed(6) : '', fix ? fix.longitude.toFixed(6) : ''];
    },

    /** The draft's typed fields, tidied, onto the record being saved. */
    fields: function (d) {
      var out = { timeStart: d.timeStart || '', timeEnd: d.timeEnd || '' };
      if (d.kind === 'giat') {
        ['supervisi', 'lokasi', 'personil', 'kegiatan'].forEach(function (k) { out[k] = String(d[k] || '').trim(); });
        ['temuan', 'eventNote', 'aght', 'kendala'].forEach(function (k) { out[k] = orNihil(d[k]); });
      } else {
        ['where', 'what', 'why'].forEach(function (k) { out[k] = String(d[k] || '').trim(); });
        out.groups = groupsOf(d);
        out.steps = (d.steps || []).map(function (s) {
          return { time: s.time || '', text: String(s.text || '').trim() };
        }).filter(function (s) { return s.text; });
        out.closing = String(d.closing || '').trim() || M.CLOSING;
      }
      return out;
    },

    sheets: function (records) {
      var theme = SA.EXCEL_THEMES.mgmt;
      var col = SA.sheets.col;
      var units = SA.sheets.unique(records.map(function (r) { return r.unit; }));
      var period = SA.sheets.period(records.map(function (r) { return r.date; }));
      var now = new Date();
      function names(r) { return (r.officers || []).join(', '); }
      var common = [
        col('Tanggal', 12, 'center', 'date'),
        col('Unit', 13, 'center', 'unit'),
        col('Zona', 11, 'center', 'zone'),
        col('Nama', 30, 'text', names),
        col('Pukul', 16, 'center', function (r) { return hours(r).replace(' WIB', ''); })
      ];
      var tail = [col('Pelapor', 20, 'text', 'reporter'), col('Waktu Simpan', 19, 'center', 'timestamp')];

      var giat = SA.sheets.build('Laporan Giat', records.filter(function (r) { return r.kind === 'giat'; }),
        common.concat([
          col('Supervisi', 34, 'text', 'supervisi'),
          col('Lokasi', 28, 'text', function (r) { return lines(r.lokasi).join('\n'); }),
          col('Personil', 26, 'text', function (r) { return lines(r.personil).join('\n'); }),
          col('Kegiatan Supervisi', 60, 'text', 'kegiatan'),
          col('Temuan', 24, 'text', 'temuan'),
          col('Event dll', 30, 'text', 'eventNote'),
          col('Kejadian AGHT', 24, 'text', 'aght'),
          col('Kendala', 24, 'text', 'kendala')
        ], tail), { label: SA.mgmtRecords.label, freeze: 3, minPhotos: 2 });
      giat.title = theme.title + ' — LAPORAN GIAT';

      var event = SA.sheets.build('Laporan Kegiatan', records.filter(function (r) { return r.kind === 'event'; }),
        common.concat([
          col('Where', 26, 'text', function (r) { return lines(r.where).join('\n'); }),
          col('What', 40, 'text', 'what'),
          col('Who', 50, 'text', whoText),
          col('Jumlah Hadir', 11, 'number', attendees),
          col('Why', 40, 'text', 'why'),
          col('How', 70, 'text', function (r) { return howLines(r).join('\n'); }),
          col('Penutup', 36, 'text', 'closing')
        ], tail), { label: SA.mgmtRecords.label, freeze: 3, minPhotos: 2 });
      event.title = theme.title + ' — LAPORAN KEGIATAN';

      var sheets = [giat, event].filter(function (s) { return s.rows.length; });
      if (!sheets.length) sheets = [giat];
      sheets.forEach(function (sheet) {
        sheet.subtitle = 'PT Prabhu · ' + (units.join(', ') || '-');
        sheet.meta = [
          ['Periode', period],
          ['Unit', units.join(', ') || '-'],
          ['Jumlah', sheet.rows.length + ' laporan'],
          ['Diexport', SA.sheets.exported(now)]
        ];
        sheet.note = SA.sheets.PHOTO_NOTE;
      });
      return sheets;
    }
  };
}(window.SA));
