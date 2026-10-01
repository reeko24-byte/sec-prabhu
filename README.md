# Laporan Tim — the super app

One PWA for three teams: **Security Officer**, **Patrol**, **Walkthrough**.
Works on Android (Chrome) and iPhone (Safari), offline, no backend. Each report
goes to WhatsApp as photos + caption in one tap; the Excel is a separate export.

**Status (v16, 2026-10-01)**

| Team | State | Reports |
|---|---|---|
| Security Officer | **built** | Pengecekan (hourly), Laporan Kejadian, Access Control, Body Check, Laporan Shift |
| Walkthrough | **built** | Laporan KP, Laporan LDS |
| Patrol | "segera" — questions on hold | (LDS is ready to share) |

The old `wt-surveillance` app is to be **retired**; WT crews switch to this app.

Built by copying the proven parts of `wt-surveillance` (photo pipeline, seal,
Exif reader, .xlsx writer, share handling, version marker). The other apps in
`D:\Users\reeko` were read only, never edited.

---

## Publishing (same as WT)

This folder is **not** a git repo. Upload the whole folder to GitHub Pages by
hand. On **every** upload, bump both of these together — they are a pair:

- `CACHE_VERSION` in `sw.js` (now `superapp-laporan-v16`)
- `BUILD` in `js/app.js` (now `v16`)

If files change and `sw.js` does not, phones that already have the app keep the
old files forever. The line at the foot of each main screen prints
`kode v16 · cache v16`; if the two differ, the new version downloaded but the app
has not been restarted. A changed home-screen icon usually only appears after the
app is removed and added to the Home Screen again.

Stored reports survive updates: the phone's database is upgraded in place
(version 2 added the `bySession` index in v10; no report is lost).

---

## How the app is organised

- **One phone, one team at a time.** The first screen picks the team; the phone
  remembers it. "Ganti tim" on a main screen switches.
- **Each team has a session:** Security's is the **shift** (post, crew, BKO,
  shift, date); Walkthrough's is the **day** (team number, crew, route, date).
  All of them live in `state.sessions[team]` and are saved as preferences.
- **`MODULES` in `js/app.js`** is the one table that says, per team: how a report
  is captioned, named, stamped and sealed; its Excel sheets and file name; where
  its session is saved; when a session is still current (a WT day is one
  calendar day; a Security shift only warns when it is over); how to open its
  home and start screens; and how to build a new draft and a saved record.
- Each team has an options file (people, places, wording data) and a records
  file (captions, stamp lines, seal facts, sheets): `options.js` +
  `sec-caption.js` + `sec-records.js` for Security, `wt-options.js` +
  `wt-records.js` for Walkthrough.
- **Photo rules** (suggested / required / maximum per report) are in
  `photoRule()` in `js/app.js`.

**Adding Patrol:** a `patrol` entry in `SA.TEAMS` (ready: true) and in
`MODULES`; a `patrol-options.js` (people from sheet PATROL, zones, vehicles…) and
`patrol-records.js` (caption, stamp, seal, sheets); a start screen and a main
screen in `index.html`; its report kinds in `photoRule()` and the form sections.
The LDS report is already shared: `SA.lds.caption(record, 'Tim Patrol 3')`.
Badges `assets/badges/patrol-1…8.png` are in place (Patrol N = ZONA N, to confirm).

---

## Security Officer

### How a shift works

1. **Mulai shift** (once per shift): post, officers on duty (tick order = print
   order; the first name is the reporter), BKO TNI (optional), shift, shift date.
2. The main screen shows the post's badge, the shift, and the **shift
   timeline**: 8 cells — the 7 check hours, then the handover.
3. Five reports:

| Report | When | Photos |
|---|---|---|
| **Pengecekan** | every hour from start+1 to end−1 (7 a shift); "Pukul" is the scheduled hour | 1–2 suggested, not required |
| **Laporan Kejadian** | immediately; one report per incident | 1–4 suggested, not required |
| **Access Control** | whenever goods go in or out, any post; "Pukul" is the actual time | **3 required**: Cargo Manifest, plat nomor, barang |
| **Body Check** | at shift change, any post, either crew; "Pukul" starts at the shift change | 4–6 suggested, not required |
| **Laporan Shift** | by the OUTGOING crew at the end hour; A and B fill themselves | 2–4 suggested, not required |

4. After the shift report, **Mulai shift berikutnya** opens the next shift with
   the handed-over names and BKO already ticked.

