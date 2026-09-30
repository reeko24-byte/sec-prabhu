# Laporan Tim — the super app

One PWA for three teams: **Security Officer**, **Patrol**, **Walkthrough**.
Works on Android (Chrome) and iPhone (Safari), offline, no backend. Each report
goes to WhatsApp as photos + caption in one tap; the Excel is a separate export.

**Status (v10, 2026-10-01):** Security Officer is built — four report types.
Patrol and Walkthrough show on the first screen as "segera" — not built yet.

Built by copying the proven parts of `wt-surveillance` (photo pipeline, seal,
Exif reader, .xlsx writer, share handling, version marker). The other apps in
`D:\Users\reeko` were read only, never edited.

---

## Publishing (same as WT)

This folder is **not** a git repo. Upload the whole folder to GitHub Pages by
hand. On **every** upload, bump both of these together — they are a pair:

- `CACHE_VERSION` in `sw.js` (now `superapp-laporan-v10`)
- `BUILD` in `js/app.js` (now `v10`)

If files change and `sw.js` does not, phones that already have the app keep the
old files forever. The line at the foot of the main screen prints
`kode v10 · cache v10`; if the two differ, the new version downloaded but the app
has not been restarted. A changed home-screen icon usually only appears after
the app is removed and added to the Home Screen again.

---

## Security Officer — how a shift works

1. **Mulai shift** (once per shift): post, officers on duty (tick order = print
   order; the first name is the reporter), BKO TNI (optional), shift, shift date.
2. The main screen shows the post's badge, the shift, and the **shift
   timeline**: 8 cells — the 7 check hours, then the handover.
3. Four reports:

| Report | When | Photos |
|---|---|---|
| **Pengecekan** | every hour from start+1 to end−1 (7 a shift); "Pukul" is the scheduled hour | 1–2 suggested, not required |
| **Laporan Kejadian** | immediately; one report per incident | 1–4 suggested, not required |
| **Access Control** | whenever goods go in or out, any post; "Pukul" is the actual time | **3 required**: Cargo Manifest, plat nomor, barang |
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
yet. Each state has a mark as well as a colour. Tapping a check cell opens that
hour's check; tapping the handover cell opens the shift report. Between the
shift's start and its first check, the screen says the handover was already
reported by the previous shift.

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
- **Laporan Kejadian:** the seven SIADIDEMENBABI questions (siapa, apa, dimana,
  dengan apa, mengapa, bagaimana, bilamana), Tindakan, and a Pelapor list.
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
  - Section B heading uses *siapa, apa, dimana, dengan apa, mengapa, bagaimana,
    bilamana*; each type reads `None`, or points to the incident report(s)
    sent during the shift.
  - Section C: Jam serah terima (the shift's end), Shift lanjut (the incoming
    names + BKO), Situasi akhir. KM Akhir was removed on request.
- **Access Control:** see below.

### Access Control (v8, from the officers' review 2026-10-01)

Goods only; every post. Title `LAPORAN ACCESS CONTROL <POS>`. Fields: Barang
keluar / masuk; **Pukul** = the actual time (time picker, typed or scrolled);
**Dari** defaults to the post; **Menuju** and **ACC oleh** are typed. Sentence:
*Pukul 20:15 WIB, petugas melakukan access control barang keluar dari SPO menuju
Segmen 9. Barang tertera di Cargo Manifest dan telah di-ACC oleh Pak Haris.*
then *Situasi aman, nihil temuan.* ("nihil taruna" in the sample was read as
autocorrect). Three photo slots, **all required**, each stamped with its subject
("Foto: Plat Nomor Kendaraan") and filed in that order. The camera unlocks once
Menuju is filled, because the route is printed on the photo. Names follow the
app's list (YOSAFAT, not the sample's "YOSAFAT KRESNO").

### Personnel (from `Database Personil.xlsx`, corrected on purpose)

`js/options.js`. The Excel is wrong in these places; do not "fix" back to it:
KOTA BATAK KP 21–28 are one post **KOTA BATAK KP 21**; **MENGGALA** Booster (not
Manggala); Yessicika Relaise Tamba and Mega Suryaningrumnugroho left out for now.

### The photo

- **Badge top right, solid**, all posts at the same height (10% of the frame's
  shorter side). Files in `assets/badges/`; replace one to change a post's badge.
- Bottom band: report type, post + shift, officers + BKO, (access control: the
  route and which photo it is), time, coordinates, address. Bottom right:
  `SEC-VERIFY` code (same seal as WT — detects a photo edited after the app
  wrote it; it is not a signature).
- Gallery pictures are stamped with their own Exif time/place, never the phone's.

### The Excel

One file, **four sheets**: Pengecekan, Kejadian, Access Control, Shift. Since v7
each sheet is laid out like Prabhu's own *Daily Report Dashboard Patroli*
workbook: Prabhu logo, a title band and column headers in the **team colour**, a
Prabhu green (`#6FB92C`) subtitle band, an info row (Periode / Pos / Jumlah /
Diexport) on light green, a `No` column, zebra rows, Arial 10, no gridlines,
landscape page, and a note on how to read the photo codes.

