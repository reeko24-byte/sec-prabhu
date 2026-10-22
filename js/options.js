/* Super App Laporan -- the teams, the Security vocabulary, and the date/time
 * helpers every module shares.
 *
 * Everything in SA.TEAMS and SA.SECURITY is DATA. It is written into the
 * WhatsApp report and the spreadsheet exactly as spelled here, so a spelling
 * changed here silently splits one post, or one officer, into two the next time
 * somebody sorts the sheet.
 *
 * Source: `Database Personil.xlsx`, sheet SECURITY OFFICER, with Billy's
 * corrections of 2026-10-01 applied ON PURPOSE -- the Excel is wrong in these
 * places and must not be "fixed" back to it:
 *
 *   - KOTA BATAK KP 21 ... KP 28 are ONE post, KOTA BATAK KP 21.
 *   - MANGGALA BOOSTER, as in the Excel and the badge (Billy, 2026-10-01; it was
 *     spelled MENGGALA until v18 -- SA.postByName still knows the old name).
 *   - Yessicika Relaise Tamba and Mega Suryaningrumnugroho are left out for now.
 *   - Full names, no ID numbers.
 */

var SA = window.SA || {};

/* The three teams of the super app, all built (Patrol since v20). */
SA.TEAMS = [
  { id: 'security',    label: 'Security Officer', ready: true,
    icon: 'i-shield', note: 'Pos jaga dan fasilitas' },
  { id: 'patrol',      label: 'Patrol',           ready: true,
    icon: 'i-route',  note: 'Patroli kendaraan per zona' },
  { id: 'walkthrough', label: 'Walkthrough',      ready: true,
    icon: 'i-steps',  note: 'Jalan kaki sepanjang ROW' },
  { id: 'office',      label: 'Security Perkantoran', ready: true,
    icon: 'i-building', note: 'SECWAN · kantor SORA dan Area Melur' }
];

/* Excel colours, one per team (Billy, 2026-10-01), taken from Prabhu's own
   "Daily Report Dashboard Patroli" workbook so the exports match the reports the
   office already makes. The title band and column headers use the team colour;
   the subtitle band is Prabhu green for all three.
     patrol       #0090C8  exactly the dashboard's blue
     walkthrough  #548235  the dashboard's dark green
     security     #0A5C8C  Prabhu navy, from the post badges */
SA.EXCEL_THEMES = {
  security:    { primary: '0A5C8C', title: 'LAPORAN SECURITY OFFICER' },
  patrol:      { primary: '0090C8', title: 'LAPORAN MONITORING PATROLI SECURITY' },
  walkthrough: { primary: '548235', title: 'LAPORAN TEAM WALKTHROUGH' },
  // Slate: apart from the other three teams' navy, blue and green.
  office:      { primary: '4A5A6A', title: 'LAPORAN SECURITY PERKANTORAN' }
};
SA.EXCEL_LOGO = 'assets/brand/prabhu-logo.png';

/* Walkthrough badges: WT N = TIM N; `team` is the plain "TEAM Walkthrough"
   badge. Patrol's are assets/badges/patrol-N.png, one per Patrol number (see
   SA.patrolBadge in patrol-options.js). */
SA.BADGES = {
  walkthroughTeam: 'assets/badges/wt-team.png',
  walkthrough: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(function (n) {
    return 'assets/badges/wt-' + n + '.png';
  })
};

