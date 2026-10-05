/* Patrol: who, where, and the fixed wording (Billy, 2026-10-01).
 *
 * Source: `Database Personil.xlsx`, sheet PATROL -- 8 zones, 8 people each,
 * full names as written there (trailing spaces trimmed).
 *
 * The crews are called PATROL 1-8, not by zone (Billy, 2026-10-01). South:
 * Patrol N is ZONA N. North (Billy, corrected 2026-10-05): Patrol 5 = ZONA 8,
 * 6 = ZONA 5, 7 = ZONA 6, 8 = ZONA 7. `sheetZone` keeps the sheet's number;
 * the crew and segments come with the zone, the vehicle and badge stay with
 * the patrol number.
 * Patrol 1-4 are the South Area, 5-8 the North Area.
 *
 * Vehicles: one per patrol, from Billy's list (2026-10-02).
 *
 * Checkpoints: the facilities and titik rawan each patrol checks, from
 * Billy's list (2026-10-05), typos tidied (Launcer, Recivee, Vantchock,
 * Menggala Boster, Sesudsh) and tags written one way (04-SBV-001 A, KP 3+400).
 * A guard tour picks one; the end-of-shift report says which were not checked
 * this shift -- a notice, never a block (Billy). A point the list does not
 * have is still typed ("Lainnya"), remembered on the phone and offered next time.
 * Held: each zone's wilayah kerja as a KP range.
 */

