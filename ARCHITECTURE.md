# Architecture note

## What I prioritised

The brief rewards depth over breadth. I treated the product as **"a shared document people can trust"** and put the depth into the parts that make collaboration safe and legible:

1. **Access control that lives on the server in one place** (`lib/access.ts`), with four roles and a test for every rule. The UI only reflects it.
2. **Never losing work**: debounced autosave with a single in-flight request and retry, optimistic-concurrency conflict detection, and version history where even a restore is reversible.
3. **Review without edit rights**: a commenter role and comment threads that don't modify the document.
4. **Files that keep their structure**: imports produce real headings, lists and tables, and Word images become stored, access-controlled assets.

Then I added editor breadth (tables, images, slash menu, colours, outline) on top of that foundation, and a branded UI.

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript strict | One deployable unit; server components load data with no client round trip. |
| Editor | TipTap 3 (ProseMirror) | Schema-enforced content, decorations, suggestion API, resizable node views. |
| Storage | libSQL / SQLite via `@libsql/client` | Same driver for a local file, in-memory tests and hosted Turso. Plain SQL, no ORM. |
| Import | `mammoth` (.docx), `marked` (.md) | Pure JS; work on serverless. |
| Hosting | Vercel + Turso free tiers | Free for reviewers. Render's free tier has no persistent disk; Railway is trial-only. |

## Data model

```
users(id, email, name, color)
documents(id, owner_id, title, content HTML, version, created_at, updated_at)
document_shares(document_id, user_id, role ∈ {viewer, commenter, editor})
document_versions(id, document_id, version, title, content, author_id, label, created_at, updated_at)
comments(id, document_id, thread_id, author_id, body, quote, prefix, resolved, resolved_by, created_at)
assets(id, document_id, uploader_id, mime, size, data BLOB, created_at)
presence(document_id, user_id, editing, last_seen)
activity(id, document_id, actor_id, type, detail JSON, created_at)
schema_migrations, app_meta
```

**Migrations.** Forward-only, transactional, recorded in `schema_migrations`. Migration 2 rebuilds `document_shares` to add the commenter role, because SQLite can't alter a CHECK constraint. A test creates a database with the first release's schema and checks it upgrades without losing shares. This matters because the live Turso database already had data.

## Access model (`lib/access.ts`)

|            | read | comment | edit / history | share, delete |
|------------|:---:|:---:|:---:|:---:|
| owner      | ✓ | ✓ | ✓ | ✓ |
| editor     | ✓ | ✓ | ✓ | |
| commenter  | ✓ | ✓ | | |
| viewer     | ✓ | | | |
| no access  | 404 | 404 | 404 | 404 |

Every service function calls `authorize(db, user, doc, action)`. That covers documents, shares, comments, versions, presence, and image bytes: `GET /api/assets/:id` checks the image's document. A user with no access gets 404, never 403, so document ids can't be probed.

## Key design decisions

**Saving and conflicts.** The client queues edits and sends one `PATCH` about 800 ms after typing stops. Edits made while a save is in flight go in the next request; network failures retry every 3 s. Each `PATCH` carries the `baseVersion` it was based on, and `UPDATE … WHERE version = ?` is atomic. If someone else saved first, the server returns 409 and the user chooses *Load theirs* or *Keep mine*. Nothing is ever silently overwritten.

**Version history.** Saves happen every second or so, so storing each one would be noise. A version is an **editing session**: while the same person keeps editing within 10 minutes, their latest snapshot is updated in place. A different author, a pause, an import or a restore starts a new one. Restoring copies the old content forward as a new version, so a restore can itself be undone.

**Comments are anchored by quote, not by marks in the HTML.** Each thread stores the selected text plus up to 40 characters before it. The client finds that text in the live document and draws a ProseMirror **decoration**, which is mapped through edits so it follows the text while people type. This means:
- commenters don't need write access to the document body;
- comments create no document versions and no edit conflicts;
- if the passage is rewritten, the thread survives and is labelled "text changed".

The trade-off: if the same phrase with the same context appears twice, the first one is used.

**Presence and live updates without WebSockets.** Vercel functions can't hold sockets. Each open editor calls `POST /sync` every 4 s: one batched round trip that records a heartbeat and returns the document version, who's present (seen within 20 s, and whether they're editing), and a key that changes when comments change. The client fetches the full document or comment list only when something changed. A tab that closes sends a `sendBeacon` so the user leaves the avatar stack straight away.

**Images.** Stored as BLOBs next to their document. This keeps one service to deploy, and Turso's free tier is plenty for a demo. Uploads are checked by **magic bytes**, not the browser's claimed MIME type, and SVG is refused because it can carry script. Responses are `private, immutable` with `nosniff`. Word imports pull embedded images out through mammoth's image hook and store them as assets of the new document.

**Security.** All stored HTML (editor saves, API calls, imports, restores) passes an allow-list sanitiser that mirrors exactly what the editor can produce. Inline styles are limited to colour, highlight, alignment, font size and table widths, each value-checked. Images must point at the app's own asset endpoint, so documents can't carry tracking pixels. The session cookie is an HMAC-signed user id (`httpOnly`, `sameSite=lax`, `secure` in production).

## Deliberately not built

| Cut | Why | What I'd do |
|---|---|---|
| Real authentication | Shows nothing new here; authorisation is the interesting part, and it is real. | Auth.js with email magic links; only `auth.ts` changes. |
| Character-level co-editing (CRDT) and live cursors | Needs Yjs plus a socket server that Vercel can't host. Version checks, 4 s sync and presence give safe, visible collaboration instead. | Yjs + Hocuspocus or Liveblocks; store Yjs updates, keep the HTML snapshot for search, export and history. |
| Inviting people without an account, link sharing | Needs invitations and email delivery. | A pending-invites table keyed by email, claimed on first sign-in. |
| Suggestion mode / tracked changes | A large feature on its own; comments cover review. | ProseMirror marks for insert/delete with accept/reject. |
| Object storage for images | BLOBs in Turso are fine at demo scale. | S3 or R2 with signed URLs; the asset table keeps the access check. |

## Known limitations

- Two editors typing in the same second will get the conflict banner rather than a merge.
- Exported HTML/Markdown links to images on the app, so they only display for signed-in users with access.
- The automated suites run against local SQLite. Turso uses the same libSQL driver and SQL, and the deployed instance is checked by hand after each deploy.