SA.SECURITY = {

  /* The report's header. Fixed -- the officer never types it. */
  TO: 'ARCO',
  CC: 'PM, Data Analyst',

  /* name   the Excel post name: what the caption and the spreadsheet print
     zone   North or South Area (Billy, 2026-10-01) -- the daily summary is per
            zone, each with its own two ARCO
     badge  the artwork burned into the photo's top right corner. Its label
            ("KB KP21", "Stasiun Batang") is shorter than the post name, and
            that is agreed: the badge is a design, the caption uses the name. */
  posts: [
    { name: 'SORA',                     zone: 'South Area', badge: 'assets/badges/sec-sora.png' },
    { name: 'SPO',                      zone: 'North Area', badge: 'assets/badges/sec-spo.png' },
    // Renamed (Billy, 2026-10-20); the badge still reads "Warehouse" until new artwork comes.
    { name: 'WAREHOUSE BUMBUNG',        zone: 'North Area', badge: 'assets/badges/sec-warehouse.png' },
    { name: 'AREA MELUR',               zone: 'South Area', badge: 'assets/badges/sec-area-melur.png' },
    { name: 'ST BATANG',                zone: 'North Area', badge: 'assets/badges/sec-st-batang.png' },
    { name: 'DURI SHIPPING PUMP (DSP)', zone: 'South Area', badge: 'assets/badges/sec-dsp.png' },
    { name: 'KOTA BATAK JUNCTION',      zone: 'South Area', badge: 'assets/badges/sec-kota-batak-junction.png' },
    { name: 'KOTA BATAK KP 21',         zone: 'South Area', badge: 'assets/badges/sec-kota-batak-kp21.png' },
    { name: 'MANGGALA BOOSTER',         zone: 'North Area', badge: 'assets/badges/sec-manggala-booster.png' },
    { name: 'DUMAI METERING',           zone: 'North Area', badge: 'assets/badges/sec-dumai-metering.png' }
  ],

  roster: {
    'SORA': ['DADANG SYARIFATULLOH', 'RAFLI', 'BONA INRA HALOHO', 'SATRIA BUDI',
      'RIDUWAN EFFENDI', 'PUTRA LIONO', 'FARDOL SUKRI', 'MUHAMMAD KHAIROL'],
    'SPO': ['RIO DENI DEMONDO', 'YOSAFAT', 'TAUFIK IRSYAD', 'ADIT SURYA',
      'REZA FARHAN ALHAFIZ', 'ADIT NUGRAHA', 'M IQBAL', 'SAWIRMAN'],
    'WAREHOUSE BUMBUNG': ['YOGI PRAYUDA', 'HASRUL HARITONGAN', 'FAUZAN', 'RENDI',
      'BAYU PRASMANA', 'IRAWAN', 'ROBY HIDAYAT', 'RIO PRASASDI'],
    'AREA MELUR': ['M. DZAKKY RIVANDI', 'GERI HIDAYAT', 'FADLY SURYA SAPUTRA',
      'MUHAMMAD RIKI', 'MAULANA WAHYUDI', 'YONDA RAFANA', 'RAFILINDO',
      'VARHAN AL HAKIM'],
    'ST BATANG': ['RISKI NANDA', 'JUNAIDI', 'IKHSAN', 'MAHDIR MUHAMMAD',
      'DESKI YUDHA', 'M DALWI', 'JULISRI', 'ZURIAN'],
    'DURI SHIPPING PUMP (DSP)': ['SYAWAL LUBIS', 'FAISAL AGUS SOFIAN',
      'RAHMAT ZARPANI', 'PUTRA SAWAL', 'JHON HENDRIK', 'M. DJATMIKO UTOMO',
      'M IWIL MULYADI', 'MARKO HERMANDA'],
    'KOTA BATAK JUNCTION': ['NOVAL ADITYA SYAHPUTRA', 'AULIA FADDILA',
      'TIKKOS SIHOMBING', 'M FAZAR IRGIANDA', 'RAMANDA BUTAR BUTAR',
      'ANDI SUSILO', 'DIMAS RAMADONI PRATAMA', 'RAMADHANI'],
    'KOTA BATAK KP 21': ['MISNA CANIAGO', 'WAHYU ANUGRAH PUTRA',
      'M RENDI SAPUTRA', 'IRFAN MAHENDRA', 'ARIFIN B', 'ALAM ILAHI',
      'ANTONI FAISAL', 'RAHMATAN PERDANA MUDASIR'],
    'MANGGALA BOOSTER': ['DODI ROBIANTO', 'M. RIDHO HAPISAN', 'TAUFIK HIDAYAT',
      'RAFIJAL', 'M DARVANI ARILMAN', 'ADRI', 'FEBRI', 'BAYU JULIANSYAH'],
    'DUMAI METERING': ['FIKRI', 'ROBY YARLI', 'M FARID', 'RAFAEL',
      'WISNU KHAIRI', 'FARHAN SAHURA', 'RAHMANSYAH', 'M FARIZ']
  },

  /* start/end are hours of the day; Sore ends at 24, which prints as 00:00 and
     belongs to the next calendar day. */
  shifts: [
    { id: 'PAGI',  start: 8,  end: 16 },
    { id: 'SORE',  start: 16, end: 24 },
    { id: 'MALAM', start: 0,  end: 8 }
  ],

  /* Section B of the shift report, in the order the template lists them. */
  incidentTypes: ['Theft', 'Vandalisme', 'Penyetopan', 'Demo', 'Other'],
  OTHER: 'Other',

  /* The incident report's questions, 5W1H (Billy, 2026-10-01; was the seven
   * of SIADIDEMENBABI until v12). Kapan keeps the key 'bilamana' so incidents
   * saved before v13 still show their time in the Excel. `long` = a text box. */
  questions: [
    { key: 'apa',       label: 'Apa',       hint: 'Apa yang terjadi' },
    { key: 'siapa',     label: 'Siapa',     hint: 'Pelaku, korban, saksi' },
    { key: 'bilamana',  label: 'Kapan',     hint: 'Pukul … WIB' },
    { key: 'dimana',    label: 'Dimana',    hint: 'Lokasi kejadian' },
    { key: 'mengapa',   label: 'Mengapa',   hint: 'Penyebab / motif' },
    { key: 'bagaimana', label: 'Bagaimana', hint: 'Kronologi kejadian', long: true }
  ],

  FINAL_SITUATION: 'Situasi akhir kondusif, aman terkendali.',

  /* Access Control (goods only, any post). The three photos are REQUIRED and
     each has a fixed subject, in this order (Billy, 2026-10-01). */
  accessDirections: ['Barang keluar', 'Barang masuk'],
  accessPhotos: ['Cargo Manifest', 'Plat Nomor Kendaraan', 'Barang'],
  accessPhotosShort: ['Manifest', 'Plat', 'Barang'],   // for the narrow Excel columns
  /* The closing line of Access Control and of Body Check. */
  CLEAR_SITUATION: 'Situasi aman, nihil temuan.',

  /* Body check with a metal detector, at shift change (Billy, 2026-10-01):
     every post; sent by whichever crew does it, filed under the shift open on
     the phone (accepted); Pukul is the actual time, typed like Access Control.
     A find replaces the CLEAR_SITUATION line. */

  /* Suggested photo counts. Shown as a hint and NEVER enforced -- a guard who
     wants more, or has none, still sends. */
  photoHint: {
    check:    { min: 1, max: 2 },
    incident: { min: 1, max: 4 },
    shift:    { min: 2, max: 4 },
    access:   { min: 3, max: 3 },
    body:     { min: 4, max: 6 },
    patrol:   { min: 1, max: 4 },
    pend:     { min: 2, max: 4 },
    office:   { min: 4, max: 6 },
    close:    { min: 1, max: 2 }
  },

  /* A hard ceiling only so the share and the phone's memory stay sane. */
  MAX_PHOTOS: 8
};

