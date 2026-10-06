# What’s truly new? · CL day gap analysis site

A static site for GitHub Pages. Leads rate the Grade 7 statements on their own laptops, each table works from one shared screen, and the facilitator view collects everything and downloads it as CSV.

- `#/` start page. Leads choose their table.
- `#/rate/A` personal ratings for Table A (Step 1).
- `#/table/A` the shared table screen. Live tallies, verdicts, where we disagreed, briefs (Steps 2 and 3).
- `#/room` facilitator view. All tables, whole-course summary, downloads.

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
`index.html`, `styles.css`, `app.js` (views), `store.js` (data layer), `data.js` (the 107 statements, verbatim from the June 2026 draft), `config.js` (your Firebase settings), `firebase-bundle.js` (Firebase SDK 10.14, bundled so nothing loads from a CDN), `firestore.rules`.
