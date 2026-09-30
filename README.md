# Laporan Tim — the super app

One PWA for three teams: **Security Officer**, **Patrol**, **Walkthrough**.
Works on Android (Chrome) and iPhone (Safari), offline, no backend. Each report
goes to WhatsApp as photos + caption in one tap; the Excel is a separate export.

**Status (2026-10-01):** Security Officer is built. Patrol and Walkthrough show
on the first screen as "segera" — not built yet.

Built by copying the proven parts of `wt-surveillance` (photo pipeline, seal,
Exif reader, .xlsx writer, share handling, version marker). The other apps in
`D:\Users\reeko` were read only, never edited.

---

## Publishing (same as WT)

This folder is **not** a git repo. Upload the whole folder to GitHub Pages by
hand. On **every** upload, bump both of these together — they are a pair:

- `CACHE_VERSION` in `sw.js` (`superapp-laporan-v6`)
- `BUILD` in `js/app.js` (`v6`)

If only files change and `sw.js` does not, phones that already have the app keep
the old files forever. The line at the foot of the main screen prints
`kode v6 · cache v6`; if the two differ, the new version downloaded but the app
has not been restarted.

---

## Look and feel (redesign, v2, 2026-10-01)

- **Prabhu green is the main colour** (v3, Billy's choice): the logo's leaf green
  `#4AC231` fills main buttons and selections, with DARK text on it — white on that
  green is only 2.3:1. Header is deep Prabhu green `#1D5217`. Sky `#01ACF1` is only
  the focus ring and the timeline's "now" ring. Navy stays in the badges. Tokens
  are at the top of `styles.css`.
- **App icon** (v6) is Billy's flat vector set: shield, pin and road on Prabhu
  green. Chosen over the v5 boot/guard-post picture because it stays readable at
  home-screen size. `icons/` holds the rounded `any` icons, full-bleed
  `maskable` ones for Android, `icon-180.png` for iPhone, and `icon.svg`;
  `design/icon-master.svg` is the source. The icon's green `#63B245` is a shade
  darker than the UI's `#4AC231`, left as drawn. The old picture is kept as
  `design/icon-old-boot.webp`.
- **Type is Barlow / Barlow Condensed** (v5, SIL OFL — `assets/fonts/OFL.txt`),
  latin subset, bundled so it works offline (≈135 KB, in the service-worker
  cache). Condensed for the header, labels, button titles and hour numbers.
  The photo stamp still uses the system font.
- **Dark theme follows the phone's setting** — for the Malam shift. Checked for
  contrast in both.
- **Main screen**: the post's own badge on top (the mark its photos will
  carry), then the **shift timeline** — one cell per hour: green ✓ sent, amber !
  missed, blue ring = now, dashed = not yet. Tap a cell to send that hour.
- Report form: Save is pinned to the bottom; the caption preview is folded
  (the send screen shows it in full).
- Name picker shows the print order inside the tick circle (1, 2, 3).

## Badges for the next two teams

Received 2026-10-01, already in `assets/badges/` and listed in `SA.BADGES`
(`js/options.js`), not yet used: `patrol-1…8.png` (assumed = ZONA 1–8),
`wt-1…13.png` (assumed = TIM 1–13), `wt-team.png` (plain "TEAM Walkthrough").
Add them to `sw.js` when those modules are built.

---

## Security Officer — how a shift works

1. **Mulai Shift** (once per shift): post, officers on duty (tick order = print
   order; first name is the reporter), BKO TNI (optional), shift, shift date.
2. The main screen shows the shift all the time, what check is due next, and any
   past hour with no report.
3. Three reports:

| Report | When | Photos (hint, never enforced) |
|---|---|---|
| **Pengecekan** | every hour; "Pukul" is the scheduled hour, the real time is on the photo | 1–2 |
| **Laporan Kejadian** | immediately; one report per incident | 1–4 |
| **Laporan Shift** | at handover; A and B fill themselves | 2–4 |

4. After the shift report, **Mulai Shift Berikutnya** opens the next shift with
   the handed-over names and BKO already ticked.

A web app cannot ring the phone every hour while it is closed. The guards set an
hourly alarm in the phone's Clock app; missed hours show on the main screen and
in section A of the shift report.

