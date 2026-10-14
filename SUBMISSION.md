# Submission — Ajaia Docs

## Links

- **Live app:** _<add Vercel URL>_
- **Walkthrough video:** see `VIDEO_URL.txt`
- **Source code:** this folder (also _<add GitHub URL if public>_)

## Test accounts

Login is mocked — pick a user on the sign-in page, no password.

| User | Email | Starting state |
|---|---|---|
| Alice Tan | alice@ajaia.test | Owns "Welcome to Ajaia Docs" |
| Bob Lim | bob@ajaia.test | Can edit Alice's welcome doc |
| Carol Ng | carol@ajaia.test | Nothing shared — use to test sharing |

Use two browser windows (one private) to be two users at once.

## What's included

| Item | Location |
|---|---|
| Source code | `src/`, `tests/`, `e2e/`, config files at the root |
| Setup & run instructions | `README.md` |
| Architecture note | `ARCHITECTURE.md` |
| AI workflow note | `AI_WORKFLOW.md` |
| This file | `SUBMISSION.md` |
| Walkthrough video URL | `VIDEO_URL.txt` |
| Screenshots | `docs/screenshots/` |
| Automated tests | `tests/` (Vitest, 15 tests), `e2e/` (Playwright, 3 tests) |

## Status

**Working end to end**

- Create, rename, edit, autosave, reopen, delete documents
- Bold, italic, underline, strikethrough, H1–H3, bulleted/numbered lists, quotes, undo/redo
- Import `.txt`, `.md`, `.docx` → new editable document (structure preserved)
- Share by email as editor or viewer; change role; remove access; owned vs shared lists
- Server-enforced permissions (viewer read-only, non-shared 404)
- Conflict detection between simultaneous editors; collaborators' saved changes appear within ~5 s
- Export to Markdown / HTML / Print-to-PDF
- Persistence in SQLite (local) / Turso (deployed)

**Intentionally not built** (reasoning in `ARCHITECTURE.md`)

- Real authentication (mocked user picker; authorisation is real)
- Character-level real-time co-editing and live cursors
- Sharing with people who have no account; link sharing
- Images, tables, comments, version history

**With another 2–4 hours I would build**

1. Version history (snapshot per save, list + restore) — cheapest high-value safety net for shared docs.
2. Presence indicators ("Bob is viewing") using the existing polling endpoint.
3. Real auth via Auth.js with email magic links, plus invite-by-email for people without accounts.
