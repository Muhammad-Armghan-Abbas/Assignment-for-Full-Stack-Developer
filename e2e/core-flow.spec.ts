import { expect, test, type Browser, type Page } from "@playwright/test";

const SHOTS = process.env.E2E_SCREENSHOTS; // set to a folder to capture README screenshots
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function signIn(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: `Continue as ${name}` }).click();
  await expect(page).toHaveURL(/\/documents$/);
  return page;
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const saved = (page: Page) => expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible({ timeout: 10_000 });

async function newDoc(page: Page, title: string) {
  await page.getByRole("button", { name: "Blank document" }).click();
  await expect(page).toHaveURL(/\/documents\/[\w-]+$/);
  const titleInput = page.getByLabel("Document title");
  await titleInput.fill(title);
  await titleInput.press("Enter");
  const body = page.getByLabel("Document content");
  await body.click();
  return body;
}

async function share(page: Page, email: string, role: "Editor" | "Commenter" | "Viewer") {
  await page.getByRole("button", { name: "Share" }).click();
  await page.getByLabel("Email to share with").fill(email);
  await page.getByLabel("Access level").selectOption({ label: role });
  await page.getByRole("dialog").getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(email, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
}

test("create, format, share, and view as another user", async ({ browser }) => {
  const title = `Launch plan ${Date.now()}`;
  const alice = await signIn(browser, "Alice Tan");
  await shot(alice, "01-documents-home");
  const body = await newDoc(alice, title);

  await alice.getByRole("button", { name: "Text style" }).click();
  await alice.getByRole("menuitemradio", { name: "Heading 1" }).click();
  await alice.keyboard.type("Launch plan");
  await alice.keyboard.press("Enter");
  await alice.getByRole("button", { name: /^Bold/ }).click();
  await alice.keyboard.type("Owner:");
  await alice.getByRole("button", { name: /^Bold/ }).click();
  await alice.keyboard.type(" Alice");
  await alice.keyboard.press("Enter");
  await alice.getByRole("button", { name: "Bulleted list" }).click();
  await alice.keyboard.type("Write the brief");
  await alice.keyboard.press("Enter");
  await alice.keyboard.type("Book the venue");
  await saved(alice);

  await alice.reload();
  await expect(alice.getByLabel("Document title")).toHaveValue(title);
  await expect(body.locator("h1")).toHaveText("Launch plan");
  await expect(body.locator("strong")).toHaveText("Owner:");
  await expect(body.locator("ul li")).toHaveCount(2);
  await expect(alice.getByRole("navigation", { name: "Document outline" })).toContainText("Launch plan");

  await share(alice, "chris@ajaia.test", "Viewer");

  const carol = await signIn(browser, "Chris Ng");
  const sharedSection = carol.getByRole("region", { name: "Shared with me" });
  await expect(sharedSection.getByText(title).first()).toBeVisible();
  await expect(carol.getByRole("region", { name: "My documents" }).getByText(title)).toHaveCount(0);
  await sharedSection.getByRole("link", { name: new RegExp(title) }).click();
  await expect(carol.getByText("You have view-only access")).toBeVisible();
  await expect(carol.getByLabel("Document content")).toHaveAttribute("contenteditable", "false");
  await expect(carol.getByRole("toolbar", { name: "Formatting" })).toHaveCount(0);

  // Presence: Alice sees Chris in the document.
  await expect(alice.getByLabel(/people here/)).toBeVisible({ timeout: 12_000 });

  // Alice's next edit reaches Chris without a refresh.
  await body.click();
  await alice.keyboard.press("Control+End");
  await alice.keyboard.press("Enter");
  await alice.keyboard.type("Confirm catering");
  await saved(alice);
  await expect(carol.getByLabel("Document content")).toContainText("Confirm catering", { timeout: 15_000 });
  await shot(carol, "05-viewer");
});

test("slash commands, tables, checklists and images", async ({ browser }) => {
  const bob = await signIn(browser, "Bob Lim");
  const body = await newDoc(bob, `Rich doc ${Date.now()}`);

  await bob.keyboard.type("/table");
  await expect(bob.getByRole("listbox", { name: "Insert block" })).toBeVisible();
  await bob.keyboard.press("Enter");
  await expect(body.locator("table tr")).toHaveCount(3);
  await expect(bob.getByRole("toolbar", { name: "Table" })).toBeVisible(); // contextual table tools
  await bob.getByRole("button", { name: "Insert row below" }).click();
  await expect(body.locator("table tr")).toHaveCount(4);

  await bob.keyboard.press("Control+End");
  await bob.keyboard.press("Enter");
  await bob.keyboard.type("/check");
  await bob.keyboard.press("Enter");
  await bob.keyboard.type("Ship images");
  await expect(body.locator('ul[data-type="taskList"] li')).toHaveCount(1);

  await bob.getByTestId("image-input").setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: PNG_1x1 });
  const img = body.locator("img");
  await expect(img).toHaveAttribute("src", /^\/api\/assets\//);
  await saved(bob);
  const src = await img.getAttribute("src");

  await bob.reload();
  await expect(bob.getByLabel("Document content").locator("img")).toHaveAttribute("src", src!);
  expect((await bob.request.get(src!)).status()).toBe(200);

  // Someone without access can't fetch the image directly.
  const carol = await signIn(browser, "Chris Ng");
  expect((await carol.request.get(src!)).status()).toBe(404);
});

