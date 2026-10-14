# Architecture note

## What I prioritised

The brief asks for breadth (editing, upload, sharing, persistence, deploy) inside 4–6 hours. I chose to make the **core loop dependable** — write → autosave → reopen → share → the other person sees the right thing with the right permissions — rather than add more editor features. Concretely, depth went into:

1. **Access control that lives on the server**, in one module, with tests.
2. **Saving that doesn't lose work**: debounced autosave, a single in-flight request, retry on network failure, and optimistic concurrency so two people can't silently overwrite each other.
3. **An import path that produces real, editable structure** (headings, lists, emphasis), not a blob of text.

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript | One deployable unit for UI + API; server components load data without a client round trip. |
| Editor | TipTap 3 (ProseMirror) | Mature rich-text model, schema-enforced content, keyboard + Markdown shortcuts for free. |
| Storage | libSQL / SQLite (`@libsql/client`) | Plain relational model for docs + shares. Same driver for a local file, in-memory tests and hosted Turso — no ORM, no migration tool. |
| Import | `mammoth` (.docx), `marked` (.md) | Pure JS, no native deps, works on serverless. |
| Hosting | Vercel + Turso free tiers | Free for reviewers; Render's free tier has no persistent disk and Railway is trial-credit only. |

## Data model

```
users(id, email, name, color)
documents(id, owner_id → users, title, content HTML, version, created_at, updated_at)
document_shares(document_id → documents, user_id → users, role ∈ {viewer, editor}, PK(document_id, user_id))
```

- **Content is stored as sanitised HTML.** TipTap round-trips it losslessly for the formatting we support, it's human-readable in the DB, and it exports trivially. (ProseMirror JSON would be better for a future real-time/CRDT layer — noted below.)
- **Ownership is a column, not a share row**, so there is always exactly one owner and "owned vs shared" is a simple query.

## Access model

`src/lib/documents.ts` resolves the caller's role for every operation, so routes never make permission decisions themselves:

| Action | Owner | Editor | Viewer | No access |
|---|---|---|---|---|
| Read, export, see collaborators | ✓ | ✓ | ✓ | 404 |
| Edit content / rename | ✓ | ✓ | 403 | 404 |
| Share, change role, remove | ✓ | 403 | 403 | 404 |
| Delete | ✓ | 403 | 403 | 404 |

Users without access get **404, not 403**, so document ids can't be probed. Sharing is by email against existing accounts; re-sharing updates the role (upsert).

## Saving and collaboration

- The editor queues changes and sends one `PATCH` ~800 ms after typing stops (or on `Ctrl+S` / title blur). Edits made while a save is in flight are batched into the next request. Network failures retry every 3 s; the status pill always shows the truth, and the browser warns before leaving with unsaved changes.
- Each `PATCH` carries the `baseVersion` the client last saw. The `UPDATE … WHERE version = ?` is atomic; if it affects 0 rows the API returns **409** and the UI offers "Load their version" or "Keep mine (overwrite)".
- While a document is open and fully saved, the client polls every 5 s and applies newer versions, so viewers and idle collaborators see changes without refreshing. This is deliberately **not** real-time co-editing — see trade-offs.

## Security / validation

- All stored HTML (editor saves, API calls, imports) passes an allow-list sanitiser — scripts, event handlers, styles, iframes and `javascript:` links are stripped server-side.
- Title (1–200 chars), content size (1 MB), upload type/size (4 MB, under Vercel's 4.5 MB request cap), share role and email are validated with clear messages; API errors share one JSON shape.
- Session cookie is an HMAC-signed user id (`httpOnly`, `sameSite=lax`, `secure` in production). It can't be forged by editing the cookie; the only shortcut is that login has no password.

## Deliberately deprioritised

| Cut | Why | Next step |
|---|---|---|
| Real auth (passwords/OAuth) | Doesn't demonstrate anything new for this brief; the authorisation layer is what matters and is real. | Swap `auth.ts` for Auth.js; nothing else changes. |
| Real-time co-editing (cursors, merge of simultaneous keystrokes) | Correct implementation needs Yjs + a WebSocket service — too much for the timebox, and Vercel functions can't hold sockets. Version checks + polling give safe, visible behaviour instead. | Yjs + Hocuspocus/Liveblocks, store ProseMirror JSON/Yjs updates. |
| Sharing with people who don't have an account / link sharing | Needs invitations and email. | Pending-invite table keyed by email. |
| Images, tables, comments, version history | Each is a feature in its own right. | Version history is cheapest: snapshot on save into a `document_versions` table. |
| Import into an existing doc, attachments | One clear upload flow (file → new doc) covers the requirement. | Reuse `convertFileToHtml` and insert at cursor. |
| Pagination/search on the documents list | Demo data is small. | `LIMIT/OFFSET` + `LIKE` on title. |

## Known limitations

- Polling sync is last-saved-wins at whole-document granularity; two editors typing at the same moment will hit the conflict banner rather than merge.
- Deployed setup was verified locally against SQLite; Turso uses the same libSQL driver and SQL, but I didn't have a Turso instance in the build environment to run the test suite against.
