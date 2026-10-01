/* Findings, shared by every team (Billy, 2026-10-01).
 *
 * A finding is a report that found something: a Security incident, a Body
 * Check with "Ada temuan", a WT KP whose note is "Lainnya", an LDS with
 * "Ditemukan indikasi", a Patrol guard tour with a temuan, a Patrol incident.
 * Like Pertagas's own daily report, each one carries a Tindak lanjut and a
 * Status, Open or Close.
 *
 * An Open finding is closed later with a short "UPDATE TEMUAN" report (kind
 * 'close') sent from Riwayat; the original is then stamped `closedAt`. The
 * close report keeps a copy of what it closes in `ref`, so a spreadsheet of
 * close reports reads on its own, and the office tool can match it to the
 * original on another phone by the first photo's code or by place and time.
 *
 * Fields on a finding:
 *   followUp   Tindak lanjut (an incident uses its own `tindakan` instead)
 *   status     'Open' | 'Close' as sent; closedAt overrides it to Close
 * On a close report:
 *   ref        { id, kind, label, where, date, time, text, code }
 *   closeTime  "HH:MM", the actual time it was closed
 *   followUp   what was done
 */

(function (SA) {

  var STATUSES = ['Open', 'Close'];

  function trim(value) { return String(value || '').trim(); }

  SA.findings = {

    STATUSES: STATUSES,

    /** Whether this report found something (and so has a follow-up and a status). */
    is: function (record) {
      if (!record) return false;
      if (record.kind === 'incident') return true;
      if (record.kind === 'body') return record.bodyResult === 'found';
      if (record.kind === 'wtkp') return record.condition === SA.WT.CONDITION_OTHER;
      if (record.kind === 'lds') return record.result === 'found';
      if (record.kind === 'patrol') return record.patrolResult === 'found';
      return false;
    },

    /** Tindak lanjut: an incident's Tindakan, everyone else's followUp. */
    followUp: function (record) {
      return trim(record.kind === 'incident' ? record.tindakan : record.followUp);
    },

    /** Open or Close: closed later wins over what was sent. */
    status: function (record) {
      if (!SA.findings.is(record)) return '';
      return record.closedAt ? 'Close' : (record.status === 'Close' ? 'Close' : 'Open');
    },

    isOpen: function (record) { return SA.findings.status(record) === 'Open'; },

    /** What was found, in a few words. */
    text: function (record) {
      if (record.kind === 'incident') {
        var apa = trim((record.answers || {}).apa);
        return SA.secCaption.incidentName(record) + (apa ? ' — ' + apa : '');
      }
      if (record.kind === 'body') return trim(record.bodyFinding);
      if (record.kind === 'wtkp') return trim(record.other);
      if (record.kind === 'lds') return trim(record.finding);
      if (record.kind === 'patrol') return trim(record.patrolFinding);
      return '';
    },

    /** The Update Temuan columns every team shares, after its own place columns. */
    closeColumns: function () {
      var col = SA.sheets.col;
      function ref(key) { return function (r) { return (r.ref || {})[key] || ''; }; }
      return [
        col('Temuan', 26, 'text', ref('label')),
        col('Keterangan', 30, 'text', ref('text')),
        col('Tanggal Temuan', 13, 'center', ref('date')),
        col('Waktu Temuan', 11, 'center', ref('time')),
        col('Kode Foto Temuan', 18, 'center', ref('code')),
        col('Tindak Lanjut', 34, 'text', 'followUp'),
        col('Status', 10, 'center', function () { return 'Close'; })
      ];
    },

    /** What a close report keeps of the finding it closes. */
    refOf: function (record, label, where) {
      var first = (record.photos || [])[0];
      // Where the finding was: the close report is filed there, even when the
      // phone has moved to another post or patrol since.
      var place = {};
      ['post', 'zone', 'teamNo', 'patrolId', 'segments'].forEach(function (key) {
        if (record[key] !== undefined && record[key] !== null && record[key] !== '') place[key] = record[key];
      });
      return {
        id: record.id, kind: record.kind, label: label, where: where,
        date: record.date, time: String(record.time || '').slice(0, 5),
        text: SA.findings.text(record), code: first ? first.sealCode || '' : '',
        place: place
      };
    },

    /**
     * The "UPDATE TEMUAN" text. `head` is the team's own opening lines (the
     * To / Cc / Hal block for Security), `crew` its closing lines.
     */
    closeCaption: function (record, head, crew) {
      var ref = record.ref || {};
      var line = SA.aligner(['Temuan', 'Keterangan', 'Dilaporkan', 'Ditutup', 'Tindak lanjut', 'Status']);
      var reported = ref.date ? SA.longDate(SA.parseDate(ref.date)) + ' pukul ' + (ref.time || '-') + ' WIB' : '-';
      return head.concat([
        line('Temuan', ref.label || '-'),
        line('Keterangan', ref.text || '-'),
        line('Dilaporkan', reported),
        line('Ditutup', SA.longDate(SA.parseDate(record.date)) + ' pukul ' + (record.closeTime || '-') + ' WIB'),
        line('Tindak lanjut', trim(record.followUp) || '-'),
        line('Status', 'Close'),
        ''
      ]).concat(crew).join('\n');
    }
  };
}(window.SA));
