import { expect, test, type Page } from "@playwright/test";

/**
 * Drag-and-drop upload, end to end.
 *
 * The load-bearing assertion is that a *dropped* file actually submits.
 * Dialogs build their payload with `new FormData(form)`, which reads from the
 * `<input type="file">` element — so a drop handler that only tracks React
 * state would show the file as attached and then silently upload nothing. That
 * is the failure this file exists to catch.
 */

const PASSWORD = "probe-pass-12345";

/** A tiny but structurally valid PDF. */
const PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";

async function signUpAndOpenProject(page: Page): Promise<void> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  const signup = await page.request.post("/api/auth/signup", {
    data: { name: "E2E", email, password: PASSWORD, passwordConfirm: PASSWORD },
  });
  expect(signup.ok(), "signup should succeed").toBeTruthy();

  const project = await page.request.post("/api/projects", {
    data: { name: "E2E Upload Probe", contract_value: 1 },
  });
  expect(project.ok(), "project create should succeed").toBeTruthy();
}

/**
 * Drop a file on the dashed zone that wraps the file input.
 *
 * Playwright cannot drag from the OS, so the DataTransfer is built inside the
 * page and dispatched as a real DragEvent — which is exactly what the browser
 * delivers on a genuine drop, so the handler under test is the real one.
 */
async function dropFile(page: Page, name: string, body: string): Promise<void> {
  const zone = page.locator('input[type="file"]').first().locator("..").locator("..");
  await zone.evaluate(
    (el, file) => {
      const dt = new DataTransfer();
      dt.items.add(new File([file.body], file.name, { type: "application/pdf" }));
      el.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: dt }));
      el.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: dt }));
      el.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
    },
    { name, body },
  );
}

test("a dropped file reaches the input, so it actually submits", async ({ page }) => {
  await signUpAndOpenProject(page);
  await page.goto("/project-documents");

  await page.getByRole("button", { name: /file document/i }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await dropFile(page, "conformed-spec.pdf", PDF);

  // The claim the UI makes...
  await expect(page.getByText(/1 file ready to upload/i)).toBeVisible();

  // ...must be backed by the input the form actually reads.
  const inInput = await page
    .locator('input[type="file"]')
    .first()
    .evaluate((el: HTMLInputElement) => Array.from(el.files ?? []).map((f) => f.name));
  expect(inInput, "dropped file must be in input.files or it will not upload").toEqual([
    "conformed-spec.pdf",
  ]);

  await page.getByLabel("Title").fill("Division 03 — Concrete (Conformed)");
  await page.getByRole("button", { name: /^file document$/i }).last().click();

  // And the round trip: the record exists with the file stored.
  await expect(page.getByRole("dialog")).toBeHidden();
  const list = await page.request.get("/api/project-documents");
  const body = (await list.json()) as { items: { title: string; file: string }[] };
  const saved = body.items.find((d) => d.title.startsWith("Division 03"));
  expect(saved, "document should have been created").toBeTruthy();
  expect(saved?.file, "the dropped file should be stored on the record").toBeTruthy();
});

test("the drop zone shows a drop state while dragging", async ({ page }) => {
  await signUpAndOpenProject(page);
  await page.goto("/project-documents");
  await page.getByRole("button", { name: /file document/i }).first().click();

  const zone = page.locator('input[type="file"]').first().locator("..").locator("..");
  await expect(page.getByText(/drag a file here/i)).toBeVisible();

  await zone.evaluate((el) => {
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], "x.pdf", { type: "application/pdf" }));
    el.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: dt }));
  });

  await expect(page.getByText(/drop to attach/i)).toBeVisible();
});

test("the Choose File button still works — the accessible path is not replaced", async ({ page }) => {
  await signUpAndOpenProject(page);
  await page.goto("/project-documents");
  await page.getByRole("button", { name: /file document/i }).first().click();

  await page.locator('input[type="file"]').first().setInputFiles({
    name: "picked.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(PDF),
  });

  await expect(page.getByText(/1 file ready to upload/i)).toBeVisible();
});

test("dropping too many files is refused, with nothing left in the input", async ({ page }) => {
  await signUpAndOpenProject(page);
  await page.goto("/project-documents");
  await page.getByRole("button", { name: /file document/i }).first().click();

  // project_documents.file is maxSelect 1, so two is one too many.
  const zone = page.locator('input[type="file"]').first().locator("..").locator("..");
  await zone.evaluate((el) => {
    const dt = new DataTransfer();
    dt.items.add(new File(["a"], "one.pdf", { type: "application/pdf" }));
    dt.items.add(new File(["b"], "two.pdf", { type: "application/pdf" }));
    el.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
  });

  await expect(page.getByText(/only one file can be attached|only 1 more file/i)).toBeVisible();

  // The input must be empty — a rejected drop that leaves files staged would
  // upload something the user was told was refused.
  const staged = await page
    .locator('input[type="file"]')
    .first()
    .evaluate((el: HTMLInputElement) => (el.files ?? []).length);
  expect(staged, "a refused drop must leave nothing staged").toBe(0);
});
