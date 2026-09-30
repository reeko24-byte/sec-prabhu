/* Laporan Tim -- screen wiring.
 *
 * One app, three teams. Only Security Officer is built; Patrol and Walkthrough
 * show on the first screen as "segera" so the shape of the super app is visible.
 *
 * SECURITY'S DAY is a shift: the post, who is on duty, the BKO and the shift
 * are asked ONCE at the start and then stay on every report of the shift. Three
 * reports are written from it:
 *
 *   Pengecekan  every hour -- "Pukul" is the scheduled hour, not the minute
 *   Kejadian    immediately, one report per incident
 *   Shift       at handover -- sections A and B fill themselves from the two
 *               above, so nothing is typed twice
 *
 * The share, the export and the diagnostics are WT's, unchanged in behaviour:
 * photos and caption go to WhatsApp in one tap, Android saves the Excel instead
 * of sharing it (Chrome refuses .xlsx), and the version marker prints both the
 * running code and the downloaded cache.
 */

(function (SA) {

  var S = SA.SECURITY;

  var state = {
    team: '',
    session: null,       // { id, post, shift, shiftDate, officers, bko }
    setup: { post: '', officers: [], bko: '', shift: '', date: '', others: false },
    gps: { state: 'waiting' },
    draft: null,         // the report being written
    nextOthers: false,   // "Tampilkan pos lain" on the Shift lanjut picker
    photos: [],
    lastAddress: null,
    sessionRecords: [],
    sending: null,
    built: null,
    chosen: [],
    includeExported: false
  };

  var addressCache = {};

  function $(id) { return document.getElementById(id); }

  var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  var SCREENS = ['team', 'setup', 'main', 'report', 'send', 'list', 'export'];

  function show(name) {
    SCREENS.forEach(function (screen) {
      $('screen-' + screen).classList.toggle('active', screen === name);
    });
    window.scrollTo(0, 0);
  }

  var toastTimer;
  function toast(message) {
    var element = $('toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { element.classList.remove('show'); }, 2600);
  }

  function describe(error) {
    if (!error) return 'unknown';
    var name = error.name || 'Error';
    return error.message ? name + ': ' + error.message : name;
  }

  function isAndroid() { return /Android/.test(navigator.userAgent); }

  /* Chrome on Android will not share an .xlsx, ever -- its allowlist is checked
     after canShare() has said yes. So the download is the real path there. */
  function fileShareLikelyBlocked() { return isAndroid(); }

  function hhmm(d) { return SA.pad2(d.getHours()) + ':' + SA.pad2(d.getMinutes()); }

  /* ── 1. Team ─────────────────────────────────────────────────────────── */

  function buildTeamChips() {
    var container = $('team-chips');
    container.innerHTML = '';
    SA.TEAMS.forEach(function (team) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'team';
      chip.innerHTML =
        '<span class="t-icon"><svg width="22" height="22" aria-hidden="true"><use href="#' + team.icon + '"/></svg></span>' +
        '<span class="t-text"><b></b><small></small></span>' +
        (team.ready ? '<svg class="t-go" width="20" height="20" aria-hidden="true"><use href="#i-chevron"/></svg>' : '');
      chip.querySelector('b').textContent = team.label;
      if (!team.ready) {
        var soon = document.createElement('span');
        soon.className = 'soon';
        soon.textContent = 'segera';
        chip.querySelector('b').appendChild(soon);
      }
      chip.querySelector('small').textContent = team.note;
      chip.disabled = !team.ready;
      chip.setAttribute('aria-pressed', String(state.team === team.id));
      chip.addEventListener('click', function () {
        state.team = team.id;
        SA.db.setPref('team', team.id);
        buildTeamChips();
        if (state.session) { renderMain(); show('main'); } else { openSetup(); }
      });
      container.appendChild(chip);
    });
  }

  $('main-team').addEventListener('click', function () { buildTeamChips(); show('team'); });
  $('setup-back').addEventListener('click', function () { buildTeamChips(); show('team'); });

  /* ── Name picker (used for the officers on duty and for Shift lanjut) ── */

  /**
   * Tick rows: this post's people first, the rest behind "Tampilkan pos lain".
   * The order ticked is the order printed, so a tick appends and an untick
   * removes without reshuffling the others.
   */
  function renderPicker(container, post, selected, expanded, onExpand, onChange) {
    container.innerHTML = '';

    function heading(text) {
      var head = document.createElement('div');
      head.className = 'pick-head';
      head.textContent = text;
      container.appendChild(head);
    }

    function row(name) {
      var at = selected.indexOf(name);
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'pick';
      button.setAttribute('aria-pressed', String(at !== -1));
      // The circle carries the print order: 1, 2, 3 in the order ticked.
      var box = document.createElement('span');
      box.className = 'box';
      box.textContent = at === -1 ? '' : String(at + 1);
      button.appendChild(box);
      var who = document.createElement('span');
      who.className = 'who-name';
      var b = document.createElement('b');
      b.textContent = name;
      who.appendChild(b);
      button.appendChild(who);
      button.addEventListener('click', function () {
        var index = selected.indexOf(name);
        if (index === -1) selected.push(name); else selected.splice(index, 1);
        onChange();
      });
      container.appendChild(button);
    }

    if (!post) {
      heading('Pilih pos dulu');
      return;
    }

    heading(post);
    (S.roster[post] || []).forEach(row);

    // Names already ticked from another post stay visible even when collapsed.
    var fromElsewhere = selected.filter(function (name) {
      return (S.roster[post] || []).indexOf(name) === -1;
    });

    if (expanded) {
      S.posts.forEach(function (other) {
        if (other.name === post) return;
        heading(other.name);
        (S.roster[other.name] || []).forEach(row);
      });
    } else if (fromElsewhere.length) {
      heading('Dari pos lain');
      fromElsewhere.forEach(row);
    }

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'pick-more';
    toggle.textContent = expanded ? 'Sembunyikan pos lain' : 'Tampilkan pos lain';
    toggle.addEventListener('click', onExpand);
    container.appendChild(toggle);
  }

  /* ── 2. Start of shift ──────────────────────────────────────────────── */

  function buildPostChips() {
    var container = $('s-post');
    container.innerHTML = '';
    S.posts.forEach(function (post) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = post.name;
      chip.addEventListener('click', function () {
        if (state.setup.post !== post.name) {
          state.setup.post = post.name;
          // Names picked for another post are almost certainly wrong here.
          state.setup.officers = state.setup.officers.filter(function (name) {
            return (S.roster[post.name] || []).indexOf(name) !== -1;
          });
        }
        renderSetup();
      });
      container.appendChild(chip);
    });

    var shifts = $('s-shift');
    shifts.innerHTML = '';
    S.shifts.forEach(function (shift) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.innerHTML = '';
      var b = document.createElement('b');
      b.textContent = shift.id;
      var small = document.createElement('small');
      small.textContent = SA.hourText(shift.start) + '–' + SA.hourText(shift.end);
      chip.appendChild(b);
      chip.appendChild(small);
      chip.addEventListener('click', function () {
        state.setup.shift = shift.id;
        renderSetup();
      });
      shifts.appendChild(chip);
    });
  }

  /** Opens the start-of-shift screen, from the session or from a fresh default. */
  function openSetup(prefill) {
    var now = new Date();
    var current = SA.shiftFor(now);
    var session = state.session;

    if (prefill) {
      state.setup = prefill;
    } else if (session && !sessionOver(session, now)) {
      state.setup = {
        post: session.post, officers: session.officers.slice(), bko: session.bko || '',
        shift: session.shift, date: session.shiftDate, others: false
      };
    } else {
      // A finished shift keeps its post (the phone lives at one post) but not
      // its people or its time.
      state.setup = {
        post: session ? session.post : '', officers: [], bko: '',
        shift: current.shift, date: current.date, others: false
      };
    }
    renderSetup();
    show('setup');
  }

  function renderSetup() {
    var setup = state.setup;

    Array.prototype.forEach.call($('s-post').children, function (chip, index) {
      chip.setAttribute('aria-pressed', String(S.posts[index].name === setup.post));
    });
    Array.prototype.forEach.call($('s-shift').children, function (chip, index) {
      chip.setAttribute('aria-pressed', String(S.shifts[index].id === setup.shift));
    });

    $('s-officers-label').textContent = 'Petugas jaga (' + setup.officers.length + ' dipilih)';
    renderPicker($('s-officers'), setup.post, setup.officers, setup.others,
      function () { setup.others = !setup.others; renderSetup(); },
      renderSetup);

    if (document.activeElement !== $('s-bko')) $('s-bko').value = setup.bko;
    $('s-date').value = setup.date;

    var ready = !!(setup.post && setup.officers.length && setup.shift && setup.date);
    $('s-start').disabled = !ready;
    $('s-blocker').textContent = ready ? ''
      : !setup.post ? 'Pilih pos dulu.'
      : !setup.officers.length ? 'Centang petugas yang jaga.'
      : !setup.shift ? 'Pilih shift.'
      : 'Isi tanggal shift.';
  }

  $('s-bko').addEventListener('input', function () { state.setup.bko = this.value; });
  $('s-date').addEventListener('change', function () {
    state.setup.date = this.value;
    renderSetup();
  });

  $('s-start').addEventListener('click', function () {
    if (this.disabled) return;
    var setup = state.setup;
    var old = state.session;
    /* Changing who is on duty mid-shift is a correction, not a new shift: the
       hourly checks already sent still count towards this shift's report. */
    var same = old && old.post === setup.post && old.shift === setup.shift &&
      old.shiftDate === setup.date;

    state.session = {
      id: same ? old.id : 's' + Date.now().toString(36),
      post: setup.post,
      shift: setup.shift,
      shiftDate: setup.date,
      officers: setup.officers.slice(),
      bko: setup.bko.trim()
    };
    SA.db.setPref('session', state.session);
    SA.photo.preload(badgeOf(state.session.post));
    renderMain();
    show('main');
  });

  function badgeOf(postName) {
    var post = SA.postByName(postName);
    return post ? post.badge : null;
  }

  /* ── 3. The shift ───────────────────────────────────────────────────── */

  function sessionOver(session, now) {
    var window_ = SA.shiftWindow(session.shiftDate, session.shift);
    // An hour's grace: the shift report is written at handover, often late.
    return !window_ || now.getTime() > window_.end.getTime() + 60 * 60 * 1000;
  }

  function loadSessionRecords() {
    return SA.db.all().then(function (records) {
      var id = state.session ? state.session.id : null;
      state.sessionRecords = records.filter(function (r) {
        return r.team === 'security' && r.sessionId === id;
      });
      return records;
    });
  }

  function hoursDone() {
    var done = {};
    state.sessionRecords.forEach(function (r) {
      if (r.kind === 'check') done[r.hour] = true;
    });
    return done;
  }

  function renderMain() {
    var session = state.session;
    if (!session) return;
    var now = new Date();

    var badge = badgeOf(session.post);
    if (badge && $('main-badge').getAttribute('src') !== badge) $('main-badge').src = badge;
    $('main-badge').alt = 'Lokasi ' + session.post;

    var shift = SA.shiftById(session.shift);
    var line = $('main-session');
    line.textContent = session.post;
    var when = document.createElement('small');
    when.className = 'when';
    when.textContent = session.shift + ' · ' + SA.hourText(shift.start) + '–' +
      SA.hourText(shift.end) + ' WIB · ' + SA.longDate(SA.parseDate(session.shiftDate));
    var who = document.createElement('small');
    who.textContent = session.officers.join(', ') +
      ' · BKO TNI: ' + (session.bko || '-');
    line.appendChild(when);
    line.appendChild(who);

    var over = sessionOver(session, now);
    $('main-over').textContent = over
      ? 'Shift ini sudah selesai. Kirim Laporan Shift bila belum, lalu tekan Ubah untuk memulai shift baru.'
      : '';
    $('main-over').classList.toggle('hidden', !over);

    loadSessionRecords().then(function (records) {
      renderDue(now);
      renderCount(records);
    });
  }

  /**
   * The shift timeline: one cell per reporting hour.
   *
   *   done     a check was sent for that hour            (leaf, tick)
   *   missed   the hour has passed and nothing was sent  (amber, "!")
   *   now      the hour we are in                        (sky ring)
   *   future   not yet due                               (dashed)
   *
   * Each state carries a mark as well as a colour, so it reads without colour.
   */
  function renderDue(now) {
    var session = state.session;
    var done = hoursDone();
    var hours = SA.shiftHours(session.shift);
    var window_ = SA.shiftWindow(session.shiftDate, session.shift);
    var current = defaultHour(session, now);
    var list = $('timeline');
    list.innerHTML = '';

    var missing = [];
    hours.forEach(function (h) {
      var at = SA.shiftHourDate(session.shiftDate, h).getTime();
      var inHour = now.getTime() >= at && now.getTime() < at + 60 * 60 * 1000;
      var past = at <= now.getTime();
      var status = done[h] ? 'done' : past && !inHour ? 'missed' : inHour ? 'now' : 'future';
      if (status === 'missed') missing.push(h);

      var item = document.createElement('li');
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = status + (inHour && done[h] ? ' now' : '');
      var label = SA.pad2(h % 24);
      var icon = status === 'done' ? 'i-check' : status === 'missed' ? 'i-bang' : 'i-dot';
      cell.innerHTML = '<span>' + label + '</span>' +
        '<svg class="mark" aria-hidden="true"><use href="#' + icon + '"/></svg>';
      cell.setAttribute('aria-label', 'Pukul ' + SA.hourText(h) + ': ' +
        (status === 'done' ? 'sudah dikirim' : status === 'missed' ? 'belum dikirim'
          : status === 'now' ? 'jam sekarang' : 'belum waktunya'));
      cell.addEventListener('click', function () { openReport('check', h); });
      item.appendChild(cell);
      list.appendChild(item);
    });

    var sent = hours.filter(function (h) { return done[h]; }).length;
    $('tl-count').textContent = sent + ' / ' + hours.length + ' terkirim';
    $('go-check-sub').textContent = 'Pukul ' + SA.hourText(current) + ' WIB' +
      (done[current] ? ' · sudah dikirim' : '');

    var due = $('main-due');
    due.textContent = now.getTime() < window_.start.getTime()
      ? 'Shift belum mulai — mulai pukul ' + SA.hourText(hours[0]) + ' WIB.'
      : '';
    if (missing.length) {
      var warn = document.createElement('b');
      warn.textContent = 'Belum dikirim: ' + missing.map(SA.hourText).join(', ') + '. ' ;
      due.appendChild(warn);
      due.appendChild(document.createTextNode('Ketuk jamnya untuk mengirim.'));
    }
  }

  function renderCount(records) {
    var mine = records.filter(function (r) { return r.team === 'security'; });
    var today = SA.dateOf(new Date());
    var todayCount = mine.filter(function (r) { return r.date === today; }).length;
    var unsent = mine.filter(function (r) { return !r.sentAt; }).length;
    var unexported = mine.filter(function (r) { return !r.exportedAt; }).length;

    $('today-count').textContent =
      (todayCount ? todayCount + ' laporan hari ini' : 'Belum ada laporan hari ini') +
      (unsent ? ' · ' + unsent + ' belum dikirim' : '');
    $('go-export').disabled = mine.length === 0;
    $('go-export').textContent = unexported ? 'Export ke Excel (' + unexported + ')' : 'Export ke Excel';
  }

  $('main-edit').addEventListener('click', function () { openSetup(); });
  $('go-check').addEventListener('click', function () { openReport('check'); });
  $('go-incident').addEventListener('click', function () { openReport('incident'); });
  $('go-shift').addEventListener('click', function () { openReport('shift'); });

  /* ── 4. One report ──────────────────────────────────────────────────── */

  var TITLES = { check: 'Pengecekan', incident: 'Laporan Kejadian', shift: 'Laporan Shift' };

  /** The hour a check most likely belongs to: the hour we are in, if it is in
      the shift; otherwise the first one nobody has reported yet. */
  function defaultHour(session, now) {
    var hours = SA.shiftHours(session.shift);
    var done = hoursDone();
    for (var i = 0; i < hours.length; i++) {
      var from = SA.shiftHourDate(session.shiftDate, hours[i]).getTime();
      var to = from + 60 * 60 * 1000;
      if (now.getTime() >= from && now.getTime() < to) return hours[i];
    }
    var open = hours.filter(function (h) { return !done[h]; });
    return open.length ? open[0] : hours[0];
  }

  function openReport(kind, hour) {
    var session = state.session;
    if (!session) { openSetup(); return; }
    var now = new Date();

    loadSessionRecords().then(function () {
      state.draft = {
        kind: kind,
        post: session.post,
        shift: session.shift,
        shiftDate: session.shiftDate,
        officers: session.officers.slice(),
        bko: session.bko,
        reporter: session.officers[0] || '',
        hour: kind === 'check' ? (hour != null ? hour : defaultHour(session, now)) : null,
        incidentType: '',
        otherText: '',
        answers: { bilamana: 'Pukul ' + hhmm(now) + ' WIB' },
        tindakan: '',
        handover: SA.hourText(SA.shiftById(session.shift).end),
        nextOfficers: [],
        nextBko: '',
        finalSituation: S.FINAL_SITUATION
      };
      state.nextOthers = false;
      state.photos = [];

      $('r-title').textContent = TITLES[kind];
      $('r-check').classList.toggle('hidden', kind !== 'check');
      $('r-incident').classList.toggle('hidden', kind !== 'incident');
      $('r-shift').classList.toggle('hidden', kind !== 'shift');

      if (kind === 'check') renderHourSelect();
      if (kind === 'incident') renderIncidentFields();
      if (kind === 'shift') renderShiftFields();

      renderPhotoStrip();
      updateReport();
      show('report');
    });
  }

  $('r-back').addEventListener('click', function () {
    if (state.photos.length && !confirm('Laporan belum disimpan. Keluar dan buang fotonya?')) return;
    renderMain();
    show('main');
  });

  $('r-to-incident').addEventListener('click', function () {
    if (state.photos.length && !confirm('Pengecekan ini belum disimpan. Pindah ke Laporan Kejadian?')) return;
    openReport('incident');
  });

  /* Hourly check */

  function renderHourSelect() {
    var select = $('r-hour');
    var done = hoursDone();
    select.innerHTML = '';
    SA.shiftHours(state.draft.shift).forEach(function (h) {
      var option = document.createElement('option');
      option.value = String(h);
      option.textContent = SA.hourText(h) + ' WIB' + (done[h] ? '  ✓ sudah dikirim' : '');
      select.appendChild(option);
    });
    select.value = String(state.draft.hour);
  }

  $('r-hour').addEventListener('change', function () {
    state.draft.hour = Number(this.value);
    updateReport();
  });

  /* Incident */

  function renderIncidentFields() {
    var chips = $('r-type');
    chips.innerHTML = '';
    S.incidentTypes.forEach(function (type) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = type;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', function () {
        state.draft.incidentType = type;
        Array.prototype.forEach.call(chips.children, function (c) {
          c.setAttribute('aria-pressed', String(c.textContent === type));
        });
        $('r-other-field').classList.toggle('hidden', type !== S.OTHER);
        updateReport();
      });
      chips.appendChild(chip);
    });
    $('r-other-field').classList.add('hidden');
    $('r-other').value = '';

    var box = $('r-questions');
    box.innerHTML = '';
    S.questions.forEach(function (q) {
      var label = document.createElement('label');
      label.className = 'field';
      var span = document.createElement('span');
      span.textContent = q.label;
      var input = document.createElement('input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.value = state.draft.answers[q.key] || '';
      input.addEventListener('input', function () {
        state.draft.answers[q.key] = this.value;
        updateReport();
      });
      label.appendChild(span);
      label.appendChild(input);
      box.appendChild(label);
    });
    $('r-tindakan').value = '';
  }

  $('r-other').addEventListener('input', function () {
    state.draft.otherText = this.value;
    updateReport();
  });
  $('r-tindakan').addEventListener('input', function () {
    state.draft.tindakan = this.value;
    updateReport();
  });

  /* Shift report */

  /** Section A: every hour of the shift up to now, and whether it was sent. */
  function checkLines(draft, now) {
    var done = hoursDone();
    return SA.shiftHours(draft.shift).filter(function (h) {
      return done[h] || SA.shiftHourDate(draft.shiftDate, h).getTime() <= now.getTime();
    }).map(function (h) { return { hour: h, done: !!done[h] }; });
  }

  /** Section B: "None", or where to find the incident report(s). */
  function incidentSummary() {
    var byType = {};
    state.sessionRecords.forEach(function (r) {
      if (r.kind !== 'incident') return;
      (byType[r.incidentType] = byType[r.incidentType] || []).push(r);
    });
    var summary = {};
    S.incidentTypes.forEach(function (type) {
      var list = byType[type];
      if (!list) { summary[type] = 'None'; return; }
      var times = list.map(function (r) { return (r.time || '').slice(0, 5); });
      var what = type === S.OTHER
        ? list.map(function (r) { return (r.otherText || '').trim(); }).filter(Boolean).join('; ')
        : '';
      summary[type] = 'Ada' + (what ? ' (' + what + ')' : '') +
        ', lihat Laporan Kejadian pukul ' + times.join(' & ') + ' WIB';
    });
    return summary;
  }

  function renderShiftFields() {
    var draft = state.draft;
    var now = new Date();
    draft.checkLines = checkLines(draft, now);
    draft.incidentSummary = incidentSummary();

    var checks = $('r-checks');
    checks.innerHTML = '';
    if (!draft.checkLines.length) checks.textContent = 'Belum ada jam pengecekan.';
    draft.checkLines.forEach(function (c) {
      var row = document.createElement('div');
      row.className = c.done ? 'ok' : 'missing';
      row.textContent = 'Pukul ' + SA.hourText(c.hour) + ' WIB  ' +
        (c.done ? '✓' : '— tidak ada laporan');
      checks.appendChild(row);
    });

    var incidents = $('r-incidents');
    incidents.innerHTML = '';
    S.incidentTypes.forEach(function (type) {
      var row = document.createElement('div');
      row.textContent = type + ': ' + draft.incidentSummary[type];
      if (draft.incidentSummary[type] !== 'None') row.className = 'missing';
      incidents.appendChild(row);
    });

    $('r-handover').value = draft.handover;
    $('r-next-bko').value = '';
    $('r-final').value = draft.finalSituation;
    renderNextPicker();
  }

  function renderNextPicker() {
    var draft = state.draft;
    $('r-next-label').textContent = 'Shift lanjut (' + draft.nextOfficers.length + ' dipilih)';
    renderPicker($('r-next'), draft.post, draft.nextOfficers, state.nextOthers,
      function () { state.nextOthers = !state.nextOthers; renderNextPicker(); },
      function () { renderNextPicker(); updateReport(); });
  }

  $('r-handover').addEventListener('input', function () {
    state.draft.handover = this.value;
    updateReport();
  });
  $('r-next-bko').addEventListener('input', function () {
    state.draft.nextBko = this.value;
    updateReport();
  });
  $('r-final').addEventListener('input', function () {
    state.draft.finalSituation = this.value;
    updateReport();
  });

  /* Shared: readiness, preview, photos */

  /** What must be set before a photo, because it is burned into the stamp. */
  function missingForPhoto() {
    var draft = state.draft;
    var missing = [];
    if (draft.kind === 'incident') {
      if (!draft.incidentType) missing.push('jenis kejadian');
      else if (draft.incidentType === S.OTHER && !draft.otherText.trim()) missing.push('penjelasan Other');
    }
    return missing;
  }

  function captionOf(record) {
    return record.kind === 'check' ? SA.secCaption.check(record)
      : record.kind === 'incident' ? SA.secCaption.incident(record)
      : SA.secCaption.shift(record);
  }

  function updateReport() {
    var draft = state.draft;
    if (!draft) return;
    var hint = S.photoHint[draft.kind];
    var taken = state.photos.length;
    var full = taken >= S.MAX_PHOTOS;
    var missing = missingForPhoto();

    $('photos-label').textContent = 'Foto · ' + taken;
    $('photos-hint').textContent = 'disarankan ' + hint.min + '–' + hint.max;
    $('take-photo').disabled = full || missing.length > 0;
    $('pick-gallery').disabled = full || missing.length > 0;
    $('photo-blocker').textContent = full
      ? 'Sudah ' + S.MAX_PHOTOS + ' foto — batas maksimum.'
      : missing.length ? 'Isi dulu: ' + missing.join(', ') + '.' : '';

    /* The photo count is a suggestion, never a gate: a guard who has none, or
       wants more, still sends. Only what the report cannot be written without
       blocks saving. */
    $('r-save').disabled = missing.length > 0;
    $('r-blocker').textContent = missing.length ? 'Isi dulu: ' + missing.join(', ') + '.'
      : taken < hint.min ? 'Belum ada foto — tetap bisa dikirim.'
      : '';

    $('r-preview').textContent = captionOf(draft);
    renderStaleWarning();
  }

  /* ── GPS ────────────────────────────────────────────────────────────── */

  function renderGps() {
    var gps = state.gps;
    $('gps').className = 'gps-pill ' + (gps.state === 'ok' ? 'ok' : gps.state === 'denied' ? 'denied' : 'waiting');
    if (gps.state === 'ok') {
      $('gps-status').textContent = 'GPS terkunci · ±' + Math.round(gps.accuracy) + ' m';
      $('gps-detail').textContent = gps.latitude.toFixed(6) + ', ' + gps.longitude.toFixed(6);
    } else {
      $('gps-status').textContent = gps.state === 'denied' ? 'Akses lokasi ditolak'
        : gps.state === 'unsupported' ? 'Perangkat ini tidak punya GPS'
        : 'Menunggu sinyal GPS…';
      $('gps-detail').textContent = gps.state === 'denied'
        ? 'Aktifkan lewat Pengaturan. Foto tetap bisa diambil, tanpa koordinat.'
        : 'Foto tetap bisa diambil.';
    }
  }

  /* ── Photographs ────────────────────────────────────────────────────── */

  function overlaySignature() {
    return SA.secRecords.stampLines(state.draft).join('|');
  }

  $('take-photo').addEventListener('click', function () {
    if (!this.disabled) $('camera-input').click();
  });
  $('pick-gallery').addEventListener('click', function () {
    if (!this.disabled) $('gallery-input').click();
  });

  function addressFor(latitude, longitude) {
    var key = latitude.toFixed(4) + ',' + longitude.toFixed(4);
    if (addressCache[key]) return Promise.resolve(addressCache[key]);
    if (!navigator.onLine) return Promise.resolve(null);
    return Promise.race([
      SA.geo.reverse(latitude, longitude),
      new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 5000); })
    ]).then(function (address) {
      if (address) addressCache[key] = address;
      return address;
    });
  }

  $('camera-input').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (file) addPhotos([file], 'camera');
  });

  $('gallery-input').addEventListener('change', function () {
    var files = Array.prototype.slice.call(this.files || []);
    this.value = '';
    if (files.length) addPhotos(files, 'gallery');
  });

  /* One at a time: several full-size decodes at once is how a mid-range phone
     ends up reloading the tab. */
  function addPhotos(files, source) {
    var room = S.MAX_PHOTOS - state.photos.length;
    if (room <= 0) return;
    var queue = files.slice(0, room);
    toast('Memproses foto…');
    queue.reduce(function (chain, file) {
      return chain.then(function () { return addOnePhoto(file, source); });
    }, Promise.resolve()).then(function () {
      renderPhotoStrip();
      updateReport();
      if (files.length > queue.length) toast('Hanya ' + queue.length + ' foto yang muat.');
    }).catch(function (error) {
      renderPhotoStrip();
      updateReport();
      toast(error.message || 'Foto gagal diproses.');
    });
  }

  function addOnePhoto(file, source) {
    var draft = state.draft;
    var signature = overlaySignature();
    var fromGallery = source === 'gallery';

    return (fromGallery ? SA.exif.read(file) : Promise.resolve(null)).then(function (exif) {
      var fix = null;
      var captured;
      if (fromGallery) {
        // Never the phone's current place or clock on a gallery picture.
        if (exif && exif.latitude != null) fix = { latitude: exif.latitude, longitude: exif.longitude };
        captured = (exif && exif.takenAt) || (file.lastModified ? new Date(file.lastModified) : new Date());
      } else {
        if (state.gps.state === 'ok') fix = { latitude: state.gps.latitude, longitude: state.gps.longitude };
        captured = new Date();
      }
      var timestamp = SA.timestampOf(captured);

      return (fix ? addressFor(fix.latitude, fix.longitude) : Promise.resolve(null)).then(function (address) {
        if (address) state.lastAddress = address;
        var facts = SA.secRecords.sealFacts(draft, timestamp, fix);

        return SA.seal.compute(file, facts).then(function (seal) {
          var lines = SA.secRecords.stampLines(draft).concat([
            timestamp,
            fix ? 'Lat: ' + fix.latitude.toFixed(6) + ', Long: ' + fix.longitude.toFixed(6) : '',
            SA.geo.addressText(address)
          ]);
          return SA.photo.process(file, {
            lines: lines,
            timestamp: timestamp,
            seal: seal,
            sealPrefix: 'SEC',
            badge: badgeOf(draft.post),
            fallback: 'SECURITY OFFICER\n' + draft.post
          }).then(function (processed) {
            if (state.photos.length >= S.MAX_PHOTOS) return;
            processed.signature = signature;
            processed.source = source;
            processed.latitude = fix ? fix.latitude : null;
            processed.longitude = fix ? fix.longitude : null;
            processed.takenAt = timestamp;
            processed.sealCode = seal.code;
            processed.sealDigest = seal.digest;
            processed.sealAlgo = seal.algo;
            state.photos.push(processed);
          });
        });
      });
    });
  }

  var stripUrls = [];
  function renderPhotoStrip() {
    stripUrls.forEach(URL.revokeObjectURL);
    stripUrls = [];
    var strip = $('photo-strip');
    strip.innerHTML = '';
    state.photos.forEach(function (photo, index) {
      var cell = document.createElement('div');
      cell.className = 'shot';
      var image = document.createElement('img');
      var url = URL.createObjectURL(photo.thumb);
      stripUrls.push(url);
      image.src = url;
      image.alt = '';
      cell.appendChild(image);
      if (photo.source === 'gallery') {
        var tag = document.createElement('span');
        tag.className = 'shot-tag';
        tag.textContent = photo.latitude == null ? 'galeri · tanpa GPS' : 'galeri';
        cell.appendChild(tag);
      }
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'shot-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Hapus');
      remove.addEventListener('click', function () {
        state.photos.splice(index, 1);
        renderPhotoStrip();
        updateReport();
      });
      cell.appendChild(remove);
      strip.appendChild(cell);
    });
    renderStaleWarning();
  }

  function renderStaleWarning() {
    if (!state.draft) return;
    var current = overlaySignature();
    var cells = $('photo-strip').children;
    var stale = false;
    state.photos.forEach(function (photo, index) {
      var outdated = photo.signature !== current;
      if (outdated) stale = true;
      if (cells[index]) cells[index].classList.toggle('stale', outdated);
    });
    $('photo-warn').textContent = stale
      ? 'Ada data yang berubah setelah foto diambil. Tulisan di foto masih yang lama — ambil ulang bila penting.'
      : '';
    $('photo-warn').classList.toggle('hidden', !stale);
  }

  /* ── Saving ─────────────────────────────────────────────────────────── */

  $('r-save').addEventListener('click', function () {
    if (this.disabled || missingForPhoto().length) { updateReport(); return; }
    var button = this;
    button.disabled = true;
    /* Saving writes the photos to the phone's database, which takes a moment
       with several pictures -- say so, or the tap looks ignored. */
    var label = button.innerHTML;
    button.lastChild.nodeValue = 'Menyimpan…';

    var draft = state.draft;
    var now = new Date();

    loadSessionRecords().then(function () {
      // A shift report's A and B are read again at the moment of saving, so a
      // check sent while this screen was open is not missed.
      if (draft.kind === 'shift') {
        draft.checkLines = checkLines(draft, now);
        draft.incidentSummary = incidentSummary();
      }

      var record = {
        team: 'security',
        kind: draft.kind,
        sessionId: state.session.id,
        date: SA.dateOf(now),
        time: SA.timeOf(now),
        timestamp: SA.timestampOf(now),
        post: draft.post,
        shift: draft.shift,
        shiftDate: draft.shiftDate,
        officers: draft.officers.slice(),
        bko: (draft.bko || '').trim(),
        reporter: draft.reporter,
        photos: state.photos.map(function (p) {
          return {
            blob: p.blob, thumb: p.thumb, width: p.width, height: p.height,
            latitude: p.latitude, longitude: p.longitude, source: p.source,
            takenAt: p.takenAt, sealCode: p.sealCode, sealDigest: p.sealDigest, sealAlgo: p.sealAlgo
          };
        })
      };

      if (draft.kind === 'check') {
        record.hour = draft.hour;
      } else if (draft.kind === 'incident') {
        record.incidentType = draft.incidentType;
        record.otherText = draft.incidentType === S.OTHER ? draft.otherText.trim() : '';
        record.answers = {};
        S.questions.forEach(function (q) {
          record.answers[q.key] = (draft.answers[q.key] || '').trim();
        });
        record.tindakan = draft.tindakan.trim();
      } else {
        record.checkLines = draft.checkLines;
        record.incidentSummary = draft.incidentSummary;
        record.handover = draft.handover;
        record.nextOfficers = draft.nextOfficers.slice();
        record.nextBko = draft.nextBko.trim();
        record.finalSituation = draft.finalSituation.trim() || S.FINAL_SITUATION;
      }

      return SA.db.add(record);
    }).then(function (saved) {
      button.disabled = false;
      button.innerHTML = label;
      state.photos = [];
      state.draft = null;
      toast('Tersimpan.');
      openSend(saved);
    }).catch(function (error) {
      button.disabled = false;
      button.innerHTML = label;
      toast('Gagal menyimpan: ' + describe(error) + '. Laporan masih di layar — coba lagi.');
    });
  });

  /* ── Send one report ────────────────────────────────────────────────── */

  var sendUrls = [];
  var sharePending = false;

  /* Everything is decided before the tap, so the tap handler has only
     navigator.share() left to run -- anything slower costs the gesture. */
  function openSend(record) {
    var caption = captionOf(record);
    var base = SA.fileSafe('SEC ' + record.post + ' ' + SA.secRecords.label(record));
    var files = (record.photos || []).map(function (photo, index) {
      return new File([photo.blob], base + '_' + (index + 1) + '.jpg', { type: 'image/jpeg' });
    });

    var mode = 'none';
    if (files.length && navigator.canShare) {
      if (navigator.canShare({ files: files, text: caption })) mode = 'text';
      else if (navigator.canShare({ files: files })) mode = 'files';
    } else if (!files.length && navigator.share) {
      mode = 'textonly';
    }

    state.sending = { record: record, caption: caption, files: files, mode: mode };
    renderSend();
    show('send');
  }

  function renderSend() {
    sendUrls.forEach(URL.revokeObjectURL);
    sendUrls = [];
    var sending = state.sending;
    var strip = $('send-photos');
    strip.innerHTML = '';
    (sending.record.photos || []).forEach(function (photo) {
      var cell = document.createElement('div');
      cell.className = 'shot';
      var image = document.createElement('img');
      var url = URL.createObjectURL(photo.thumb || photo.blob);
      sendUrls.push(url);
      image.src = url;
      image.alt = '';
      cell.appendChild(image);
      strip.appendChild(cell);
    });

    $('send-caption').textContent = sending.caption;
    $('send-share').disabled = sending.mode === 'none';

    var pasting = sending.mode === 'files';
    var steps = $('send-steps');
    steps.innerHTML = '';
    steps.classList.toggle('hidden', !pasting);
    if (pasting) {
      ['Pilih grup WhatsApp', 'Tekan lama kolom caption → Tempel', 'Kirim'].forEach(function (text, i) {
        var row = document.createElement('span');
        row.className = 'step';
        var number = document.createElement('b');
        number.textContent = String(i + 1);
        row.appendChild(number);
        row.appendChild(document.createTextNode(text));
        steps.appendChild(row);
      });
    }

    $('send-note').textContent =
      sending.mode === 'none' ? 'Browser ini tidak bisa membagikan. Buka lewat Chrome (Android) atau Safari (iPhone), atau Salin Caption.'
      : sending.mode === 'textonly' ? 'Tanpa foto — hanya teks laporan yang dikirim.'
      : pasting ? 'Browser ini hanya mengirim foto — caption sudah disalin, tinggal ditempel.'
      : 'Foto dan caption dikirim bersamaan.';

    /* Which icon to tap on Android's share sheet. The top row (contact photos)
       captions every picture separately; the WhatsApp icon below gives one
       caption for the album. Same call -- only the tap differs. */
    $('send-tip').textContent = sending.mode === 'none' ? '' :
      'Di menu berbagi, pilih ikon WhatsApp di baris bawah — bukan foto kontak di baris atas. ' +
      'Baru pilih grupnya. Kalau lewat baris atas, caption akan terulang di setiap foto.';

    $('send-new-shift').classList.toggle('hidden', sending.record.kind !== 'shift');
    $('send-status').textContent = '';
    $('send-env').classList.add('hidden');
  }

  $('send-back').addEventListener('click', function () { renderMain(); show('main'); });

  $('send-share').addEventListener('click', function () {
    var sending = state.sending;
    if (!sending || sending.mode === 'none') return;
    var payload = sending.mode === 'text' ? { files: sending.files, text: sending.caption }
      : sending.mode === 'files' ? { files: sending.files }
      : { text: sending.caption };
    if (sending.mode === 'files') copyCaption(sending.caption, false);

    if (sharePending) {
      $('send-status').textContent = 'Menu berbagi sebelumnya belum tertutup. Tutup aplikasi lalu buka lagi.';
      showEnvironment('send-env');
      return;
    }
    sharePending = true;
    navigator.share(payload).then(function () {
      sharePending = false;
      SA.db.markSent([sending.record.id], new Date().toISOString()).then(function () {
        $('send-status').textContent = 'Terkirim.';
      });
    }).catch(function (error) {
      sharePending = false;
      if (error && error.name === 'AbortError') return;
      $('send-status').textContent = 'Gagal mengirim: ' + describe(error) + '. Salin caption lalu kirim manual.';
      showEnvironment('send-env');
    });
  });

  function copyCaption(text, announce) {
    if (!text) return;
    function say(message) { if (announce) $('send-status').textContent = message; }
    function fallback() {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '0';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(area);
      say(ok ? 'Caption disalin.' : 'Gagal menyalin — salin manual dari kotak di atas.');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { say('Caption disalin.'); }).catch(fallback);
    } else {
      fallback();
    }
  }

  $('send-copy').addEventListener('click', function () {
    copyCaption(state.sending ? state.sending.caption : '', true);
  });

  /* The shift after this one, with the names that were just handed over. */
  $('send-new-shift').addEventListener('click', function () {
    var record = state.sending && state.sending.record;
    if (!record) return;
    var order = ['PAGI', 'SORE', 'MALAM'];
    var next = order[(order.indexOf(record.shift) + 1) % 3];
    var date = SA.parseDate(record.shiftDate);
    if (record.shift === 'SORE') date.setDate(date.getDate() + 1);  // Sore → Malam crosses midnight
    openSetup({
      post: record.post,
      officers: (record.nextOfficers || []).slice(),
      bko: record.nextBko || '',
      shift: next,
      date: SA.dateOf(date),
      others: false
    });
  });

  /* ── List ───────────────────────────────────────────────────────────── */

  $('view-list').addEventListener('click', function () { renderList(); show('list'); });
  $('list-back').addEventListener('click', function () { renderMain(); show('main'); });

  var listUrls = [];
  function renderList() {
    listUrls.forEach(URL.revokeObjectURL);
    listUrls = [];
    SA.db.all().then(function (all) {
      var records = all.filter(function (r) { return r.team === 'security'; });
      var body = $('list-body');
      body.innerHTML = '';
      $('list-title').textContent = records.length + ' laporan tersimpan';
      if (!records.length) {
        var empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = 'Belum ada laporan.';
        body.appendChild(empty);
        return;
      }
      records.slice().reverse().forEach(function (record) {
        var card = document.createElement('div');
        card.className = 'card';
        var image = document.createElement('img');
        var first = (record.photos || [])[0];
        if (first) {
          var url = URL.createObjectURL(first.thumb || first.blob);
          listUrls.push(url);
          image.src = url;
        }
        image.alt = '';
        card.appendChild(image);

        var info = document.createElement('div');
        info.className = 'card-body';
        var title = document.createElement('b');
        title.textContent = SA.secRecords.label(record);
        info.appendChild(title);
        var meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = record.post + ' · ' + record.date + ' ' + (record.time || '').slice(0, 5) +
          ' · ' + (record.photos || []).length + ' foto';
        info.appendChild(meta);
        var badges = document.createElement('div');
        badges.className = 'badges';
        if (record.sentAt) badges.appendChild(badge('terkirim', 'ok'));
        if (record.exportedAt) badges.appendChild(badge('diexport', 'flat'));
        info.appendChild(badges);
        card.appendChild(info);

        var actions = document.createElement('div');
        actions.className = 'card-actions';
        var send = document.createElement('button');
        send.className = 'link';
        send.textContent = 'Kirim';
        send.addEventListener('click', function () { openSend(record); });
        actions.appendChild(send);
        var remove = document.createElement('button');
        remove.className = 'danger-link';
        remove.textContent = 'Hapus';
        remove.addEventListener('click', function () {
          if (!confirm('Hapus ' + SA.secRecords.label(record) + '?')) return;
          SA.db.remove(record.id).then(function () { renderList(); toast('Dihapus.'); });
        });
        actions.appendChild(remove);
        card.appendChild(actions);
        body.appendChild(card);
      });
    });
  }

  function badge(text, kind) {
    var span = document.createElement('span');
    span.className = 'badge ' + kind;
    span.textContent = text;
    return span;
  }

  /* ── Excel export ───────────────────────────────────────────────────── */

  $('go-export').addEventListener('click', function () {
    state.built = null;
    state.includeExported = false;
    $('export-ready').classList.add('hidden');
    $('export-build').classList.remove('hidden');
    $('export-status').textContent = '';
    $('export-env').classList.add('hidden');
    show('export');
    renderExport();
  });
  $('export-back').addEventListener('click', function () { renderMain(); show('main'); });

  function renderExport() {
    return SA.db.all().then(function (all) {
      var mine = all.filter(function (r) { return r.team === 'security'; });
      var fresh = mine.filter(function (r) { return !r.exportedAt; });
      var doneCount = mine.length - fresh.length;
      var chosen = state.includeExported ? mine : fresh;
      state.chosen = chosen;

      var counts = { check: 0, incident: 0, shift: 0 };
      chosen.forEach(function (r) { counts[r.kind] += 1; });
      $('export-summary').textContent = chosen.length === 0
        ? (doneCount ? 'Semua laporan sudah diexport.' : 'Belum ada laporan untuk diexport.')
        : chosen.length + ' laporan: ' + counts.check + ' pengecekan, ' +
          counts.incident + ' kejadian, ' + counts.shift + ' shift.';

      var include = $('export-include');
      include.classList.toggle('hidden', doneCount === 0);
      include.textContent = state.includeExported
        ? 'Jangan sertakan ' + doneCount + ' yang sudah diexport'
        : 'Sertakan juga ' + doneCount + ' yang sudah diexport';

      var bytes = 0;
      chosen.forEach(function (r) {
        (r.photos || []).forEach(function (p) { if (p && p.blob) bytes += p.blob.size; });
      });
      var mb = bytes / 1048576;
      $('export-size').textContent = chosen.length
        ? 'Perkiraan ukuran file: ' + mb.toFixed(mb < 10 ? 1 : 0) + ' MB' : '';
      var warning = $('export-warn');
      warning.textContent = mb >= 95
        ? 'File ' + Math.round(mb) + ' MB — terlalu besar untuk WhatsApp. Export lebih sering.'
        : mb >= 50 ? 'File ' + Math.round(mb) + ' MB — besar. Sebaiknya export lebih sering.' : '';
      warning.classList.toggle('hidden', mb < 50);

      $('export-build').disabled = chosen.length === 0;
    });
  }

  $('export-include').addEventListener('click', function () {
    state.includeExported = !state.includeExported;
    renderExport();
  });

  $('export-build').addEventListener('click', function () {
    var button = this;
    var records = state.chosen.slice();
    if (!records.length) return;
    button.disabled = true;
    var status = $('export-status');
    status.textContent = 'Menyusun file…';

    SA.xlsx.build(SA.secRecords.sheets(records), function (done, total) {
      status.textContent = 'Menulis foto ' + done + ' dari ' + total + '…';
    }).then(function (blob) {
      var post = state.session ? state.session.post : records[0].post;
      var filename = 'SECURITY_' + SA.fileSafe(post) + '_' + SA.stampOf(new Date()) + '.xlsx';
      var file = new File([blob], filename, { type: XLSX_MIME });
      state.built = {
        blob: blob, file: file, filename: filename, count: records.length,
        ids: records.map(function (r) { return r.id; }),
        shareable: !!(navigator.canShare && navigator.canShare({ files: [file] }))
      };
      $('export-filename').textContent = filename + ' · ' +
        (blob.size / 1048576).toFixed(1) + ' MB · ' + records.length + ' laporan';
      arrangeExportButtons();
      $('export-ready').classList.remove('hidden');
      button.classList.add('hidden');
      status.textContent = 'File siap.';
    }).catch(function (error) {
      button.disabled = false;
      status.textContent = 'Gagal: ' + describe(error);
    });
  });

  function arrangeExportButtons() {
    var ready = $('export-ready');
    var share = $('export-share');
    var download = $('export-download');
    if (fileShareLikelyBlocked()) {
      ready.insertBefore(download, share);
      download.className = 'primary';
      share.className = 'secondary';
      $('export-route').textContent = 'File tersimpan di folder Download. ' +
        'Kirim lewat WhatsApp › grup › Lampirkan › Dokumen.';
    } else {
      ready.insertBefore(share, download);
      share.className = 'primary';
      download.className = 'secondary';
      $('export-route').textContent = '';
    }
  }

  function markExported() {
    if (!state.built) return Promise.resolve();
    return SA.db.markExported(state.built.ids, new Date().toISOString());
  }

  $('export-share').addEventListener('click', function () {
    if (!state.built) return;
    if (!state.built.shareable) {
      $('export-status').textContent = 'Browser ini tidak bisa membagikan file Excel. Pakai Simpan ke Files.';
      showEnvironment('export-env');
      return;
    }
    navigator.share({ files: [state.built.file] }).then(function () {
      markExported().then(function () {
        $('export-status').textContent = 'File berisi ' + state.built.count + ' laporan terkirim.';
      });
    }).catch(function (error) {
      if (error && error.name === 'AbortError') return;
      $('export-status').textContent = fileShareLikelyBlocked() && error && error.name === 'NotAllowedError'
        ? 'Chrome di Android tidak mengizinkan file Excel dibagikan. Pakai Simpan ke Files, lalu WhatsApp › Lampirkan › Dokumen.'
        : 'Gagal mengirim: ' + describe(error);
      showEnvironment('export-env');
    });
  });

  $('export-download').addEventListener('click', function () {
    if (!state.built) return;
    var url = URL.createObjectURL(state.built.blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = state.built.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    markExported().then(function () {
      $('export-status').textContent = 'Tersimpan di folder Download. Kirim lewat WhatsApp › grup › Lampirkan › Dokumen.';
      if (!isAndroid()) showEnvironment('export-env');
    });
  });

  /* Only ever removes reports already in a spreadsheet. */
  $('export-clear').addEventListener('click', function () {
    SA.db.all().then(function (all) {
      var done = all.filter(function (r) { return r.team === 'security' && r.exportedAt; });
      if (!done.length) { toast('Belum ada laporan yang sudah diexport.'); return; }
      if (!confirm('Hapus ' + done.length + ' laporan yang sudah diexport dari HP?')) return;
      return SA.db.removeMany(done.map(function (r) { return r.id; })).then(function () {
        state.built = null;
        toast(done.length + ' laporan dihapus.');
        renderMain();
        show('main');
      });
    });
  });

  /* ── Diagnostics ────────────────────────────────────────────────────── */

  /* BUILD and CACHE_VERSION in sw.js are a PAIR -- bump both on every upload.
     The marker prints both; when they differ, the new version has downloaded
     but the app has not been restarted. */
  var BUILD = 'v6';
  var CACHE_PREFIX = 'superapp-laporan-';

  function showVersion() {
    var running = 'kode ' + BUILD;
    function put(text) {
      $('app-version').textContent = text;
      $('app-version-team').textContent = text;
    }
    if (!window.caches || !caches.keys) { put(running); return; }
    caches.keys().then(function (names) {
      var mine = names.filter(function (n) { return n.indexOf(CACHE_PREFIX) === 0; }).sort();
      if (!mine.length) { put(running + ' · belum tersimpan offline'); return; }
      var cached = mine[mine.length - 1].replace(CACHE_PREFIX, '');
      put(running + ' · cache ' + cached + (cached === BUILD ? '' : ' · TUTUP APLIKASI & BUKA LAGI'));
    }).catch(function () { put(running); });
  }

  function showEnvironment(lineId) {
    var agent = navigator.userAgent;
    var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    var ios = agent.match(/OS (\d+)[_.](\d+)/);
    var android = agent.match(/Android (\d+(?:\.\d+)?)/);
    var platform = /iPhone|iPad|iPod/.test(agent) ? (ios ? 'iOS ' + ios[1] + '.' + ios[2] : 'iOS')
      : android ? 'Android ' + android[1] : (navigator.platform || 'unknown');
    var line = $(lineId);
    line.textContent = [
      standalone ? 'home screen' : 'browser tab',
      platform,
      'share ' + (navigator.share ? 'yes' : 'no'),
      'canShare ' + (navigator.canShare ? 'yes' : 'no'),
      window.isSecureContext ? 'secure' : 'NOT SECURE',
      sharePending ? 'share still open' : 'share idle'
    ].join(' · ');
    line.classList.remove('hidden');
  }

  /* ── Start-up ───────────────────────────────────────────────────────── */

  function init() {
    buildTeamChips();
    buildPostChips();
    renderGps();

    SA.db.getPref('team', '').then(function (team) {
      state.team = team || '';
      return SA.db.getPref('session', null);
    }).then(function (session) {
      if (session && session.post) {
        state.session = session;
        SA.photo.preload(badgeOf(session.post));
      }
      buildTeamChips();
      if (state.team === 'security' && state.session) { renderMain(); show('main'); }
      else if (state.team === 'security') openSetup();
      else show('team');
    }).catch(function (error) {
      show('team');
      toast('Gagal memulai: ' + describe(error));
    });

    SA.geo.watch(function (update) { state.gps = update; renderGps(); });

    // Keeps a shift's photographs from being evicted under storage pressure.
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

    // The due line goes stale as the clock moves; refresh it while visible.
    setInterval(function () {
      if (state.session && $('screen-main').classList.contains('active')) renderMain();
    }, 60000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && state.session && $('screen-main').classList.contains('active')) renderMain();
    });

    showVersion();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(function (registration) {
        registration.update();
        navigator.serviceWorker.addEventListener('controllerchange', showVersion);
        setTimeout(showVersion, 1500);
      }).catch(showVersion);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
}(window.SA));
