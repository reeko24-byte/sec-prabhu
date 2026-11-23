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
 *   giat:  supervisi, lokasi, personilGroups [{ place, names: [..] }], entries [{ time, text }],
 *          temuan, eventNote, aght, kendala   (before v60: personil and kegiatan as plain text)
 *   event: where, what, why, groups [{ party, names: [..] }], steps [{ time, text }], closing, demikian
 *   incident (v60): the incident form every team uses (incidentType, otherText, answers, tindakan,
 *          status) plus demikian; zone = the ARCO's area, or the one the PM picked
 *   close (v60): Tutup temuan, as every team
 *   timeMode (v60)  'one' (15:21 WIB) | 'range' (09:30-16:00 WIB) | 'open' (08:45 WIB s/d selesai);
 *          a record without it prints as before (an end time = a range, none = s/d selesai)
 *   photos [..]
 *
 * v60 (Billy, 2026-11-23, from the ARCOs' own WhatsApp reports): incidents with Open/Close and Tutup
 * temuan, so a case reported one day and finished the next is one case; the office tool reads them.
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
    CLOSING: 'Kegiatan berjalan lancar, situasi aman dan kondusif.',
    /* The last line before "Dokumentasi terlampir." -- typed by the ARCO, this by default (v60). */
    DEMIKIAN: { event: 'Demikian Komandan laporan kegiatan ini.', incident: 'Demikian Komandan laporan kejadian ini.' },
    AREAS: ['North Area', 'South Area'],
    TIME_MODES: [['one', 'Jam saja'], ['range', 'Sampai jam'], ['open', 's/d selesai']]
  };

  var M = SA.MGMT;

  function unitOf(name) {
    return M.units.filter(function (u) { return u.name === name; })[0] || null;
  }

  function lines(text) {
    return String(text || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function orNihil(text) { return String(text || '').trim() || M.NIHIL; }

  /** "15:21 WIB", "09:30–16:00 WIB", "08:45 WIB s/d selesai", or '' when no time was given. */
  function hours(r) {
    if (!r.timeStart) return '';
    var mode = r.timeMode || (r.timeEnd ? 'range' : 'open');      // before v60: no mode
    if (mode === 'one') return r.timeStart + ' WIB';
    if (mode === 'range') return r.timeEnd ? r.timeStart + '–' + r.timeEnd + ' WIB' : r.timeStart + ' WIB';
    return r.timeStart + ' WIB s/d selesai';
  }

  /** "10:00" -> "10.00", as the ARCOs write it in Kegiatan Supervisi. */
  function dotted(time) { return String(time || '').replace(':', '.'); }

  /** Giat E: the people on duty, per post / patrol / WT team. On the form a group
      holds `picked` (tapped from the roster) and `extra` (typed, one per line);
      saved, a list of names. */
  function personilOf(r) {
    if (Array.isArray(r.personilGroups)) {
      return r.personilGroups.map(function (g) {
        var names = Array.isArray(g.names) ? g.names
          : (g.picked || []).concat(lines(g.extra));
        return { place: String(g.place || '').trim(), names: names };
      }).filter(function (g) { return g.names.length; });
    }
    return null;          // before v60: r.personil, plain text
  }

  /** Giat F: the entries that have text, each with its time. */
  function entriesOf(r) {
    if (!Array.isArray(r.entries)) return null;     // before v60: r.kegiatan, plain text
    return r.entries.filter(function (e) { return String(e.text || '').trim(); });
  }

  /** "- Pukul : 10.00 WIB" then the text indented; "- " lines inside stay sub-points. */
  function entryLines(e) {
    var body = String(e.text || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var out = e.time ? ['- Pukul : ' + dotted(e.time) + ' WIB'].concat(body.map(function (s) { return '  ' + s; }))
      : ['- ' + body[0]].concat(body.slice(1).map(function (s) { return '  ' + s; }));
    return out;
  }

  /** The people an ARCO supervises, by place: the area's Security posts, Patrols and WT teams
      (all of them for the PM), each with its roster. */
  function personilPlaces(zone) {
    var out = [];
    var S = SA.SECURITY, P = SA.PATROL, W = SA.WT;
    function inZone(z) { return !zone || z === zone; }
    if (S) {
      S.posts.forEach(function (p) {
        if (inZone(p.zone)) out.push({ name: p.name, kind: 'Pos', members: (S.roster || {})[p.name] || [] });
      });
    }
    if (P) {
      P.units.forEach(function (u) { if (inZone(u.area)) out.push({ name: u.id, kind: 'Patrol', members: u.members }); });
    }
    if (W) {
      W.groups.forEach(function (g) {
        if (inZone(g.zone)) out.push({ name: 'WT ' + g.label, kind: 'WT', members: g.members });
      });
    }
    return out;
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

  /** The ARCO's own last sentence, or the default for the kind. */
  function demikian(r) {
    return SA.sentence(String(r.demikian || '').trim() || M.DEMIKIAN[r.kind] || M.DEMIKIAN.event);
  }

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
    hours: hours,
    personilOf: personilOf,
    personilPlaces: personilPlaces,

    caption: function (r) {
      if (r.kind === 'incident') return SA.mgmtRecords.incidentCaption(r);
      if (r.kind === 'close') return SA.mgmtRecords.closeCaption(r);
      return r.kind === 'event' ? SA.mgmtRecords.eventCaption(r) : SA.mgmtRecords.giatCaption(r);
    },

    giatCaption: function (r) {
      var unit = unitOf(r.unit);
      var role = unit ? unit.role : 'Arco';
      var date = SA.longDate(SA.parseDate(r.date));
      // "Pukul" sits under "Hari/Tgl", its colon in line: the indent is part of the label measured.
      var line = SA.aligner(['B. Hari/Tgl', '    Pukul']);
      var lokasi = lines(r.lokasi);
      var groups = personilOf(r);
      var personil = lines(r.personil);
      var entries = entriesOf(r);
      var out = header(r, giatTitle(r)).concat(['Izin melaporkan,', '', 'A. Nama ' + role + ' :'])
        .concat(listed(r.officers || []))
        .concat(['', line('B. Hari/Tgl', date)]);
      if (hours(r)) out.push(line('    Pukul', hours(r)));
      out.push('', 'C. Supervisi : ' + orNihil(r.supervisi), '');
      if (lokasi.length > 1) out = out.concat(['D. Lokasi :'], listed(lokasi, true));
      else out.push('D. Lokasi : ' + (lokasi[0] || '-'));
      out.push('', 'E. Nama Personil :');
      if (groups) {
        if (!groups.length) out.push('-');
        groups.forEach(function (g) {
          // A group with no place (E kept as plain text before v60): the names alone
          if (g.place) out.push('- ' + g.place);
          g.names.forEach(function (n, i) { out.push((g.place ? '  ' : '') + (i + 1) + '. ' + n); });
        });
      } else {
        out = out.concat(personil.length ? listed(personil) : ['-']);
      }
      out.push('', 'F. Kegiatan Supervisi :');
      if (entries) {
        if (!entries.length) out.push('-');
        entries.forEach(function (e, i) {
          if (i) out.push('');
          out = out.concat(entryLines(e));
        });
      } else {
        out = out.concat(lines(r.kegiatan).length ? lines(r.kegiatan) : ['-']);
      }
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
      out.push('', SA.sentence(r.closing || M.CLOSING), '', demikian(r), 'Dokumentasi terlampir.');
      return out.concat(signOff(r)).join('\n');
    },

    /** An incident (v60): the form every team uses, under the Manajemen header. */
    incidentCaption: function (r) {
      var S = SA.SECURITY;
      var labels = ['Hari/Tgl', 'Area', 'Kejadian', 'Tindakan', 'Status'];
      S.questions.forEach(function (q) { labels.push(q.label); });
      var line = SA.aligner(labels);
      var answers = r.answers || {};
      var out = header(r, 'LAPORAN KEJADIAN ' + r.unit).concat(['Izin melaporkan,', '',
        line('Hari/Tgl', SA.longDate(SA.parseDate(r.date)))]);
      if (r.zone) out.push(line('Area', r.zone));
      out.push(line('Kejadian', SA.secCaption.incidentName(r)), '');
      S.questions.forEach(function (q) { out = out.concat(SA.secCaption.block(line, q.label, answers[q.key])); });
      out.push('');
      out = out.concat(SA.secCaption.block(line, 'Tindakan', r.tindakan));
      out.push(line('Status', SA.findings.status(r)), '', demikian(r), 'Dokumentasi terlampir.');
      return out.concat(signOff(r)).join('\n');
    },

    /** Tutup temuan for one of the unit's incidents. */
    closeCaption: function (r) {
      return SA.findings.closeCaption(r, header(r, 'UPDATE TEMUAN ' + r.unit).concat(['Izin melaporkan,', '']),
        ['Dokumentasi terlampir.'].concat(signOff(r)));
    },

    label: function (r) {
      if (r.kind === 'incident') return 'Kejadian · ' + SA.secCaption.incidentName(r);
      if (r.kind === 'close') return 'Tutup Temuan · ' + ((r.ref || {}).label || '');
      if (r.kind === 'event') return 'Kegiatan · ' + (lines(r.what)[0] || '-');
      return 'Giat · ' + (String(r.supervisi || '').trim() || '-');
    },

    /** The report's facts on the photo, set before the first one is taken. */
    stampLines: function (d) {
      var what = d.kind === 'event' ? 'Kegiatan: ' + (lines(d.what)[0] || '-')
        : d.kind === 'incident' ? 'Kejadian: ' + (SA.secCaption.incidentName(d) || '-')
        : d.kind === 'close' ? 'Update temuan: ' + ((d.ref || {}).label || '-')
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
      var mode = d.timeMode || 'one';
      var out = { timeMode: mode, timeStart: d.timeStart || '', timeEnd: mode === 'range' ? d.timeEnd || '' : '' };
      if (d.kind === 'giat') {
        ['supervisi', 'lokasi'].forEach(function (k) { out[k] = String(d[k] || '').trim(); });
        out.personilGroups = personilOf(d) || [];
        out.entries = (entriesOf(d) || []).map(function (e) {
          return { time: e.time || '', text: String(e.text).trim() };
        });
        ['temuan', 'eventNote', 'aght', 'kendala'].forEach(function (k) { out[k] = orNihil(d[k]); });
      } else {
        ['where', 'what', 'why'].forEach(function (k) { out[k] = String(d[k] || '').trim(); });
        out.groups = groupsOf(d);
        out.steps = (d.steps || []).map(function (s) {
          return { time: s.time || '', text: String(s.text || '').trim() };
        }).filter(function (s) { return s.text; });
        out.closing = String(d.closing || '').trim() || M.CLOSING;
        out.demikian = String(d.demikian || '').trim() || M.DEMIKIAN.event;
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
          col('Personil', 30, 'text', function (r) {
            var g = personilOf(r);
            return g ? g.map(function (x) { return (x.place ? x.place + ': ' : '') + x.names.join(', '); }).join('\n')
              : lines(r.personil).join('\n');
          }),
          col('Kegiatan Supervisi', 60, 'text', function (r) {
            var e = entriesOf(r);
            return e ? e.map(function (x) { return entryLines(x).join('\n'); }).join('\n\n') : r.kegiatan || '';
          }),
          col('Temuan', 24, 'text', 'temuan'),
          col('Event dll', 30, 'text', 'eventNote'),
          col('Kejadian AGHT', 24, 'text', 'aght'),
          col('Kendala', 24, 'text', 'kendala'),
          col('Jumlah Personil', 11, 'number', function (r) {
            var g = personilOf(r);
            return g ? g.reduce(function (n, x) { return n + x.names.length; }, 0) : lines(r.personil).length;
          })
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

      // The incident sheets carry Patrol's columns, so the office tool reads them the same way (v60).
      var placeCols = [
        col('Tanggal', 12, 'center', 'date'),
        col('Waktu', 9, 'center', function (r) { return String(r.time || '').slice(0, 5); }),
        col('Unit', 13, 'center', 'unit'),
        col('Zona', 11, 'center', 'zone'),
        col('Nama', 30, 'text', names)
      ];
      var S = SA.SECURITY;
      var incident = SA.sheets.build('Kejadian', records.filter(function (r) { return r.kind === 'incident'; }),
        placeCols.concat([
          col('Kejadian', 16, 'center', 'incidentType'),
          col('Keterangan Dll', 22, 'text', 'otherText')
        ]).concat(S.questions.map(function (q) {
          return col(q.label, 24, 'text', function (r) { return (r.answers || {})[q.key] || ''; });
        })).concat([
          col('Tindakan', 30, 'text', 'tindakan'),
          col('Status', 10, 'center', SA.findings.status)
        ], tail), { label: SA.mgmtRecords.label, freeze: 3 });
      incident.title = theme.title + ' — LAPORAN KEJADIAN';
      var close = SA.sheets.build('Update Temuan', records.filter(function (r) { return r.kind === 'close'; }),
        placeCols.concat([col('Pukul', 9, 'center', 'closeTime')]).concat(SA.findings.closeColumns(), tail),
        { label: SA.mgmtRecords.label, freeze: 3 });
      close.title = theme.title + ' — UPDATE TEMUAN';

      var sheets = [giat, event, incident, close].filter(function (s) { return s.rows.length; });
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