A web app cannot ring the phone every hour while it is closed. The guards set an
hourly alarm in the phone's Clock app; missed hours show on the timeline and in
section A of the shift report.

### 8 reports a shift (v9, Billy 2026-10-01)

The **outgoing** crew sends the shift report at the END of its shift. The
incoming crew's first hourly check is one hour after its shift starts, because
the previous crew's handover already covers that hour. So each shift has
**7 checks + 1 handover = 8 reports**:

| Shift | Checks | Handover |
|---|---|---|
| Pagi 08:00–16:00 | 09:00–15:00 | 16:00 |
| Sore 16:00–00:00 | 17:00–23:00 | 00:00 |
| Malam 00:00–08:00 | 01:00–07:00 | 08:00 |

`SA.checkHours()` in `js/options.js` is the one place this is decided; the
timeline, the hour picker and section A of the shift report all read it.

(The officers had first suggested the incoming crew send the handover; Billy
chose this instead, because section A would otherwise shrink to one hour.)

### The timeline (main screen)

One cell per check hour, then the handover cell (clipboard mark):
green ✓ sent · amber ! missed · blue ring = the hour we are in · dashed = not
yet. Each state has a mark as well as a colour. Tapping an unsent cell opens that
hour's check or the shift report; tapping a **sent** cell opens the report that
was sent (to read or re-send it), and *Laporan shift* asks before a second
handover. Between the shift's start and its first check, the screen says the
handover was already reported by the previous shift.

### Agreed wording (Billy, 2026-10-01)

Recorded here so it is not "tidied" later. Code: `js/sec-caption.js`.

- Header on all four: `To : ARCO` / `Cc : PM, Data Analyst` / `Hal : …`.
- **Post names are the Excel names** everywhere in the text. The badge label
  ("KB KP21", "Stasiun Batang") is only on the photo.
- **Full names from the list, no ID numbers.**
- **BKO is the last numbered line** of every officer list, `-` when none; the
  number is counted (2 officers → `3. BKO TNI`).
- **Pengecekan:** *Pukul 02:00 WIB, Petugas Security Pos \<POS\> [bersama BKO
  TNI] mohon izin untuk melaporkan situasi \<POS\> saat ini. Petugas standby di
  pos penjagaan setelah melaksanakan patroli dan Guard Tour Point. Situasi dan
  kondisi \<POS\> saat ini terpantau dalam keadaan aman dan terkendali.* —
  "bersama BKO TNI" only when a BKO is on duty. Closing: *Demikian Komandan,
  laporan dari Petugas Pos \<POS\>.* then *Salam hormat,* and the names.
- **Laporan Kejadian (5W1H since v13):** Apa, Siapa, Kapan, Dimana, Mengapa,
  Bagaimana, then Tindakan and a Pelapor list. Kapan is pre-filled with
  *Pukul HH:MM WIB* (the time the report is opened, editable); Bagaimana is a
  larger box for the chronology; every box has a hint. Multi-line answers
  (Bagaimana, Tindakan) keep their further lines under the value. Until v12 it
  was the seven SIADIDEMENBABI questions: *Dengan apa* is gone, and *Bilamana*
  became Kapan (same stored key, so older incidents still export their time).
  Incidents saved before v13 still export their *Dengan apa* answer, in a
  "Dengan apa (lama)" column that appears only when such an incident is in the
  export.
- **Laporan Shift:**
  - **Section A lists every check hour of the shift**, each with ✓ when a check
    was sent or `— tidak ada laporan` when none was (Billy confirmed he wants
    the missed hours listed, not hidden). Example, Sore:
    ```
    A. PEMERIKSAAN DAN CEK LIST :
       - Pukul 17:00 WIB ✓
       - Pukul 18:00 WIB ✓
       - Pukul 19:00 WIB — tidak ada laporan
       …
       - Pukul 23:00 WIB ✓
    ```
  - Section B heading uses *apa, siapa, kapan, dimana, mengapa, bagaimana*
    (5W1H, like the incident report); each type reads `None`, or points to the
    incident report(s) sent during the shift.
  - Section C: Jam serah terima (the shift's end; required), Shift lanjut (the
    incoming names + BKO), Situasi akhir. KM Akhir was removed on request.

### Access Control (v8, from the officers' review 2026-10-01)

