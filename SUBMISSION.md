# Submission — Ajaia Docs

## Links

- **Live app:** https://ajaia-docs-gilt-xi.vercel.app
- **Walkthrough video:** see `VIDEO_URL.txt`
- **Source code:** this folder (also _<add GitHub URL if public>_)

## Test accounts

Login is mocked: pick a user on the sign-in page, no password. Use a second browser or a private window to be two people at once.

| User | Email | Starting state |
|---|---|---|
| Alice Tan | alice@ajaia.test | Owns "Welcome to Ajaia Docs"; **commenter** on Bob's "Q4 Launch Plan" |
| Bob Lim | bob@ajaia.test | Owns "Q4 Launch Plan" (has a comment thread); **editor** on Alice's welcome doc |
| Chris Ng | chris@ajaia.test | **Viewer** on the launch plan; use him to test sharing |

**Suggested 3-minute review path:**
1. Alice: open the welcome doc. Type `/` on an empty line, then try a table, an image and a checklist.
2. Select a sentence and comment on it.
3. Share the doc with Chris as a commenter.
4. In a private window, sign in as Chris. Open the doc (Alice's avatar shows she's there) and reply to the comment. Commenters can't edit the text.
5. Back as Alice, resolve the thread, then open **Version history** and restore an earlier version. Chris's tab updates on its own.

## What's included

| Item | Location |
|---|---|
| Source code | `src/`, `tests/`, `e2e/`, config files at the root |
| Setup & run instructions | `README.md` |
| Architecture note | `ARCHITECTURE.md` |
| AI workflow note | `AI_WORKFLOW.md` |
| This file | `SUBMISSION.md` |
| Walkthrough video URL | `VIDEO_URL.txt` |
| Screenshots | `docs/screenshots/` (desktop and mobile) |
| Automated tests | `tests/` (Vitest, 31 tests), `e2e/` (Playwright, 6 multi-user browser tests) |

## Status

**Working end to end**

- Documents: create (blank or template), rename, autosave, reopen, delete; conflict detection between simultaneous editors.
- Rich text: bold, italic, underline, strikethrough, colour, highlight, font size, H1–H3, alignment, bulleted/numbered lists, checklists, quotes, code blocks, dividers, links.
- Tables with row/column tools, and resizable images (upload, paste, drag-drop). The `/` command menu, selection toolbar, outline, and word count.
- Import `.txt` / `.md` / `.docx` (Word images included) as a new document. Export Markdown / HTML / PDF.
- Sharing: editor / commenter / viewer roles, change or remove access, owned vs shared lists, search and sort.
- Comment threads anchored to text, with replies, resolve/reopen and delete.
- Version history with preview and non-destructive restore.
- Live presence and collaborators' changes arriving without refresh; an activity feed.
- Server-enforced permissions everywhere, including image URLs.
- Persistence in SQLite (local) / Turso (deployed), with schema migrations.

**Intentionally not built** (reasoning in `ARCHITECTURE.md`)

- Real authentication (a mocked user picker; authorisation is real).
- Character-level real-time co-editing and live cursors (CRDT).
- Invites for people without accounts; link sharing.
- Suggestion mode / tracked changes.

**With another 2–4 hours I would build**

1. Yjs-based co-editing on a small WebSocket service (e.g. Hocuspocus on Fly.io), keeping the current HTML snapshots for history, search and export.
2. Suggestion mode built on the existing comment-anchoring approach.
3. Real auth (Auth.js magic links) plus invite-by-email for people without accounts.
