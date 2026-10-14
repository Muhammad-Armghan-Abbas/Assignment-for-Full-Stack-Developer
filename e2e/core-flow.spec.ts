import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.E2E_SCREENSHOTS; // set to a folder to capture README screenshots

async function signIn(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/documents$/);
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test("create, format, share, and view as another user", async ({ browser }) => {
  const title = `Launch plan ${Date.now()}`;

  // --- Alice creates and formats a document ---
  const alice = await (await browser.newContext()).newPage();
  await signIn(alice, "Alice");
  await expect(alice.getByRole("region", { name: "Shared with me" })).toBeVisible();
  await alice.getByRole("button", { name: /Blank document/ }).click();
  await expect(alice).toHaveURL(/\/documents\/[\w-]+$/);

  const titleInput = alice.getByLabel("Document title");
  await titleInput.fill(title);
  await titleInput.press("Enter");

  const body = alice.getByLabel("Document content");
  await body.click();
  await alice.getByLabel("Text style").selectOption("h1");
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
  await expect(alice.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible({ timeout: 10_000 });
  await alice.evaluate(() => window.scrollTo(0, 0));
  await shot(alice, "02-editor");

  // --- Reload: content and formatting persist ---
  await alice.reload();
  await expect(alice.getByLabel("Document title")).toHaveValue(title);
  await expect(body.locator("h1")).toHaveText("Launch plan");
  await expect(body.locator("strong")).toHaveText("Owner:");
  await expect(body.locator("ul li")).toHaveCount(2);

  // --- Share with Carol as a viewer ---
  await alice.getByRole("button", { name: "Share" }).click();
  await alice.getByLabel("Email to share with").fill("carol@ajaia.test");
  await alice.getByLabel("Access level").selectOption("viewer");
  await alice.getByRole("dialog").getByRole("button", { name: "Share", exact: true }).click();
  await expect(alice.getByRole("status").filter({ hasText: "Shared with carol@ajaia.test" })).toBeVisible();
  await shot(alice, "03-share-dialog");
  // Validation: unknown user
  await alice.getByLabel("Email to share with").fill("nobody@ajaia.test");
  await alice.getByRole("dialog").getByRole("button", { name: "Share", exact: true }).click();
  await expect(alice.getByRole("alert").filter({ hasText: "No user with email" })).toBeVisible();
  await alice.getByRole("button", { name: "Done" }).click();

  // --- Carol sees it under "Shared with me", read-only ---
  const carol = await (await browser.newContext()).newPage();
  await signIn(carol, "Carol");
  const shared = carol.getByRole("region", { name: "Shared with me" });
  await expect(shared.getByText(title)).toBeVisible();
  await expect(carol.getByRole("region", { name: "My documents" }).getByText(title)).toHaveCount(0);
  await shot(carol, "01-documents-home");
  await shared.getByText(title).click();
  await expect(carol.getByText("You have view-only access")).toBeVisible();
  await expect(carol.getByLabel("Document content")).toHaveAttribute("contenteditable", "false");
  await expect(carol.getByRole("toolbar", { name: "Formatting" })).toHaveCount(0);
  await shot(carol, "04-viewer");

  // --- Alice's later edit reaches Carol without a manual refresh ---
  await body.click();
  await alice.keyboard.press("Control+End");
  await alice.keyboard.press("Enter");
  await alice.keyboard.type("Confirm catering");
  await expect(alice.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible({ timeout: 10_000 });
  await expect(carol.getByLabel("Document content")).toContainText("Confirm catering", { timeout: 15_000 });
});

test("import a markdown file as a new document", async ({ page }) => {
  await signIn(page, "Bob");
  await page.getByTestId("import-input").setInputFiles({
    name: "meeting_notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Meeting notes\n\n**Decisions**\n\n1. Ship v1\n2. Cut realtime cursors\n"),
  });
  await expect(page).toHaveURL(/\/documents\/[\w-]+$/);
  await expect(page.getByLabel("Document title")).toHaveValue("meeting notes");
  const body = page.getByLabel("Document content");
  await expect(body.locator("h1")).toHaveText("Meeting notes");
  await expect(body.locator("ol li")).toHaveCount(2);
});

test("unsupported uploads show a clear error", async ({ page }) => {
  await signIn(page, "Bob");
  await page.getByTestId("import-input").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("x") });
  await expect(page.getByRole("alert").filter({ hasText: "Unsupported file type" })).toBeVisible();
});
