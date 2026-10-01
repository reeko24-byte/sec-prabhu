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
  var SCREENS = ['team', 'setup', 'main', 'wt-setup', 'wt-main', 'report', 'send', 'list', 'export'];

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

  function hoursDone() {
    var done = {};
    state.sessionRecords.forEach(function (r) {
      if (r.kind === 'check') done[r.hour] = true;
    });
    return done;
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
    var done = hoursDone();
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
      var status = sent ? 'done' : past && !inHour ? 'missed' : inHour ? 'now' : 'future';
      if (status === 'missed') missing.push(isHandover ? 'serah terima ' + SA.hourText(h) : SA.hourText(h));

      var item = document.createElement('li');
      if (isHandover) item.className = 'handover';
      var button = document.createElement('button');
      button.type = 'button';
      button.className = status + (inHour && sent ? ' now' : '');
      var icon = status === 'done' ? 'i-check' : status === 'missed' ? 'i-bang'
        : isHandover ? 'i-clipboard' : 'i-dot';
      button.innerHTML = '<span>' + SA.pad2(h % 24) + '</span>' +
        '<svg class="mark" aria-hidden="true"><use href="#' + icon + '"/></svg>';
      button.setAttribute('aria-label', (isHandover ? 'Serah terima ' : 'Pukul ') + SA.hourText(h) + ': ' +
        (status === 'done' ? 'sudah dikirim' : status === 'missed' ? 'belum dikirim'
          : status === 'now' ? 'jam sekarang' : 'belum waktunya'));
      button.addEventListener('click', function () {
        // A sent cell opens the report that was sent (to read or re-send it);
        // making a second one would send a duplicate to the group.
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
      (done[current] ? ' · sudah dikirim' : '');

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

  /* ── 4. One report ──────────────────────────────────────────────────── */

  var TITLES = { check: 'Pengecekan', incident: 'Laporan Kejadian', shift: 'Laporan Shift',
    access: 'Access Control', wtkp: 'Laporan KP', lds: 'Laporan LDS' };

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

  /* ── Walkthrough: the two forms ─────────────────────────────────────── */

  function wtDraft(kind, s, now) {
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
      finding: ''
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
    state.draft.date = accessDate(value, new Date());
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
    var done = hoursDone();
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
  function secDraft(kind, session, now, hour) {
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
      approvedBy: ''
    };
  }

  function openReport(kind, hour) {
    var session = currentSession();
    var module = moduleOf(currentTeam());
    /* No session, or a Walkthrough day that is not today: back to the start
       screen, so today's reports are never filed under yesterday's crew. */
    if (!session || !module.fresh(session)) { goMain(); return; }
    var now = new Date();

    loadSessionRecords().then(function () {
      state.draft = module.draft(kind, session, now, hour);
      state.nextOthers = false;
      releasePhotoUrls(state.photos);
      state.photos = [];

      $('r-title').textContent = TITLES[kind];
      $('r-check').classList.toggle('hidden', kind !== 'check');
      $('r-incident').classList.toggle('hidden', kind !== 'incident');
      $('r-shift').classList.toggle('hidden', kind !== 'shift');
      $('r-access').classList.toggle('hidden', kind !== 'access');
      $('r-wtkp').classList.toggle('hidden', kind !== 'wtkp');
      $('r-lds').classList.toggle('hidden', kind !== 'lds');
      // Access control has its own three named photo slots.
      $('r-photos-generic').classList.toggle('hidden', kind === 'access');

      if (kind === 'check') renderHourSelect();
      if (kind === 'access') renderAccessFields();
      if (kind === 'incident') renderIncidentFields();
      if (kind === 'shift') renderShiftFields();
      if (kind === 'wtkp') renderWtKpFields();
      if (kind === 'lds') renderLdsFields();

      renderPhotoStrip();
      updateReport();
      show('report');
    });
  }

  $('r-back').addEventListener('click', function () {
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
    select.innerHTML = '';
    SA.checkHours(state.draft.shift).forEach(function (h) {
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
    renderChoice($('r-type'), S.incidentTypes.map(function (t) { return { value: t, text: t }; }),
      state.draft.incidentType, function (type) {
        state.draft.incidentType = type;
        $('r-other-field').classList.toggle('hidden', type !== S.OTHER);
        updateReport();
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

  /** Section A: every hour of the shift up to now, and whether it was sent. */
  function checkLines(draft, now) {
    var done = hoursDone();
    return SA.checkHours(draft.shift).filter(function (h) {
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
        if (pair[1] === 'accessTime') state.draft.date = accessDate(this.value, new Date());
        updateReport();          // redraws the slots once, via renderStaleWarning
      });
    });

  /**
   * The day an access control happened, from its Pukul. A time later than now
   * belongs to yesterday: goods out at 23:50, report saved at 00:10, is dated
   * the day the goods left -- not the day the guard finished the photos. Five
   * minutes of slack so a clock a little ahead of the phone's is still today.
   */
  function accessDate(hhmmText, now) {
    var parts = String(hhmmText || '').split(':');
    var day = new Date(now.getTime());
    if (parts.length === 2) {
      var at = new Date(now.getTime());
      at.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
      if (at.getTime() > now.getTime() + 5 * 60 * 1000) day.setDate(day.getDate() - 1);
    }
    return SA.dateOf(day);
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
      else if (draft.incidentType === S.OTHER && !draft.otherText.trim()) missing.push('penjelasan Other');
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
    return missing;
  }

  /** What saving needs on top of that. Only access control requires photos. */
  function missingForSave() {
    var draft = state.draft;
    var missing = missingForPhoto();
    if (state.processing) missing.push('foto masih diproses');
    if (draft.kind === 'shift' && !draft.handover) missing.push('Jam serah terima');
    if (draft.kind === 'lds' && !/^\d+$/.test(String(draft.radius))) missing.push('radius penyisiran');
    if (draft.kind === 'lds' && draft.result === 'found' && !String(draft.finding).trim()) {
      missing.push('keterangan temuan');
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
          date: draft.kind === 'access' ? accessDate(draft.accessTime, now) : SA.dateOf(now),
          time: SA.timeOf(now), timestamp: SA.timestampOf(now),
          post: draft.post, shift: draft.shift, shiftDate: draft.shiftDate,
          officers: draft.officers.slice(), bko: (draft.bko || '').trim(), reporter: draft.reporter
        };
      },
      summary: function (c, n) {
        return n + ' laporan: ' + (c.check || 0) + ' pengecekan, ' + (c.incident || 0) + ' kejadian, ' +
          (c.access || 0) + ' access control, ' + (c.shift || 0) + ' shift.';
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
      draft: function (kind, session, now) { return wtDraft(kind, session, now); },
      recordBase: function (draft, now, session) {
        return {
          team: 'walkthrough', kind: draft.kind, sessionId: session.id,
          // An LDS is dated by its Jam, like Access Control by its Pukul.
          date: draft.kind === 'lds' ? accessDate(draft.ldsTime, now) : SA.dateOf(now),
          time: SA.timeOf(now), timestamp: SA.timestampOf(now),
          teamNo: draft.teamNo, zone: draft.zone, routeId: draft.routeId,
          officers: draft.officers.slice(), reporter: draft.reporter
        };
      },
      summary: function (c, n) {
        return n + ' laporan: ' + (c.wtkp || 0) + ' KP, ' + (c.lds || 0) + ' LDS.';
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
      : !rule.required && taken < rule.min ? 'Belum ada foto — tetap bisa dikirim.'
      : '';

    $('r-preview').textContent = captionOf(draft);
    renderStaleWarning();
  }

  /* ── GPS ────────────────────────────────────────────────────────────── */

  function renderGps() {
    var gps = state.gps;
    // The same panel sits on both main screens: Security's and Walkthrough's.
    ['', 'wt-'].forEach(function (prefix) {
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

      var record = moduleOf(draft.team).recordBase(draft, now, state.sessions[draft.team]);
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
      } else if (draft.kind === 'check') {
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

    $('send-new-shift').classList.toggle('hidden', sending.record.kind !== 'shift');
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
  $('wt-view-list').addEventListener('click', function () { renderList(); show('list'); });
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
  $('export-clear').addEventListener('click', function () {
    SA.db.all().then(function (all) {
      var team = currentTeam();
      var session = currentSession();
      var current = session ? session.id : null;
      var exported = all.filter(function (r) { return (r.team || 'security') === team && r.exportedAt; });
      var done = exported.filter(function (r) { return r.sentAt && r.sessionId !== current; });
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
  var BUILD = 'v14';
  var CACHE_PREFIX = 'superapp-laporan-';

  function showVersion() {
    var running = 'kode ' + BUILD;
    function put(text) {
      $('app-version').textContent = text;
      $('app-version-team').textContent = text;
      $('wt-version').textContent = text;
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
          state.sessions[team] = session;
          SA.photo.preload(module.sessionBadge(session));
        });
      }));
    }).then(function () {
      buildTeamChips();
      buildWtTeamChips();
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
