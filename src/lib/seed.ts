import type { Client, InStatement } from "@libsql/client";

/**
 * Demo data so reviewers can test every role immediately.
 * Versioned: each seed revision runs once per database (tracked in app_meta),
 * and uses fixed ids + upserts so it is safe if two cold starts race.
 */

export const SEED_USERS = [
  // Photos are optional: anyone without one gets coloured initials.
  { id: "u_alice", email: "alice@ajaia.test", name: "Alice Tan", color: "#1d4ed8", avatar: "/avatars/alice.jpg" },
  { id: "u_bob", email: "bob@ajaia.test", name: "Bob Lim", color: "#047857", avatar: "/avatars/bob.jpg" },
  { id: "u_carol", email: "chris@ajaia.test", name: "Chris Ng", color: "#c2410c", avatar: "/avatars/chris.jpg" },
] as const;

const SEED_REVISION = "4";

const WELCOME_HTML = `<h1>Welcome to Ajaia Docs</h1>
<p>Ajaia Docs is a lightweight collaborative editor. This document is owned by <strong>Alice</strong> and shared with <strong>Bob</strong> as an editor. <mark data-color="#fde68a" style="background-color: #fde68a; color: inherit">Everything here is editable</mark> — try it.</p>
<h2>Get started</h2>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="true"><p>Sign in as one of the demo users</p></li>
<li data-type="taskItem" data-checked="false"><p>Type <code>/</code> on an empty line to insert headings, tables, images and more</p></li>
<li data-type="taskItem" data-checked="false"><p>Select some text and add a comment from the toolbar</p></li>
<li data-type="taskItem" data-checked="false"><p>Click <strong>Share</strong> and give Chris access</p></li>
<li data-type="taskItem" data-checked="false"><p>Open <strong>Version history</strong> and restore an earlier version</p></li>
</ul>
<h2>What each role can do</h2>
<table><tbody>
<tr><th><p>Role</p></th><th><p>Read</p></th><th><p>Comment</p></th><th><p>Edit</p></th><th><p>Share &amp; delete</p></th></tr>
<tr><td><p>Owner</p></td><td><p>✓</p></td><td><p>✓</p></td><td><p>✓</p></td><td><p>✓</p></td></tr>
<tr><td><p>Editor</p></td><td><p>✓</p></td><td><p>✓</p></td><td><p>✓</p></td><td><p>—</p></td></tr>
<tr><td><p>Commenter</p></td><td><p>✓</p></td><td><p>✓</p></td><td><p>—</p></td><td><p>—</p></td></tr>
<tr><td><p>Viewer</p></td><td><p>✓</p></td><td><p>—</p></td><td><p>—</p></td><td><p>—</p></td></tr>
</tbody></table>
<blockquote><p>Tip: open this document as Bob in a private window to see live presence and edits arrive.</p></blockquote>`;

const LAUNCH_HTML = `<h1>Q4 Launch Plan</h1>
<p style="text-align: center"><span style="color: #475569">Owner: Bob Lim · Status: <strong>Draft</strong></span></p>
<h2>Goals</h2>
<ol>
<li><p>Ship the collaborative editor to the internal pilot group.</p></li>
<li><p>Reach <strong>50 weekly active writers</strong> by the end of the quarter.</p></li>
<li><p>Collect structured feedback through comments, not email threads.</p></li>
</ol>
<h2>Timeline</h2>
<table><tbody>
<tr><th><p>Milestone</p></th><th><p>Date</p></th><th><p>Owner</p></th></tr>
<tr><td><p>Pilot build</p></td><td><p>Oct 28</p></td><td><p>Bob</p></td></tr>
<tr><td><p>Security review</p></td><td><p>Nov 8</p></td><td><p>Alice</p></td></tr>
<tr><td><p>Pilot launch</p></td><td><p>Nov 18</p></td><td><p>Chris</p></td></tr>
</tbody></table>
<h2>Risks</h2>
<ul>
<li><p>Simultaneous edits on the same paragraph — mitigated by conflict detection.</p></li>
<li><p>Large imported files — capped at 4 MB.</p></li>
</ul>`;

