# Submission: Ajaia Docs

**Candidate:** Muhammad Armaghan Abbas · armaghanabbas11@gmail.com · +92 325 9377334 (phone / WhatsApp)
[GitHub](https://github.com/Muhammad-Armghan-Abbas) · [LinkedIn](https://www.linkedin.com/in/armghan-abbas)

## Links

| | |
|---|---|
| **Live app** | https://ajaia-docs-gilt-xi.vercel.app |
| **Source code** | https://github.com/Muhammad-Armghan-Abbas/Assignment-for-Full-Stack-Developer (also in this folder) |
| **Walkthrough video** | see `VIDEO_URL.txt` |
| **Submission report (PDF)** | `SUBMISSION_REPORT.pdf`: requirement-by-requirement coverage with live screenshots |

## Test accounts

Login is mocked: pick a user on the sign-in page, no password. Use a second browser or a private window to be two people at once.

| User | Email | Starting state |
|---|---|---|
| Alice Tan | alice@ajaia.test | Owns "Welcome to Ajaia Docs" and "Q1 Pilot Report"; commenter on Bob's "Q4 Launch Plan" |
| Bob Lim | bob@ajaia.test | Owns "Q4 Launch Plan"; editor on Alice's welcome doc; **commenter** on the Q1 Pilot Report (with a comment thread) |
| Chris Ng | chris@ajaia.test | **Viewer** on the Q4 Launch Plan and Q1 Pilot Report; use him to test sharing |

**3-minute review path**
1. Sign in as **Alice**. Import `sample-files/q1-pilot-report.docx`: headings, table, link and the embedded chart come through.
2. Type `/` on an empty line to insert a table or checklist. Select a sentence and click **Comment**.
3. **Share** the document with bob@ajaia.test as **Commenter**.
4. In a private window, sign in as **Bob** and open it from **Shared with me**. Alice sees Bob's avatar appear. Bob can reply to comments but can't edit.
5. As Alice, resolve the thread, edit a paragraph, then open **Version history**, preview the "Imported" version and **Restore** it. Bob's window updates on its own.

## What's included

| Item | Location |
|---|---|
| Source code | `src/`, `tests/`, `e2e/`, config files at the root |
| Setup & run instructions | `README.md` |
| Architecture note | `ARCHITECTURE.md` |
| AI workflow note | `AI_WORKFLOW.md` |
| Submission report | `SUBMISSION_REPORT.pdf` |
| This file | `SUBMISSION.md` |
| Walkthrough video URL | `VIDEO_URL.txt` |
| Screenshots (from the live deployment) | `docs/screenshots/` (11 images) |
| Sample files for testing import, images and validation | `sample-files/` (with a 10-minute test script in its README) |
| Automated tests | `tests/` (Vitest, 31 tests), `e2e/` (Playwright, 6 multi-user browser tests) |

## Status

**Working end to end**

- **Documents:** create (blank, template or import), rename, autosave, reopen and delete, with conflict detection between simultaneous editors.
- **Rich text:**
  - bold, italic, underline, strikethrough;
  - colour, highlight and font size;
  - H1–H3 and alignment;
  - bulleted, numbered and checklist lists;
  - quotes, code blocks, dividers and links.
- **Tables and images:** tables with row/column tools, and resizable images (upload, paste or drag-drop). Also the `/` command menu, selection toolbar, outline and word count.
- **Import and export:** `.txt` / `.md` / `.docx` import, including images inside Word files. Export to Markdown, HTML or Print → PDF.
- **Sharing:** editor / commenter / viewer roles; change or remove access; owned vs shared lists, with search and sort.
- **Comments:** threads anchored to text, with replies, resolve/reopen and delete.
- **Version history:** preview any version and restore it without losing history.
- **Collaboration:** live presence with profile photos, collaborators' changes arriving without a refresh, and an activity feed.
- **Permissions:** enforced on the server everywhere, including image URLs.
- **Storage:** SQLite locally and Turso in production, with schema migrations that upgraded the live database in place.

**Intentionally not built** (reasoning in `ARCHITECTURE.md`)

- Real authentication: there's a mocked user picker, but authorisation is real.
- Character-level real-time co-editing and live cursors (CRDT).
- Invites for people without accounts, and link sharing.
- Suggestion mode / tracked changes.

**With another 2–4 hours I would build**

1. Yjs-based co-editing on a small WebSocket service (e.g. Hocuspocus on Fly.io), keeping the current HTML snapshots for history, search and export.
2. Suggestion mode, built on the existing comment-anchoring approach.
3. Real auth (Auth.js magic links) plus invite-by-email for people without accounts.