(function (SA) {

  /** A titik rawan on a patrol's list. */
  function rawan(name) { return { name: name, rawan: true }; }

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
      unit(6, 5, 'North Area', 'SEG 8, 9, 7', ['SIGIT SURYA', 'AMI SAPUTRA', 'FIKRI BUDIARDONO',
        'NANDA IRAWAN', 'KARSIN', 'ROBBY GUSBIANTO', 'RIFAL ANDRYO', 'RACHMADI']),
      unit(7, 6, 'North Area', 'SEG 7', ['RISKI PERMADI', 'MUHAMMAD KHOIRI', 'HASNUL FAHRINUR',
        'SYARIPUDIN', 'M RIZAL', 'SUKARDI', 'MH RUSTAM', 'REYHAN MUHAMMAD']),
      unit(8, 7, 'North Area', 'SEG 10/12', ['FENGKI HUTASOIT', 'ABD CHOIR MASYURI', 'ANDI ARDIANSYAH',
        'JUSRI', 'ARIEV TRI RAHMAT', 'JOVI HASRADI', 'M WELDI', 'AHMAD JEFRI'])
    ],

    /* Each patrol's checkpoints, in Billy's order. rawan() = titik rawan. */
    checkpoints: {
      'PATROL 1': [
        'Pig Launcher 01-PL-001 Area Camp Minas',
        'Pig Receiver 01-PR-001 Area Camp Minas',
        rawan('Tie In TP 005 (Segment 2) GS 3 Minas'),
        '02-SBV-001 (Segment 2) GS 3 Minas',
        'Tie In TP 006 (Segment 2) GS 4 Minas',
        rawan('Tie In TP 007 (Segment 2) KM 49 Putra Dairi'),
        'Tie In TP 008 (Segment 2) NBS',
        '03-PL-001 (Segment 3A) NBS'
      ],
      'PATROL 2': [
        '04-PL-001 KP 0+000 Area Kota Batak',
        '04-SBV-001 A Area Kota Garo',
        '04-SBV-001 B Area Kota Garo',
        '04-SBV-002 Area Telaga Sam Sam',
        '04-PR-001 Area Simpang Gelombang',
        'Ventcock KP 3+400 Area Indra Sakti',
        'Ventcock KP 5+500 Area Indra Sakti',
        'Ventcock KP 17+500 Area Kota Garo',
        'Ventcock KP 19+600 Area Kota Garo',
        'Ventcock KP 32+500 Area Simpang Gelombang',
        'Ventcock KP 28+600 Area Telaga Sam Sam',
        'Ventcock KP 26+300 Area Kota Garo'
      ],
      'PATROL 3': [
        'Control Box KP 4+900 Segment 3',
        'Control Box KP 25+300 Segment 3',
        '03-SBV-001 Desa Mindal Segment 3',
        '03-SBV-002 A Barak Nias Surya Minang Segment 3',
        '05-PR-001 Libo Baru Mindal Segment 5',
        '05-PL-001 GS Libo Segment 5',
        'KP 9+200 Segment 5'
      ],
      'PATROL 4': [
        'Ventcock KP 47+900 Balai Raja Segment 3',
        '03-SBV-003 KP 46+300 Belakang Samsat Pinggir Segment 3',
        'Tie In Intan TP 012 KP 36+500 Simpang Intan Segment 3',
        'Tie In Pungut TP 011 KP 34+100 Simpang Gas Station Pungut Segment 3',
        '03-SBV-002 B KP 31+300 Belakang PLTMG Balai Pungut Segment 3'
      ],
      'PATROL 5': [
        '01-PL-001 Area CGS 1 HO Segment 11A',
        'Tie In TP 30 Jl. V HO Segment 6, 11A-11B',
        'Tie In CGS 5 HO Jl. V HO Segment 6, 11A-11B',
        'PL PR CGS 10 Jl. V HO Segment 6, 11A-11B',
        'CGS 001 - CGS 002 Jl. V HO',
        'CGS 001 - CGS 002 Jl. Simpang Bangko',
        'SBV 001 Segment 6 KP 11+850',
        'SBV 002 Segment 6 KP 11+850',
        'Tie In TP 021 Simpang Pemburu Jl. Lintas Sumatra',
        'Batang HO',
        'KP 6+500 Jl. Arjuna Segment 6, 11B',
        'KP 6+000 Jl. Arjuna Segment 6, 11B',
        'KP 18+000 Jl. Arjuna Segment 6',
        'KP 5+000 Jl. Arjuna Segment 11B',
        'KP 27+000 Jl. Lintas Sumatra Segment 6'
      ],
      'PATROL 6': [
        'Pig Launcher Balam GS Segment 8',
        'Control Box KP 3+800 Segment 8',
        'Control Box KP 6+300 Segment 8',
        'Control Box KP 9+600 Segment 8',
        'Control Box KP 12+200 Segment 8',
        'Control Box KP 12+300 Segment 8',
        'Control Box KP 12+350 Segment 8',
        'Control Box KP 12+500 Segment 8',
        'Pig Receiver Bangko GS Segment 7',
        'SBV 001 Jembatan Tes A Pematang Ibul Segment 7',
        'SBV 002 Jembatan Seroja Segment 7',
        'Tie In Seruni GS Segment 7',
        'Manggala Booster Pump Simpang Manggala Junction Segment 7',
        'Pig Launcher Benar GS Segment 9',
        'Control Box KP 3+300 Segment 9',
        'Control Box KP 3+950 Segment 9',
        'Control Box KP 5+200 Segment 9',
        'Control Box KP 8+200 Segment 9',
        'Control Box KP 10+000 Segment 9',
        'Pig Receiver Jembatan Seroja Segment 9',
        rawan('KP 12+350 Bangko KM 0 Segment 8'),
        rawan('KP 0+950 Bangko Permata Segment 9'),
        rawan('KP 6+150 Pematang Ibul Segment 7')
      ],
      'PATROL 7': [
        'Manggala Booster Segment 7',
        'SBV 003 Simpang Mayat Segment 7',
        'Tie In Sintong GS Segment 7',
        'Control Box KP 19+000 Segment 7',
        'Control Box KP 19+500 Segment 7',
        'SBV 004 Jembatan Ujung Tanjong Segment 7',
        'SBV 005 Sesudah Jembatan Ujung Tanjong Segment 7',
        'Tie In Simpang Rantau Bais GS Segment 7',
        'Control Box KP 39+700 Segment 7',
        'SBV 006 Simpang Batang GS Segment 7',
        'Tie In Simpang Batang GS Segment 7',
        'Batang Station Segment 7',
        rawan('KP 16+500 Segment 7 Banjar 12')
      ],
      'PATROL 8': [
        'SBV 003 Bukit Batrem',
        'SBV 004 Bukit Batrem',
        'Ventcock KP 24+500',
        'Critical Area KP 24+400',
        'SBV 002 Bukit Timah',
        'SBV 001 Bukit Timah',
        'Critical Area KP 14+900',
        'Ventcock Jl. Lingkar Bukit Timah',
        'Ventcock Simpang PT Momugo',
        'Batang Booster'
      ]
    },

    /* Each patrol's vehicle, in Patrol order (Billy, 2026-10-02). Picked by
       default for that patrol; another one, or a typed plate, when swapped. */
    vehicles: ['BM 8036 QI', 'BM 8034 QI', 'BM 8035 QI', 'BM 8033 QI',
      'BM 8031 QI', 'BM 8541 SJ', 'BM 8032 QI', 'BM 8248 QD'],

    /* A checkpoint's condition, picked on its guard tour. */
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

  /** A patrol's checkpoints as [{name, rawan}], in list order. */
  SA.patrolPoints = function (id) {
    return (SA.PATROL.checkpoints[id] || []).map(function (p) {
      return typeof p === 'string' ? { name: p, rawan: false } : { name: p.name, rawan: !!p.rawan };
    });
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
