/* Patrol: who, where, and the fixed wording (Billy, 2026-10-01).
 *
 * Source: `Database Personil.xlsx`, sheet PATROL -- 8 zones, 8 people each,
 * full names as written there (trailing spaces trimmed).
 *
 * The crews are called PATROL 1-8, not by zone (Billy, 2026-10-01). South:
 * Patrol N is ZONA N. North is the other way round: Patrol 5 = ZONA 8,
 * 6 = ZONA 7, 7 = ZONA 6, 8 = ZONA 5. `sheetZone` keeps the sheet's number.
 * Patrol 1-4 are the South Area, 5-8 the North Area.
 *
 * Vehicles: one per patrol, from Billy's list (2026-10-02).
 *
 * Placeholders, until Billy sends the real lists:
 *   areas       empty -- the crew types the area ("ketik sendiri"); what they
 *               type is remembered on the phone and offered next time
 *   facilities  "Fasilitas 1..3", Aktif / Tidak Aktif (Pertagas's manifold list
 *               is not Rokan's; the real one comes later)
 * Held: each zone's wilayah kerja as a KP range.
 */

(function (SA) {

  function unit(n, sheetZone, area, segments, members) {
    return { id: 'PATROL ' + n, n: n, sheetZone: 'ZONA ' + sheetZone, area: area,
      segments: segments, members: members };
  }

  SA.PATROL = {
    units: [
      unit(1, 1, 'South Area', 'SEG 1, 2, 3', ['TEDY GUSRIZAL', 'RAHMATUL RAVIZ', 'PIKA ANDRIANTA',
        'RYANDA NUZUL', 'FAJAR BUANA', 'RIDWAN SALEH', 'ASRIL HALOMON S', 'HENDRA PRAYOGA']),
      unit(2, 2, 'South Area', 'SEG 3, 4', ['MUHAMMAD RUSLI', 'FAHRIAN ARYA PRAYODA', 'JEFRY KHAIRUNNAS',
        'RAHMAT PRASETYO', 'TSABIT KARIMI', 'ISHAK RIANTO', 'HENDRIYANSYAH', 'DANI SANDRIA']),
      unit(3, 3, 'South Area', 'SEG 5, 3', ['ANDI SAPUTRA', 'ARWAN SAPUTRA', 'ROMA DONI',
        'PERIS MARDIANTO', 'SYAWAL AFANDI', 'FERY ANDI HUTAGALUNG', 'ANDRIKO', 'RYDHO HIDAYAT']),
      unit(4, 4, 'South Area', 'SEG 3', ['RIZAL', 'HENDRI MUHARAM', 'MUHAMMAD ZULFA',
        'NOFRIADI', 'NAULIANTO', 'METRO MANALU', 'TRI ANGGI SITOMPUL', 'ERI SAPUTRA']),
      unit(5, 8, 'North Area', 'SEG 6, 11B, 11A', ['ABDUL GAFUR', "MUHAMAT SAFI'I", 'MAZLAN',
        'FADJRI NOOR ARILDI', 'ANDRE HERMAWAN', 'MAULANA YAHYA', 'SAHAT ANDRI PARDEDE',
        'RAHMAT TAUFIK HIDAYAT']),
      unit(6, 7, 'North Area', 'SEG 10/12', ['FENGKI HUTASOIT', 'ABD CHOIR MASYURI', 'ANDI ARDIANSYAH',
        'JUSRI', 'ARIEV TRI RAHMAT', 'JOVI HASRADI', 'M WELDI', 'AHMAD JEFRI']),
      unit(7, 6, 'North Area', 'SEG 7', ['RISKI PERMADI', 'MUHAMMAD KHOIRI', 'HASNUL FAHRINUR',
        'SYARIPUDIN', 'M RIZAL', 'SUKARDI', 'MH RUSTAM', 'REYHAN MUHAMMAD']),
      unit(8, 5, 'North Area', 'SEG 8, 9, 7', ['SIGIT SURYA', 'AMI SAPUTRA', 'FIKRI BUDIARDONO',
        'NANDA IRAWAN', 'KARSIN', 'ROBBY GUSBIANTO', 'RIFAL ANDRYO', 'RACHMADI'])
    ],

    /* Per patrol, once Billy sends them. Empty = typed. */
    areas: {},

    /* Each patrol's vehicle, in Patrol order (Billy, 2026-10-02). Picked by
       default for that patrol; another one, or a typed plate, when swapped. */
    vehicles: ['BM 8036 QI', 'BM 8034 QI', 'BM 8035 QI', 'BM 8033 QI',
      'BM 8031 QI', 'BM 8541 SJ', 'BM 8032 QI', 'BM 8248 QD'],

    /* PLACEHOLDER facilities, the same three for every patrol. */
    facilities: ['Fasilitas 1', 'Fasilitas 2', 'Fasilitas 3'],
    FACILITY_STATES: ['Aktif', 'Tidak Aktif'],

    weather: ['Cerah', 'Berawan', 'Hujan'],
    road: ['Bagus', 'Rusak', 'Licin', 'Banjir'],
    NIHIL: 'Nihil',

    /* E. Gangguan: each one that happens gets its own incident report (5W1H),
       sent at once; the guard tour report then points to it. */
    gangguan: ['Illegal Tapping', 'Pencurian', 'Penyetopan', 'Demo', 'Perkelahian', 'Dll'],
    OTHER: 'Dll',

    /* G. Field Interview: the same lines every time, editable (tidied from
       Billy's sample). What the crew last sent is offered next time. */
    FIELD_INTERVIEW: [
      'Pergantian driver dilakukan setiap 2 jam.',
      'Setiap kendaraan mundur selalu dipandu.',
      'Saat cuaca tidak kondusif, kecepatan disesuaikan.',
      'Selalu berhati-hati terhadap binatang berbisa saat foot patrol.'
    ].join('\n'),

    TITLE: 'LAPORAN MONITORING PATROLI SECURITY PT PRABHU',
    CLOSING: 'Demikian laporan Patroli Security PT Prabhu.'
  };

  SA.patrolUnit = function (id) {
    var found = null;
    SA.PATROL.units.forEach(function (u) { if (u.id === id) found = u; });
    return found;
  };

  /** The patrol's own vehicle: "PATROL 6" -> "BM 8541 SJ". */
  SA.patrolVehicle = function (id) {
    var u = SA.patrolUnit(id);
    return u ? SA.PATROL.vehicles[u.n - 1] || '' : '';
  };

  /** Billy's "TEAM Patrol N" badge, top right of every photo. */
  SA.patrolBadge = function (id) {
    var u = SA.patrolUnit(id);
    return u ? 'assets/badges/patrol-' + u.n + '.png' : null;
  };

  /** "SEG 3, 4" -> the first segment id the WT list knows ("3"), for LDS. */
  SA.patrolFirstSegment = function (unitId) {
    var z = SA.patrolUnit(unitId);
    var first = z ? z.segments.replace(/^SEG\s*/i, '').split(/[,\s]+/)[0] : '';
    return SA.wtSegment(first) ? first : '';
  };

  var NUMBERS = ['NOL', 'SATU', 'DUA', 'TIGA', 'EMPAT', 'LIMA', 'ENAM', 'TUJUH', 'DELAPAN',
    'SEMBILAN', 'SEPULUH', 'SEBELAS', 'DUA BELAS'];
  /** 3 -> "3 (TIGA)" */
  SA.countWords = function (n) { return n + (NUMBERS[n] ? ' (' + NUMBERS[n] + ')' : ''); };
}(window.SA));
