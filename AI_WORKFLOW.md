# AI workflow note

## Tools used

- **Claude (Cowork, Opus model)** as a pair-programmer with a shell: scoping, scaffolding, writing code and tests, running the build/tests/browser checks, and drafting docs.
- **Playwright + Chromium**, driven from the same session, to click through the app and capture screenshots so UI changes were checked visually, not just by type-checking.

## How I used it

1. **Decide before generating.** I fixed the stack (Next.js + SQLite) and deployment target up front, then had the assistant check the constraints that mattered — Render's free tier has no persistent disk, Railway is trial-credit only — which is why production uses Vercel + Turso (free, SQLite-compatible, same driver).
2. **Domain layer first, UI last.** Access rules, validation and import conversion were written as plain functions with Vitest tests *before* any UI, so the AI-written UI sat on top of logic that was already verified.
3. **Generate → run → look → correct.** Every step ended with `tsc`, `vitest`, `next build` and a Playwright run; screenshots were reviewed by eye.

## Where AI materially sped things up

- Boilerplate-heavy pieces: API route handlers, the share dialog, CSS for a Docs-like page layout, the toolbar wiring to TipTap.
- Test scaffolding — including generating a valid `.docx` in-memory (JSZip) so the Word import path is tested with a real file rather than mocked.
- A full browser E2E test across two user sessions (owner + viewer) in one pass.

## What I changed or rejected

| AI output / default | What I did |
|---|---|
| `npm i -D typescript` pulled TypeScript 7 | Pinned TS 5.9 — Next.js tooling expects the TS 5 API. |
| Render/Railway with a local SQLite file | Rejected: data would be wiped on free tiers. Switched to libSQL so the same code runs on a file locally and Turso in production. |
| 5 MB upload limit | Lowered to 4 MB — Vercel rejects request bodies over 4.5 MB, which would have produced an opaque error. |
| Plain "last write wins" save | Added a `version` column and `WHERE version = ?` check with a conflict banner; silent overwrites are the worst failure for a shared doc. |
| Sticky floating toolbar | Screenshot review showed it covering document text when scrolled; moved header + toolbar into one sticky bar. |
| Seeding with `count = 0 → insert` | Made it idempotent (`INSERT OR IGNORE`, fixed ids) — two serverless cold starts could race and crash the second. |
| Running schema statements one by one | Batched into one round trip; matters on a cold start against a remote DB. |
| Yjs/CRDT real-time editing | Rejected for this timebox (needs a socket server Vercel can't host); chose version checks + 5 s polling and documented the gap. |
| First Vercel deploy: document routes returned an empty 500 | Diagnosed by calling the API from the browser — only routes importing the HTML sanitizer failed. `sanitize-html` now pulls ESM-only dependencies that need Node ≥ 22.12; my sandbox had Node 22, Vercel defaulted lower. Pinned `engines.node` to 22.x and let Next bundle the package instead of loading it externally. Lesson: match the runtime version locally before the first deploy. |
| E2E selector `getByRole("alert")` | Failed because Next.js injects its own route-announcer alert; scoped selectors by text. |

## How I verified correctness, UX and reliability

- **Correctness:** 15 Vitest tests over the domain layer (permissions matrix, 404 vs 403, conflicts, sanitisation, all three import formats, error cases), run against a fresh in-memory database each time.
- **End to end:** 3 Playwright tests run against the production build — create/format/reload/share/view-only/live update across two browser contexts, Markdown import, rejected upload.
- **UX:** reviewed screenshots of each screen (home, editor, share dialog, viewer) and fixed what looked wrong; checked keyboard flows (Enter/Escape on title, `Ctrl+S`), empty states, error messages.
- **Reliability:** `tsc --noEmit` strict mode and `next build` clean; server-side validation on every input regardless of what the UI allows.