/* -- Lookups ----------------------------------------------------------- */

/** Typed text as one sentence: trimmed, exactly one full stop, '-' if empty. */
SA.sentence = function (text) {
  return (String(text || '').trim().replace(/[.\s]+$/, '') || '-') + '.';
};

/* Security Perkantoran (SECWAN), Billy 2026-10-02: office security at two of
   Security's posts, one officer each (the two left out of the Security
   roster). Always Pagi; one report per officer per day, at the shift's end,
   with the visitors counted through the day. Photos 4-6 suggested (guest book,
   the area, other). Badges: the posts' own. */
SA.OFFICE = {
  posts: [
    { name: 'SORA',       officers: ['YESSICIKA RELAISE TAMBA'] },
    { name: 'AREA MELUR', officers: ['MEGA SURYANINGRUMNUGROHO'] }
  ],
  SHIFT: 'PAGI',
  SITUATION: 'Laporan standby, situasi area sementara aman terkendali, temuan nihil.'
};

/* Patrol and Walkthrough -- both out on the pipeline -- share one list of
   incidents (Billy, 2026-10-20); Security Officer has its own. A record
   without a team is Security's, as everywhere else (saved before v11). */
function onPipeline(team) { return (team || 'security') !== 'security' && !!SA.PATROL; }
SA.incidentTypesOf = function (team) {
  return onPipeline(team) ? SA.PATROL.gangguan : SA.SECURITY.incidentTypes;
};
/** The incident type whose details are typed: Security's "Other", Patrol's "Dll". */
SA.otherTypeOf = function (team) {
  return onPipeline(team) ? SA.PATROL.OTHER : SA.SECURITY.OTHER;
};

