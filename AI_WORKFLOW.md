# AI workflow note

## Tools used

- **Claude (Cowork, Opus model)** as a pair-programmer with a shell: scoping, schema and API design, writing code and tests, running builds, and drafting docs.
- **Playwright + Chromium**, driven from the same session, to click through the app as two or three users at once and capture screenshots, so UI work was checked by looking at it, not only by type-checking.
- **Claude in Chrome** to debug the live Vercel deployment by calling its API from the browser.

## How I worked

1. **Decide, then generate.** I fixed the stack, hosting and scope before writing code. When the free-tier constraints were checked, Render (no persistent disk) and Railway (trial only) were ruled out, which is why production is Vercel + Turso.
2. **Domain layer first, UI last.** Access rules, versions, comments, assets, presence and import were written as plain functions with Vitest tests *before* any UI. All 29 backend tests passed before the first component existed, so AI-written UI sat on verified logic.
3. **Two iterations.** v1 was a deliberately small, solid slice. v2 added depth where it mattered for a *shared* document: roles, review, history, presence. I didn't add more toolbar buttons first.
4. **Generate → run → look → correct.** Every step ended with `tsc`, `vitest`, `next build`, a Playwright run, and a review of the screenshots.

## Where AI materially sped things up

- Boilerplate-heavy pieces: about a dozen API routes, the toolbar and its dropdowns, the share dialog, the stylesheet.
- TipTap plumbing that would have meant a lot of doc-reading: the suggestion-based `/` menu, the comment-highlight decoration plugin, the bubble menu, resizable images.
- Test scaffolding: an in-memory `.docx` built with JSZip, a real Word file with an embedded image generated via python-docx, and multi-user browser tests (owner + commenter + viewer in parallel contexts).

## What I changed or rejected

| AI output / first approach | What I did instead, and why |
|---|---|
| Store comments as marks inside the document HTML | **Rejected.** Commenters would need edit rights, and every comment would create a version and could cause edit conflicts. Anchored threads by quoted text + context, drawn as decorations that follow edits, with a "text changed" state when the text disappears. |
| Snapshot a version on every save | **Rejected.** Hundreds of near-identical versions. Versions are editing *sessions* (same author, 10-minute window); restore adds a version instead of deleting history. |
| WebSockets for presence and live updates | **Rejected for this host.** Vercel functions can't hold sockets. Built one batched `/sync` heartbeat that returns version, presence and a comments-changed key; the full document is fetched only when it changed. |
| Trust the uploaded file's MIME type | **Changed.** Check magic bytes; refuse SVG (it can carry script); serve with `nosniff` and an access check per request. |
| `ALTER TABLE` to add the commenter role | **Wouldn't work.** SQLite can't alter a CHECK constraint. Wrote a migration runner and a table rebuild, plus a test that upgrades a v1-schema database, because the live Turso database already had data. |
| Plain "last write wins" saves | **Changed.** Version column + `WHERE version = ?`, with a conflict banner offering *Load theirs / Keep mine*. |
| Opening a document triggered a save (found in screenshot review: a 403 in the console for a commenter) | StarterKit's trailing-node rule changed the document on load. Disabled it, ignored updates in read-only mode, and skipped saves when the HTML hadn't changed. |
| First Vercel deploy: document routes returned an empty 500 | Diagnosed from the browser: only routes importing the HTML sanitizer failed. `sanitize-html` needs Node ≥ 22.12 for its ESM-only deps; the sandbox had Node 22, Vercel defaulted lower. Pinned Node 22.x and bundled the package. |
| Login buttons labelled by avatar + hint text | A Playwright test matched two buttons for "Alice" (Bob's hint mentions Alice). Gave each button an explicit accessible name, which is better for screen readers too. |
| Editor header on phones | Screenshot review at 390 px showed the title squeezed out; collapsed secondary actions to icons. |
| `npm i -D typescript` pulled TypeScript 7 | Pinned TS 5.9, which Next.js tooling expects. |
| Yjs/CRDT co-editing, suggestion mode, real auth | Out of scope for the timebox; documented in ARCHITECTURE.md with the next step for each. |

## How I verified correctness, UX and reliability

- **Correctness:** 30 Vitest tests over the domain layer. They cover the full permission matrix (404 vs 403), conflicts, version grouping and restore, comment resolve rules, image access and magic-byte checks, the sanitizer allow-list, presence, activity scoping, cascade deletes, schema upgrade, and all import formats including a real Word file with an image. Each test gets a fresh in-memory database.
- **End to end:** 6 Playwright tests against the production build, using two or three simultaneous users:
  - create/format/reload/share/view-only, with presence and a live edit arriving in the viewer's tab;
  - slash menu, tables, checklists, image upload, and an image URL that returns 404 for a user without access;
  - commenter → owner reply → resolve;
  - history preview and restore reaching another editor;
  - Markdown import and a rejected upload.
- **UX:** reviewed screenshots of every screen and state at desktop and phone widths, with no console errors, and fixed what looked wrong. Keyboard paths: `/` menu, `Ctrl+K` link, `Ctrl+Alt+M` comment, `Ctrl+S`, Enter/Escape on the title.
- **Reliability:** strict TypeScript and a clean `next build`. The server validates every input whatever the UI allows. Seeding and migrations are idempotent, so two concurrent cold starts are safe.