Goods only; every post. Title `LAPORAN ACCESS CONTROL <POS>`. Fields: Barang
keluar / masuk; **Pukul** = the actual time (time picker, typed or scrolled);
**Dari** defaults to the post; **Menuju** and **ACC oleh** are typed. Sentence:
*Pukul 20:15 WIB, petugas melakukan access control barang keluar dari SPO menuju
Segmen 9. Barang tertera di Cargo Manifest dan telah di-ACC oleh Pak Haris.*
then *Situasi aman, nihil temuan.* ("nihil taruna" in the sample was read as
autocorrect). Three photo slots, **all required**, each stamped with its subject
("Foto: Plat Nomor Kendaraan") and filed in that order. The camera unlocks once
Menuju is filled, because the route is printed on the photo. The date follows
Pukul (see "Dates of typed times" below): 23:50 saved at 00:10 is dated the day
the goods left. Names follow the
app's list (YOSAFAT, not the sample's "YOSAFAT KRESNO").

### Body Check (v15, Billy 2026-10-01)

Metal-detector body check of the staff coming in and going out at shift change.
Every post; not on the timeline (a separate button, like Access Control); sent by
whichever crew does it — filed under the shift open on the phone, so an incoming
crew checking before the handover report appears under the outgoing crew's names
(accepted by Billy). Title `LAPORAN BODY CHECK <POS>`. Sentence:
*Pukul 08:00 WIB, saat pergantian shift, petugas melakukan body check
menggunakan metal detector terhadap karyawan yang masuk dan keluar KOTA BATAK
JUNCTION.* then *Situasi aman, nihil temuan.* — or, with **Ada temuan**,
*Temuan: \<typed\>.* (the finding is then required). One sentence, no head
count (Billy).

**Pukul defaults to the nearer shift change** of the current shift: Malam opened
at 07:20 starts at 08:00 (outgoing crew), at 00:20 at 00:00 (incoming crew);
the guard can change it. Dated by the rule below, so the 08:00 default typed at
07:40 is today and Sore's 00:00 typed at 23:50 is tomorrow. Stored as
`bodyTime`, `bodyResult`, `bodyFinding` (not LDS's `result`/`finding`). Photos 4–6 suggested, never gated; band line
*Metal detector · Nihil temuan / Ada temuan*. Excel sheet **Body Check**.

### Dates of typed times (v16)

Access Control's Pukul, Body Check's Pukul and LDS's Jam are dated by one rule
(`typedTimeDate` in `js/app.js`): the day that puts the time between **20 hours
before now and 4 hours after**. Goods out 23:50 saved 00:10 → yesterday; 08:00
typed at 07:40 → today; 00:00 typed at 23:50 → tomorrow; 23:00 reported at 11:30
the next morning → yesterday. It is anchored to now, not to the shift, so a
shift nobody closed on the phone cannot drag the date back. (Until v15 Access
Control and LDS used "later than now + 5 minutes = yesterday", which dated a
time written a little in advance as yesterday.)

### Personnel (from `Database Personil.xlsx`, corrected on purpose)

`js/options.js`. The Excel is wrong in these places; do not "fix" back to it:
KOTA BATAK KP 21–28 are one post **KOTA BATAK KP 21**; **MENGGALA** Booster (not
Manggala); Yessicika Relaise Tamba and Mega Suryaningrumnugroho left out for now.

---

## Walkthrough (v11–v12, Billy 2026-10-01)

Source: `Database Personil.xlsx`, sheet **WT** — 34 people in 8 groups (13
teams), each group with its zone and routes. Data: `js/wt-options.js`.

1. **Mulai hari**: pick the **team number (1–13)**; the group's people are
   listed first (anyone can be picked — crews lend people; switching to another
   group clears names from the old one); pick **today's route** from the group's
   routes (decided daily; "Tampilkan semua rute" for a crew sent elsewhere). The
   team's badge `wt-N.png` goes on every photo.
2. **A WT day is one calendar day.** When the saved day is not today — the next
   morning, or the app left open past midnight — the app opens the start screen
   again, pre-filled with the last team, crew and route and a "Hari baru" note,
   so today's reports are never filed under yesterday's crew.
3. **Laporan KP** — the approved WT report, unchanged from the old WT app:
   `LAPORAN TEAM WT`, ✅ per name, Location / Segment / KP / Size Pipe / Note.
   The segment list puts today's route first. KP is typed as `XX+XXX` (printed
   `XX + XXX`); KP numbers for part-segment routes (Booster KBJ, SBV, Tie In
   Benar) are deferred. **3 photos required.** After sending, *Laporan KP
   berikutnya* starts the next KP.