/* Old post names still found on phones (a saved shift, older records). */
SA.POST_ALIASES = { 'MENGGALA BOOSTER': 'MANGGALA BOOSTER', 'WAREHOUSE': 'WAREHOUSE BUMBUNG' };

/** A post's current name: "MENGGALA BOOSTER" -> "MANGGALA BOOSTER". */
SA.canonicalPost = function (name) { return SA.POST_ALIASES[name] || name; };

/* The post in an export's FILE NAME only (Billy, 2026-10-21) -- the report
   and the Excel keep the full name. A post not here is written as one word. */
SA.FILE_POSTS = {
  'AREA MELUR': 'MELUR',
  'WAREHOUSE BUMBUNG': 'WHBUMBUNG',
  'ST BATANG': 'STBATANG',
  'DUMAI METERING': 'METERING',
  'MANGGALA BOOSTER': 'MANGGALABOOSTER',
  'DURI SHIPPING PUMP (DSP)': 'DSP',
  'KOTA BATAK KP 21': 'KBKP21',
  'KOTA BATAK JUNCTION': 'KBJ'
};

SA.postByName = function (name) {
  var current = SA.canonicalPost(name);
  var found = null;
  SA.SECURITY.posts.forEach(function (post) { if (post.name === current) found = post; });
  return found;
};

SA.shiftById = function (id) {
  var found = null;
  SA.SECURITY.shifts.forEach(function (shift) { if (shift.id === id) found = shift; });
  return found;
};

/* -- Time -------------------------------------------------------------- */

function pad2(n) { return n < 10 ? '0' + n : String(n); }

SA.pad2 = pad2;

/** "2026-10-01" -- how a day is grouped and stored. */
SA.dateOf = function (d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
};

/** "08:14:22" */
SA.timeOf = function (d) {
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
};

/** "2026-10-01 08:14:22" -- what is burned into the photograph. */
SA.timestampOf = function (d) { return SA.dateOf(d) + ' ' + SA.timeOf(d); };

/** "20261001_081422", for filenames. */
SA.stampOf = function (d) {
  return SA.dateOf(d).replace(/-/g, '') + '_' + SA.timeOf(d).replace(/:/g, '');
};

/** "2026-10-01" -> a Date at local midnight. */
SA.parseDate = function (text) {
  var parts = String(text).split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
};

var HARI = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
var BULAN = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI',
  'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];

/** "KAMIS, 1 OKTOBER 2026" -- the report's Hari/Tgl line. */
SA.longDate = function (d) {
  return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' +
    d.getFullYear();
};

/** 2 -> "02:00", 24 -> "00:00". */
SA.hourText = function (hour) { return pad2(hour % 24) + ':00'; };

