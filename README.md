# What’s truly new? · CL day gap analysis site

A static site for GitHub Pages. The start page asks for a grade.

- **Grade 7** is the October 8 gap analysis. Leads rate their table's topics on their own laptops, each table works from one shared screen, and the facilitator view collects everything and downloads it as CSV.
- **Grades 8 and 9** (added 2026-11-23) have no tables. Everyone rates every topic on their own laptop, and the results page shows the whole room and downloads it as CSV.

- `#/` start page. Choose Grade 7, 8 or 9.
- `#/7` Grade 7 start. Leads choose their table.
- `#/rate/A` personal ratings for Table A (Step 1).
- `#/table/A` the shared table screen. Live tallies, verdicts, where we disagreed, briefs (Steps 2 and 3).
- `#/room` Grade 7 facilitator view. All tables, whole-course summary, downloads.
- `#/8`, `#/9` Grade 8 or 9 start. `#/8/rate` rates every topic. `#/8/results` is the results and downloads page (same for 9).

Each grade has its own session in Firestore: `cl-2026-10-08` (Grade 7), `cl-2026-gr8` and `cl-2026-gr9`. They are set in `config.js`.

With an empty `config.js` the site runs in **demo mode**. Answers stay in that one browser. Use it to look around. It collects nothing.

## Setup

Follow `Setup Guide.md` in this folder. It walks through every click.

To practise without touching the real data, add `?session=practice` to the address.

## On the day
- Put the start page URL (or a QR code for it) on the screen.
- One laptop per table opens the table screen. The others close once their ratings are in.
- You keep `#/room` open. Download all five files before you leave. The JSON file is the full backup.
- If the Wi-Fi drops, ratings save on the laptop and send when it reconnects. If the site will not load at all, use the paper sheets.

## What the data looks like
- **Ratings CSV.** One row per person per statement. Participants are labelled A01, A02 and so on. Columns include the old program ticks (1 or 0), Me, Most teachers and the note.
- **Statement summary CSV.** One row per statement, with counts, the share of leads who said most teachers must learn it, and the table verdict.
- **Table verdicts CSV.** Every statement’s verdict and note, plus each table’s “where we disagreed” text.
- **Briefs CSV.** Every brief.

## Privacy
No names, emails or school names are collected. Each laptop gets a random anonymous ID from Firebase. Anyone with the link can read the session while the site is up, so take it down or change the rules to `allow read, write: if false;` after you download the data.

## Files
`index.html`, `styles.css`, `app.js` (views), `store.js` (data layer), `data.js`, `data8.js`, `data9.js` (topics, descriptions and statements for each grade, verbatim from the June 2026 draft), `config.js` (your Firebase settings), `firebase-bundle.js` (Firebase SDK 10.14, bundled so nothing loads from a CDN), `firestore.rules`.
<!-- colleague-scan: 2026-10-09 | hash:8cb6358a -->
<!-- school-scan: 2026-10-09 | hash:8cb6358a -->
