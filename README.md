# Rola & Marco · Find your table

A small static web page. Guests type their first or last name and see their table number.
It needs no backend, database, or build step. Netlify serves the files as they are.

## Files

| File | What it is |
|---|---|
| `guests.csv` | **The guest list**: one row per guest, sorted by table. |
| `config.js` | All page text: date, welcome note, schedule, Wi-Fi, hashtag, who to ask for help. Look for `TODO`. |
| `index.html`, `style.css`, `app.js` | The page itself. You shouldn't need to touch these. |
| `fonts/` | Self-hosted fonts (Pinyon Script and Cormorant Garamond, both under the SIL Open Font License). |
| `netlify.toml`, `robots.txt` | Hosting settings: keep the page out of Google, and always serve the newest `guests.csv`. |

## Guest list format (`guests.csv`)

```
table,group,first_name,last_name,aliases,note
3,High Table · Rola Friends,Johanna,Boehm,Böhm,
4,High Table · Rola Friends,Sara,Tennis,Sarah,

5,High Table · Rola Friends,Hania +1,,,Guest of Hania Mostafa
```

- **One row per person.** Couples and families are separate rows. The list is sorted by table, with a blank row between tables.
- `group` is only for you (e.g. "Rola Friends"). Guests never see it.
- `table` holds a number (`7`) or a name (`Jasmine`). Leave it empty and the guest sees "being finalised, please ask the welcome desk".
- `aliases` (optional) lists other spellings or nicknames, separated by `|`. Guests can search with any of them.
- `note` (optional) is shown under the name. Use it only to tell apart people who share a name.
- The column order doesn't matter, and `;`-separated files (German Excel) work too.
- Start a row with `#` to hide that guest temporarily.

**Easiest workflow:** keep the list in Excel or Google Sheets with these column headers, then save or download it as CSV (UTF-8) named `guests.csv` into this folder. `.xlsx` files are git-ignored, so your master spreadsheet never gets published.

## How search works

- Capital letters, extra spaces, accents (José = jose), apostrophes and hyphens are all ignored (O'Brien = obrien, Abdel-Aziz = abdelaziz).
- Partial names work ("moh"), as does a full name in any order ("rossi chiara").
- German spellings: Müller = muller = mueller, Groß = gross.
- Typos and sound-alikes get "Did you mean…" suggestions (Rosi → Rossi, Mahmod → Mahmoud, Muhammad → Mohamed).
- More than 8 matches asks for more letters. Numbers, emoji and Arabic script get a friendly hint.
- The phone remembers the last table found, so a guest reopening the page sees it straight away.
- `?name=Rossi` in the URL pre-fills the search.

## Preview locally

Opening `index.html` by double-clicking won't load the CSV, because browsers block that. Run this in this folder instead:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy (Netlify + GitHub)

1. Push this folder to a GitHub repo.
2. In Netlify, choose **Add new site → Import from Git**, pick the repo, leave the build command empty and set the publish directory to `.`
3. Set a fixed subdomain (Site settings → Domain), e.g. `rola-and-marco.netlify.app`, **before** making the QR code.
4. To change seating on the day, edit `guests.csv` and push. Netlify updates in about 30 seconds and the QR code keeps working.

## Privacy note

The page is hidden from search engines. Anyone who opens the link could still technically read `guests.csv`, which holds names and table numbers only. Don't put phone numbers or other personal data in it.
