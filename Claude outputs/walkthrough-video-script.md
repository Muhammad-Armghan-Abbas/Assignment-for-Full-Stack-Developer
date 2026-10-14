# Walkthrough video script (≈4 min)

**Setup before recording:** two browser windows side by side: normal (Alice) and private (Bob). Have `sample-files/` open in Explorer. Record with Loom, set to *unlisted*.

---

### 0:00 – 0:20 · Intro
> "Hi, I'm Armaghan. This is Ajaia Docs, a lightweight collaborative editor. I focused on making a shared document something people can trust: clear permissions, never losing work, and reviewing without editing. Everything you'll see is on the live Vercel deployment."

### 0:20 – 1:20 · Main flow (Alice)
1. Sign in as **Alice**. Point at **My documents** vs **Shared with me**, the role badges, and the activity feed.
2. **Import file** → `q1-pilot-report.docx`.
   > "Word import keeps the headings, the table and the embedded chart, which is stored as a real access-controlled image."
3. Resize the chart. Rename the document. Type `/` → insert a **checklist**. Bold a word. Point at the **"All changes saved"** indicator.
4. Refresh the page: everything persists.

### 1:20 – 2:20 · Sharing and collaboration
1. **Share** → bob@ajaia.test as **Commenter**, carol@ajaia.test as **Viewer**.
2. In the Bob window, open it from **Shared with me**.
   > "Alice sees Bob's avatar appear. Bob is a commenter, so there's no toolbar, but he can select text and comment."
3. Bob comments on "52 weekly active writers". Switch to Alice: the comment appears within seconds. Reply, then **Resolve**.
4. Alice edits a paragraph; it appears in Bob's window without a refresh.

### 2:20 – 2:50 · Safety nets
1. Alice → **Version history** → preview the "Imported from…" version → **Restore**.
   > "Restoring adds a new version, so a restore can itself be undone."
2. Try importing `unsupported-example.csv`: a clear error. Mention that the server enforces permissions, and a viewer's edit request is rejected even if the UI is bypassed.

### 2:50 – 3:30 · Key decisions and what I cut
> "A few decisions: permissions live in one module and are enforced on every API route, including image URLs. Saves use optimistic concurrency, so two people can't silently overwrite each other. Comments are anchored by quoted text rather than stored in the document, which is why commenters don't need edit rights. Presence uses a single heartbeat endpoint, because Vercel functions can't hold WebSockets.
> I deliberately didn't build real auth, character-level co-editing, or suggestion mode. Those are my next steps, and they're explained in the architecture note."

### 3:30 – 4:00 · How AI helped
> "I used Claude as a pair-programmer with a shell and a real browser. I built and tested the domain layer before any UI. Then I ran each change through type-checks, 31 unit tests, 6 multi-user browser tests and screenshot review. Some AI defaults I rejected: storing comments inside the document, snapshotting every save, and trusting uploaded file types. Screenshot review also caught a bug where opening a document triggered a save. The AI workflow note lists these."

### Close
> "Links, demo accounts and the test script are in SUBMISSION.md. Thanks for watching."
