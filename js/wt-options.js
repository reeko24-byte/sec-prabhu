/* Walkthrough -- teams, people, routes, segments, and the KP helpers.
 *
 * Source: `Database Personil.xlsx`, sheet WT (Billy, 2026-10-01). The left table
 * gives each person's GROUP ("TIM 2 & 3 & 4"); the right table gives each
 * group's zone and routes. Thirteen teams walk in eight groups; which team of a
 * group walks which route is decided DAILY, so the app offers the group's routes
 * and the crew picks one each morning.
 *
 * The segment table (name, pipe size, zone) is the WT app's, which took it from
 * ARROW's AssetOptions.kt. "10/12" is ONE segment carrying two pipes; "3A"/"3B"
 * are both parts of segment 3; "11B/6" is walked as one route over segments 11B
 * and 6. KP numbers for the part-segment routes (Booster KBJ, SBV1/2A/2B, Tie In
 * Benar) are not known yet -- the crew types every KP (Billy, 2026-10-01).
 */

var SA = window.SA || {};

SA.WT = {

  groups: [
    { id: 'G1',  label: 'TIM 1',         teams: [1],       zone: 'South Area',
      members: ['MUHAMMAD JEFRIAN', 'BUDI HERIYANTO', 'ANUGRAH PUTRA PERSADA'],
      routes: ['S1', 'S2', 'S3A'] },
    { id: 'G2',  label: 'TIM 2 & 3 & 4', teams: [2, 3, 4], zone: 'South Area',
      members: ['FAHMIZAN', 'EDI HARTONO', 'NURDIANTO', 'FIRMANSYAH', 'MUSLIM',
        'RICKI ARIANSYAH GINTING', 'HARYANTO HAMONGANAN'],
      routes: ['S4', 'S3B1'] },
    { id: 'G5',  label: 'TIM 5',         teams: [5],       zone: 'South Area',
      members: ['MUHAMMAD ARDIANSYAH', 'ISMED FAUZI', 'SANDY HADI'],
      routes: ['S5', 'S3B2'] },
    { id: 'G6',  label: 'TIM 6 & 7',     teams: [6, 7],    zone: 'South Area',
      members: ['RINALDO PANDIANGAN', 'ILHAM AKBAR HAWARI', 'IBNU AL MUJAHIDIN',
        'MHD FAUZI', 'ADE SAPUTRA'],
      routes: ['S3B3'] },
    { id: 'G8',  label: 'TIM 8',         teams: [8],       zone: 'North Area',
      members: ['RONI SUHENDRI', 'IRMAN SIMATUPANG', 'DEWANGGA SALSABILLA'],
      routes: ['S8', 'S9'] },
    { id: 'G9',  label: 'TIM 9 & 10',    teams: [9, 10],   zone: 'North Area',
      members: ['ARI KURNIAWAN', 'DENNY SUKARMONO', 'PANDAPOTAN H H', 'SUPRATNO',
        'JOJON HERDIKA'],
      routes: ['S7A', 'S7B'] },
    { id: 'G11', label: 'TIM 11 & 12',   teams: [11, 12],  zone: 'North Area',
      members: ['NURDIN SYAHPUTRA', 'MUHAMMAD RISKI', "AHMAD SAFI'I", 'NOVENDRA', 'M YUSUF'],
      routes: ['S1012'] },
    { id: 'G13', label: 'TIM 13',        teams: [13],      zone: 'North Area',
      members: ['HENDRA YANI', 'JUHAR', 'IRWAN'],
      routes: ['S11A', 'S11B6'] }
  ],

  /* label: as the WT sheet writes it. segments: which segment ids a KP on this
     route can belong to (the first is the default). */
  routes: {
    S1:    { label: 'Seg 1 · PL → PR',                segments: ['1'] },
    S2:    { label: 'Seg 2 · PL → PR',                segments: ['2'] },
    S3A:   { label: 'Seg 3A · PL → Booster KBJ',      segments: ['3'] },
    S4:    { label: 'Seg 4 · PL → PR',                segments: ['4'] },
    S3B1:  { label: 'Seg 3B · Booster KBJ → SBV1',    segments: ['3'] },
    S5:    { label: 'Seg 5 · PL → PR',                segments: ['5'] },
    S3B2:  { label: 'Seg 3B · SBV1 → SBV2A',          segments: ['3'] },
    S3B3:  { label: 'Seg 3B · SBV2B → PR',            segments: ['3'] },
    S8:    { label: 'Seg 8 · PL → PR',                segments: ['8'] },
    S9:    { label: 'Seg 9 · PL → PR',                segments: ['9'] },
    S7A:   { label: 'Seg 7 · PL → Tie In Benar',      segments: ['7'] },
    S7B:   { label: 'Seg 7 · Tie In Benar → PR',      segments: ['7'] },
    S1012: { label: 'Seg 10/12 · PL → PR',            segments: ['10/12'] },
    S11A:  { label: 'Seg 11A · PL → PR',              segments: ['11A'] },
    S11B6: { label: 'Seg 11B/6 · PL → PR',            segments: ['11B', '6'] }
  },
  routeOrder: ['S1', 'S2', 'S3A', 'S4', 'S3B1', 'S5', 'S3B2', 'S3B3',
    'S8', 'S9', 'S7A', 'S7B', 'S1012', 'S11A', 'S11B6'],

  segments: [
    { id: '1',     name: 'GS1-MTF',         size: [8],      zone: 'South Area' },
    { id: '2',     name: 'MTF-NBS',         size: [10],     zone: 'South Area' },
    { id: '3',     name: 'NBS-DURI',        size: [20],     zone: 'South Area' },
    { id: '4',     name: 'KOTA BATAK-KBJ',  size: [8],      zone: 'South Area' },
    { id: '5',     name: 'LIBO-MINDAL',     size: [4],      zone: 'South Area' },
    { id: '6',     name: 'DURI CPS-BATANG', size: [20],     zone: 'North Area' },
    { id: '7',     name: 'BANGKO-BATANG',   size: [16],     zone: 'North Area' },
    { id: '8',     name: 'BALAM-BANGKO',    size: [8],      zone: 'North Area' },
    { id: '9',     name: 'BENAR-BANGKO',    size: [4],      zone: 'North Area' },
    { id: '10/12', name: 'BATANG-DUMAI',    size: [24, 20], zone: 'North Area' },
    { id: '11A',   name: 'CGS1-CGS10',      size: [8],      zone: 'North Area' },
    { id: '11B',   name: 'CGS10-BATANG',    size: [20],     zone: 'North Area' }
  ],

  /* The Note line: the chip is short, the report gets the sentence. */
  conditions: [
    { label: 'Area ROW Terpantau Aman',
      note: 'Area ROW saat ini terpantau aman dan tidak ada indikasi yg mencurigakan.' },
    { label: 'Lainnya', note: '' }
  ],
  CONDITION_OTHER: 'Lainnya',

  /* LDS (leak detection) response -- shared with Patrol later. */
  LDS_RADIUS: '500',

  /* What a line checker counts on the ROW (Pertagas's daily report, part B.II;
     Billy 2026-10-01). Tagged on a KP report when the point has one; the
     office tool adds them up for the day. All optional. */
  assets: [
    { key: 'patok',      label: 'Patok ROW' },
    { key: 'warning',    label: 'Warning Sign' },
    { key: 'cathodic',   label: 'Cathodic' },
    { key: 'centerLine', label: 'Center Line' }
  ],
  ASSET_STATES: ['Baik', 'Rusak', 'Hilang'],
  buildings: [
    { key: 'rumah',   label: 'Rumah' },
    { key: 'sekolah', label: 'Sekolah' },
    { key: 'pabrik',  label: 'Pabrik' },
    { key: 'kebun',   label: 'Kebun' },
    { key: 'kantor',  label: 'Kantor Pemerintah' }
  ]
};