### Agreed wording (Billy, 2026-10-01)

Recorded here so it is not "tidied" later. Code: `js/sec-caption.js`.

- Header on all three: `To : ARCO` / `Cc : PM, Data Analyst` / `Hal : …`.
- **Post names are the Excel names** everywhere in the text. The badge label
  ("KB KP21", "Stasiun Batang") is only on the photo.
- **Full names from the list, no ID numbers.**
- **BKO is the last numbered line** of every officer list, `-` when none; the
  number is counted (2 officers → `3. BKO TNI`).
- Hourly sentence: *Pukul 02:00 WIB, Petugas Security Pos \<POS\> [bersama BKO
  TNI] mohon izin untuk melaporkan situasi \<POS\> saat ini. Petugas standby di
  pos penjagaan setelah melaksanakan patroli dan Guard Tour Point. Situasi dan
  kondisi \<POS\> saat ini terpantau dalam keadaan aman dan terkendali.* —
  "bersama BKO TNI" only when a BKO is on duty. Closing: *Demikian Komandan,
  laporan dari Petugas Pos \<POS\>.* then *Salam hormat,* and the names.
- Shift report section B heading uses *siapa, apa, dimana, dengan apa, mengapa,
  bagaimana, bilamana* (SIADIDEMENBABI). KM Akhir was removed on request.
- Shifts: Pagi 08:00–16:00, Sore 16:00–00:00, Malam 00:00–08:00. A Sore
  check at 00:00 is dated the next day, because that is when it happened.

### Personnel (from `Database Personil.xlsx`, corrected on purpose)

`js/options.js`. The Excel is wrong in these places; do not "fix" back to it:
KOTA BATAK KP 21–28 are one post **KOTA BATAK KP 21**; **MENGGALA** Booster (not
Manggala); Yessicika Relaise Tamba and Mega Suryaningrumnugroho left out for now.

### The photo

- **Badge top right, solid**, all posts at the same height (10% of the frame's
  shorter side). Files in `assets/badges/`; replace one to change a post's badge.
- Bottom band: report type, post + shift, officers + BKO, time, coordinates,
  address. Bottom right: `SEC-VERIFY` code (same seal as WT — detects a photo
  edited after the app wrote it; it is not a signature).
- Gallery pictures are stamped with their own Exif time/place, never the phone's.

### The Excel

One file, three sheets: **Pengecekan**, **Kejadian**, **Shift**. Photos at
5.00 × 3.75 cm; Waktu / Kode / Lat / Long per photo; as many photo columns as the
busiest row needs. Android saves the file (Chrome will not share .xlsx); send it
from WhatsApp › Lampirkan › Dokumen.

---

## Verified / not verified

Verified by driving the app in a browser at phone size: setup, hourly check with
a photo (badge + stamp checked at full size), incident without photos, shift
report (A and B filled from the other two), next-shift prefill, and the
workbook opened with openpyxl (3 sheets, images placed).

**Not verified — needs a real phone:** camera, GPS prompt, Add to Home Screen,
offline start, and the WhatsApp share. The test browser blocks the service worker
and has no share sheet.

---

## Open — Patrol (held by Billy on 2026-10-01, to be asked again)

Agreed so far: tidied caption "LAPORAN MONITORING PATROLI SECURITY PT PRABHU";
no badge numbers; TNI rolled into the list as the last numbered line and counted
in TOTAL PERSONIL.

Still to ask:
1. Area — typed, or a list per zone?
2. Guard Tour "Nihil" with a check listed under it — separate things, or does the
   check replace "Nihil"?
3. How often — one report per shift, or hourly as well?
4. E. Gangguan — separate incident report per disturbance, like Security?
5. G. Field Interview — same four lines every time (fixed, editable)?
6. Vehicles — a fixed list with plates, or typed?
7. Photos — how many, and should each carry its check ("Vent Cocks KP 47+900")?
8. Patrol's badge artwork.

## Open — Walkthrough

TIM 1–13 (Sheet3 of the personnel file) is the new setup, replacing the WT app's
three crews. Keep `wt-surveillance` live until the crews switch.