Team colours (`SA.EXCEL_THEMES` in `js/options.js`): Security navy `#0A5C8C`,
Patrol blue `#0090C8` (the dashboard's own), Walkthrough dark green `#548235`.

**The column headers are on row 8**, so a script reading these files must skip
seven rows (pandas: `header=7`).

Photos at 5.00 × 3.75 cm; Waktu / Kode / Lat / Long per photo. Access Control has
three named photo columns (Cargo Manifest, Plat Nomor Kendaraan, Barang); the
other sheets get as many photo columns as their busiest row needs. Android saves
the file (Chrome will not share .xlsx); send it from WhatsApp › Lampirkan ›
Dokumen.

---

## Look and feel

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
  latin subset, bundled so it works offline (≈135 KB, in the service-worker
  cache). Condensed for the header, labels, button titles and hour numbers. The
  photo stamp still uses the system font.
- **Dark theme follows the phone's setting** — for the Malam shift. Checked for
  contrast in both.
- Report form: Save is pinned to the bottom and says *Menyimpan…* while it
  works; the caption preview is folded (the send screen shows it in full).
- Name picker shows the print order inside the tick circle (1, 2, 3).

Design references used: the `frontend-design`, `ui-ux-pro-max` (installed as a
user skill on this PC) and `web-design-guidelines` skills.

---

## Files

| Path | What it is |
|---|---|
| `index.html` | every screen, plus the SVG icon set |
| `styles.css` | colour tokens, light/dark themes, all components |
| `js/options.js` | teams, posts, roster, shifts, **checkHours()**, Excel themes, badges |
| `js/sec-caption.js` | the four WhatsApp captions (the agreed wording) |
| `js/sec-records.js` | photo stamp lines, seal facts, and the four Excel sheets |
| `js/app.js` | screens, timeline, forms, photos, save, share, export |
| `js/photo.js` · `seal.js` · `exif.js` · `geo.js` | photo pipeline (from WT) |
| `js/xlsx.js` | the .xlsx writer — dashboard layout, logo, team colour |
| `js/db.js` | IndexedDB: reports + preferences |
| `sw.js` | offline cache — **bump `CACHE_VERSION` every upload** |
| `assets/badges/` | post badges (Security) and team badges (Patrol, WT — not used yet) |
| `assets/brand/prabhu-logo.png` | the logo on every Excel sheet |
| `assets/fonts/` | Barlow + licence |
| `icons/`, `favicon.ico` | app icons |
| `design/` | icon sources |

---

## Code review (v10, 2026-10-01)

A high-effort code review found ten issues; all were fixed and each was checked
in the browser:

1. **Clearing exported data** now removes only reports that were exported AND
   sent to WhatsApp, and never the current shift's (the shift report and the
   timeline are built from them).
2. A photo still being stamped when the guard leaves a report is **dropped**,
   not added to the next report; **Save waits** while a photo is processing.
3. The report **preview** showed "undefined, NaN" as the date for Kejadian and
   Access Control — the form now carries a date like a saved report.
4. The **version marker** compares versions as numbers (as text, v10 < v9).
5. Tapping a **sent (✓) timeline cell** opens the report that was sent;
   *Laporan shift* asks before making a second handover.
6. **Access Control's date follows its Pukul**: 23:50 saved at 00:10 is dated
   the day the goods left.
7. **Jam serah terima is required**; the caption falls back to "-".
8. The once-a-minute refresh reads only the current shift's reports, through
   a new `bySession` database index (database version 2; existing reports are
   kept on upgrade).
9. Access Control photo slots redraw once per keystroke and reuse thumbnails.
10. Excel row numbers come from the row position.

## Verified / not verified

Verified by driving the app in a browser at phone size, light and dark:
setup; hourly check with a photo (badge and stamp checked at full size);
incident without photos; access control (every required field and photo blocks
saving until done; slot stamps; caption); shift report (A and B filled from the
other reports); the 8-cell timeline and handover cell; next-shift prefill.
Generated workbooks were opened in **real Excel 16 on this PC** (no repair
prompt) and rendered to check the layout.

**Not verified — needs a real phone:** camera, GPS prompt, Add to Home Screen,
the new icon on the home screen, offline start, and the WhatsApp share. The test
browser blocks the service worker and has no share sheet.

---

## Open — Patrol (held by Billy on 2026-10-01, to be asked again)

Agreed so far: tidied caption "LAPORAN MONITORING PATROLI SECURITY PT PRABHU";
no badge numbers; TNI rolled into the list as the last numbered line and counted
in TOTAL PERSONIL. Badges received (`patrol-1…8.png`).

Still to ask:
1. Area — typed, or a list per zone?
2. Guard Tour "Nihil" with a check listed under it — separate things, or does the
   check replace "Nihil"?
3. How often — one report per shift, or hourly as well?
4. E. Gangguan — separate incident report per disturbance, like Security?
5. G. Field Interview — same four lines every time (fixed, editable)?
6. Vehicles — a fixed list with plates, or typed?
7. Photos — how many, and should each carry its check ("Vent Cocks KP 47+900")?
8. Confirm the badges: Patrol N = ZONA N?

## Open — Walkthrough

TIM 1–13 (Sheet3 of the personnel file) is the new setup, replacing the WT app's
three crews. Badges received (`wt-1…13.png`, `wt-team.png`) — confirm WT N =
TIM N. Keep `wt-surveillance` live until the crews switch.

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
| v10 | Fixes from a high-effort code review (see below) |