/* -- Lookups ----------------------------------------------------------- */

SA.wtGroupOfTeam = function (teamNo) {
  var found = null;
  SA.WT.groups.forEach(function (g) { if (g.teams.indexOf(teamNo) !== -1) found = g; });
  return found;
};

SA.wtSegment = function (id) {
  var found = null;
  SA.WT.segments.forEach(function (s) { if (s.id === id) found = s; });
  return found;
};

/** "4(KOTA BATAK-KBJ)" -- how the approved WT report names a segment. */
SA.wtSegmentText = function (id) {
  var seg = SA.wtSegment(id);
  return seg ? seg.id + '(' + seg.name + ')' : (id || '');
};

SA.wtBadge = function (teamNo) {
  return teamNo ? 'assets/badges/wt-' + teamNo + '.png' : SA.BADGES.walkthroughTeam;
};

/* -- KP ("25+666", printed "25 + 666") --------------------------------- */

/** Raw digits into XX+XXX as they are typed (the caller moves the caret). */
SA.formatKp = function (raw) {
  var digits = String(raw).replace(/\D/g, '').slice(0, 5);
  return digits.length > 2 ? digits.slice(0, 2) + '+' + digits.slice(2) : digits;
};

SA.isKpComplete = function (kp) { return /^\d{2}\+\d{3}$/.test(String(kp)); };

/** Stored tight, printed with a space either side of the plus. */
SA.kpPrint = function (kp) { return kp ? String(kp).replace('+', ' + ') : ''; };

/* -- Pipe size --------------------------------------------------------- */

/** [8] -> '8"', [24, 20] -> '24" & 20"' */
SA.sizeText = function (inches) {
  var list = Object.prototype.toString.call(inches) === '[object Array]' ? inches
    : inches == null || inches === '' ? [] : [inches];
  return list.length ? list.join('" & ') + '"' : '';
};

/** 1 -> "1️⃣" ... 10 -> "🔟": the numbered list of the LDS report. */
SA.keycap = function (n) {
  return n === 10 ? '🔟' : n >= 0 && n <= 9 ? String(n) + '️⃣' : String(n) + '.';
};

window.SA = SA;