4. **Laporan LDS** — answering a leak-detection ticket from SPO:
   ```
   Izin lapor Pak @SPO ORA, Tim WT 1

   LAPORAN TIM WT 1
   1️⃣ …
   Hari/Tgl : …   Jam : 23:40 WIB   Loc : SOUTH AREA
   Segment  : 1 KP 02 + 130 (GS 1 Minas)

   Melaporkan:
   - Team menanggapi adanya laporan notifikasi LDS di Segment 1 KP 02 + 130.
   - Team melakukan penyisiran radius 500 m dari titik deteksi …
   - Team tidak menemukan adanya crude atau kebocoran pada pipa PTG.
   - Area ROW PTG saat ini terpantau aman …

   Cc :

   Terima kasih
   ```
   - **Jam** is the actual time (dated like Access Control).
   - **Radius** is pre-filled 500, digits only, and **required** — the report
     never invents a radius.
   - **Ditemukan indikasi** replaces the last two lines with the typed finding
     (required).
   - **At least 4 photos required** (5–6 suggested). Ticket number: on hold.
   - **@-tags:** WhatsApp only makes a real tag (one that notifies) when it is
     picked from its own list, and each phone shows the tagged name as saved in
     ITS contacts. So the report prints "@SPO ORA" as plain text and leaves Cc
     empty; the send screen tells the guard to add the real tags in WhatsApp.
   - LDS is written once (`SA.lds` in `js/wt-records.js`) for Patrol to reuse.

**Names** follow the WT sheet in full (e.g. DEWANGGA SALSABILLA, IBNU AL
MUJAHIDIN); some differ from the old WT app's list on purpose.

**Heads-up for the master Excel tool** (`wt_tracker.py` in `D:\Users\reeko\wt-tools`):
it reads the OLD WT app's spreadsheets. The new files put the headers on row 8
and have different columns, so that tool needs updating before it can merge
them.

---

## Shared by every team

### The photo

- **Badge top right**, every badge at the same height (10% of the frame's
  shorter side): the post's badge for Security, `wt-N.png` for Walkthrough. Files
  in `assets/badges/`; replace one to change it. **Since v14 the white card is
  see-through** (45%, `CARD_OPACITY` in `js/photo.js`) so the scene behind the
  badge can still be made out; the logo and words stay solid. Each pixel's
  opacity goes from 45% (pure white) to solid (ink), so letter edges blend
  cleanly. Removing the card entirely was tried and rejected: the dark-blue post
  name vanishes on a dark photo. Comparison: `design/badge-opacity-compare.png`.
- Bottom band: report type, place, crew, (report-specific lines: the route and
  photo subject for Access Control, the result for Body Check, KP and condition for WT, KP and result for
  LDS), time, coordinates, address.
- Bottom right: the verification code — `SEC-VERIFY` (Security) or `WT-VERIFY`
  (Walkthrough). It detects a photo edited after the app wrote it; it is not a
  signature. The same code is in the Excel's *Kode Foto* column.
- Gallery pictures are stamped with their own Exif time/place, never the phone's.

### The Excel

One file per export, per team:

