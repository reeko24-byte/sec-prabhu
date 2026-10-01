/* Security Perkantoran (SECWAN): the end-of-shift report, what goes on the
 * photo, what the seal binds, and the Excel sheet (Billy, 2026-10-02).
 *
 * Office security at the SORA and AREA MELUR posts, Pagi shift (08:00-16:00).
 * One report per officer per day, sent at the end of the shift: the visitors
 * counted through the day and 4-6 photos (guest book, the area, other).
 *
 * A record looks like:
 *   team 'office', kind 'office'
 *   sessionId, post, zone, shift ('PAGI'), shiftDate, officers [name], reporter
 *   date, time, timestamp
 *   visitors     the count sent (from the counter; the officer may correct it)
 *   visitTimes   ['08:41', ...] each tap of "+1 Tamu"
 *   situation    the standby sentence (fixed, editable)
 *   photos [..]
 */

(function (SA) {

  var O = SA.OFFICE;

  function shiftLine() {
    var shift = SA.shiftById(O.SHIFT);
    return shift.id + ', ' + SA.hourText(shift.start) + ' WIB s/d ' + SA.hourText(shift.end) + ' WIB';
  }

  function hours() {
    var shift = SA.shiftById(O.SHIFT);
    return SA.hourText(shift.start) + '–' + SA.hourText(shift.end) + ' WIB';
  }

  SA.officeRecords = {

    caption: function (record) {
      var line = SA.aligner(['Hari/Tgl', 'Shift']);
      // The To / Cc / Hal block every Security report uses.
      return SA.secCaption.header('LAPORAN SECURITY PERKANTORAN ' + record.post)
        .concat([
          line('Hari/Tgl', SA.longDate(SA.parseDate(record.shiftDate || record.date))),
          line('Shift', shiftLine()), '',
          'NAMA PETUGAS :'
        ])
        .concat((record.officers || []).map(function (name, i) { return (i + 1) + '. ' + name; }))
        .concat([
          '',
          SA.sentence(record.situation || O.SITUATION),
          '',
          'Jumlah tamu pukul ' + hours() + ' : ' + (Number(record.visitors) || 0) + ' orang.',
          '',
          'Terima kasih.'
        ]).join('\n');
    },

    label: function (record) {
      return 'Laporan Harian · ' + (Number(record.visitors) || 0) + ' tamu';
    },

    /** No visitor count on the photo: it changes all day, and every photo taken
        before the last "+1 Tamu" would then be marked as out of date. */
    stampLines: function (report) {
      return ['SECURITY PERKANTORAN · ' + report.post,
        'Shift ' + O.SHIFT + ' · ' + hours(),
        (report.officers || []).length ? 'Petugas: ' + report.officers.join(', ') : '',
        ''];
    },

    /** What the seal is bound to, in a fixed order. Append only. */
    sealFacts: function (report, timestamp, fix) {
      return ['OFF1', timestamp, report.kind, report.post, report.shiftDate,
        (report.officers || []).join('+'),
        fix ? fix.latitude.toFixed(6) : '', fix ? fix.longitude.toFixed(6) : ''];
    },

    sheets: function (records) {
      var theme = SA.EXCEL_THEMES.office;
      var col = SA.sheets.col;
      var posts = SA.sheets.unique(records.map(function (r) { return r.post; }));
      var period = SA.sheets.period(records.map(function (r) { return r.shiftDate || r.date; }));
      var now = new Date();
      var sheet = SA.sheets.build('Laporan Harian', records.filter(function (r) { return r.kind === 'office'; }), [
        col('Tanggal', 12, 'center', function (r) { return r.shiftDate || r.date; }),
        col('Pos', 16, 'center', 'post'),
        col('Zona', 12, 'center', 'zone'),
        col('Shift', 9, 'center', 'shift'),
        col('Petugas', 30, 'text', function (r) { return (r.officers || []).join(', '); }),
        col('Jumlah Tamu', 11, 'number', function (r) { return Number(r.visitors) || 0; }),
        col('Jam Tamu', 40, 'text', function (r) { return (r.visitTimes || []).join(', '); }),
        col('Situasi', 44, 'text', 'situation'),
        col('Pelapor', 20, 'text', 'reporter'),
        col('Waktu Simpan', 19, 'center', 'timestamp')
      ], { label: SA.officeRecords.label, freeze: 3, minPhotos: 4 });
      sheet.title = theme.title + ' — LAPORAN HARIAN';
      sheet.subtitle = 'PT Prabhu · ' + (posts.join(', ') || '-');
      sheet.meta = [
        ['Periode', period],
        ['Pos', posts.join(', ') || '-'],
        ['Jumlah', sheet.rows.length + ' laporan'],
        ['Diexport', SA.dateOf(now) + ' ' + SA.timeOf(now).slice(0, 5)]
      ];
      sheet.note = SA.sheets.PHOTO_NOTE;
      return [sheet];
    }
  };
}(window.SA));
