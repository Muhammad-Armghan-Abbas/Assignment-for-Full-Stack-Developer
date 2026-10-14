import { beforeEach, describe, expect, it } from "vitest";
import { listActivity } from "@/lib/activity";
import { readAsset, storeAsset } from "@/lib/assets";
import { createThread, deleteComment, listThreads, replyToThread, setResolved } from "@/lib/comments";
import { createDb, migrate, type Db } from "@/lib/db";
import { createDocument, deleteDocument, getDocument, shareDocument, updateDocument } from "@/lib/documents";
import { AppError } from "@/lib/errors";
import { sync } from "@/lib/presence";
import { sanitizeDocumentHtml } from "@/lib/sanitize";
import { getVersion, listVersions, restoreVersion } from "@/lib/versions";
import { ALICE, BOB, CAROL, testDb } from "./helpers";

async function expectStatus(p: Promise<unknown>, status: number) {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(status);
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let db: Db;
beforeEach(async () => {
  db = await testDb();
});

describe("commenter role", () => {
  it("can read and comment but not edit; viewers can do neither", async () => {
    const doc = await createDocument(db, ALICE, { content: "<p>Ship it in November</p>" });
    await shareDocument(db, ALICE, doc.id, { email: "bob@ajaia.test", role: "commenter" });
    await shareDocument(db, ALICE, doc.id, { email: "carol@ajaia.test", role: "viewer" });

    expect((await getDocument(db, BOB, doc.id)).role).toBe("commenter");
    await expectStatus(updateDocument(db, BOB, doc.id, { content: "<p>x</p>", baseVersion: doc.version }), 403);
    const threads = await createThread(db, BOB, doc.id, { body: "Which week?", quote: "November", prefix: "Ship it in " });
    expect(threads).toHaveLength(1);

    await expectStatus(createThread(db, CAROL, doc.id, { body: "hi", quote: "Ship" }), 403);
    expect(await listThreads(db, CAROL, doc.id)).toHaveLength(1); // but viewers can read the discussion
  });
});

describe("comments", () => {
  it("threads replies, and lets the author or an editor resolve", async () => {
    const doc = await createDocument(db, ALICE, { content: "<p>Budget is 10k</p>" });
    await shareDocument(db, ALICE, doc.id, { email: "bob@ajaia.test", role: "commenter" });
    await shareDocument(db, ALICE, doc.id, { email: "carol@ajaia.test", role: "commenter" });

    const [thread] = await createThread(db, BOB, doc.id, { body: "Too low?", quote: "10k" });
    let threads = await replyToThread(db, ALICE, doc.id, thread.id, { body: "Agreed, raising it." });
    expect(threads[0].messages.map((m) => m.author.id)).toEqual([BOB, ALICE]);

    await expectStatus(setResolved(db, CAROL, doc.id, thread.id, true), 403); // another commenter can't
    threads = await setResolved(db, BOB, doc.id, thread.id, true); // the author can
    expect(threads[0].resolved).toBe(true);

    threads = await replyToThread(db, CAROL, doc.id, thread.id, { body: "Reopening — finance disagrees" });
    expect(threads[0].resolved).toBe(false); // replying reopens
  });

  it("validates input and restricts deletion", async () => {
    const doc = await createDocument(db, ALICE, { content: "<p>Text</p>" });
    await shareDocument(db, ALICE, doc.id, { email: "bob@ajaia.test", role: "editor" });
    await expectStatus(createThread(db, BOB, doc.id, { body: "   ", quote: "Text" }), 400);
    await expectStatus(createThread(db, BOB, doc.id, { body: "x", quote: "" }), 400);
    await expectStatus(createThread(db, BOB, doc.id, { body: "x".repeat(2001), quote: "Text" }), 400);

    const [t] = await createThread(db, BOB, doc.id, { body: "Bob's note", quote: "Text" });
    await expectStatus(createThread(db, CAROL, doc.id, { body: "no access", quote: "Text" }), 404);
    const [a] = await createThread(db, ALICE, doc.id, { body: "Alice's note", quote: "Text" }).then((ts) => ts.filter((x) => x.id !== t.id));
    await expectStatus(deleteComment(db, BOB, doc.id, a.id), 403); // not his
    expect(await deleteComment(db, ALICE, doc.id, t.id)).toHaveLength(1); // owner can moderate
  });
});

describe("version history", () => {
  it("groups one person's continuous edits into one version, and starts a new one for another author", async () => {
    const doc = await createDocument(db, ALICE, { content: "<p>v1</p>" });
    await shareDocument(db, ALICE, doc.id, { email: "bob@ajaia.test", role: "editor" });
    let d = await updateDocument(db, ALICE, doc.id, { content: "<p>v2</p>", baseVersion: doc.version });
    d = await updateDocument(db, ALICE, doc.id, { content: "<p>v3</p>", baseVersion: d.version });
    d = await updateDocument(db, BOB, doc.id, { content: "<p>v4</p>", baseVersion: d.version });

    const versions = await listVersions(db, ALICE, doc.id);
    expect(versions.map((v) => [v.author.id, v.label])).toEqual([
      [BOB, null],
      [ALICE, null], // v2 + v3 folded together
      [ALICE, "Created"],
    ]);
    expect((await getVersion(db, ALICE, doc.id, versions[1].id)).content).toBe("<p>v3</p>");
  });

  it("restores an old version as a new version, without losing history", async () => {
    const doc = await createDocument(db, ALICE, { title: "Plan", content: "<p>original</p>" });
    const edited = await updateDocument(db, ALICE, doc.id, { title: "Plan v2", content: "<p>changed</p>", baseVersion: doc.version });
    const created = (await listVersions(db, ALICE, doc.id)).find((v) => v.label === "Created")!;

    const restored = await restoreVersion(db, ALICE, doc.id, created.id);
    expect(restored.content).toBe("<p>original</p>");
    expect(restored.title).toBe("Plan");
    expect(restored.version).toBeGreaterThan(edited.version); // open editors will see it as a newer version

    const versions = await listVersions(db, ALICE, doc.id);
    expect(versions).toHaveLength(3);
    expect(versions[0].label).toMatch(/^Restored from/);
  });

  it("is limited to people who can edit", async () => {
    const doc = await createDocument(db, ALICE);
    await shareDocument(db, ALICE, doc.id, { email: "bob@ajaia.test", role: "commenter" });
    await expectStatus(listVersions(db, BOB, doc.id), 403);
    await expectStatus(listVersions(db, CAROL, doc.id), 404);
  });
});

describe("images", () => {
  it("stores images for editors and serves them only to people with access", async () => {
    const doc = await createDocument(db, ALICE);
    await shareDocument(db, ALICE, doc.id, { email: "bob@ajaia.test", role: "viewer" });
    const asset = await storeAsset(db, ALICE, doc.id, PNG);
    expect(asset.url).toBe(`/api/assets/${asset.id}`);
    expect(asset.mime).toBe("image/png");

    expect((await readAsset(db, BOB, asset.id)).data).toEqual(PNG);
    await expectStatus(readAsset(db, CAROL, asset.id), 404);
    await expectStatus(storeAsset(db, BOB, doc.id, PNG), 403); // viewers can't upload
  });

  it("checks real file contents, not the claimed type", async () => {
    const doc = await createDocument(db, ALICE);
    const svg = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
    await expectStatus(storeAsset(db, ALICE, doc.id, svg), 400);
    await expectStatus(storeAsset(db, ALICE, doc.id, new Uint8Array(3 * 1024 * 1024 + 1).fill(0x89)), 400);
  });

  it("keeps internal image URLs and strips external ones", () => {
    const html = sanitizeDocumentHtml(
      '<p><img src="/api/assets/abc" width="320"><img src="https://evil.test/pixel.gif"><img src="data:image/png;base64,AAA"></p>',
    );
    expect(html).toBe('<p><img src="/api/assets/abc" width="320" /></p>');
  });
});

describe("rich content survives the sanitizer", () => {
  it("keeps tables, checklists, colours, highlights and alignment; drops unsafe styles", () => {
    const input =
      '<table><tbody><tr><th colspan="2"><p>H</p></th></tr></tbody></table>' +
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked></label><div><p>Done</p></div></li></ul>' +
      '<p style="text-align: center"><span style="color: #ff0000; position: fixed">red</span>' +
      '<mark data-color="#fde68a" style="background-color: #fde68a">hi</mark></p>';
    const out = sanitizeDocumentHtml(input);
    expect(out).toContain('<th colspan="2">');
    expect(out).toContain('data-type="taskItem" data-checked="true"');
    expect(out).toContain('<input type="checkbox" checked />');
    expect(out).toContain('style="text-align:center"');
    expect(out).toContain('<span style="color:#ff0000">red</span>');
    expect(out).not.toContain("position");
    expect(out).toContain('<mark data-color="#fde68a" style="background-color:#fde68a">');
  });
});

describe("presence and activity", () => {
  it("reports who is in the document and a key that changes with comments", async () => {
    const doc = await createDocument(db, ALICE, { content: "<p>Hello</p>" });
    await shareDocument(db, ALICE, doc.id, { email: "bob@ajaia.test", role: "editor" });
    await sync(db, ALICE, doc.id, true);
    const s1 = await sync(db, BOB, doc.id, false);
    expect(s1.presence.map((p) => [p.id, p.editing])).toEqual([
      [ALICE, true],
      [BOB, false],
    ]);
    await createThread(db, BOB, doc.id, { body: "?", quote: "Hello" });
    const s2 = await sync(db, BOB, doc.id, false);
    expect(s2.commentsKey).not.toBe(s1.commentsKey);
    await expectStatus(sync(db, CAROL, doc.id, false), 404);
  });

  it("only shows activity from documents the user can access", async () => {
    const doc = await createDocument(db, ALICE, { title: "Secret" });
    expect((await listActivity(db, BOB)).map((a) => a.document.title)).not.toContain("Secret");
    await shareDocument(db, ALICE, doc.id, { email: "bob@ajaia.test", role: "viewer" });
    const feed = await listActivity(db, BOB);
    expect(feed[0]).toMatchObject({ type: "shared", document: { title: "Secret" }, detail: { name: "Bob Lim", role: "viewer" } });
  });

  it("deleting a document removes its comments, versions, images and activity", async () => {
    const doc = await createDocument(db, ALICE, { content: "<p>x</p>" });
    await createThread(db, ALICE, doc.id, { body: "c", quote: "x" });
    await storeAsset(db, ALICE, doc.id, PNG);
    await deleteDocument(db, ALICE, doc.id);
    for (const t of ["comments", "document_versions", "assets", "activity"]) {
      const { rows } = await db.execute({ sql: `SELECT COUNT(*) AS n FROM ${t} WHERE document_id = ?`, args: [doc.id] });
      expect(Number(rows[0].n)).toBe(0);
    }
  });
});

describe("migrations", () => {
  it("upgrades a database created by the first release without losing shares", async () => {
    const legacy = createDb("file::memory:");
    await legacy.batch(
      [
        "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, color TEXT NOT NULL)",
        "CREATE TABLE documents (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
        "CREATE TABLE document_shares (document_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')), created_at TEXT NOT NULL, PRIMARY KEY (document_id, user_id))",
        "INSERT INTO users VALUES ('u_alice','alice@ajaia.test','Alice','#000'), ('u_bob','bob@ajaia.test','Bob','#000'), ('u_carol','carol@ajaia.test','Carol','#000')",
        "INSERT INTO documents VALUES ('old', 'u_alice', 'Old doc', '<p>kept</p>', 3, '2026-01-01', '2026-01-01')",
        "INSERT INTO document_shares VALUES ('old', 'u_bob', 'editor', '2026-01-01')",
      ],
      "write",
    );
    await migrate(legacy);
    await migrate(legacy); // idempotent

    expect((await getDocument(legacy, BOB, "old")).role).toBe("editor");
    await shareDocument(legacy, ALICE, "old", { email: "carol@ajaia.test", role: "commenter" }); // new role accepted
    expect((await getDocument(legacy, CAROL, "old")).role).toBe("commenter");
    // Migration 3 + seed revision 3 add profile photos, with initials as the fallback.
    expect((await getDocument(legacy, ALICE, "old")).owner.avatarUrl).toBe("/avatars/alice.jpg");
    const shares = await shareDocument(legacy, ALICE, "old", { email: "carol@ajaia.test", role: "viewer" });
    expect(shares.find((s) => s.userId === CAROL)?.avatarUrl).toBeNull();
  });
});