| Team | File name | Sheets | Colour |
|---|---|---|---|
| Security | `SECURITY_<POS>_<date>_<time>.xlsx` | Pengecekan, Kejadian, Access Control, Body Check, Shift | navy `#0A5C8C` |
| Walkthrough | `WT_TIM<N>_<date>_<time>.xlsx` | Laporan KP, LDS | dark green `#548235` |
| Patrol (later) | — | — | blue `#0090C8` (the dashboard's own) |

Every sheet is laid out like Prabhu's own *Daily Report Dashboard Patroli*
workbook: Prabhu logo, a title band and column headers in the **team colour**, a
Prabhu green (`#6FB92C`) subtitle band, an info row (Periode / Pos or Tim /
Jumlah / Diexport) on light green, a `No` column, zebra rows, Arial 10, no
gridlines, landscape page, and a note on how to read the photo codes. Colours:
`SA.EXCEL_THEMES` in `js/options.js`.

**The column headers are on row 8**, so a script reading these files must skip
seven rows (pandas: `header=7`).

Photos at 5.00 × 3.75 cm; Waktu / Kode / Lat / Long per photo. Access Control has
three named photo columns (Cargo Manifest, Plat Nomor Kendaraan, Barang); other
sheets get as many photo columns as their busiest row needs (at least 3 for WT
KP, 4 for LDS). Android saves the file (Chrome will not share .xlsx); send it
from WhatsApp › Lampirkan › Dokumen.

**Hapus data yang sudah diexport** removes only reports that were exported AND
sent to WhatsApp, and never the current shift's or day's.

### Look and feel

- **Prabhu green is the main colour** (Billy's choice): the logo's leaf green
  `#4AC231` fills main buttons and selections, with DARK text on it — white on
  that green is only 2.3:1. Header is deep Prabhu green `#1D5217`. Sky
  `#01ACF1` is only the focus ring and the timeline's "now" ring. Navy stays in
  the badges and the Excel. Tokens are at the top of `styles.css`.
- **App icon** is Billy's flat vector set: shield, pin and road on Prabhu green.
  Chosen over his boot/guard-post picture because it stays readable at
  home-screen size. `icons/` holds the rounded `any` icons, full-bleed
  `maskable` ones for Android, `icon-180.png` for iPhone, and `icon.svg`;
  `design/icon-master.svg` is the source; the old picture is
  `design/icon-old-boot.webp`.
- **Type is Barlow / Barlow Condensed** (SIL OFL — `assets/fonts/OFL.txt`),
  latin subset, bundled so it works offline (≈135 KB). Condensed for the header,
  labels, button titles and hour numbers. The photo stamp uses the system font.
- **Dark theme follows the phone's setting** — for night shifts. Checked for
  contrast in both.
- Report form: Save is pinned to the bottom and says *Menyimpan…* while it
  works (and waits while a photo is still processing); the caption preview is
  folded (the send screen shows it in full).
- Name picker shows the print order inside the tick circle (1, 2, 3); it says
  "pos" on Security's screens and "tim" on Walkthrough's.

Design references used: the `frontend-design`, `ui-ux-pro-max` (installed as a
user skill on this PC) and `web-design-guidelines` skills.

---

## Files

| Path | What it is |
|---|---|
| `index.html` | every screen, plus the SVG icon set |
| `styles.css` | colour tokens, light/dark themes, all components |
| `js/app.js` | screens and the report engine; **`MODULES`** (per-team behaviour), `photoRule()` |
| `js/options.js` | teams, Security posts / roster / shifts, **`checkHours()`**, Excel themes, badge list, date helpers |
| `js/sec-caption.js` | Security: the four WhatsApp captions (the agreed wording) |
| `js/sec-records.js` | Security: photo stamp lines, seal facts, the four Excel sheets |
| `js/wt-options.js` | Walkthrough: groups, people, routes, segments, KP helpers |
| `js/wt-records.js` | Walkthrough: KP caption, **LDS caption (shared)**, stamps, seals, sheets |
| `js/sheets.js` | the Excel sheet builder shared by every team |
| `js/xlsx.js` | the .xlsx writer — dashboard layout, logo, team colour |
| `js/photo.js` · `seal.js` · `exif.js` · `geo.js` | photo pipeline (from WT) |
| `js/db.js` | IndexedDB: reports + preferences (version 2, `bySession` index) |
| `sw.js` | offline cache — **bump `CACHE_VERSION` every upload**; badges cached best-effort |
| `assets/badges/` | Security post badges, WT team badges (used); Patrol zone badges (not yet) |
| `assets/brand/prabhu-logo.png` | the logo on every Excel sheet |
| `assets/fonts/` | Barlow + licence |
| `icons/`, `favicon.ico` | app icons |
| `design/` | icon sources |

---

## Testing

**Verified** by driving the app in a browser at phone size, light and dark:

- Security: setup; hourly check with a photo (badge and stamp at full size);
  incident without photos; access control (required fields and photos block
  saving; slot stamps; caption); shift report (A and B filled from the other
  reports); the 8-cell timeline and handover cell; next-shift prefill.
- Walkthrough: start screen (team, names, routes); new-day rule (next morning
  and past midnight); KP report (mask, 3 required photos, caption, stamp with
  `wt-9` badge); LDS (radius and finding required, 4 photos, caption, tag
  reminder); each team's history shows only its own reports.
- Every generated workbook type was opened in **real Excel 16 on this PC** (no
  repair prompt) and rendered to check the layout.
- The service worker's install was checked in a Node simulation with one badge
  failing on purpose (the install still completes).

**Not verified — needs a real phone:** camera, GPS prompt, Add to Home Screen,
the home-screen icon, offline start, the database upgrade on a phone with saved
reports, and the WhatsApp share. The test browser blocks the service worker and
has no share sheet.

**Testing locally:** serve the folder (`python -m http.server 8765`) and open it
in a browser. After editing a file, the browser may keep serving the old copy
from its HTTP cache — reload with the cache bypassed before trusting a result.

---

## Code reviews

### First review (v10)

1. **Clearing exported data** removes only reports exported AND sent, never the
   current shift's.
2. A photo still being stamped when the guard leaves a report is **dropped**,
   not added to the next report; **Save waits** while a photo is processing.
3. The report **preview** showed "undefined, NaN" as the date — fixed.
4. The **version marker** compares versions as numbers (as text, v10 < v9).
5. A **sent timeline cell** opens the sent report; no accidental second handover.
6. **Access Control's date follows its Pukul.**
7. **Jam serah terima is required.**
8. The once-a-minute refresh reads only the current shift (`bySession` index).
9. Access Control slots redraw once per keystroke and reuse thumbnails.
10. Excel row numbers come from the row position.

### Second review (v12)

1. **A WT day is one calendar day** (see Walkthrough, point 2).
2. **LDS radius**: digits only, required; never an invented 500 m.
3. Changing the WT **team number to another group** drops the old group's names.
4. A photo picker returning when **no report is open** is ignored.
5. The name picker says **"tim"** on the WT screen.
6. **Badges are cached best-effort**: one slow badge no longer fails the whole
   offline install.
7. **One sessions map** and a fuller `MODULES` table — Patrol is one entry, not
   new branches.
8. The chip rows share `renderChoice`.
9. Both main screens use one counter (`renderCount`).

### Third review (v16)

Eight findings on v13–v15; seven fixed, one accepted:

1. The photo hint said "Belum ada foto" with 1–3 photos attached; it now says
   "2 foto, disarankan 4–6 — tetap bisa dikirim."
2. *Accepted:* a Body Check is filed under the shift open on the phone.
3. One date rule for every typed time (see "Dates of typed times").
4. One closing line, `CLEAR_SITUATION`, for Access Control and Body Check.
5. "Dengan apa" from before v13 is still exported.
6. Multi-line answers stay under their value in the caption.
7. Body Check has its own field names (`bodyResult`, `bodyFinding`).
8. A stale "all three" comment.

---

## Open items

**Patrol** (held by Billy on 2026-10-01, to be asked again). Agreed so far:
tidied caption "LAPORAN MONITORING PATROLI SECURITY PT PRABHU"; no badge
numbers; TNI rolled into the list as the last numbered line and counted in TOTAL
PERSONIL; Patrol also sends LDS (shared report). Still to ask:

1. Area — typed, or a list per zone?
2. Guard Tour "Nihil" with a check listed under it — separate things, or does the
   check replace "Nihil"?
3. How often — one report per shift, or hourly as well?
4. E. Gangguan — separate incident report per disturbance, like Security?
5. G. Field Interview — same four lines every time (fixed, editable)?
6. Vehicles — a fixed list with plates, or typed?
7. Photos — how many, and should each carry its check ("Vent Cocks KP 47+900")?
8. Confirm the badges: Patrol N = ZONA N?

**Walkthrough**

- KP numbers of Booster KBJ, SBV1/2A/2B and Tie In Benar (to fill route ranges).
- LDS ticket number (on hold).
- Retire `wt-surveillance` once the crews have switched; update `wt_tracker.py`
  for the new Excel layout.

**Everyone:** a real-phone test (see Testing).

---

## Version history

| | Change |
|---|---|
| v1 | Security Officer: hourly check, incident, shift report; Excel; send to WhatsApp |
| v2 | Redesign: Prabhu colours from the badges, dark mode, shift timeline |
| v3 | Prabhu green as main colour; first own icon |
| v4 | *Menyimpan…* state on save (ui-ux-pro-max review) |
| v5 | Barlow fonts; boot/guard-post icon |
| v6 | Flat vector icon set with maskable Android icons |
| v7 | Excel in the Daily Report Dashboard style, one colour per team |
| v8 | Access Control report |
| v9 | 8 reports a shift: checks start+1…end−1, handover by the outgoing crew |
| v10 | Fixes from the first code review |
| v11 | Walkthrough: KP report and LDS report; report engine made team-aware |
| v12 | Fixes from the second code review |
| v13 | Laporan Kejadian in 5W1H (Apa, Siapa, Kapan, Dimana, Mengapa, Bagaimana) |
| v14 | Photo badge: white card see-through (45%), logo and words solid |
| v15 | Body Check report (metal detector, at shift change) |
| v16 | Fixes from the third code review |