function iso(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

export async function seed(db: Client) {
  const { rows } = await db.execute({ sql: "SELECT value FROM app_meta WHERE key = 'seed'", args: [] });
  if (rows[0]?.value === SEED_REVISION) return;

  const stmts: InStatement[] = [];
  for (const u of SEED_USERS) {
    stmts.push({
      sql: `INSERT INTO users (id, email, name, color, avatar_url) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, color = excluded.color, avatar_url = excluded.avatar_url`,
      args: [u.id, u.email, u.name, u.color, u.avatar],
    });
  }

  const docs = [
    { id: "welcome", owner: "u_alice", title: "Welcome to Ajaia Docs", html: WELCOME_HTML, age: 90 },
    { id: "q4-launch", owner: "u_bob", title: "Q4 Launch Plan", html: LAUNCH_HTML, age: 45 },
  ];
  for (const d of docs) {
    stmts.push({
      sql: `INSERT INTO documents (id, owner_id, title, content, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content,
              version = documents.version + 1, updated_at = excluded.updated_at`,
      args: [d.id, d.owner, d.title, d.html, iso(d.age), iso(d.age)],
    });
    stmts.push({
      sql: `INSERT OR IGNORE INTO document_versions (id, document_id, version, title, content, author_id, label, created_at, updated_at)
            VALUES (?, ?, 1, ?, ?, ?, 'Created', ?, ?)`,
      args: [`v_${d.id}_1`, d.id, d.title, d.html, d.owner, iso(d.age), iso(d.age)],
    });
    stmts.push({
      sql: `INSERT OR IGNORE INTO activity (id, document_id, actor_id, type, detail, created_at) VALUES (?, ?, ?, 'created', NULL, ?)`,
      args: [`a_${d.id}_created`, d.id, d.owner, iso(d.age)],
    });
  }

  const shares: [string, string, string, number][] = [
    ["welcome", "u_bob", "editor", 80],
    ["q4-launch", "u_alice", "commenter", 40],
    ["q4-launch", "u_carol", "viewer", 39],
  ];
  for (const [doc, user, role, age] of shares) {
    stmts.push({
      sql: `INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(document_id, user_id) DO UPDATE SET role = excluded.role`,
      args: [doc, user, role, iso(age)],
    });
    const owner = docs.find((d) => d.id === doc)!.owner;
    const name = SEED_USERS.find((u) => u.id === user)!.name;
    stmts.push({
      sql: `INSERT OR IGNORE INTO activity (id, document_id, actor_id, type, detail, created_at) VALUES (?, ?, ?, 'shared', ?, ?)`,
      args: [`a_${doc}_share_${user}`, doc, owner, JSON.stringify({ name, role }), iso(age)],
    });
  }

  // A resolved-ready comment thread on the launch plan: Alice (commenter) asks, Bob replies.
  stmts.push(
    {
      sql: `INSERT OR IGNORE INTO comments (id, document_id, thread_id, author_id, body, quote, prefix, created_at)
            VALUES ('c_seed_1', 'q4-launch', 'c_seed_1', 'u_alice', ?, '50 weekly active writers', 'Reach ', ?)`,
      args: ["Is 50 realistic for a pilot? The pilot group is ~70 people.", iso(30)],
    },
    {
      sql: `INSERT OR IGNORE INTO comments (id, document_id, thread_id, author_id, body, created_at)
            VALUES ('c_seed_2', 'q4-launch', 'c_seed_1', 'u_bob', ?, ?)`,
      args: ["Fair point — let's treat it as a stretch goal and track it weekly.", iso(25)],
    },
    {
      sql: `INSERT OR IGNORE INTO activity (id, document_id, actor_id, type, detail, created_at) VALUES ('a_seed_comment', 'q4-launch', 'u_alice', 'commented', ?, ?)`,
      args: [JSON.stringify({ excerpt: "Is 50 realistic for a pilot?" }), iso(30)],
    },
    {
      sql: `INSERT INTO app_meta (key, value) VALUES ('seed', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      args: [SEED_REVISION],
    },
  );

  await db.batch(stmts, "write");
}