/** "MALAM, 00:00 WIB s/d 08:00 WIB" */
SA.shiftText = function (shiftId) {
  var shift = SA.shiftById(shiftId);
  if (!shift) return '';
  return shift.id + ', ' + SA.hourText(shift.start) + ' WIB s/d ' +
    SA.hourText(shift.end) + ' WIB';
};

/**
 * Which shift a moment falls in, and the calendar date that shift started on.
 * 00:00-07:59 Malam, 08:00-15:59 Pagi, 16:00-23:59 Sore.
 */
SA.shiftFor = function (d) {
  var hour = d.getHours();
  var id = hour < 8 ? 'MALAM' : hour < 16 ? 'PAGI' : 'SORE';
  return { shift: id, date: SA.dateOf(d) };
};

/** The Date a given hour of a shift falls on. Sore's 24 is next day's 00:00. */
SA.shiftHourDate = function (shiftDate, hour) {
  var d = SA.parseDate(shiftDate);
  d.setHours(hour, 0, 0, 0);          // setHours(24) rolls to the next day
  return d;
};

/** Start and end of a shift as Dates. */
SA.shiftWindow = function (shiftDate, shiftId) {
  var shift = SA.shiftById(shiftId);
  if (!shift) return null;
  return {
    start: SA.shiftHourDate(shiftDate, shift.start),
    end: SA.shiftHourDate(shiftDate, shift.end)
  };
};

/**
 * The hourly checks of a shift: from one hour after it starts to one hour
 * before it ends -- Sore gives [17..23], seven checks.
 *
 * Agreed with Billy after the officers' review (2026-10-01): the OUTGOING crew
 * sends the shift report at the end of its shift, and that handover covers the
 * next shift's first hour. So a shift has 8 reports: 7 checks + its own
 * handover at the end hour. Nobody sends a check at the start hour.
 */
SA.checkHours = function (shiftId) {
  var shift = SA.shiftById(shiftId);
  var hours = [];
  if (!shift) return hours;
  for (var h = shift.start + 1; h < shift.end; h++) hours.push(h);
  return hours;
};

/** Numbers as words, for "TOTAL PERSONIL : 3 (TIGA)" and the like. */
SA.numberWord = function (n) {
  var words = ['NOL', 'SATU', 'DUA', 'TIGA', 'EMPAT', 'LIMA', 'ENAM', 'TUJUH',
    'DELAPAN', 'SEMBILAN', 'SEPULUH'];
  return words[n] || String(n);
};

/** Strips anything that would upset a filename or a WhatsApp attachment. */
SA.fileSafe = function (name) {
  return String(name).trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Laporan';
};

/* How wide WhatsApp draws each character (Roboto, its font on Android, at 100
   px; measured 2026-10-23): the letters are not equally wide, so padding a
   label to the same NUMBER of letters left every caption's colons uneven by up
   to seven spaces (Billy). Printable ASCII from the space on, then the letter
   pairs Roboto draws closer ("AT" in PATROL and TANGGAL). An iPhone's font is
   close, not the same: there the colons land within about a space. */
var CHAR_WIDTHS = [24.8, 25.8, 32, 61.6, 56.2, 73.2, 62.2, 17.5, 34.2, 34.8, 43.1, 56.7, 19.7, 27.6, 26.4, 41.3,
  56.2, 56.2, 56.2, 56.2, 56.2, 56.2, 56.2, 56.2, 56.2, 56.2, 24.2, 21.1, 50.8, 54.9, 52.3, 47.3, 89.8, 65.2,
  62.3, 65.1, 65.6, 56.8, 55.3, 68.1, 71.3, 27.2, 55.2, 62.7, 53.9, 87.3, 71.3, 68.8, 63.1, 68.8, 61.6, 59.4,
  59.7, 64.8, 63.7, 88.7, 62.7, 60.1, 59.9, 26.5, 41.1, 26.5, 41.8, 45.1, 30.9, 54.4, 56.2, 52.3, 56.4, 53,
  34.8, 56.2, 55.1, 24.3, 23.9, 50.7, 24.3, 87.7, 55.2, 57, 56.2, 56.8, 33.9, 51.6, 32.7, 55.1, 48.4, 75.1,
  49.6, 47.3, 49.6, 33.8, 24.4, 33.8, 68];