test("comment threads: commenter comments, owner replies and resolves", async ({ browser }) => {
  const bob = await signIn(browser, "Bob Lim");
  const title = `Review me ${Date.now()}`;
  const body = await newDoc(bob, title);
  await bob.keyboard.type("The budget for Q4 is ten thousand dollars.");
  await saved(bob);
  await share(bob, "alice@ajaia.test", "Commenter");

  const alice = await signIn(browser, "Alice Tan");
  await alice.getByRole("region", { name: "Shared with me" }).getByRole("link", { name: new RegExp(title) }).click();
  await expect(alice.getByLabel("Document content")).toHaveAttribute("contenteditable", "false");
  await alice.getByLabel("Document content").locator("p").first().selectText();
  await alice.getByRole("toolbar", { name: "Commenting" }).getByRole("button", { name: /Add comment/ }).click();
  await alice.getByLabel("Add a comment…").fill("Is this enough for the pilot?");
  await alice.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(alice.getByTestId("comment-thread")).toContainText("Is this enough for the pilot?");
  await expect(alice.locator(".comment-anchor")).toBeVisible();
  await shot(alice, "03-comments");

  // Bob sees the new thread arrive via sync, replies, and resolves it.
  await expect(bob.getByRole("button", { name: /Comments \(1 open\)/ })).toBeVisible({ timeout: 12_000 });
  await bob.getByRole("button", { name: /Comments/ }).click();
  await expect(body.locator(".comment-anchor")).toHaveText("The budget for Q4 is ten thousand dollars.");
  await bob.getByTestId("comment-thread").click();
  await bob.getByLabel("Reply…").fill("Yes — approved by finance.");
  await bob.getByRole("button", { name: "Reply" }).click();
  await expect(bob.getByTestId("comment-thread")).toContainText("approved by finance");
  await bob.getByRole("button", { name: "Resolve thread" }).click();
  await expect(bob.getByTestId("comment-thread")).toHaveCount(0);
  await bob.getByRole("button", { name: "Resolved" }).click();
  await expect(bob.getByTestId("comment-thread")).toContainText("Resolved by Bob Lim");
});

test("version history: preview and restore an earlier version", async ({ browser }) => {
  const alice = await signIn(browser, "Alice Tan");
  const body = await newDoc(alice, `History ${Date.now()}`);
  await alice.keyboard.type("Original paragraph.");
  await saved(alice);

  // A second author creates a new history entry.
  await share(alice, "bob@ajaia.test", "Editor");
  const docUrl = alice.url();
  const bob = await signIn(browser, "Bob Lim");
  await bob.goto(docUrl);
  await bob.getByLabel("Document content").click();
  await bob.keyboard.press("Control+A");
  await bob.keyboard.type("Bob rewrote everything.");
  await saved(bob);

  await expect(body).toContainText("Bob rewrote everything.", { timeout: 15_000 });
  await alice.getByRole("button", { name: "Version history" }).click();
  const items = alice.getByTestId("version-item");
  await expect(items).toHaveCount(3); // Bob's edit, Alice's edit, Created
  await items.nth(1).click();
  await expect(alice.locator(".doc-body.is-preview")).toContainText("Original paragraph.");
  await shot(alice, "04-history");
  await alice.getByRole("button", { name: "Restore this version" }).click();
  await alice.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(body).toContainText("Original paragraph.");
  await expect(items.first()).toContainText("Restored from");
  await expect(bob.getByLabel("Document content")).toContainText("Original paragraph.", { timeout: 15_000 });
});

test("import a markdown file as a new document", async ({ browser }) => {
  const page = await signIn(browser, "Bob Lim");
  await page.getByTestId("import-input").setInputFiles({
    name: "meeting_notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Meeting notes\n\n**Decisions**\n\n1. Ship v1\n2. Cut realtime cursors\n\n- [x] done\n"),
  });
  await expect(page).toHaveURL(/\/documents\/[\w-]+$/);
  await expect(page.getByLabel("Document title")).toHaveValue("meeting notes");
  const body = page.getByLabel("Document content");
  await expect(body.locator("h1")).toHaveText("Meeting notes");
  await expect(body.locator("ol li")).toHaveCount(2);
  await shot(page, "02-editor");
});

test("unsupported uploads show a clear error", async ({ browser }) => {
  const page = await signIn(browser, "Bob Lim");
  await page.getByTestId("import-input").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("x") });
  await expect(page.getByRole("alert").filter({ hasText: "Unsupported file type" })).toBeVisible();
});
