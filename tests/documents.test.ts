import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  shareDocument,
  unshareDocument,
  updateDocument,
} from "@/lib/documents";
import { AppError } from "@/lib/errors";
import { ALICE, BOB, CAROL, testDb } from "./helpers";

/** Assert a promise rejects with an AppError of the given HTTP status. */
async function expectStatus(p: Promise<unknown>, status: number) {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(status);
}

let db: Db;
beforeEach(async () => {
  db = await testDb();
});

describe("document lifecycle", () => {
  it("creates, renames, edits and reopens a document with formatting intact", async () => {
    const doc = await createDocument(db, ALICE);
    expect(doc.title).toBe("Untitled document");
    expect(doc.role).toBe("owner");

    const html = "<h2>Plan</h2><p><strong>Bold</strong> <em>it</em> <u>u</u></p><ul><li>one</li></ul>";
    const saved = await updateDocument(db, ALICE, doc.id, { title: "  Q4   plan ", content: html, baseVersion: doc.version });
    expect(saved.version).toBe(doc.version + 1);

    const reopened = await getDocument(db, ALICE, doc.id);
    expect(reopened.title).toBe("Q4 plan");
    expect(reopened.content).toBe(html);
  });

  it("strips scripts and event handlers from saved HTML", async () => {
    const doc = await createDocument(db, ALICE, {
      content: '<p onclick="steal()">hi<script>alert(1)</script></p><img src=x onerror=alert(1)>',
    });
    expect(doc.content).toBe("<p>hi</p>");
  });

  it("rejects empty titles and stale versions", async () => {
    const doc = await createDocument(db, ALICE);
    await expectStatus(updateDocument(db, ALICE, doc.id, { title: "   ", baseVersion: doc.version }), 400);

    await updateDocument(db, ALICE, doc.id, { content: "<p>first</p>", baseVersion: doc.version });
    // A second writer still holding the old version must not clobber the first write.
    await expectStatus(updateDocument(db, ALICE, doc.id, { content: "<p>second</p>", baseVersion: doc.version }), 409);
    expect((await getDocument(db, ALICE, doc.id)).content).toBe("<p>first</p>");
  });
});

describe("sharing and access control", () => {
  it("separates owned and shared documents per user", async () => {
    const doc = await createDocument(db, ALICE, { title: "Roadmap" });
    await shareDocument(db, ALICE, doc.id, { email: "bob@ajaia.test", role: "viewer" });

    const alice = await listDocuments(db, ALICE);
    const bob = await listDocuments(db, BOB);
    const carol = await listDocuments(db, CAROL);

    expect(alice.owned.map((d) => d.title)).toContain("Roadmap");
    expect(alice.shared.map((d) => d.title)).not.toContain("Roadmap");
    expect(bob.shared.find((d) => d.id === doc.id)?.role).toBe("viewer");
    expect(bob.owned.map((d) => d.id)).not.toContain(doc.id);
    expect(carol.owned.concat(carol.shared).map((d) => d.id)).not.toContain(doc.id);
  });

  it("hides unshared documents behind a 404", async () => {
    const doc = await createDocument(db, ALICE);
    await expectStatus(getDocument(db, CAROL, doc.id), 404);
    await expectStatus(updateDocument(db, CAROL, doc.id, { content: "<p>x</p>", baseVersion: 1 }), 404);
  });

  it("lets editors edit but not share or delete; viewers can only read", async () => {
    const doc = await createDocument(db, ALICE);
    await shareDocument(db, ALICE, doc.id, { email: "bob@ajaia.test", role: "editor" });
    await shareDocument(db, ALICE, doc.id, { email: "CAROL@ajaia.test ", role: "viewer" }); // email is normalized

    const edited = await updateDocument(db, BOB, doc.id, { content: "<p>bob was here</p>", baseVersion: doc.version });
    expect(edited.content).toBe("<p>bob was here</p>");
    await expectStatus(shareDocument(db, BOB, doc.id, { email: "carol@ajaia.test", role: "editor" }), 403);
    await expectStatus(deleteDocument(db, BOB, doc.id), 403);

    expect((await getDocument(db, CAROL, doc.id)).content).toBe("<p>bob was here</p>");
    await expectStatus(updateDocument(db, CAROL, doc.id, { content: "<p>nope</p>", baseVersion: edited.version }), 403);
  });

  it("re-sharing changes the role, and unsharing revokes access", async () => {
    const doc = await createDocument(db, ALICE);
    await shareDocument(db, ALICE, doc.id, { email: "bob@ajaia.test", role: "viewer" });
    const shares = await shareDocument(db, ALICE, doc.id, { email: "bob@ajaia.test", role: "editor" });
    expect(shares).toEqual([expect.objectContaining({ userId: BOB, role: "editor" })]);

    await unshareDocument(db, ALICE, doc.id, BOB);
    await expectStatus(getDocument(db, BOB, doc.id), 404);
  });

  it("validates share requests", async () => {
    const doc = await createDocument(db, ALICE);
    await expectStatus(shareDocument(db, ALICE, doc.id, { email: "nobody@ajaia.test" }), 400);
    await expectStatus(shareDocument(db, ALICE, doc.id, { email: "alice@ajaia.test" }), 400);
    await expectStatus(shareDocument(db, ALICE, doc.id, { email: "bob@ajaia.test", role: "admin" }), 400);
  });

  it("deleting a document removes it for everyone it was shared with", async () => {
    const doc = await createDocument(db, ALICE);
    await shareDocument(db, ALICE, doc.id, { email: "bob@ajaia.test" });
    await deleteDocument(db, ALICE, doc.id);
    await expectStatus(getDocument(db, BOB, doc.id), 404);
    expect((await listDocuments(db, BOB)).shared.map((d) => d.id)).not.toContain(doc.id);
  });
});
