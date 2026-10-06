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
    sessions: {},        // per team: Security's shift, Walkthrough's day
    wtSetup: { teamNo: 0, officers: [], routeId: '', others: false, allRoutes: false },
    oSetup: { post: '', officer: '' },
    pSetup: { patrolId: '', officers: [], tni: '', vehicle: '', ownVehicle: false, km: '', shift: '', date: '', others: false },
    setup: { post: '', officers: [], bko: '', shift: '', date: '', others: false },
    gps: { state: 'waiting' },
    draft: null,         // the report being written
    nextOthers: false,   // "Tampilkan pos lain" on the Shift lanjut picker
    photos: [],
    processing: 0,       // photos still being stamped; saving waits for them
    lastAddress: null,
    sessionRecords: [],
    sending: null,
    built: null,
    chosen: [],
    includeExported: false
  };

  /* Every team's current session lives in state.sessions[team]. These two
     names are shorthands for the code written for one team:
       state.session    Security's shift  { id, post, shift, shiftDate, officers, bko }
       state.wtSession  Walkthrough's day { id, teamNo, zone, routeId, date, officers } */
  Object.defineProperty(state, 'session', {
    get: function () { return state.sessions.security || null; },
    set: function (value) { state.sessions.security = value; }
  });
  Object.defineProperty(state, 'wtSession', {
    get: function () { return state.sessions.walkthrough || null; },
    set: function (value) { state.sessions.walkthrough = value; }
  });

  var addressCache = {};

  function $(id) { return document.getElementById(id); }

  var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  var SCREENS = ['team', 'setup', 'main', 'wt-setup', 'wt-main', 'p-setup', 'p-main', 'o-setup', 'o-main',
    'report', 'send', 'list', 'export'];

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
        goMain();
      });
      container.appendChild(chip);
    });
  }

  $('main-team').addEventListener('click', function () { buildTeamChips(); show('team'); });
  $('wt-main-team').addEventListener('click', function () { buildTeamChips(); show('team'); });
  $('wt-setup-back').addEventListener('click', function () { buildTeamChips(); show('team'); });

  /** The current team's home: its main screen, or its start screen if there
      is no shift/day yet. Every "back to the start" goes through here. */
  function goMain() {
    var team = currentTeam();
    var session = state.sessions[team];
    if (session && moduleOf(team).fresh(session)) moduleOf(team).home();
    else moduleOf(team).setup();
  }

  function currentTeam() { return MODULES[state.team] ? state.team : 'security'; }

  function currentSession() { return state.sessions[currentTeam()] || null; }
  $('setup-back').addEventListener('click', function () { buildTeamChips(); show('team'); });

  /* ── Name picker (used for the officers on duty and for Shift lanjut) ── */

  /**
   * Tick rows: this post's people first, the rest behind "Tampilkan pos lain".
   * The order ticked is the order printed, so a tick appends and an untick
   * removes without reshuffling the others.
   */
  /* `directory` = { noun, groups: [{ name, members }] }; Security's posts by
     default. The noun is what the list is grouped by: "pos" or "tim". */
  function renderPicker(container, post, selected, expanded, onExpand, onChange, directory) {
    container.innerHTML = '';
    var noun = directory ? directory.noun : 'pos';
    var dir = directory ? directory.groups : S.posts.map(function (p) {
      return { name: p.name, members: S.roster[p.name] || [] };
    });
    function membersOf(name) {
      var found = null;
      dir.forEach(function (g) { if (g.name === name) found = g; });
      return found ? found.members : [];
    }

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
      heading('Pilih ' + noun + ' dulu');
      return;
    }

    heading(post);
    membersOf(post).forEach(row);

    // Names already ticked from another post stay visible even when collapsed.
    var fromElsewhere = selected.filter(function (name) {
      return membersOf(post).indexOf(name) === -1;
    });

    if (expanded) {
      dir.forEach(function (other) {
        if (other.name === post) return;
        heading(other.name);
        other.members.forEach(row);
      });
    } else if (fromElsewhere.length) {
      heading('Dari ' + noun + ' lain');
      fromElsewhere.forEach(row);
    }

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'pick-more';
    toggle.textContent = (expanded ? 'Sembunyikan ' : 'Tampilkan ') + noun + ' lain';
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
      bko: setup.bko.trim(),
      // What the partner sent from their own phone (see partnerMarks).
      partner: same && old.partner ? old.partner : { hours: {}, incidents: {} }
    };
    SA.db.setPref('session', state.session);
    SA.photo.preload(badgeOf(state.session.post));
    renderMain();
    show('main');
    afterStart();
  });

  /** A Tutup temuan that had to wait for the start screen. */
  function afterStart() {
    if (!pendingClose) return;
    var ref = pendingClose;
    pendingClose = null;
    openReport('close', null, ref);
  }

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

  /* Only this shift's reports, through the bySession index -- this runs every
     minute on the main screen and on every report opened or saved. */
  function loadSessionRecords() {
    var session = currentSession();
    if (!session) { state.sessionRecords = []; return Promise.resolve([]); }
    var team = currentTeam();
    return SA.db.bySession(session.id).then(function (records) {
      state.sessionRecords = records.filter(function (r) { return (r.team || 'security') === team; });
      return state.sessionRecords;
    });
  }

  /** The checks THIS phone sent, by hour (the record, so its reporter is known). */
  function hoursDone() {
    var done = {};
    state.sessionRecords.forEach(function (r) {
      if (r.kind === 'check') done[r.hour] = r;
    });
    return done;
  }

  /*
   * Two guards a shift, each on their own phone, often take turns: one phone
   * cannot see what the other sent. So a guard marks what the partner sent --
   * an hour (on the timeline's check form, or in section A at handover) or an
   * incident type (section B). The marks live on the shift session:
   *   session.partner = { hours: { 2: 'ALAM ILAHI' }, incidents: { Theft: '…' } }
   * The partner is anyone on the shift but the first name (this phone's owner,
   * the reporter). A check this phone sent always wins over a mark.
   */
  function partnerMarks() {
    var session = state.session;
    if (!session.partner) session.partner = { hours: {}, incidents: {} };
    return session.partner;
  }

  function partnersOf(session) { return (session.officers || []).slice(1); }

  function setPartnerMark(group, key, name) {
    var marks = partnerMarks()[group];
    if (name) marks[key] = name; else delete marks[key];
    SA.db.setPref('session', state.session);
  }

  /** Tapping a mark steps through the partners and back to none. */
  function nextPartner(current) {
    var list = partnersOf(state.session);
    var i = list.indexOf(current);
    return i + 1 < list.length ? list[i + 1] : null;
  }

  /** Every hour that is covered: sent by this phone, or marked as the partner's. */
  function hoursCovered() {
    var covered = {};
    var own = hoursDone();
    var marks = partnerMarks().hours;
    Object.keys(marks).forEach(function (h) { covered[h] = true; });
    Object.keys(own).forEach(function (h) { covered[h] = true; });
    return covered;
  }

  /** `tick` is the once-a-minute refresh: it redraws the timeline only, and
      leaves the whole-phone counters to the moments a person opens the screen. */
  function renderMain(tick) {
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

    loadSessionRecords().then(function () {
      renderDue(now);
      if (!tick) return SA.db.all().then(renderCount);
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
    var own = hoursDone();
    var marks = partnerMarks().hours;
    var done = hoursCovered();
    var hours = SA.checkHours(session.shift);
    var end = SA.shiftById(session.shift).end;
    var window_ = SA.shiftWindow(session.shiftDate, session.shift);
    var current = defaultHour(session, now);
    var handedOver = state.sessionRecords.some(function (r) { return r.kind === 'shift'; });
    var HOUR = 60 * 60 * 1000;
    var list = $('timeline');
    list.innerHTML = '';

    var missing = [];
    function cell(h, isHandover) {
      var at = SA.shiftHourDate(session.shiftDate, h).getTime();
      var inHour = now.getTime() >= at && now.getTime() < at + HOUR;
      var past = at <= now.getTime();
      var sent = isHandover ? handedOver : done[h];
      var byPartner = !isHandover && !own[h] && marks[h];
      var status = sent ? 'done' : past && !inHour ? 'missed' : inHour ? 'now' : 'future';
      if (status === 'missed') missing.push(isHandover ? 'serah terima ' + SA.hourText(h) : SA.hourText(h));

      var item = document.createElement('li');
      if (isHandover) item.className = 'handover';
      var button = document.createElement('button');
      button.type = 'button';
      button.className = status + (inHour && sent ? ' now' : '') + (byPartner ? ' partner' : '');
      var icon = status === 'done' ? 'i-check' : status === 'missed' ? 'i-bang'
        : isHandover ? 'i-clipboard' : 'i-dot';
      button.innerHTML = '<span>' + SA.pad2(h % 24) + '</span>' +
        '<svg class="mark" aria-hidden="true"><use href="#' + icon + '"/></svg>';
      button.setAttribute('aria-label', (isHandover ? 'Serah terima ' : 'Pukul ') + SA.hourText(h) + ': ' +
        (byPartner ? 'dikirim ' + byPartner + ' (rekan)'
          : status === 'done' ? 'sudah dikirim' : status === 'missed' ? 'belum dikirim'
          : status === 'now' ? 'jam sekarang' : 'belum waktunya'));
      button.addEventListener('click', function () {
        // A sent cell opens the report that was sent (to read or re-send it);
        // making a second one would send a duplicate to the group. A cell marked
        // as the partner's opens its check form, where the mark can be undone.
        var already = latestRecord(isHandover ? 'shift' : 'check', isHandover ? null : h);
        if (already) { openSend(already); return; }
        if (isHandover) openReport('shift'); else openReport('check', h);
      });
      item.appendChild(button);
      list.appendChild(item);
    }
    hours.forEach(function (h) { cell(h, false); });
    cell(end, true);

    var sentCount = hours.filter(function (h) { return done[h]; }).length + (handedOver ? 1 : 0);
    $('tl-count').textContent = sentCount + ' / ' + (hours.length + 1) + ' terkirim';
    $('go-check-sub').textContent = 'Pukul ' + SA.hourText(current) + ' WIB' +
      (own[current] ? ' · sudah dikirim' : marks[current] ? ' · dikirim rekan' : '');

    var first = SA.shiftHourDate(session.shiftDate, hours[0]).getTime();
    var due = $('main-due');
    due.textContent = now.getTime() < window_.start.getTime()
      ? 'Shift belum mulai — pengecekan pertama pukul ' + SA.hourText(hours[0]) + ' WIB.'
      : now.getTime() < first
      ? 'Serah terima sudah dilaporkan shift sebelumnya. Pengecekan pertama pukul ' +
        SA.hourText(hours[0]) + ' WIB.'
      : '';
    if (missing.length) {
      var warn = document.createElement('b');
      warn.textContent = 'Belum dikirim: ' + missing.join(', ') + '. ';
      due.appendChild(warn);
      due.appendChild(document.createTextNode('Ketuk jamnya untuk mengirim.'));
    }
  }

  /** The newest report of a kind in this shift (for a check: of that hour). */
  function latestRecord(kind, hour) {
    var found = null;
    state.sessionRecords.forEach(function (r) {
      if (r.kind === kind && (hour == null || r.hour === hour)) found = r;
    });
    return found;
  }

  /** The footer counters and the export button of a team's main screen. */
  function renderCount(records, team, countId, exportId) {
    team = team || 'security';
    countId = countId || 'today-count';
    exportId = exportId || 'go-export';
    var mine = records.filter(function (r) { return (r.team || 'security') === team; });
    var today = SA.dateOf(new Date());
    var todayCount = mine.filter(function (r) { return r.date === today; }).length;
    var unsent = mine.filter(function (r) { return !r.sentAt; }).length;
    var unexported = mine.filter(function (r) { return !r.exportedAt; }).length;

    $(countId).textContent =
      (todayCount ? todayCount + ' laporan hari ini' : 'Belum ada laporan hari ini') +
      (unsent ? ' · ' + unsent + ' belum dikirim' : '');
    $(exportId).disabled = mine.length === 0;
    $(exportId).textContent = unexported ? 'Export ke Excel (' + unexported + ')' : 'Export ke Excel';
  }

  $('main-edit').addEventListener('click', function () { openSetup(); });
  $('go-check').addEventListener('click', function () { openReport('check'); });
  $('go-incident').addEventListener('click', function () { openReport('incident'); });
  $('go-shift').addEventListener('click', function () {
    var sent = latestRecord('shift', null);
    if (sent && !confirm('Laporan shift sudah dikirim pukul ' + String(sent.time).slice(0, 5) +
        '. Buat laporan shift lagi?')) return;
    openReport('shift');
  });
  $('go-access').addEventListener('click', function () { openReport('access'); });
  $('go-body').addEventListener('click', function () { openReport('body'); });

  /* ── 4. One report ──────────────────────────────────────────────────── */

  var TITLES = { check: 'Pengecekan', incident: 'Laporan Kejadian', shift: 'Laporan Shift',
    access: 'Access Control', body: 'Body Check', wtkp: 'Laporan KP', lds: 'Laporan LDS',
    close: 'Tutup Temuan', patrol: 'Guard Tour', pend: 'Akhir Shift Patroli', office: 'Laporan Harian' };
  /* ── Security Perkantoran: start of day ─────────────────────────────── */

  var O = SA.OFFICE;

  function officePost(name) {
    return O.posts.filter(function (p) { return p.name === name; })[0] || null;
  }

  function openOfficeSetup() {
    var s = state.sessions.office;
    state.oSetup = s ? { post: s.post, officer: s.officers[0] } : { post: '', officer: '' };
    renderOfficeSetup();
    show('o-setup');
  }

  function renderOfficeSetup() {
    var setup = state.oSetup;
    renderChoice($('o-post'), O.posts.map(function (p) { return { value: p.name, text: p.name }; }), setup.post,
      function (value) {
        setup.post = value;
        var post = officePost(value);
        if (post && post.officers.indexOf(setup.officer) === -1) setup.officer = post.officers[0] || '';
        renderOfficeSetup();
      });
    // This post's officer first; the other office's, for a day one covers for the other.
    var post = officePost(setup.post);
    var names = (post ? post.officers : []).concat(O.posts.filter(function (p) { return p !== post; })
      .reduce(function (all, p) { return all.concat(p.officers); }, []));
    renderChoice($('o-officer'), names.map(function (n) { return { value: n, text: n }; }), setup.officer,
      function (value) { setup.officer = value; renderOfficeSetup(); });
    $('o-date').textContent = SA.longDate(new Date());
    var ready = !!(setup.post && setup.officer);
    $('o-start').disabled = !ready;
    $('o-blocker').textContent = ready ? '' : !setup.post ? 'Pilih pos dulu.' : 'Pilih petugas.';
  }

  $('o-start').addEventListener('click', function () {
    if (this.disabled) return;
    var setup = state.oSetup;
    var today = SA.dateOf(new Date());
    var old = state.sessions.office;
    // Same officer, post and day: a correction -- the visitors already counted stay.
    var same = old && old.post === setup.post && old.officers[0] === setup.officer && old.date === today;
    state.sessions.office = {
      id: same ? old.id : 'o' + Date.now().toString(36),
      post: setup.post,
      zone: (SA.postByName(setup.post) || {}).zone || '',
      officers: [setup.officer],
      shift: O.SHIFT,
      shiftDate: today,
      date: today,
      visits: same ? (old.visits || []) : []
    };
    SA.db.setPref('officeSession', state.sessions.office);
    SA.photo.preload(badgeOf(setup.post));
    renderOfficeMain();
    show('o-main');
    afterStart();
  });

  $('o-setup-back').addEventListener('click', function () { buildTeamChips(); show('team'); });
  $('o-main-team').addEventListener('click', function () { buildTeamChips(); show('team'); });
  $('o-edit').addEventListener('click', openOfficeSetup);

  /* ── Security Perkantoran: the day ──────────────────────────────────── */

  function renderOfficeMain() {
    var s = state.sessions.office;
    if (!s) return;
    var badge = badgeOf(s.post);
    if (badge && $('o-badge').getAttribute('src') !== badge) $('o-badge').src = badge;
    $('o-badge').alt = 'Lokasi ' + s.post;
    var shift = SA.shiftById(s.shift);
    var line = $('o-session');
    line.textContent = s.post + ' · ' + s.zone;
    var when = document.createElement('small');
    when.className = 'when';
    when.textContent = s.shift + ' · ' + SA.hourText(shift.start) + '–' + SA.hourText(shift.end) + ' WIB · ' +
      SA.longDate(SA.parseDate(s.date));
    var who = document.createElement('small');
    who.textContent = s.officers.join(', ');
    line.appendChild(when);
    line.appendChild(who);
    renderVisitors();

    var sent = null;
    loadSessionRecords().then(function (records) {
      sent = records.filter(function (r) { return r.kind === 'office'; }).pop() || null;
      return SA.db.getPref(keptKey('office', 'office'), null);
    }).then(function (kept) {
      // What is kept is said first: a second report started after sending is
      // not hidden behind "Sudah dikirim".
      var photos = kept && kept.sessionId === s.id ? kept.photos || 0 : 0;
      var sentText = sent ? 'dikirim pukul ' + String(sent.time).slice(0, 5) : '';
      $('go-office-sub').textContent = photos ? photos + ' foto tersimpan, belum dikirim' + (sent ? ' · ' + sentText : '')
        : sent ? 'Sudah ' + sentText : 'Foto dan isian tersimpan sampai Simpan';
      return SA.db.all();
    }).then(function (all) {
      renderCount(all, 'office', 'o-today', 'o-go-export');
    });
    offerKept('office', 'office');
  }

  function renderVisitors() {
    var visits = state.sessions.office.visits || [];
    $('o-visitors').textContent = String(visits.length);
    $('o-minus').disabled = !visits.length;
    $('o-times').textContent = visits.length ? 'Jam: ' + visits.join(', ') : 'Belum ada tamu hari ini.';
  }

  /** A screen left open past midnight must not count on yesterday. */
  function officeDayOver() {
    var s = state.sessions.office;
    if (s && s.date === SA.dateOf(new Date())) return false;
    toast('Hari baru — mulai hari dulu.');
    goMain();
    return true;
  }

  /* Every tap is stored at once: the count survives closing the app. */
  $('o-plus').addEventListener('click', function () {
    if (officeDayOver()) return;
    var s = state.sessions.office;
    s.visits = (s.visits || []).concat([hhmm(new Date())]);
    SA.db.setPref('officeSession', s);
    renderVisitors();
  });
  $('o-minus').addEventListener('click', function () {
    if (officeDayOver()) return;
    var s = state.sessions.office;
    if (!s.visits || !s.visits.length) return;
    if (!confirm('Hapus tamu terakhir (pukul ' + s.visits[s.visits.length - 1] + ')?')) return;
    s.visits = s.visits.slice(0, -1);
    SA.db.setPref('officeSession', s);
    renderVisitors();
  });

  $('go-office').addEventListener('click', function () {
    var sent = latestRecord('office', null);
    if (sent && !confirm('Laporan hari ini sudah dikirim pukul ' + String(sent.time).slice(0, 5) +
        '. Buat lagi?')) return;
    openReport('office');
  });
  $('o-view-list').addEventListener('click', function () { renderList(); show('list'); });
  $('o-go-export').addEventListener('click', openExport);

  /* ── Security Perkantoran: the report, kept until Simpan ────────────── */

  function officeDraft(kind, s, now, ref) {
    var taps = (s.visits || []).length;
    return {
      kind: kind, team: 'office', date: SA.dateOf(now),
      post: s.post, zone: s.zone, shift: s.shift, shiftDate: s.shiftDate,
      officers: s.officers.slice(), reporter: s.officers[0] || '',
      // A correction is kept as a difference from the taps, so visitors
      // counted after it still reach the report.
      visitTimes: (s.visits || []).slice(), visitorsAdjust: 0, visitors: String(taps),
      situation: O.SITUATION,
      followUp: '', status: 'Open', closeTime: hhmm(now), ref: ref || null
    };
  }

  function applyOfficeKept(d, fields) {
    if (fields.situation) d.situation = fields.situation;
    d.visitorsAdjust = Number(fields.visitorsAdjust) || 0;
    d.visitors = String(Math.max(0, d.visitTimes.length + d.visitorsAdjust));
  }

  function renderOfficeFields() {
    var d = state.draft;
    function fill() {
      $('r-o-visitors').value = d.visitors;
      $('r-o-situation').value = d.situation;
      var taps = d.visitTimes.length;
      $('r-o-times').textContent = (taps ? 'Dari tombol +1 Tamu: ' + taps + ', pukul ' + d.visitTimes.join(', ')
        : 'Belum ada tamu yang dicatat dengan tombol +1 Tamu.') +
        (d.visitorsAdjust ? ' · koreksi ' + (d.visitorsAdjust > 0 ? '+' : '') + d.visitorsAdjust : '');
    }
    fill();
    restoreKept(d, function (fields) { applyOfficeKept(d, fields); fill(); });
  }

  $('r-o-visitors').addEventListener('input', function () {
    var d = state.draft;
    if (!d) return;
    this.value = this.value.replace(/\D/g, '').slice(0, 4);
    d.visitors = this.value;
    if (this.value !== '') d.visitorsAdjust = Number(this.value) - d.visitTimes.length;
    updateReport();
  });
  wireText('r-o-situation', 'situation');

  $('r-o-reset').addEventListener('click', function () {
    var d = state.draft;
    if (!d || !confirm('Hapus semua foto dan isian laporan ini? Jumlah tamu kembali ke hitungan tombol.')) return;
    releasePhotoUrls(state.photos);
    state.photos = [];
    d.situation = O.SITUATION;
    d.visitorsAdjust = 0;
    d.visitors = String(d.visitTimes.length);
    $('r-o-visitors').value = d.visitors;
    $('r-o-situation').value = d.situation;
    renderPhotoStrip();
    updateReport();
    saveKept(true);
    toast('Foto dan isian direset.');
  });

  /* ── Kept drafts: a report written over a whole shift ─────────────────
     A module that lists a kind in `keep` (the fields to keep) gets: the form
     saved on the phone as it changes, restored when the form opens again,
     Batal that keeps it, and -- once a new day or shift has started -- an
     offer to send the earlier one or throw it away. Photos are written only
     when they change; text a moment after typing stops. Per team and kind:
       kept:<team>:<kind>        { sessionId, session, fields, photos (count), touched }
       keptPhotos:<team>:<kind>  { sessionId, photos }                           */

  function keptFields(draft) {
    var module = draft && MODULES[draft.team];
    return module && module.keep ? module.keep[draft.kind] || null : null;
  }
  function keptKey(team, kind) { return 'kept:' + team + ':' + kind; }
  function keptPhotosKey(team, kind) { return 'keptPhotos:' + team + ':' + kind; }

  var keptTimer = null;
  var keptPhotoSig = '';
  function photoSigOf(photos) {
    return (photos || []).map(function (p) { return p.sealCode || p.takenAt; }).join('|');
  }

  function saveKept(now) {
    var d = state.draft;
    var fields = keptFields(d);
    if (!fields || !d.restored) return;
    var sig = photoSigOf(state.photos);
    if (sig !== keptPhotoSig) {
      keptPhotoSig = sig;
      SA.db.setPref(keptPhotosKey(d.team, d.kind), { sessionId: d.session.id,
        photos: state.photos.map(function (p) { return Object.assign({}, p, { url: null }); }) });
    }
    clearTimeout(keptTimer);
    function write() {
      var values = {};
      var touched = state.photos.length > 0;
      fields.forEach(function (f) {
        values[f] = d[f];
        if (d.keptInitial && d[f] !== d.keptInitial[f]) touched = true;
      });
      SA.db.setPref(keptKey(d.team, d.kind), { sessionId: d.session.id, session: d.session, fields: values,
        photos: state.photos.length, touched: touched });
    }
    if (now) write(); else keptTimer = setTimeout(write, 600);
  }

  /** Reads the kept form back; nothing is saved over it before that. */
  function restoreKept(d, apply) {
    d.keptInitial = {};
    keptFields(d).forEach(function (f) { d.keptInitial[f] = d[f]; });
    Promise.all([SA.db.getPref(keptKey(d.team, d.kind), null),
                 SA.db.getPref(keptPhotosKey(d.team, d.kind), null)]).then(function (got) {
      if (state.draft !== d) return;
      var kept = got[0];
      var photos = got[1] && got[1].sessionId === d.session.id ? got[1].photos || [] : [];
      if (kept && kept.sessionId === d.session.id) apply(kept.fields || {});
      // Photos taken earlier first, then any taken while this was loading.
      state.photos = photos.concat(state.photos);
      keptPhotoSig = photoSigOf(photos);
      d.restored = true;
      renderPhotoStrip();
      updateReport();
    });
  }

  function clearKept(team, kind) {
    clearTimeout(keptTimer);
    keptPhotoSig = '';
    SA.db.setPref(keptKey(team, kind), null);
    SA.db.setPref(keptPhotosKey(team, kind), null);
  }

  /* A report kept from an earlier day or shift: send it now, or throw it away
     -- asked once per app start, never silently lost (code review, v26). */
  var keptOffered = {};
  function offerKept(team, kind) {
    var current = state.sessions[team];
    SA.db.getPref(keptKey(team, kind), null).then(function (kept) {
      if (!kept || !kept.session || (current && kept.sessionId === current.id)) return;
      if (!kept.touched || keptOffered[kept.sessionId]) return;
      keptOffered[kept.sessionId] = true;
      var when = SA.longDate(SA.parseDate(kept.session.shiftDate || kept.session.date));
      if (confirm('Laporan ' + when + ' belum dikirim (' + (kept.photos || 0) + ' foto). Kirim sekarang?')) {
        openReport(kind, null, null, kept.session);
      } else if (confirm('Buang laporan ' + when + ' yang belum dikirim itu? Foto dan isiannya dihapus.')) {
        clearKept(team, kind);
        toast('Laporan ' + when + ' dibuang.');
      }
    });
  }


  /* ── Walkthrough: start of day ──────────────────────────────────────── */

  var W = SA.WT;

  function wtDirectory() {
    return W.groups.map(function (g) { return { name: g.label, members: g.members }; });
  }

  /** Opens the WT start screen: yesterday's team and people are offered again,
      because a crew is usually the same; the route is picked fresh each day. */
  function openWtSetup() {
    var s = state.wtSession;
    state.wtSetup = s
      ? { teamNo: s.teamNo, officers: s.officers.slice(), routeId: s.routeId, others: false, allRoutes: false }
      : { teamNo: 0, officers: [], routeId: '', others: false, allRoutes: false };
    renderWtSetup();
    show('wt-setup');
  }

  function buildWtTeamChips() {
    var box = $('w-team');
    box.innerHTML = '';
    for (var n = 1; n <= 13; n++) {
      (function (teamNo) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.textContent = String(teamNo);
        chip.setAttribute('aria-label', 'Tim ' + teamNo);
        chip.addEventListener('click', function () {
          var setup = state.wtSetup;
          var before = SA.wtGroupOfTeam(setup.teamNo);
          var group = SA.wtGroupOfTeam(teamNo);
          setup.teamNo = teamNo;
          // A different group: different routes (pick again, or the only one),
          // and names picked for the other group are almost certainly wrong.
          if (!before || before.id !== group.id) {
            setup.routeId = group.routes.length === 1 ? group.routes[0] : '';
            setup.officers = setup.officers.filter(function (name) {
              return group.members.indexOf(name) !== -1;
            });
          }
          renderWtSetup();
        });
        box.appendChild(chip);
      }(n));
    }
  }

  function renderWtSetup() {
    var setup = state.wtSetup;
    var group = SA.wtGroupOfTeam(setup.teamNo);

    Array.prototype.forEach.call($('w-team').children, function (chip, index) {
      chip.setAttribute('aria-pressed', String(index + 1 === setup.teamNo));
    });
    $('w-group').textContent = group ? group.label + ' · ' + group.zone : 'Pilih nomor tim dulu.';

    $('w-officers-label').textContent = 'Petugas (' + setup.officers.length + ' dipilih)';
    renderPicker($('w-officers'), group ? group.label : '', setup.officers, setup.others,
      function () { setup.others = !setup.others; renderWtSetup(); },
      renderWtSetup, { noun: 'tim', groups: wtDirectory() });

    // A saved day that is not today: the crew confirms today's team and route.
    var previous = state.wtSession;
    var newDay = !!(previous && previous.date !== SA.dateOf(new Date()));
    $('w-newday').classList.toggle('hidden', !newDay);

    // The group's routes first; any route if the crew is lent elsewhere today.
    var box = $('w-route');
    box.innerHTML = '';
    var ids = !group ? [] : setup.allRoutes ? W.routeOrder : group.routes;
    ids.forEach(function (id) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = W.routes[id].label;
      chip.setAttribute('aria-pressed', String(id === setup.routeId));
      chip.addEventListener('click', function () { setup.routeId = id; renderWtSetup(); });
      box.appendChild(chip);
    });
    $('w-route-all').classList.toggle('hidden', !group);
    $('w-route-all').textContent = setup.allRoutes ? 'Hanya rute tim ini' : 'Tampilkan semua rute';
    $('w-date').textContent = SA.longDate(new Date());

    var ready = !!(setup.teamNo && setup.officers.length && setup.routeId);
    $('w-start').disabled = !ready;
    $('w-blocker').textContent = ready ? ''
      : !setup.teamNo ? 'Pilih nomor tim dulu.'
      : !setup.officers.length ? 'Centang petugas yang jalan hari ini.'
      : 'Pilih rute hari ini.';
  }

  $('w-route-all').addEventListener('click', function () {
    state.wtSetup.allRoutes = !state.wtSetup.allRoutes;
    renderWtSetup();
  });

  $('w-start').addEventListener('click', function () {
    if (this.disabled) return;
    var setup = state.wtSetup;
    var today = SA.dateOf(new Date());
    var old = state.wtSession;
    // Same team, same day: a correction (people or route), not a new day.
    var same = old && old.teamNo === setup.teamNo && old.date === today;
    state.wtSession = {
      id: same ? old.id : 'w' + Date.now().toString(36),
      teamNo: setup.teamNo,
      zone: SA.wtGroupOfTeam(setup.teamNo).zone,
      routeId: setup.routeId,
      date: today,
      officers: setup.officers.slice()
    };
    SA.db.setPref('wtSession', state.wtSession);
    SA.photo.preload(SA.wtBadge(setup.teamNo));
    renderWtMain();
    show('wt-main');
    afterStart();
  });

  /* ── Walkthrough: the day ───────────────────────────────────────────── */

  function renderWtMain() {
    var s = state.wtSession;
    if (!s) return;
    var badge = SA.wtBadge(s.teamNo);
    if ($('wt-badge').getAttribute('src') !== badge) $('wt-badge').src = badge;
    $('wt-badge').alt = 'Team Walkthrough ' + s.teamNo;

    var line = $('wt-session');
    line.textContent = 'TIM ' + s.teamNo + ' · ' + s.zone;
    var when = document.createElement('small');
    when.className = 'when';
    when.textContent = (W.routes[s.routeId] || {}).label + ' · ' + SA.longDate(SA.parseDate(s.date));
    var who = document.createElement('small');
    who.textContent = s.officers.join(', ');
    line.appendChild(when);
    line.appendChild(who);

    var stale = s.date !== SA.dateOf(new Date());
    $('wt-over').textContent = stale
      ? 'Ini data tim tanggal ' + SA.longDate(SA.parseDate(s.date)) + '. Tekan Ubah untuk memulai hari ini.'
      : '';
    $('wt-over').classList.toggle('hidden', !stale);

    loadSessionRecords().then(function (records) {
      var kps = records.filter(function (r) { return r.kind === 'wtkp'; });
      var lds = records.filter(function (r) { return r.kind === 'lds'; });
      var last = kps[kps.length - 1];
      $('go-wtkp-sub').textContent = last
        ? kps.length + ' KP hari ini · terakhir KP ' + SA.kpPrint(last.kp)
        : 'Belum ada KP hari ini';
      $('go-lds-sub').textContent = lds.length ? lds.length + ' laporan LDS hari ini' : 'Saat ada tiket dari SPO';
      return SA.db.all();
    }).then(function (all) {
      renderCount(all, 'walkthrough', 'wt-count', 'wt-go-export');
    });
  }

  $('wt-edit').addEventListener('click', openWtSetup);
  $('go-wtkp').addEventListener('click', function () { openReport('wtkp'); });
  $('go-lds').addEventListener('click', function () { openReport('lds'); });

  /* ── Patrol: start of shift ─────────────────────────────────────────── */

  var P = SA.PATROL;

  function patrolDirectory() {
    return P.units.map(function (u) { return { name: u.id, members: u.members }; });
  }

  /** Opens the Patrol start screen; `prefill` is the next shift after an end
      of shift report (same patrol and vehicle, the km carried over). */
  function openPatrolSetup(prefill) {
    var s = state.sessions.patrol;
    var now = new Date();
    var current = SA.shiftFor(now);
    if (prefill) {
      state.pSetup = prefill;
    } else if (s && !sessionOver(s, now)) {
      state.pSetup = { patrolId: s.patrolId, officers: s.officers.slice(), tni: s.tni || '', vehicle: s.vehicle,
        ownVehicle: P.vehicles.indexOf(s.vehicle) === -1, km: s.kmStart || '',
        shift: s.shift, date: s.shiftDate, others: false };
    } else {
      // A finished shift keeps its patrol and vehicle, not its people or its time.
      state.pSetup = { patrolId: s ? s.patrolId : '', officers: [], tni: '', vehicle: s ? s.vehicle : '',
        ownVehicle: !!(s && P.vehicles.indexOf(s.vehicle) === -1), km: '',
        shift: current.shift, date: current.date, others: false };
    }
    renderPatrolSetup();
    show('p-setup');
  }

  function buildPatrolChips() {
    var units = $('p-unit');
    units.innerHTML = '';
    P.units.forEach(function (u) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = u.id;
      chip.addEventListener('click', function () {
        var setup = state.pSetup;
        if (setup.patrolId !== u.id) {
          // The patrol's own vehicle, unless the crew already picked another.
          if (!setup.vehicle || setup.vehicle === SA.patrolVehicle(setup.patrolId)) {
            setup.vehicle = SA.patrolVehicle(u.id);
            setup.ownVehicle = false;
          }
          setup.patrolId = u.id;
          // Names picked for another patrol are almost certainly wrong here.
          setup.officers = setup.officers.filter(function (name) { return u.members.indexOf(name) !== -1; });
        }
        renderPatrolSetup();
      });
      units.appendChild(chip);
    });

    var shifts = $('p-shift');
    shifts.innerHTML = '';
    S.shifts.forEach(function (shift) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      var b = document.createElement('b');
      b.textContent = shift.id;
      var small = document.createElement('small');
      small.textContent = SA.hourText(shift.start) + '–' + SA.hourText(shift.end);
      chip.appendChild(b);
      chip.appendChild(small);
      chip.addEventListener('click', function () { state.pSetup.shift = shift.id; renderPatrolSetup(); });
      shifts.appendChild(chip);
    });
  }

  function renderPatrolSetup() {
    var setup = state.pSetup;
    var u = SA.patrolUnit(setup.patrolId);
    Array.prototype.forEach.call($('p-unit').children, function (chip, i) {
      chip.setAttribute('aria-pressed', String(P.units[i].id === setup.patrolId));
    });
    $('p-unit-note').textContent = u ? u.segments + ' · ' + u.area + ' (' + u.sheetZone + ' di Database Personil)'
      : 'Pilih patrol dulu.';

    $('p-officers-label').textContent = 'Personil patroli (' + setup.officers.length + ' dipilih)';
    renderPicker($('p-officers'), setup.patrolId, setup.officers, setup.others,
      function () { setup.others = !setup.others; renderPatrolSetup(); },
      renderPatrolSetup, { noun: 'patrol', groups: patrolDirectory() });

    if (document.activeElement !== $('p-tni')) $('p-tni').value = setup.tni;
    renderChoice($('p-vehicle'), P.vehicles.map(function (v, i) { return { value: v, text: 'Patrol ' + (i + 1) + ' · ' + v }; })
      .concat([{ value: '__own', text: 'Ketik sendiri' }]),
      setup.ownVehicle ? '__own' : setup.vehicle, function (value) {
        var wasOwn = setup.ownVehicle;
        setup.ownVehicle = value === '__own';
        if (setup.ownVehicle && !wasOwn) $('p-vehicle-own').value = '';
        setup.vehicle = setup.ownVehicle ? $('p-vehicle-own').value.trim() : value;
        renderPatrolSetup();
      });
    $('p-vehicle-own-field').classList.toggle('hidden', !setup.ownVehicle);
    if (setup.ownVehicle && document.activeElement !== $('p-vehicle-own')) $('p-vehicle-own').value = setup.vehicle;
    if (!setup.ownVehicle) $('p-vehicle-own').value = '';
    if (document.activeElement !== $('p-km')) $('p-km').value = setup.km;

    Array.prototype.forEach.call($('p-shift').children, function (chip, i) {
      chip.setAttribute('aria-pressed', String(S.shifts[i].id === setup.shift));
    });
    $('p-date').value = setup.date;

    var ready = !!(setup.patrolId && setup.officers.length && String(setup.vehicle).trim() && setup.shift && setup.date);
    $('p-start').disabled = !ready;
    $('p-blocker').textContent = ready ? ''
      : !setup.patrolId ? 'Pilih patrol dulu.'
      : !setup.officers.length ? 'Centang personil patroli.'
      : !String(setup.vehicle).trim() ? 'Pilih atau ketik kendaraan.'
      : !setup.shift ? 'Pilih shift.'
      : 'Isi tanggal shift.';
  }

  $('p-tni').addEventListener('input', function () { state.pSetup.tni = this.value; });
  $('p-vehicle-own').addEventListener('input', function () {
    state.pSetup.vehicle = this.value.trim();
    renderPatrolSetup();
  });
  $('p-km').addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 7);
    state.pSetup.km = this.value;
  });
  $('p-date').addEventListener('change', function () { state.pSetup.date = this.value; renderPatrolSetup(); });
  $('p-setup-back').addEventListener('click', function () { buildTeamChips(); show('team'); });
  $('p-main-team').addEventListener('click', function () { buildTeamChips(); show('team'); });

  $('p-start').addEventListener('click', function () {
    if (this.disabled) return;
    var setup = state.pSetup;
    var old = state.sessions.patrol;
    var u = SA.patrolUnit(setup.patrolId);
    // Same patrol, shift and date: a correction, not a new shift.
    var same = old && old.patrolId === setup.patrolId && old.shift === setup.shift && old.shiftDate === setup.date;
    state.sessions.patrol = {
      id: same ? old.id : 'p' + Date.now().toString(36),
      patrolId: setup.patrolId,
      zone: u.area,
      segments: u.segments,
      officers: setup.officers.slice(),
      tni: setup.tni.trim(),
      vehicle: String(setup.vehicle).trim(),
      kmStart: setup.km,
      shift: setup.shift,
      shiftDate: setup.date,
      fieldInterview: same && old.fieldInterview ? old.fieldInterview : P.FIELD_INTERVIEW
    };
    SA.db.setPref('patrolSession', state.sessions.patrol);
    SA.photo.preload(SA.patrolBadge(setup.patrolId));
    renderPatrolMain();
    show('p-main');
    afterStart();
  });

  /* ── Patrol: the shift ──────────────────────────────────────────────── */

  /** `light`: the minute tick -- skips counting every record for Export. */
  function renderPatrolMain(light) {
    var s = state.sessions.patrol;
    if (!s) return;
    var shift = SA.shiftById(s.shift);
    var badge = SA.patrolBadge(s.patrolId);
    if (badge && $('p-badge').getAttribute('src') !== badge) $('p-badge').src = badge;
    $('p-badge').alt = 'Team ' + SA.patrolRecords.teamLabel(s);
    var line = $('p-session');
    line.textContent = s.patrolId + ' · ' + s.segments + ' · ' + s.zone;
    var when = document.createElement('small');
    when.className = 'when';
    when.textContent = s.shift + ' · ' + SA.hourText(shift.start) + '–' + SA.hourText(shift.end) +
      ' WIB · ' + SA.longDate(SA.parseDate(s.shiftDate));
    var who = document.createElement('small');
    who.textContent = s.officers.join(', ') + ' · TNI: ' + (s.tni || '-');
    var car = document.createElement('small');
    car.textContent = s.vehicle + (s.kmStart ? ' · KM awal ' + s.kmStart : '');
    line.appendChild(when);
    line.appendChild(who);
    line.appendChild(car);

    var over = sessionOver(s, new Date());
    $('p-over').textContent = over
      ? 'Shift ini sudah selesai. Kirim Laporan Akhir Shift bila belum, lalu tekan Ubah untuk memulai shift baru.'
      : '';
    $('p-over').classList.toggle('hidden', !over);

    loadSessionRecords().then(function (records) {
      var tours = records.filter(function (r) { return r.kind === 'patrol'; });
      var last = tours[tours.length - 1];
      var points = SA.patrolRecords.points(s.patrolId, records);
      var left = points.filter(function (p) { return !p.time; });
      $('go-patrol-sub').textContent = (points.length
        ? (points.length - left.length) + ' dari ' + points.length + ' titik dicek'
        : tours.length + ' titik') +
        (last ? ' · terakhir ' + String(last.time).slice(0, 5) : ' · belum ada shift ini');
      renderPointsLeft(left, s);
      var ended = records.filter(function (r) { return r.kind === 'pend'; }).length;
      $('go-pend-sub').textContent = ended ? 'Sudah dikirim' : 'KM akhir, titik belum dicek';
      return light ? null : SA.db.all();
    }).then(function (all) {
      if (all) renderCount(all, 'patrol', 'p-count', 'p-go-export');
    });
  }

  /**
   * The checkpoints not yet checked this shift (Billy, 2026-10-05): a notice,
   * never a block. Amber in the shift's last two hours and after it.
   */
  function renderPointsLeft(left, s) {
    var box = $('p-points');
    box.innerHTML = '';
    box.classList.toggle('hidden', !left.length);
    if (!left.length) return;
    var window_ = SA.shiftWindow(s.shiftDate, s.shift);
    var late = !window_ || Date.now() > window_.end.getTime() - 2 * 60 * 60 * 1000;
    box.classList.toggle('late', late);
    var title = document.createElement('b');
    title.textContent = 'Belum dicek shift ini (' + left.length + ')';
    box.appendChild(title);
    var list = document.createElement('ul');
    left.forEach(function (p) {
      var item = document.createElement('li');
      item.textContent = p.name;
      if (p.rawan) {
        var tag = document.createElement('span');
        tag.className = 'tag-rawan';
        tag.textContent = 'Titik rawan';
        item.appendChild(tag);
      }
      list.appendChild(item);
    });
    box.appendChild(list);
  }

  $('p-edit').addEventListener('click', function () { openPatrolSetup(); });
  $('go-patrol').addEventListener('click', function () { openReport('patrol'); });
  $('go-p-incident').addEventListener('click', function () { openReport('incident'); });
  $('go-p-lds').addEventListener('click', function () { openReport('lds'); });
  $('go-pend').addEventListener('click', function () {
    var sent = latestRecord('pend', null);
    if (sent && !confirm('Laporan akhir shift sudah dikirim pukul ' + String(sent.time).slice(0, 5) +
        '. Buat lagi?')) return;
    openReport('pend');
  });

  /* ── Patrol: the forms ──────────────────────────────────────────────── */

  function patrolDraft(kind, s, now, ref) {
    return {
      kind: kind,
      team: 'patrol',
      date: SA.dateOf(now),
      patrolId: s.patrolId, zone: s.zone, segments: s.segments,
      shift: s.shift, shiftDate: s.shiftDate,
      officers: s.officers.slice(), tni: s.tni, vehicle: s.vehicle,
      reporter: s.officers[0] || '',
      // guard tour: a point on the patrol's list, or a typed area
      point: '', typing: false, area: '', facility: '', check: '',
      weather: P.weather[0], road: P.road[0], traffic: P.NIHIL, crash: P.NIHIL,
      gangguanSummary: {}, patrolResult: 'none', patrolFinding: '',
      fieldInterview: s.fieldInterview || P.FIELD_INTERVIEW,
      // end of shift
      kmStart: s.kmStart || '', kmEnd: '', points: [], tours: [], findingList: [],
      nextOfficers: [], nextTni: '',
      // incident (5W1H), as Security's
      incidentType: '', otherText: '', answers: { bilamana: 'Pukul ' + hhmm(now) + ' WIB' }, tindakan: '',
      // LDS, as Walkthrough's -- any segment, the patrol's first by default
      routeId: null, ldsTime: hhmm(now), ldsSegment: SA.patrolFirstSegment(s.patrolId), ldsKp: '',
      landmark: '', radius: W.LDS_RADIUS, result: 'none', finding: '',
      // findings and closing
      followUp: '', status: 'Open', closeTime: hhmm(now), ref: ref || null
    };
  }

  /** E. Gangguan: Nihil, or where to find the incident report(s) of this shift. */
  function gangguanSummary() {
    var summary = {};
    P.gangguan.forEach(function (type) {
      var list = state.sessionRecords.filter(function (r) { return r.kind === 'incident' && r.incidentType === type; });
      if (!list.length) return;
      summary[type] = 'Ada, lihat Laporan Kejadian pukul ' +
        list.map(function (r) { return String(r.time || '').slice(0, 5); }).join(' & ') + ' WIB';
    });
    return summary;
  }

  /** The areas typed on this phone before, offered while the list is missing. */
  var patrolAreas = [];

  /**
   * The patrol's checkpoints, each with when it was checked this shift; the
   * last row types a point the list does not have. Nothing is picked for the
   * crew: the point is on the photo and in the report.
   */
  function renderPatrolPoints() {
    var d = state.draft;
    var points = SA.patrolRecords.points(d.patrolId, state.sessionRecords);
    var left = points.filter(function (p) { return !p.time; }).length;
    $('r-p-points-label').textContent = points.length
      ? 'Titik — ' + (points.length - left) + ' dari ' + points.length + ' sudah dicek shift ini'
      : 'Titik';
    var box = $('r-p-points');
    box.innerHTML = '';
    var typing = d.point === '' && d.typing;
    points.forEach(function (p) {
      var row = document.createElement('button');
      row.type = 'button';
      row.setAttribute('aria-pressed', String(d.point === p.name));
      var name = document.createElement('span');
      name.textContent = p.name;
      if (p.rawan) {
        var tag = document.createElement('span');
        tag.className = 'tag-rawan';
        tag.textContent = 'Titik rawan';
        name.appendChild(tag);
      }
      var when = document.createElement('small');
      when.className = p.time ? 'done' : '';
      when.textContent = p.time ? '✓ ' + p.time + (p.facility === 'Tidak Aktif' ? ' · Tidak Aktif' : '') : 'belum';
      row.appendChild(name);
      row.appendChild(when);
      row.addEventListener('click', function () { pickPatrolPoint(p.name); });
      box.appendChild(row);
    });
    var other = document.createElement('button');
    other.type = 'button';
    other.setAttribute('aria-pressed', String(typing || !points.length));
    var label = document.createElement('span');
    label.className = 'other';
    label.textContent = 'Lainnya — ketik sendiri';
    other.appendChild(label);
    other.addEventListener('click', function () { pickPatrolPoint(null); });
    box.appendChild(other);
    $('r-p-area-field').classList.toggle('hidden', !(typing || !points.length));
    $('r-p-facility-field').classList.toggle('hidden', d.point === '');
    // Nothing picked for the crew: Aktif or Tidak Aktif is a tap at each point.
    renderChoice($('r-p-facility'), P.FACILITY_STATES.map(function (v) { return { value: v, text: v }; }),
      d.facility, function (value) { state.draft.facility = value; updateReport(); });
  }

  /** A point from the list (its name is the area), or null to type one. */
  function pickPatrolPoint(name) {
    var d = state.draft;
    if ((name || '') !== d.point) d.facility = '';   // another point: look again
    d.point = name || '';
    d.typing = !name;
    d.area = name || String($('r-p-area').value).trim();
    renderPatrolPoints();
    if (!name) $('r-p-area').focus();
    updateReport();
  }

  function renderPatrolFields() {
    var d = state.draft;
    d.gangguanSummary = gangguanSummary();
    $('r-p-area').value = '';
    $('r-p-check').value = '';
    $('r-p-traffic').value = d.traffic;
    $('r-p-crash').value = d.crash;
    $('r-p-finding').value = '';
    $('r-p-interview').value = d.fieldInterview;
    $('r-p-areas').innerHTML = '';
    var listed = SA.patrolPoints(d.patrolId).map(function (p) { return p.name.toLowerCase(); });
    SA.sheets.unique(patrolAreas).filter(function (area) {
      return listed.indexOf(String(area).toLowerCase()) === -1;
    }).forEach(function (area) {
      var option = document.createElement('option');
      option.value = area;
      $('r-p-areas').appendChild(option);
    });
    renderPatrolPoints();
    renderChoice($('r-p-weather'), P.weather.map(function (w) { return { value: w, text: w }; }), d.weather,
      function (value) { state.draft.weather = value; updateReport(); });
    renderChoice($('r-p-road'), P.road.map(function (w) { return { value: w, text: w }; }), d.road,
      function (value) { state.draft.road = value; updateReport(); });
    $('r-p-gangguan').textContent = P.gangguan.map(function (type) {
      return type + ': ' + (d.gangguanSummary[type] || P.NIHIL);
    }).join(' · ') + '. Ada gangguan? Kirim lewat Laporan kejadian — terhitung di sini.';
    renderChoice($('r-p-result'), [
      { value: 'none', text: 'Nihil' },
      { value: 'found', text: 'Ada temuan' }
    ], d.patrolResult, function (value) {
      state.draft.patrolResult = value;
      $('r-p-finding-field').classList.toggle('hidden', value !== 'found');
      updateReport();
    });
    $('r-p-finding-field').classList.add('hidden');
  }

  // Only shown under "Lainnya". A name that is on the list becomes that point
  // (so its condition is asked), instead of a typed area that happens to match.
  wireText('r-p-area', 'area', function (value) {
    var key = String(value).trim().toLowerCase();
    var match = SA.patrolPoints(state.draft.patrolId).filter(function (p) {
      return p.name.toLowerCase() === key;
    })[0];
    if (!match) return;
    $('r-p-area').value = '';
    pickPatrolPoint(match.name);
  });
  wireText('r-p-check', 'check');
  wireText('r-p-traffic', 'traffic');
  wireText('r-p-crash', 'crash');
  wireText('r-p-finding', 'patrolFinding');
  wireText('r-p-interview', 'fieldInterview');

  /** What the crew typed is offered next time: the area, the field interview. */
  function rememberPatrol(record) {
    if (record.area && !record.point && patrolAreas.indexOf(record.area) === -1) {
      patrolAreas = patrolAreas.concat([record.area]).slice(-60);
      SA.db.setPref('patrolAreas', patrolAreas);
    }
    var s = state.sessions.patrol;
    if (s && record.fieldInterview && s.fieldInterview !== record.fieldInterview) {
      s.fieldInterview = record.fieldInterview;
      SA.db.setPref('patrolSession', s);
    }
  }

  /** End of shift: this shift's checkpoints and findings, frozen at saving. */
  function patrolShiftSummary(d) {
    d.tours = state.sessionRecords.filter(function (r) { return r.kind === 'patrol'; }).map(function (r) {
      return { time: String(r.time || '').slice(0, 5), area: r.area || '', check: r.check || '',
        facility: r.facility || '' };
    });
    d.points = SA.patrolRecords.points(d.patrolId, state.sessionRecords);
    d.findingList = state.sessionRecords.filter(function (r) { return SA.findings.is(r); }).map(function (r) {
      return { time: String(r.time || '').slice(0, 5), label: SA.patrolRecords.label(r), status: SA.findings.status(r) };
    });
  }

  /** The incoming crew: this patrol's people first, the rest behind "patrol lain". */
  function renderPendNext() {
    var d = state.draft;
    $('r-pend-next-label').textContent = 'Shift lanjut (masuk) — ' + d.nextOfficers.length + ' dipilih';
    renderPicker($('r-pend-next'), d.patrolId, d.nextOfficers, state.nextOthers,
      function () { state.nextOthers = !state.nextOthers; renderPendNext(); },
      function () { renderPendNext(); updateReport(); },
      { noun: 'patrol', groups: patrolDirectory() });
  }

  $('r-pend-next-tni').addEventListener('input', function () {
    if (!state.draft) return;
    state.draft.nextTni = this.value;
    updateReport();
  });

  function renderPendFields() {
    var d = state.draft;
    patrolShiftSummary(d);
    $('r-pend-next-tni').value = '';
    renderPendNext();
    $('r-pend-km-start').value = d.kmStart;
    $('r-pend-km-end').value = '';
    // The checklist, from this shift's guard tours. Unchecked points are
    // named in the report; sending is never blocked by them (Billy).
    var left = d.points.filter(function (p) { return !p.time; });
    $('r-pend-points-note').textContent = left.length
      ? left.length + ' dari ' + d.points.length + ' titik belum dicek shift ini — tertulis di laporan. ' +
        'Laporan tetap bisa dikirim.'
      : '';
    var box = $('r-pend-points');
    box.innerHTML = '';
    if (!d.points.length) box.textContent = 'Patrol ini belum punya daftar titik.';
    d.points.forEach(function (p) {
      var row = document.createElement('div');
      row.className = !p.time ? 'missing' : p.facility === 'Tidak Aktif' ? 'missing' : 'ok';
      row.textContent = p.name + (p.rawan ? ' (titik rawan)' : '') + ' — ' +
        (p.time ? '✓ ' + p.time + (p.facility ? ' · ' + p.facility : '') : 'belum dicek');
      box.appendChild(row);
    });
    // Below it, only what the checklist does not show: points typed under
    // "Lainnya", and the findings.
    var listed = d.points.map(function (p) { return p.name.toLowerCase(); });
    var summary = $('r-pend-summary');
    summary.innerHTML = '';
    var rows = d.tours.filter(function (t) { return listed.indexOf(String(t.area).toLowerCase()) === -1; })
      .map(function (t) { return t.time + ' · ' + (t.area || '-'); })
      .concat(d.findingList.map(function (f) { return f.time + ' · ' + f.label + ' (' + f.status + ')'; }));
    if (!rows.length) summary.textContent = 'Tidak ada titik lain atau temuan shift ini.';
    rows.forEach(function (text) {
      var row = document.createElement('div');
      row.textContent = text;
      summary.appendChild(row);
    });
    renderPendDistance();
  }

  function renderPendDistance() {
    var km = SA.patrolRecords.distance(state.draft);
    $('r-pend-distance').textContent = km === null ? 'Jarak tempuh: isi KM awal dan KM akhir.'
      : 'Jarak tempuh: ' + km + ' km';
  }

  ['r-pend-km-start', 'r-pend-km-end'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      if (!state.draft) return;
      this.value = this.value.replace(/\D/g, '').slice(0, 7);
      state.draft[id === 'r-pend-km-start' ? 'kmStart' : 'kmEnd'] = this.value;
      renderPendDistance();
      updateReport();
    });
  });

  /* ── Walkthrough: the two forms ─────────────────────────────────────── */

  function wtDraft(kind, s, now, ref) {
    var route = W.routes[s.routeId] || { segments: [''] };
    return {
      kind: kind,
      team: 'walkthrough',
      date: SA.dateOf(now),
      teamNo: s.teamNo,
      zone: s.zone,
      routeId: s.routeId,
      officers: s.officers.slice(),
      reporter: s.officers[0] || '',
      segment: route.segments[0],
      kp: '',
      condition: W.conditions[0].label,
      other: '',
      ldsTime: hhmm(now),
      ldsSegment: route.segments[0],
      ldsKp: '',
      landmark: '',
      radius: W.LDS_RADIUS,
      result: 'none',
      finding: '',
      assets: {},
      buildings: {},
      followUp: '',
      status: 'Open',
      closeTime: hhmm(now),
      ref: ref || null
    };
  }

  /** Today's route's segments first, then every other segment. */
  function fillSegmentSelect(select, routeId, value) {
    select.innerHTML = '';
    var mine = (W.routes[routeId] || { segments: [] }).segments;
    function group(label, ids) {
      if (!ids.length) return;
      var og = document.createElement('optgroup');
      og.label = label;
      ids.forEach(function (id) {
        var option = document.createElement('option');
        option.value = id;
        option.textContent = SA.wtSegmentText(id);
        og.appendChild(option);
      });
      select.appendChild(og);
    }
    group('Rute hari ini', mine);
    group('Segment lain', W.segments.map(function (s) { return s.id; })
      .filter(function (id) { return mine.indexOf(id) === -1; }));
    select.value = value;
  }

  function renderChoice(box, options, current, onPick) {
    box.innerHTML = '';
    options.forEach(function (o) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = o.text;
      chip.setAttribute('aria-pressed', String(o.value === current));
      chip.addEventListener('click', function () {
        onPick(o.value);
        Array.prototype.forEach.call(box.children, function (c, i) {
          c.setAttribute('aria-pressed', String(options[i].value === o.value));
        });
      });
      box.appendChild(chip);
    });
  }

  function renderWtKpFields() {
    var d = state.draft;
    fillSegmentSelect($('r-wt-seg'), d.routeId, d.segment);
    $('r-wt-kp').value = d.kp;
    $('r-wt-other').value = '';
    renderChoice($('r-wt-cond'), W.conditions.map(function (c) {
      return { value: c.label, text: c.label === W.CONDITION_OTHER ? 'Lainnya — tulis sendiri' : c.label };
    }), d.condition, function (value) {
      state.draft.condition = value;
      renderWtNote();
      updateReport();
    });
    renderWtNote();
    renderWtAssets();
  }

  /** The sentence that will actually be sent, under the choice that makes it. */
  function renderWtNote() {
    var d = state.draft;
    var other = d.condition === W.CONDITION_OTHER;
    $('r-wt-other-field').classList.toggle('hidden', !other);
    var c = W.conditions.filter(function (x) { return x.label === d.condition; })[0];
    $('r-wt-note').textContent = other ? '' : (c ? c.note : '');
  }

  function renderLdsFields() {
    var d = state.draft;
    $('r-lds-time').value = d.ldsTime;
    fillSegmentSelect($('r-lds-seg'), d.routeId, d.ldsSegment);
    d.ldsSegment = $('r-lds-seg').value;
    $('r-lds-kp').value = '';
    $('r-lds-landmark').value = '';
    $('r-lds-radius').value = d.radius;
    $('r-lds-finding').value = '';
    renderChoice($('r-lds-result'), [
      { value: 'none', text: 'Tidak ditemukan kebocoran' },
      { value: 'found', text: 'Ditemukan indikasi' }
    ], d.result, function (value) {
      state.draft.result = value;
      $('r-lds-finding-field').classList.toggle('hidden', value !== 'found');
      updateReport();
    });
    $('r-lds-finding-field').classList.add('hidden');
  }

  /* The KP mask: digits only, the "+" appears by itself, caret kept at the end
     (otherwise typing 0,7,6,0,0 gives 07+006 instead of 07+600). */
  function wireKp(id, key) {
    $(id).addEventListener('input', function () {
      if (!state.draft) return;
      var formatted = SA.formatKp(this.value);
      this.value = formatted;
      this.setSelectionRange(formatted.length, formatted.length);
      state.draft[key] = formatted;
      updateReport();
    });
  }
  wireKp('r-wt-kp', 'kp');
  wireKp('r-lds-kp', 'ldsKp');

  function wireText(id, key, after) {
    $(id).addEventListener('input', function () {
      if (!state.draft) return;
      state.draft[key] = this.value;
      if (after) after(this.value);
      updateReport();
    });
  }
  wireText('r-wt-other', 'other');
  wireText('r-lds-landmark', 'landmark');
  wireText('r-lds-finding', 'finding');
  // The radius: digits only, and never silently replaced by the default.
  $('r-lds-radius').addEventListener('input', function () {
    if (!state.draft) return;
    this.value = this.value.replace(/\D/g, '').slice(0, 5);
    state.draft.radius = this.value;
    updateReport();
  });
  wireText('r-lds-time', 'ldsTime', function (value) {
    state.draft.date = typedTimeDate(value, new Date());
  });
  $('r-wt-seg').addEventListener('change', function () {
    if (!state.draft) return;
    state.draft.segment = this.value;
    updateReport();
  });
  $('r-lds-seg').addEventListener('change', function () {
    if (!state.draft) return;
    state.draft.ldsSegment = this.value;
    updateReport();
  });


  /** The hour a check most likely belongs to: the hour we are in, if it is in
      the shift; otherwise the first one nobody has reported yet. */
  function defaultHour(session, now) {
    var hours = SA.checkHours(session.shift);
    var done = hoursCovered();
    for (var i = 0; i < hours.length; i++) {
      var from = SA.shiftHourDate(session.shiftDate, hours[i]).getTime();
      var to = from + 60 * 60 * 1000;
      if (now.getTime() >= from && now.getTime() < to) return hours[i];
    }
    // Before the first check (the hour the previous shift's handover covers),
    // the first check is the one coming up.
    if (now.getTime() < SA.shiftHourDate(session.shiftDate, hours[0]).getTime()) return hours[0];
    var open = hours.filter(function (h) { return !done[h]; });
    return open.length ? open[0] : hours[hours.length - 1];
  }

  /** A new Security report, filled from the shift. */
  function secDraft(kind, session, now, hour, ref) {
    return {
      kind: kind,
      team: 'security',
      // The captions read `date`; a draft has one too, so the preview is right.
      date: SA.dateOf(now),
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
      finalSituation: S.FINAL_SITUATION,
      direction: S.accessDirections[0],
      accessTime: hhmm(now),
      from: session.post,
      to: '',
      approvedBy: '',
      // Body check: done at shift change, so Pukul starts at the nearer one.
      bodyTime: SA.hourText(nearestChange(session, now)),
      bodyResult: 'none',
      bodyFinding: '',
      // A finding's Tindak lanjut and Status, and the close report (findings.js).
      followUp: '',
      status: 'Open',
      closeTime: hhmm(now),
      ref: ref || null
    };
  }

  /** The shift change nearest to now: this shift's start hour or its end hour.
      The outgoing crew (near the end) and the incoming crew (near the start)
      both get the right default. */
  function nearestChange(session, now) {
    var shift = SA.shiftById(session.shift);
    var start = SA.shiftHourDate(session.shiftDate, shift.start).getTime();
    var end = SA.shiftHourDate(session.shiftDate, shift.end).getTime();
    return Math.abs(now.getTime() - start) <= Math.abs(end - now.getTime()) ? shift.start : shift.end;
  }



  /** `ref` only for 'close': the finding being closed (SA.findings.refOf). */
  /* Every report kind: its form section and what fills it. A new kind is one
     line here (and its section in index.html). */
  var FORMS = {
    check:    ['r-check',    renderHourSelect],
    incident: ['r-incident', renderIncidentFields],
    shift:    ['r-shift',    renderShiftFields],
    access:   ['r-access',   renderAccessFields],
    body:     ['r-body',     renderBodyFields],
    wtkp:     ['r-wtkp',     renderWtKpFields],
    lds:      ['r-lds',      renderLdsFields],
    close:    ['r-close',    renderCloseFields],
    patrol:   ['r-patrol',   renderPatrolFields],
    pend:     ['r-pend',     renderPendFields],
    office:   ['r-office',   renderOfficeFields]
  };

  /** A Tutup temuan asked for before the day or shift was started: opened
      as soon as it is (see afterStart). */
  var pendingClose = null;

  /** `keptSession`: an earlier day's session whose kept report is being sent. */
  function openReport(kind, hour, ref, keptSession) {
    var session = keptSession || currentSession();
    var module = moduleOf(currentTeam());
    /* No session, or a Walkthrough day that is not today: back to the start
       screen, so today's reports are never filed under yesterday's crew. */
    if (!keptSession && (!session || !module.fresh(session))) {
      if (kind === 'close') {
        pendingClose = ref;
        toast('Mulai hari/shift dulu — Tutup temuan terbuka setelah itu.');
      }
      goMain();
      return;
    }
    var now = new Date();

    loadSessionRecords().then(function () {
      state.draft = module.draft(kind, session, now, hour, ref);
      state.draft.session = session;   // the record is filed under this session
      state.draft.restored = !keptFields(state.draft);
      // A close report is filed where the finding was (findings.js refOf).
      if (kind === 'close' && ref && ref.place) Object.assign(state.draft, ref.place);
      state.nextOthers = false;
      releasePhotoUrls(state.photos);
      state.photos = [];

      $('r-title').textContent = TITLES[kind];
      Object.keys(FORMS).forEach(function (k) {
        $(FORMS[k][0]).classList.toggle('hidden', k !== kind);
      });
      // Access control has its own three named photo slots.
      $('r-photos-generic').classList.toggle('hidden', kind === 'access');

      FORMS[kind][1]();
      renderFindingFields();

      renderPhotoStrip();
      updateReport();
      show('report');
    });
  }

  $('r-back').addEventListener('click', function () {
    // A report kept until Simpan (Security Perkantoran): Batal keeps it.
    if (keptFields(state.draft)) {
      saveKept(true);
      toast('Foto dan isian tetap tersimpan di HP sampai Simpan.');
      goMain();
      return;
    }
    if ((state.photos.length || state.processing) &&
        !confirm('Laporan belum disimpan. Keluar dan buang fotonya?')) return;
    goMain();
  });

  $('r-to-incident').addEventListener('click', function () {
    if ((state.photos.length || state.processing) &&
        !confirm('Pengecekan ini belum disimpan. Pindah ke Laporan Kejadian?')) return;
    openReport('incident');
  });

  /* Hourly check */

  function renderHourSelect() {
    var select = $('r-hour');
    var done = hoursDone();
    var marks = partnerMarks().hours;
    select.innerHTML = '';
    SA.checkHours(state.draft.shift).forEach(function (h) {
      var option = document.createElement('option');
      option.value = String(h);
      option.textContent = SA.hourText(h) + ' WIB' + (done[h] ? '  ✓ sudah dikirim'
        : marks[h] ? '  ✓ dikirim ' + marks[h] : '');
      select.appendChild(option);
    });
    select.value = String(state.draft.hour);
    renderPartnerBox();
  }

  /** "Already sent by my partner from their phone?" -- mark it, no photo. */
  function renderPartnerBox() {
    var draft = state.draft;
    var box = $('r-partner');
    var partners = partnersOf(state.session);
    if (!partners.length || hoursDone()[draft.hour]) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    var hour = SA.hourText(draft.hour);
    var marked = partnerMarks().hours[draft.hour];
    $('r-partner-text').textContent = marked
      ? 'Pukul ' + hour + ' WIB ditandai: dikirim ' + marked + ' dari HP-nya.'
      : 'Pukul ' + hour + ' WIB sudah dikirim rekan dari HP-nya? Tandai saja — tanpa foto.';
    var actions = $('r-partner-actions');
    actions.innerHTML = '';
    (marked ? [null] : partners).forEach(function (name) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary';
      button.textContent = name ? 'Dikirim ' + name : 'Batalkan tanda';
      button.addEventListener('click', function () {
        if (name && (state.photos.length || state.processing) &&
            !confirm('Foto di layar ini dibuang. Tandai pukul ' + hour + ' dikirim ' + name + '?')) return;
        setPartnerMark('hours', draft.hour, name);
        if (!name) { toast('Tanda pukul ' + hour + ' dibatalkan.'); renderHourSelect(); return; }
        toast('Pukul ' + hour + ' ditandai: dikirim ' + name + '.');
        goMain();
      });
      actions.appendChild(button);
    });
  }

  $('r-hour').addEventListener('change', function () {
    state.draft.hour = Number(this.value);
    renderPartnerBox();
    updateReport();
  });

  /* Incident */

  function renderIncidentFields() {
    var types = state.draft.team === 'patrol' ? P.gangguan : S.incidentTypes;
    renderChoice($('r-type'), types.map(function (t) { return { value: t, text: t }; }),
      state.draft.incidentType, function (type) {
        state.draft.incidentType = type;
        $('r-other-field').classList.toggle('hidden', type !== SA.otherTypeOf(state.draft.team));
        updateReport();
      });
    $('r-other-field').classList.add('hidden');
    $('r-other-label').textContent = 'Jelaskan (' + SA.otherTypeOf(state.draft.team) + ')';
    $('r-other').value = '';

    var box = $('r-questions');
    box.innerHTML = '';
    S.questions.forEach(function (q) {
      var label = document.createElement('label');
      label.className = 'field';
      var span = document.createElement('span');
      span.textContent = q.label;
      var input = document.createElement(q.long ? 'textarea' : 'input');
      if (q.long) input.rows = 3; else input.type = 'text';
      input.autocomplete = 'off';
      input.placeholder = q.hint || '';
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

  /** Section A: every hour of the shift up to now, whether it was sent, and
      by whom -- this phone's reporter, or the partner it was marked for. */
  function checkLines(draft, now) {
    var own = hoursDone();
    var marks = partnerMarks().hours;
    return SA.checkHours(draft.shift).filter(function (h) {
      return own[h] || marks[h] || SA.shiftHourDate(draft.shiftDate, h).getTime() <= now.getTime();
    }).map(function (h) {
      if (own[h]) return { hour: h, done: true, by: own[h].reporter || '' };
      if (marks[h]) return { hour: h, done: true, by: marks[h], partner: true };
      return { hour: h, done: false };
    });
  }

  /** Section B: "None", or where to find the incident report(s). */
  function incidentSummary() {
    var byType = {};
    state.sessionRecords.forEach(function (r) {
      if (r.kind !== 'incident') return;
      (byType[r.incidentType] = byType[r.incidentType] || []).push(r);
    });
    var marks = partnerMarks().incidents;
    var summary = {};
    S.incidentTypes.forEach(function (type) {
      var list = byType[type] || [];
      var partner = marks[type];
      if (!list.length && !partner) { summary[type] = 'None'; return; }
      var parts = [];
      if (list.length) {
        var times = list.map(function (r) { return (r.time || '').slice(0, 5); });
        var who = SA.sheets.unique(list.map(function (r) { return r.reporter; }).filter(Boolean));
        parts.push('lihat Laporan Kejadian pukul ' + times.join(' & ') + ' WIB' +
          (who.length ? ' (' + who.join(', ') + ')' : ''));
      }
      if (partner) parts.push('lihat Laporan Kejadian dari ' + partner);
      var what = type === S.OTHER
        ? list.map(function (r) { return (r.otherText || '').trim(); }).filter(Boolean).join('; ')
        : '';
      summary[type] = 'Ada' + (what ? ' (' + what + ')' : '') + ', ' + parts.join('; ');
    });
    return summary;
  }

  function renderShiftFields() {
    var draft = state.draft;
    var now = new Date();
    renderShiftSummary(now);
    $('r-handover').value = draft.handover;
    $('r-next-bko').value = '';
    $('r-final').value = draft.finalSituation;
    renderNextPicker();
  }

  /**
   * Sections A and B as they will be sent. With a partner on the shift, an
   * hour this phone did not send, and an incident type, can be tapped to mark
   * it as the partner's (tap again for the next partner, then none).
   */
  function renderShiftSummary(now) {
    var draft = state.draft;
    var canMark = partnersOf(state.session).length > 0;
    draft.checkLines = checkLines(draft, now || new Date());
    draft.incidentSummary = incidentSummary();
    $('r-partner-hint').classList.toggle('hidden', !canMark);

    function row(box, text, className, onTap, action) {
      var el = document.createElement(onTap ? 'button' : 'div');
      el.className = className + (onTap ? ' tap' : '');
      el.textContent = text;
      if (onTap) {
        el.type = 'button';
        var tag = document.createElement('small');
        tag.textContent = action;
        el.appendChild(tag);
        el.addEventListener('click', function () {
          onTap();
          renderShiftSummary();
          updateReport();
        });
      }
      box.appendChild(el);
    }

    var checks = $('r-checks');
    checks.innerHTML = '';
    if (!draft.checkLines.length) checks.textContent = 'Belum ada jam pengecekan.';
    draft.checkLines.forEach(function (c) {
      var text = 'Pukul ' + SA.hourText(c.hour) + ' WIB  ' +
        (c.done ? '✓' + (c.by ? ' ' + c.by : '') + (c.partner ? ' (rekan)' : '') : '— tidak ada laporan');
      var mine = c.done && !c.partner;
      row(checks, text, c.partner ? 'ok partner' : c.done ? 'ok' : 'missing',
        canMark && !mine ? function () { setPartnerMark('hours', c.hour, nextPartner(c.by || null)); } : null,
        c.partner ? 'ubah' : 'dikirim rekan?');
    });

    var marks = partnerMarks().incidents;
    var incidents = $('r-incidents');
    incidents.innerHTML = '';
    S.incidentTypes.forEach(function (type) {
      var text = type + ': ' + draft.incidentSummary[type];
      row(incidents, text, draft.incidentSummary[type] !== 'None' ? 'missing' : '',
        canMark ? function () { setPartnerMark('incidents', type, nextPartner(marks[type] || null)); } : null,
        marks[type] ? 'ubah' : 'dilaporkan rekan?');
    });
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

  /* Access control */

  function renderAccessFields() {
    var draft = state.draft;
    renderChoice($('r-direction'), S.accessDirections.map(function (d) { return { value: d, text: d }; }),
      draft.direction, function (direction) {
        state.draft.direction = direction;
        updateReport();
      });
    $('r-time').value = draft.accessTime;
    $('r-from').value = draft.from;
    $('r-to').value = '';
    $('r-acc').value = '';
  }

  [['r-time', 'accessTime'], ['r-from', 'from'], ['r-to', 'to'], ['r-acc', 'approvedBy']]
    .forEach(function (pair) {
      $(pair[0]).addEventListener('input', function () {
        if (!state.draft) return;
        state.draft[pair[1]] = this.value;
        if (pair[1] === 'accessTime') state.draft.date = typedTimeDate(this.value, new Date());
        updateReport();          // redraws the slots once, via renderStaleWarning
      });
    });

  /* Body check */

  function renderBodyFields() {
    var d = state.draft;
    d.date = typedTimeDate(d.bodyTime, new Date());
    $('r-body-time').value = d.bodyTime;
    $('r-body-finding').value = '';
    renderChoice($('r-body-result'), [
      { value: 'none', text: 'Nihil temuan' },
      { value: 'found', text: 'Ada temuan' }
    ], d.bodyResult, function (value) {
      state.draft.bodyResult = value;
      $('r-body-finding-field').classList.toggle('hidden', value !== 'found');
      updateReport();
    });
    $('r-body-finding-field').classList.add('hidden');
  }

  wireText('r-body-time', 'bodyTime', function (value) {
    state.draft.date = typedTimeDate(value, new Date());
  });
  wireText('r-body-finding', 'bodyFinding');

  /* Finding: Tindak lanjut and Status (findings.js). Shown only while the
     report has found something; an incident's Tindak lanjut is its Tindakan. */

  function renderFindingFields() {
    $('r-followup').value = '';
    renderChoice($('r-status'), [
      { value: 'Open', text: 'Open — belum selesai' },
      { value: 'Close', text: 'Close — sudah selesai' }
    ], state.draft.status, function (value) {
      state.draft.status = value;
      updateReport();
    });
  }

  function showFindingFields() {
    var draft = state.draft;
    var finding = SA.findings.is(draft);
    $('r-finding').classList.toggle('hidden', !finding);
    $('r-followup-field').classList.toggle('hidden', draft.kind === 'incident');
  }

  wireText('r-followup', 'followUp');

  /* Close: an UPDATE TEMUAN for an Open finding, opened from Riwayat. */

  function renderCloseFields() {
    var d = state.draft;
    var ref = d.ref || {};
    d.date = typedTimeDate(d.closeTime, new Date());
    $('r-close-ref').textContent = (ref.label || '') + ' — dilaporkan ' + (ref.date || '') +
      ' pukul ' + (ref.time || '') + (ref.text ? ': ' + ref.text : '');
    $('r-close-time').value = d.closeTime;
    $('r-close-followup').value = '';
  }

  wireText('r-close-time', 'closeTime', function (value) {
    state.draft.date = typedTimeDate(value, new Date());
  });
  wireText('r-close-followup', 'followUp');

  /* WT: what the line checker found at this KP, for Pertagas's B.II counts.
     Tapping the chosen state again clears it -- every tag is optional. */

  function renderWtAssets() {
    var d = state.draft;
    var box = $('r-wt-assets');
    box.innerHTML = '';
    W.assets.forEach(function (asset) {
      var row = document.createElement('div');
      row.className = 'asset-row';
      var name = document.createElement('span');
      name.textContent = asset.label;
      row.appendChild(name);
      var chips = document.createElement('div');
      chips.className = 'chips';
      W.ASSET_STATES.forEach(function (value) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.textContent = value;
        chip.setAttribute('aria-pressed', String(d.assets[asset.key] === value));
        chip.addEventListener('click', function () {
          if (state.draft.assets[asset.key] === value) delete state.draft.assets[asset.key];
          else state.draft.assets[asset.key] = value;
          renderWtAssets();
          updateReport();
        });
        chips.appendChild(chip);
      });
      row.appendChild(chips);
      box.appendChild(row);
    });

    var counts = $('r-wt-buildings');
    counts.innerHTML = '';
    W.buildings.forEach(function (building) {
      var n = Number(d.buildings[building.key]) || 0;
      var row = document.createElement('div');
      row.className = 'asset-row';
      var name = document.createElement('span');
      name.textContent = building.label;
      row.appendChild(name);
      var stepper = document.createElement('div');
      stepper.className = 'stepper';
      [['−', -1], [String(n), 0], ['+', 1]].forEach(function (part) {
        var el = document.createElement(part[1] ? 'button' : 'b');
        el.textContent = part[0];
        if (part[1]) {
          el.type = 'button';
          el.className = 'step-btn';
          el.setAttribute('aria-label', (part[1] > 0 ? 'Tambah ' : 'Kurangi ') + building.label);
          el.disabled = part[1] < 0 && n === 0;
          el.addEventListener('click', function () {
            var next = Math.max(0, n + part[1]);
            if (next) state.draft.buildings[building.key] = next;
            else delete state.draft.buildings[building.key];
            renderWtAssets();
            updateReport();
          });
        }
        stepper.appendChild(el);
      });
      row.appendChild(stepper);
      counts.appendChild(row);
    });
  }

  /**
   * The day a typed time (Access Control's Pukul, Body Check's Pukul, LDS's
   * Jam) belongs to: the one that puts it between 20 hours before now and 4
   * hours after. One rule for all three:
   *   goods out 23:50, saved 00:10          -> yesterday (20 min ago)
   *   Body Check default 08:00, at 07:40    -> today (20 min ahead)
   *   Sore's Body Check 00:00, at 23:50     -> tomorrow (10 min ahead)
   *   goods out 08:30, written at 08:20     -> today
   * Anchored to now, not to the shift, so a shift nobody closed on the phone
   * cannot drag the date back. 4 hours ahead covers the furthest default (the
   * nearer shift change is never more than 4 hours away).
   */
  var AHEAD_MS = 4 * 60 * 60 * 1000;
  function typedTimeDate(hhmmText, now) {
    var parts = String(hhmmText || '').split(':');
    if (parts.length !== 2) return SA.dateOf(now);
    for (var offset = 1; offset >= -1; offset--) {
      var at = new Date(now.getTime());
      at.setDate(at.getDate() + offset);
      at.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
      var ahead = at.getTime() - now.getTime();
      if (ahead <= AHEAD_MS && ahead > AHEAD_MS - 24 * 60 * 60 * 1000) return SA.dateOf(at);
    }
    return SA.dateOf(now);
  }

  /** Which slot the next camera or gallery pick fills. */
  var pendingSlot = null;

  function photoInSlot(slot) {
    var found = null;
    state.photos.forEach(function (photo) { if (photo.slot === slot) found = photo; });
    return found;
  }

  /* A photo's thumbnail URL is made once and kept on the photo, so redrawing
     the slots on every keystroke does not re-create and re-decode them. */
  function thumbUrl(photo) {
    if (!photo.url) photo.url = URL.createObjectURL(photo.thumb);
    return photo.url;
  }
  function releasePhotoUrls(photos) {
    (photos || []).forEach(function (p) {
      if (p.url) { URL.revokeObjectURL(p.url); p.url = null; }
    });
  }

  function renderSlots() {
    var box = $('r-slots');
    box.innerHTML = '';
    var blocked = missingForPhoto().length > 0;
    var current = overlaySignature();

    S.accessPhotos.forEach(function (name, slot) {
      var photo = photoInSlot(slot);
      var row = document.createElement('div');
      row.className = 'slot' + (photo ? ' done' : '') +
        (photo && photo.signature !== current ? ' stale' : '');

      var thumb = document.createElement('span');
      thumb.className = 'thumb';
      if (photo) {
        var img = document.createElement('img');
        img.src = thumbUrl(photo);
        img.alt = 'Foto ' + name;
        thumb.appendChild(img);
      } else {
        thumb.innerHTML = '<svg width="22" height="22" aria-hidden="true"><use href="#i-camera"/></svg>';
      }
      row.appendChild(thumb);

      var text = document.createElement('span');
      text.className = 's-text';
      var b = document.createElement('b');
      b.textContent = (slot + 1) + '. ' + name;
      var small = document.createElement('small');
      small.textContent = photo ? '✓ ' + photo.takenAt.slice(11, 16) +
        (photo.source === 'gallery' ? ' · galeri' : '') : 'Belum ada foto';
      text.appendChild(b);
      text.appendChild(small);
      row.appendChild(text);

      var actions = document.createElement('span');
      actions.className = 's-actions';
      [['camera-input', 'i-camera', 'Ambil foto ' + name],
       ['gallery-input', 'i-image', 'Pilih ' + name + ' dari galeri']].forEach(function (a) {
        var button = document.createElement('button');
        button.type = 'button';
        button.disabled = blocked;
        button.setAttribute('aria-label', a[2]);
        button.innerHTML = '<svg width="20" height="20" aria-hidden="true"><use href="#' + a[1] + '"/></svg>';
        button.addEventListener('click', function () {
          pendingSlot = slot;
          $(a[0]).click();
        });
        actions.appendChild(button);
      });
      row.appendChild(actions);
      box.appendChild(row);
    });
  }

  /* Shared: readiness, preview, photos */

  /** What must be set before a photo, because it is burned into the stamp. */
  function missingForPhoto() {
    var draft = state.draft;
    var missing = [];
    if (draft.kind === 'incident') {
      if (!draft.incidentType) missing.push('jenis kejadian');
      else if (draft.incidentType === SA.otherTypeOf(draft.team) && !draft.otherText.trim()) {
        missing.push('penjelasan ' + SA.otherTypeOf(draft.team));
      }
    }
    // Walkthrough: the KP and the condition are burned into the photo.
    if (draft.kind === 'wtkp') {
      if (!SA.isKpComplete(draft.kp)) missing.push('KP');
      if (draft.condition === SA.WT.CONDITION_OTHER && !String(draft.other).trim()) missing.push('kondisi lain');
    }
    // LDS: the time, segment and KP of the detection point are on the photo.
    if (draft.kind === 'lds') {
      if (!draft.ldsTime) missing.push('Jam');
      if (!draft.ldsSegment) missing.push('Segment');
      if (!SA.isKpComplete(draft.ldsKp)) missing.push('KP');
    }
    // Pukul, Dari and Menuju are burned into the access control photos.
    if (draft.kind === 'access') {
      if (!draft.accessTime) missing.push('Pukul');
      if (!String(draft.from).trim()) missing.push('Dari');
      if (!String(draft.to).trim()) missing.push('Menuju');
    }
    // The body check's Pukul is on the photo.
    if (draft.kind === 'body' && !draft.bodyTime) missing.push('Pukul');
    if (draft.kind === 'close' && !draft.closeTime) missing.push('Pukul');
    // Patrol: the area and what was checked are on the photo.
    if (draft.kind === 'patrol') {
      if (!draft.point && !String(draft.area).trim()) missing.push('Titik');
      if (!String(draft.check).trim()) missing.push('yang dicek');
    }
    return missing;
  }

  /** What saving needs on top of that. Only access control requires photos. */
  function missingForSave() {
    var draft = state.draft;
    var missing = missingForPhoto();
    if (state.processing) missing.push('foto masih diproses');
    if (draft.kind === 'shift' && !draft.handover) missing.push('Jam serah terima');
    if (draft.kind === 'lds' && !/^\d+$/.test(String(draft.radius))) missing.push('radius penyisiran');
    if ((draft.kind === 'lds' && draft.result === 'found' && !String(draft.finding).trim()) ||
        (draft.kind === 'body' && draft.bodyResult === 'found' && !String(draft.bodyFinding).trim())) {
      missing.push('keterangan temuan');
    }
    // Every finding says what was done about it (Pertagas: "Wajib diisi").
    if (SA.findings.is(draft) && !SA.findings.followUp(draft)) {
      missing.push(draft.kind === 'incident' ? 'Tindakan' : 'tindak lanjut');
    }
    if (draft.kind === 'close' && !String(draft.followUp).trim()) missing.push('tindak lanjut');
    if (draft.kind === 'patrol' && draft.patrolResult === 'found' && !String(draft.patrolFinding).trim()) {
      missing.push('keterangan temuan');
    }
    if (draft.kind === 'patrol' && draft.point && !draft.facility) missing.push('kondisi fasilitas');
    if (draft.kind === 'office' && !/^\d+$/.test(String(draft.visitors))) missing.push('jumlah tamu');
    if (draft.kind === 'pend') {
      if (!draft.nextOfficers.length) missing.push('shift lanjut');
      if (!String(draft.kmEnd).trim()) missing.push('KM akhir');
      else if (String(draft.kmStart).trim() && SA.patrolRecords.distance(draft) === null) {
        missing.push('KM akhir lebih kecil dari KM awal');
      }
    }
    var rule = photoRule(draft.kind);
    if (draft.kind !== 'access' && rule.required && state.photos.length < rule.required) {
      missing.push('foto (' + (rule.required - state.photos.length) + ' lagi)');
    }
    if (draft.kind === 'access') {
      if (!String(draft.approvedBy).trim()) missing.push('ACC oleh');
      S.accessPhotos.forEach(function (name, slot) {
        if (!photoInSlot(slot)) missing.push('foto ' + name);
      });
    }
    return missing;
  }

  function captionOf(record) { return moduleOf(record.team).caption(record); }

  /**
   * How many photos each report takes.
   *   min-max   the suggestion shown on the form
   *   required  saving waits for at least this many (0 = never required)
   *   cap       the most the form accepts
   * Security's check, incident and shift are suggestions only; Access Control
   * (3 named slots), a WT KP (exactly 3) and LDS (at least 4) are required.
   */
  function photoRule(kind) {
    if (kind === 'access') return { min: 3, max: 3, required: 3, cap: 3 };
    if (kind === 'wtkp') return { min: 3, max: 3, required: 3, cap: 3 };
    if (kind === 'lds') return { min: 5, max: 6, required: 4, cap: S.MAX_PHOTOS };
    var hint = S.photoHint[kind];
    return { min: hint.min, max: hint.max, required: 0, cap: S.MAX_PHOTOS };
  }

  /* Per team: how a report is captioned, named, stamped, sealed and exported. */
  var MODULES = {
    security: {
      caption: function (r) {
        return r.kind === 'check' ? SA.secCaption.check(r)
          : r.kind === 'incident' ? SA.secCaption.incident(r)
          : r.kind === 'access' ? SA.secCaption.access(r)
          : r.kind === 'body' ? SA.secCaption.body(r)
          : r.kind === 'close' ? SA.secCaption.close(r)
          : SA.secCaption.shift(r);
      },
      label: function (r) { return SA.secRecords.label(r); },
      stamp: function (d) { return SA.secRecords.stampLines(d); },
      seal: function (d, t, f) { return SA.secRecords.sealFacts(d, t, f); },
      sealPrefix: 'SEC',
      badge: function (d) { return badgeOf(d.post); },
      fallback: function (d) { return 'SECURITY OFFICER\n' + d.post; },
      sheets: function (rs) { return SA.secRecords.sheets(rs); },
      fileLabel: function (r) { return 'SEC ' + r.post + ' ' + SA.secRecords.label(r); },
      exportName: function (rs) {
        return 'SECURITY_' + SA.fileSafe(state.session ? state.session.post : rs[0].post);
      },
      where: function (r) { return r.post; },
      prefKey: 'session',
      valid: function (s) { return !!(s && s.post); },
      sessionBadge: function (s) { return badgeOf(s.post); },
      // A shift past its end only warns (the handover may still be owed).
      fresh: function () { return true; },
      home: function () { renderMain(); show('main'); },
      setup: function () { openSetup(); },
      draft: secDraft,
      recordBase: function (draft, now, session) {
        return {
          team: 'security', kind: draft.kind, sessionId: session.id,
          date: draft.kind === 'access' ? typedTimeDate(draft.accessTime, now)
            : draft.kind === 'body' ? typedTimeDate(draft.bodyTime, now)
            : draft.kind === 'close' ? typedTimeDate(draft.closeTime, now)
            : SA.dateOf(now),
          time: SA.timeOf(now), timestamp: SA.timestampOf(now),
          post: draft.post, zone: (SA.postByName(draft.post) || {}).zone || '',
          shift: draft.shift, shiftDate: draft.shiftDate,
          officers: draft.officers.slice(), bko: (draft.bko || '').trim(), reporter: draft.reporter
        };
      },
      summary: function (c, n) {
        return n + ' laporan: ' + (c.check || 0) + ' pengecekan, ' + (c.incident || 0) + ' kejadian, ' +
          (c.access || 0) + ' access control, ' + (c.body || 0) + ' body check, ' +
          (c.shift || 0) + ' shift' + (c.close ? ', ' + c.close + ' update temuan' : '') + '.';
      }
    },
    office: {
      caption: function (r) { return SA.officeRecords.caption(r); },
      label: function (r) { return SA.officeRecords.label(r); },
      stamp: function (d) { return SA.officeRecords.stampLines(d); },
      seal: function (d, t, f) { return SA.officeRecords.sealFacts(d, t, f); },
      sealPrefix: 'OFF',
      badge: function (d) { return badgeOf(d.post); },
      fallback: function (d) { return 'SECURITY PERKANTORAN\n' + d.post; },
      sheets: function (rs) { return SA.officeRecords.sheets(rs); },
      fileLabel: function (r) { return 'SECWAN ' + r.post + ' ' + SA.officeRecords.label(r); },
      exportName: function (rs) {
        var s = state.sessions.office;
        return 'SECWAN_' + SA.fileSafe(s ? s.post : rs[0].post);
      },
      where: function (r) { return r.post; },
      prefKey: 'officeSession',
      // Written over the whole shift and sent at its end: kept until Simpan.
      keep: { office: ['situation', 'visitorsAdjust'] },
      valid: function (s) { return !!(s && s.post && s.officers && s.officers.length); },
      sessionBadge: function (s) { return badgeOf(s.post); },
      // One officer's day: another day means the start screen again.
      fresh: function (s) { return s.date === SA.dateOf(new Date()); },
      home: function () { renderOfficeMain(); show('o-main'); },
      setup: function () { openOfficeSetup(); },
      draft: function (kind, session, now, hour, ref) { return officeDraft(kind, session, now, ref); },
      recordBase: function (draft, now, session) {
        return {
          team: 'office', kind: draft.kind, sessionId: session.id,
          date: SA.dateOf(now), time: SA.timeOf(now), timestamp: SA.timestampOf(now),
          post: draft.post, zone: draft.zone, shift: draft.shift, shiftDate: draft.shiftDate,
          officers: draft.officers.slice(), reporter: draft.reporter
        };
      },
      summary: function (c, n) { return n + ' laporan harian.'; }
    },
    patrol: {
      caption: function (r) { return SA.patrolRecords.caption(r); },
      label: function (r) { return SA.patrolRecords.label(r); },
      stamp: function (d) { return SA.patrolRecords.stampLines(d); },
      seal: function (d, t, f) { return SA.patrolRecords.sealFacts(d, t, f); },
      sealPrefix: 'PAT',
      badge: function (d) { return SA.patrolBadge(d.patrolId); },
      fallback: function (d) { return 'SECURITY PATROL\n' + d.patrolId; },
      sheets: function (rs) { return SA.patrolRecords.sheets(rs); },
      fileLabel: function (r) { return r.patrolId + ' ' + SA.patrolRecords.label(r); },
      exportName: function (rs) {
        var s = state.sessions.patrol;
        return SA.fileSafe(s ? s.patrolId : rs[0].patrolId);
      },
      where: function (r) { return SA.patrolRecords.teamLabel(r); },
      prefKey: 'patrolSession',
      valid: function (s) { return !!(s && s.patrolId); },
      // A shift saved before a patrol's segments changed (v28: Patrol 6 and 8
      // had swapped zones) takes the patrol's current segments and area.
      refresh: function (s) {
        var u = SA.patrolUnit(s.patrolId);
        if (!u || (u.segments === s.segments && u.area === s.zone)) return false;
        s.segments = u.segments;
        s.zone = u.area;
        return true;
      },
      sessionBadge: function (s) { return SA.patrolBadge(s.patrolId); },
      // Like Security: a shift past its end only warns.
      fresh: function () { return true; },
      home: function () { renderPatrolMain(); show('p-main'); },
      setup: function () { openPatrolSetup(); },
      draft: function (kind, session, now, hour, ref) { return patrolDraft(kind, session, now, ref); },
      recordBase: function (draft, now, session) {
        return {
          team: 'patrol', kind: draft.kind, sessionId: session.id,
          date: draft.kind === 'lds' ? typedTimeDate(draft.ldsTime, now)
            : draft.kind === 'close' ? typedTimeDate(draft.closeTime, now)
            : SA.dateOf(now),
          time: SA.timeOf(now), timestamp: SA.timestampOf(now),
          patrolId: draft.patrolId, zone: draft.zone, segments: draft.segments,
          shift: draft.shift, shiftDate: draft.shiftDate,
          officers: draft.officers.slice(), tni: (draft.tni || '').trim(), vehicle: draft.vehicle,
          reporter: draft.reporter
        };
      },
      summary: function (c, n) {
        return n + ' laporan: ' + (c.patrol || 0) + ' guard tour, ' + (c.incident || 0) + ' kejadian, ' +
          (c.lds || 0) + ' LDS, ' + (c.pend || 0) + ' akhir shift' +
          (c.close ? ', ' + c.close + ' update temuan' : '') + '.';
      }
    },
    walkthrough: {
      caption: function (r) { return SA.wtRecords.caption(r); },
      label: function (r) { return SA.wtRecords.label(r); },
      stamp: function (d) { return SA.wtRecords.stampLines(d); },
      seal: function (d, t, f) { return SA.wtRecords.sealFacts(d, t, f); },
      sealPrefix: 'WT',
      badge: function (d) { return SA.wtBadge(d.teamNo); },
      fallback: function (d) { return 'TEAM WALKTHROUGH\nTIM ' + d.teamNo; },
      sheets: function (rs) { return SA.wtRecords.sheets(rs); },
      fileLabel: function (r) { return 'WT T' + r.teamNo + ' ' + SA.wtRecords.label(r); },
      exportName: function (rs) {
        return 'WT_TIM' + (state.wtSession ? state.wtSession.teamNo : rs[0].teamNo);
      },
      where: function (r) { return 'Tim WT ' + r.teamNo; },
      prefKey: 'wtSession',
      valid: function (s) { return !!(s && s.teamNo); },
      sessionBadge: function (s) { return SA.wtBadge(s.teamNo); },
      // A WT day is one calendar day: another day means a new start screen.
      fresh: function (s) { return s.date === SA.dateOf(new Date()); },
      home: function () { renderWtMain(); show('wt-main'); },
      setup: function () { openWtSetup(); },
      draft: function (kind, session, now, hour, ref) { return wtDraft(kind, session, now, ref); },
      recordBase: function (draft, now, session) {
        return {
          team: 'walkthrough', kind: draft.kind, sessionId: session.id,
          // An LDS is dated by its Jam, like Access Control by its Pukul.
          date: draft.kind === 'lds' ? typedTimeDate(draft.ldsTime, now)
            : draft.kind === 'close' ? typedTimeDate(draft.closeTime, now)
            : SA.dateOf(now),
          time: SA.timeOf(now), timestamp: SA.timestampOf(now),
          teamNo: draft.teamNo, zone: draft.zone, routeId: draft.routeId,
          officers: draft.officers.slice(), reporter: draft.reporter
        };
      },
      summary: function (c, n) {
        return n + ' laporan: ' + (c.wtkp || 0) + ' KP, ' + (c.lds || 0) + ' LDS' +
          (c.close ? ', ' + c.close + ' update temuan' : '') + '.';
      }
    }
  };

  function moduleOf(team) { return MODULES[team] || MODULES.security; }

  function updateReport() {
    var draft = state.draft;
    if (!draft) return;
    var rule = photoRule(draft.kind);
    var taken = state.photos.length;
    var full = taken >= rule.cap;
    var missing = missingForPhoto();

    $('photos-label').textContent = 'Foto · ' + taken;
    $('photos-hint').textContent = !rule.required ? 'disarankan ' + rule.min + '–' + rule.max
      : rule.required === rule.max ? 'wajib ' + rule.required
      : 'wajib min. ' + rule.required + ' · disarankan ' + rule.min + '–' + rule.max;
    $('take-photo').disabled = full || missing.length > 0;
    $('pick-gallery').disabled = full || missing.length > 0;
    $('photo-blocker').textContent = full
      ? 'Sudah ' + rule.cap + ' foto — batas maksimum.'
      : missing.length ? 'Isi dulu: ' + missing.join(', ') + '.' : '';

    /* The photo count is a suggestion, never a gate: a guard who has none, or
       wants more, still sends. Only what the report cannot be written without
       blocks saving -- and for access control that includes its three photos. */
    var saveMissing = missingForSave();
    $('r-save').disabled = saveMissing.length > 0;
    $('r-blocker').textContent = saveMissing.length ? 'Isi dulu: ' + saveMissing.join(', ') + '.'
      : !rule.required && !taken ? 'Belum ada foto — tetap bisa dikirim.'
      : !rule.required && taken < rule.min
        ? taken + ' foto, disarankan ' + rule.min + '–' + rule.max + ' — tetap bisa dikirim.'
      : '';

    showFindingFields();
    $('r-preview').textContent = captionOf(draft);
    saveKept();
    renderStaleWarning();
  }

  /* ── GPS ────────────────────────────────────────────────────────────── */

  function renderGps() {
    var gps = state.gps;
    // The same panel sits on both main screens: Security's and Walkthrough's.
    ['', 'wt-', 'p-', 'o-'].forEach(function (prefix) {
      $(prefix + 'gps').className = 'gps-pill ' +
        (gps.state === 'ok' ? 'ok' : gps.state === 'denied' ? 'denied' : 'waiting');
      if (gps.state === 'ok') {
        $(prefix + 'gps-status').textContent = 'GPS terkunci · ±' + Math.round(gps.accuracy) + ' m';
        $(prefix + 'gps-detail').textContent = gps.latitude.toFixed(6) + ', ' + gps.longitude.toFixed(6);
      } else {
        $(prefix + 'gps-status').textContent = gps.state === 'denied' ? 'Akses lokasi ditolak'
          : gps.state === 'unsupported' ? 'Perangkat ini tidak punya GPS'
          : 'Menunggu sinyal GPS…';
        $(prefix + 'gps-detail').textContent = gps.state === 'denied'
          ? 'Aktifkan lewat Pengaturan. Foto tetap bisa diambil, tanpa koordinat.'
          : 'Foto tetap bisa diambil.';
      }
    });
  }

  /* ── Photographs ────────────────────────────────────────────────────── */

  function overlaySignature() {
    return moduleOf(state.draft.team).stamp(state.draft).join('|');
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
    // A picker that returns after its report was saved or left: nothing to add to.
    if (!state.draft) return;
    if (state.draft.kind === 'access') {
      if (pendingSlot == null) return;
      var slot = pendingSlot;
      pendingSlot = null;
      toast('Memproses foto…');
      addOnePhoto(files[0], source, slot).then(function () {
        renderPhotoStrip();
        updateReport();
      }).catch(function (error) {
        renderPhotoStrip();
        updateReport();
        toast(error.message || 'Foto gagal diproses.');
      });
      return;
    }
    var room = photoRule(state.draft.kind).cap - state.photos.length;
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

  function addOnePhoto(file, source, slot) {
    var draft = state.draft;
    var signature = overlaySignature();
    var fromGallery = source === 'gallery';
    state.processing += 1;
    function finished() { state.processing = Math.max(0, state.processing - 1); }
    updateReport();              // Save greys out while the photo is stamped

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
        var module = moduleOf(draft.team);
        var facts = module.seal(draft, timestamp, fix);
        // Which of the three access-control photos this is: stamped and sealed.
        var subject = slot != null ? S.accessPhotos[slot] : '';
        if (subject) facts.push(subject);

        return SA.seal.compute(file, facts).then(function (seal) {
          var lines = module.stamp(draft).concat([
            subject ? 'Foto: ' + subject : '',
            timestamp,
            fix ? 'Lat: ' + fix.latitude.toFixed(6) + ', Long: ' + fix.longitude.toFixed(6) : '',
            SA.geo.addressText(address)
          ]);
          return SA.photo.process(file, {
            lines: lines,
            timestamp: timestamp,
            seal: seal,
            sealPrefix: module.sealPrefix,
            badge: module.badge(draft),
            fallback: module.fallback(draft)
          }).then(function (processed) {
            /* The guard may have left this report while the photo was being
               stamped. Its stamp and seal belong to that report, so it must not
               land in whichever one is on screen now. */
            if (state.draft !== draft) return;
            if (slot != null) {
              // A new picture for a slot replaces the old one.
              releasePhotoUrls(state.photos.filter(function (p) { return p.slot === slot; }));
              state.photos = state.photos.filter(function (p) { return p.slot !== slot; });
              processed.slot = slot;
            } else if (state.photos.length >= photoRule(draft.kind).cap) {
              return;
            }
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
    }).then(function () { finished(); }, function (error) { finished(); throw error; });
  }

  var stripUrls = [];
  function renderPhotoStrip() {
    if (state.draft && state.draft.kind === 'access') { renderSlots(); return; }
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
    // Access control marks a stale photo on its own slot row.
    if (state.draft.kind === 'access') { renderSlots(); return; }
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
    if (this.disabled || missingForSave().length) { updateReport(); return; }
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

      var record = moduleOf(draft.team).recordBase(draft, now, draft.session || state.sessions[draft.team]);
      // Access control photos are filed in slot order: manifest, plate, goods.
      record.photos = state.photos.slice().sort(function (a, b) {
          return (a.slot == null ? 0 : a.slot) - (b.slot == null ? 0 : b.slot);
        }).map(function (p) {
          return {
            blob: p.blob, thumb: p.thumb, width: p.width, height: p.height,
            latitude: p.latitude, longitude: p.longitude, source: p.source,
            takenAt: p.takenAt, sealCode: p.sealCode, sealDigest: p.sealDigest, sealAlgo: p.sealAlgo,
            slot: p.slot == null ? null : p.slot
          };
        });

      if (draft.kind === 'wtkp') {
        record.segment = draft.segment;
        record.kp = draft.kp;
        record.condition = draft.condition;
        record.other = draft.condition === SA.WT.CONDITION_OTHER ? String(draft.other).trim() : '';
      } else if (draft.kind === 'lds') {
        record.ldsTime = draft.ldsTime;
        record.ldsSegment = draft.ldsSegment;
        record.ldsKp = draft.ldsKp;
        record.landmark = String(draft.landmark).trim();
        record.radius = String(draft.radius).trim();
        record.result = draft.result;
        record.finding = draft.result === 'found' ? String(draft.finding).trim() : '';
      } else if (draft.kind === 'access') {
        record.direction = draft.direction;
        record.accessTime = draft.accessTime;
        record.from = String(draft.from).trim();
        record.to = String(draft.to).trim();
        record.approvedBy = String(draft.approvedBy).trim();
      } else if (draft.kind === 'body') {
        record.bodyTime = draft.bodyTime;
        record.bodyResult = draft.bodyResult;
        record.bodyFinding = draft.bodyResult === 'found' ? String(draft.bodyFinding).trim() : '';
      } else if (draft.kind === 'check') {
        record.hour = draft.hour;
      } else if (draft.kind === 'patrol') {
        record.point = draft.point;
        record.area = draft.point || String(draft.area).trim();
        record.facility = draft.point ? draft.facility : '';
        // Frozen, so a later change to the list never rewrites a sent report.
        record.rawan = SA.patrolRecords.rawanOf(record);
        record.check = String(draft.check).trim();
        record.weather = draft.weather;
        record.road = draft.road;
        record.traffic = String(draft.traffic).trim() || P.NIHIL;
        record.crash = String(draft.crash).trim() || P.NIHIL;
        record.gangguanSummary = gangguanSummary();
        record.patrolResult = draft.patrolResult;
        record.patrolFinding = draft.patrolResult === 'found' ? String(draft.patrolFinding).trim() : '';
        record.fieldInterview = String(draft.fieldInterview).trim();
        rememberPatrol(record);
      } else if (draft.kind === 'pend') {
        patrolShiftSummary(draft);
        record.kmStart = String(draft.kmStart).trim();
        record.kmEnd = String(draft.kmEnd).trim();
        record.points = draft.points;
        record.tours = draft.tours;
        record.findingList = draft.findingList;
        record.nextOfficers = draft.nextOfficers.slice();
        record.nextTni = String(draft.nextTni || '').trim();
      } else if (draft.kind === 'office') {
        record.visitors = Number(draft.visitors) || 0;
        record.visitTimes = draft.visitTimes.slice();
        record.situation = String(draft.situation).trim() || O.SITUATION;
      } else if (draft.kind === 'close') {
        record.closeTime = draft.closeTime;
        record.followUp = String(draft.followUp).trim();
        record.ref = draft.ref;
      } else if (draft.kind === 'incident') {
        record.incidentType = draft.incidentType;
        record.otherText = draft.incidentType === SA.otherTypeOf(draft.team) ? draft.otherText.trim() : '';
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

      if (draft.kind === 'wtkp') {
        record.assets = Object.assign({}, draft.assets);
        record.buildings = Object.assign({}, draft.buildings);
      }
      // A finding keeps what was done and whether it is finished.
      if (SA.findings.is(record)) {
        record.status = draft.status === 'Close' ? 'Close' : 'Open';
        if (record.kind !== 'incident') record.followUp = String(draft.followUp).trim();
      }

      return SA.db.add(record).then(function (saved) {
        // Closing a finding marks the original, so Riwayat shows it closed.
        if (saved.kind !== 'close' || !saved.ref || saved.ref.id == null) return saved;
        return SA.db.markClosed(saved.ref.id, saved.timestamp).then(function () { return saved; });
      });
    }).then(function (saved) {
      if (keptFields(draft)) clearKept(draft.team, draft.kind);   // sent: nothing left to keep
      button.disabled = false;
      button.innerHTML = label;
      releasePhotoUrls(state.photos);
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
    var base = SA.fileSafe(moduleOf(record.team).fileLabel(record));
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

    $('send-new-shift').classList.toggle('hidden', sending.record.kind !== 'shift' && sending.record.kind !== 'pend');
    $('send-next').classList.toggle('hidden', sending.record.kind !== 'wtkp');
    /* LDS names people with @-tags. Tags only notify when picked from
       WhatsApp's own list, so the guard adds them there before sending. */
    $('send-tags').classList.toggle('hidden', sending.record.kind !== 'lds');
    $('send-status').textContent = '';
    $('send-env').classList.add('hidden');
  }

  $('send-back').addEventListener('click', function () { goMain(); });
  $('send-next').addEventListener('click', function () { openReport('wtkp'); });

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
    if (record.team === 'patrol') {
      // Same patrol and vehicle, the crew that was handed over, km carried over.
      openPatrolSetup({
        patrolId: record.patrolId, officers: (record.nextOfficers || []).slice(), tni: record.nextTni || '',
        vehicle: record.vehicle,
        ownVehicle: P.vehicles.indexOf(record.vehicle) === -1, km: record.kmEnd || '',
        shift: next, date: SA.dateOf(date), others: false
      });
      return;
    }
    openSetup({
      post: SA.canonicalPost(record.post),
      officers: (record.nextOfficers || []).slice(),
      bko: record.nextBko || '',
      shift: next,
      date: SA.dateOf(date),
      others: false
    });
  });

  /* ── List ───────────────────────────────────────────────────────────── */

  $('view-list').addEventListener('click', function () { renderList(); show('list'); });
  $('wt-view-list').addEventListener('click', function () { renderList(); show('list'); });
  $('p-view-list').addEventListener('click', function () { renderList(); show('list'); });
  $('list-back').addEventListener('click', function () { goMain(); });

  var listUrls = [];
  function renderList() {
    listUrls.forEach(URL.revokeObjectURL);
    listUrls = [];
    SA.db.all().then(function (all) {
      var team = currentTeam();
      var records = all.filter(function (r) { return (r.team || 'security') === team; });
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
        title.textContent = moduleOf(record.team).label(record);
        info.appendChild(title);
        var meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = moduleOf(record.team).where(record) + ' · ' + record.date + ' ' +
          (record.time || '').slice(0, 5) +
          ' · ' + (record.photos || []).length + ' foto';
        info.appendChild(meta);
        var badges = document.createElement('div');
        badges.className = 'badges';
        if (record.sentAt) badges.appendChild(badge('terkirim', 'ok'));
        if (record.exportedAt) badges.appendChild(badge('diexport', 'flat'));
        var status = SA.findings.status(record);
        if (status) badges.appendChild(badge('temuan ' + status, status === 'Open' ? 'warn' : 'flat'));
        info.appendChild(badges);
        card.appendChild(info);

        var actions = document.createElement('div');
        actions.className = 'card-actions';
        var send = document.createElement('button');
        send.className = 'link';
        send.textContent = 'Kirim';
        send.addEventListener('click', function () { openSend(record); });
        actions.appendChild(send);
        if (status === 'Open') {
          var close = document.createElement('button');
          close.className = 'link';
          close.textContent = 'Tutup temuan';
          close.addEventListener('click', function () {
            var module = moduleOf(record.team);
            openReport('close', null, SA.findings.refOf(record, module.label(record), module.where(record)));
          });
          actions.appendChild(close);
        }
        var remove = document.createElement('button');
        remove.className = 'danger-link';
        remove.textContent = 'Hapus';
        remove.addEventListener('click', function () {
          if (!confirm('Hapus ' + moduleOf(record.team).label(record) + '?')) return;
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

  $('go-export').addEventListener('click', openExport);
  $('wt-go-export').addEventListener('click', openExport);
  $('p-go-export').addEventListener('click', openExport);

  function openExport() {
    state.built = null;
    state.includeExported = false;
    $('export-ready').classList.add('hidden');
    $('export-build').classList.remove('hidden');
    $('export-status').textContent = '';
    $('export-env').classList.add('hidden');
    show('export');
    renderExport();
  }
  $('export-back').addEventListener('click', function () { goMain(); });

  function renderExport() {
    return SA.db.all().then(function (all) {
      var team = currentTeam();
      var mine = all.filter(function (r) { return (r.team || 'security') === team; });
      var fresh = mine.filter(function (r) { return !r.exportedAt; });
      var doneCount = mine.length - fresh.length;
      var chosen = state.includeExported ? mine : fresh;
      state.chosen = chosen;

      var counts = {};
      chosen.forEach(function (r) { counts[r.kind] = (counts[r.kind] || 0) + 1; });
      $('export-summary').textContent = chosen.length === 0
        ? (doneCount ? 'Semua laporan sudah diexport.' : 'Belum ada laporan untuk diexport.')
        : moduleOf(team).summary(counts, chosen.length);

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

  /* The Prabhu logo for the top of every sheet, read once from the app's own
     cache. A logo that will not load costs the file its header picture only. */
  var logoPromise = null;
  function loadLogo() {
    if (logoPromise) return logoPromise;
    logoPromise = fetch(SA.EXCEL_LOGO).then(function (response) {
      if (!response.ok) throw new Error('logo ' + response.status);
      return response.blob();
    }).then(function (blob) {
      return new Promise(function (resolve) {
        var url = URL.createObjectURL(blob);
        var img = new Image();
        img.onload = function () {
          URL.revokeObjectURL(url);
          resolve({ blob: blob, width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
      });
    }).catch(function () { logoPromise = null; return null; });
    return logoPromise;
  }

  $('export-build').addEventListener('click', function () {
    var button = this;
    var records = state.chosen.slice();
    if (!records.length) return;
    button.disabled = true;
    var status = $('export-status');
    status.textContent = 'Menyusun file…';

    loadLogo().then(function (logo) {
      var team = currentTeam();
      return SA.xlsx.build(moduleOf(team).sheets(records), function (done, total) {
        status.textContent = 'Menulis foto ' + done + ' dari ' + total + '…';
      }, { primary: SA.EXCEL_THEMES[team].primary, logo: logo });
    }).then(function (blob) {
      var filename = moduleOf(currentTeam()).exportName(records) + '_' +
        SA.stampOf(new Date()) + '.xlsx';
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

  /* Removes only reports that are safe to lose from the phone: already in a
     spreadsheet AND already sent to WhatsApp, and never the current shift's --
     the shift report's sections A and B and the timeline are built from those. */
  /* An Open finding stays on the phone so it can still be closed -- for 30
     days. After that it is cleared like the rest: by then it has usually been
     closed from the partner's phone, and the photos must not pile up. */
  var OPEN_KEEP_DAYS = 30;
  function keepOpen(record, now) {
    if (!SA.findings.isOpen(record)) return false;
    var age = now.getTime() - SA.parseDate(record.date).getTime();
    return age < OPEN_KEEP_DAYS * 24 * 60 * 60 * 1000;
  }

  $('export-clear').addEventListener('click', function () {
    SA.db.all().then(function (all) {
      var team = currentTeam();
      var session = currentSession();
      var current = session ? session.id : null;
      var exported = all.filter(function (r) { return (r.team || 'security') === team && r.exportedAt; });
      var done = exported.filter(function (r) {
        return r.sentAt && r.sessionId !== current && !keepOpen(r, new Date());
      });
      var kept = exported.length - done.length;
      if (!done.length) {
        toast(exported.length
          ? 'Laporan shift ini dan yang belum dikirim tetap disimpan.'
          : 'Belum ada laporan yang sudah diexport.');
        return;
      }
      if (!confirm('Hapus ' + done.length + ' laporan yang sudah diexport dan dikirim dari HP?' +
          (kept ? ' (' + kept + ' laporan shift ini / belum dikirim tetap disimpan.)' : ''))) return;
      return SA.db.removeMany(done.map(function (r) { return r.id; })).then(function () {
        state.built = null;
        toast(done.length + ' laporan dihapus.');
        goMain();
      });
    });
  });

  /* ── Diagnostics ────────────────────────────────────────────────────── */

  /* BUILD and CACHE_VERSION in sw.js are a PAIR -- bump both on every upload.
     The marker prints both; when they differ, the new version has downloaded
     but the app has not been restarted. */
  var BUILD = 'v29';
  var CACHE_PREFIX = 'superapp-laporan-';

  function showVersion() {
    var running = 'kode ' + BUILD;
    function put(text) {
      $('app-version').textContent = text;
      $('app-version-team').textContent = text;
      $('wt-version').textContent = text;
      $('p-version').textContent = text;
      $('o-version').textContent = text;
    }
    if (!window.caches || !caches.keys) { put(running); return; }
    caches.keys().then(function (names) {
      /* By version NUMBER: as text, "v10" sorts before "v9", and the marker
         would name the old cache exactly while a new one is arriving. */
      var mine = names.filter(function (n) { return n.indexOf(CACHE_PREFIX) === 0; })
        .sort(function (a, b) {
          return (parseInt(a.slice(CACHE_PREFIX.length + 1), 10) || 0) -
                 (parseInt(b.slice(CACHE_PREFIX.length + 1), 10) || 0);
        });
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
      return Promise.all(Object.keys(MODULES).map(function (team) {
        var module = MODULES[team];
        return SA.db.getPref(module.prefKey, null).then(function (session) {
          if (!module.valid(session)) return;
          // A shift saved under a post's old name carries on under the new one.
          if (session.post && SA.canonicalPost(session.post) !== session.post) {
            session.post = SA.canonicalPost(session.post);
            SA.db.setPref(module.prefKey, session);
          }
          if (module.refresh && module.refresh(session)) SA.db.setPref(module.prefKey, session);
          state.sessions[team] = session;
          SA.photo.preload(module.sessionBadge(session));
        });
      }));
    }).then(function () {
      buildTeamChips();
      buildWtTeamChips();
      buildPatrolChips();
      return SA.db.getPref('patrolAreas', []).then(function (areas) { patrolAreas = areas || []; });
    }).then(function () {
      if (MODULES[state.team]) goMain();
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
      if (state.session && $('screen-main').classList.contains('active')) renderMain(true);
      if (state.sessions.patrol && $('screen-p-main').classList.contains('active')) renderPatrolMain(true);
    }, 60000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      if (state.session && $('screen-main').classList.contains('active')) renderMain();
      if (state.sessions.patrol && $('screen-p-main').classList.contains('active')) renderPatrolMain();
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