var PAIR_KERNING = {};
('AT-6 AV-4 AW-3 AY-5 Av-2 Aw-2 Ay-2 BY-3 DY-2 D.-5 FA-8 FJ-13 Fa-2 F.-11 KC-2 KG-2 KO-2 KQ-2 Kv-2 Kw-3 Ky-2 ' +
  'LC-3 LG-3 LO-3 LQ-3 LT-13 LU-3 LV-9 LW-7 LY-12 Lu-2 Lv-6 Lw-4 Ly-6 OY-2 O.-5 PA-7 PJ-10 PX-2 P.-16 QT-2 QY-2 ' +
  'RT-4 RY-2 TA-4 TJ-12 Ta-6 Tc-5 Td-5 Te-5 Tg-5 Tm-5 Tn-5 To-5 Tp-5 Tq-5 Tr-4 Ts-6 Tu-5 Tv-4 Tw-3 Tx-4 Ty-4 ' +
  'Tz-3 T.-11 VA-4 Va-2 Vc-2 Vd-2 Ve-2 Vg-2 Vo-2 Vq-2 V.-11 WA-2 Wa-2 Wc-2 Wd-2 We-2 Wg-2 Wo-2 Wq-2 W.-6 Xv-2 ' +
  'Xy-2 YA-5 YJ-5 YU-5 Ya-4 Yc-3 Yd-3 Ye-3 Yg-3 Ym-2 Yn-2 Yo-3 Yp-2 Yq-3 Yr-2 Ys-3 Yu-2 Y.-10 fi-4 fl-2 ra-2 ' +
  'rt2 r.-6 v.-5 w.-6 y.-5 //-11').split(' ').forEach(function (p) { PAIR_KERNING[p.slice(0, 2)] = Number(p.slice(2)); });

/** How wide `text` shows in WhatsApp, in Roboto units (100 px type). */
SA.textWidth = function (text) {
  var width = 0;
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    width += code >= 32 && code < 127 ? CHAR_WIDTHS[code - 32] : CHAR_WIDTHS[78];   // other: as wide as "n"
    if (i) width += PAIR_KERNING[text.slice(i - 1, i + 1)] || 0;
  }
  return width;
};

/**
 * Pads each label with spaces to the same WIDTH, so the colons line up in
 * WhatsApp ("Hari/Tgl  :" and "Shift      :"): the end is put where the spaces
 * leave the labels closest together, within half a space. `extra`: spaces
 * after the widest label (WT's KP report keeps a wide gap).
 */
SA.aligner = function (labels, extra) {
  var space = CHAR_WIDTHS[0];
  var widths = labels.map(SA.textWidth);
  var widest = Math.max.apply(null, widths) + (extra || 0) * space;
  var best = null;
  for (var step = 0; step < 8; step++) {          // try the end at eighths of a space
    var end = widest + step * space / 8;
    var spaces = widths.map(function (w) { return Math.round((end - w) / space); });
    var at = widths.map(function (w, i) { return w + spaces[i] * space; });
    var spread = Math.max.apply(null, at) - Math.min.apply(null, at);
    if (!best || spread < best.spread) best = { spread: spread, end: end };
  }
  function padded(label) {
    var n = Math.max(0, Math.round((best.end - SA.textWidth(label)) / space));
    return label + new Array(n + 1).join(' ');
  }
  var line = function (label, value) {
    return padded(label) + ' : ' + (value == null || value === '' ? '-' : value);
  };
  /* A label with nothing after its colon, for a line whose value is the list
     printed underneath it ("Shift lanjut     :"). */
  line.head = function (label) { return padded(label) + ' :'; };
  return line;
};

window.SA = SA;
