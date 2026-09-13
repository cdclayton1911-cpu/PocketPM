import { expect, test, type Page } from "@playwright/test";

/**
 * Uploading to a record that already has files must ADD, never replace.
 *
 * The loss this exists for: four progress photos on a daily log, then a PDF mix
 * ticket, and the photos were gone. PocketBase reads a bare `attachments` on an
 * update as "replace every file", and the route sent exactly that, with a 200.
 * Uploads now append (crud-route.ts), the dialog says what a save will do
 * before it does it (lib/files/pending.ts), and these tests hold both in place
 * through the real stack: browser, Next route, PocketBase.
 *
 * PocketBase stores a file as its snake_cased name plus a random suffix, so
 * names here are already snake_case and matched by prefix.
 */

const PASSWORD = "probe-pass-12345";
const PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";

async function signUpAndOpenProject(page: Page): Promise<void> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const signup = await page.request.post("/api/auth/signup", {
    data: { name: "E2E", email, password: PASSWORD, passwordConfirm: PASSWORD },
  });
  expect(signup.ok(), "signup should succeed").toBeTruthy();
  const project = await page.request.post("/api/projects", { data: { name: "E2E Attachments", contract_value: 1 } });
  expect(project.ok(), "project create should succeed").toBeTruthy();
}

const jpg = (name: string, bytes = 64) => ({ name, mimeType: "image/jpeg", buffer: Buffer.alloc(bytes, 1) });
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from(PDF) });

type Upload = ReturnType<typeof jpg>;

/** A multipart body the way the dialog builds it: files under the bare field name. */
function form(fields: Record<string, string>, files: Upload[], removals: string[] = []): FormData {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  for (const f of files) body.append("attachments", new File([f.buffer], f.name, { type: f.mimeType }));
  for (const name of removals) body.append("attachments-", name);
  return body;
}

interface Log {
  id: string;
  attachments: string[];
}

async function logs(page: Page): Promise<Log[]> {
  const res = await page.request.get("/api/daily-logs");
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { items: Log[] }).items;
}

const has = (stored: string[], stem: string) => stored.some((n) => n.startsWith(stem));

test("a second upload keeps the first files, and the dialog says so before saving", async ({ page }) => {
  await signUpAndOpenProject(page);
  await page.goto("/daily-log");

  await page.getByRole("button", { name: /new log/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Log date").fill("2026-09-12");
  await dialog.locator('input[type="file"]').setInputFiles([jpg("progress_1.jpg"), jpg("progress_2.jpg")]);
  await dialog.getByRole("button", { name: /save log/i }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await logs(page))[0]?.attachments.length ?? 0).toBe(2);

  // The row's Edit, not the page header's "Edit" (which edits the project).
  await page.getByRole("table").getByRole("button", { name: /^edit$/i }).first().click();
  await expect(dialog.getByText(/^progress_1/)).toBeVisible();
  await dialog.locator('input[type="file"]').setInputFiles([pdf("mix_ticket.pdf")]);

  // Said before it happens.
  await expect(dialog.getByText("1 file ready to upload, added to the 2 already attached, which stay.")).toBeVisible();

  await dialog.getByRole("button", { name: /save changes/i }).click();
  await expect(dialog).toBeHidden();

  // The load-bearing assertion: all three are on the record.
  await expect.poll(async () => (await logs(page))[0]?.attachments.length ?? 0).toBe(3);
  const [log] = await logs(page);
  for (const stem of ["progress_1", "progress_2", "mix_ticket"]) {
    expect(has(log.attachments, stem), `${stem} should still be attached`).toBe(true);
  }
});

test("removing a file is shown before saving, and can be undone", async ({ page }) => {
  await signUpAndOpenProject(page);
  const created = await page.request.post("/api/daily-logs", {
    multipart: form({ log_date: "2026-09-12" }, [jpg("keep_me.jpg"), jpg("drop_me.jpg")]),
  });
  expect(created.status()).toBe(201);

  await page.goto("/daily-log");
  // The row's Edit, not the page header's "Edit" (which edits the project).
  await page.getByRole("table").getByRole("button", { name: /^edit$/i }).first().click();
  const dialog = page.getByRole("dialog");

  await dialog.getByRole("button", { name: /remove drop_me/i }).click();
  await expect(dialog.getByText("removed on save")).toBeVisible();
  await expect(dialog.getByText(/On save, drop_me\S* will be removed\./)).toBeVisible();

  await dialog.getByRole("button", { name: /^undo$/i }).click();
  await expect(dialog.getByText("removed on save")).toBeHidden();
});

test("the route adds on edit, removes only what is named, and does both in one save", async ({ page }) => {
  await signUpAndOpenProject(page);

  const created = await page.request.post("/api/daily-logs", {
    multipart: form({ log_date: "2026-09-12" }, [jpg("photo_a.jpg"), jpg("photo_b.jpg")]),
  });
  expect(created.status()).toBe(201);
  const { record } = (await created.json()) as { record: Log };

  // Exactly what the dialog sends: files under the bare field name.
  const added = await page.request.patch(`/api/daily-logs/${record.id}`, { multipart: form({}, [pdf("ticket_c.pdf")]) });
  expect(added.status()).toBe(200);
  const afterAdd = ((await added.json()) as { record: Log }).record.attachments;
  expect(afterAdd).toHaveLength(3);

  const photoA = afterAdd.find((n) => n.startsWith("photo_a"))!;
  const both = await page.request.patch(`/api/daily-logs/${record.id}`, {
    multipart: form({}, [jpg("photo_d.jpg")], [photoA]),
  });
  expect(both.status()).toBe(200);
  const final = ((await both.json()) as { record: Log }).record.attachments;
  expect(final).toHaveLength(3);
  expect(has(final, "photo_a"), "photo_a was named for removal").toBe(false);
  for (const stem of ["photo_b", "ticket_c", "photo_d"]) expect(has(final, stem), stem).toBe(true);
});

test("going over the file limit across saves is refused with the counts, and nothing changes", async ({ page }) => {
  await signUpAndOpenProject(page);
  const nine = Array.from({ length: 9 }, (_, i) => jpg(`photo_${i}.jpg`));
  const created = await page.request.post("/api/daily-logs", { multipart: form({ log_date: "2026-09-12" }, nine) });
  expect(created.status()).toBe(201);
  const { record } = (await created.json()) as { record: Log };

  const res = await page.request.patch(`/api/daily-logs/${record.id}`, {
    multipart: form({}, [jpg("photo_9.jpg"), jpg("photo_10.jpg")]),
  });
  expect(res.status()).toBe(400);
  const { errors } = (await res.json()) as { errors: Record<string, string> };
  expect(errors.attachments).toMatch(/already has 9 files.*would make 11.*limit is 10/);

  const [log] = await logs(page);
  expect(log.attachments).toHaveLength(9);
});

test("a 12 MB phone photo is accepted, and one over the limit is refused by name", async ({ page }) => {
  await signUpAndOpenProject(page);
  const MB = 1024 * 1024;

  const ok = await page.request.post("/api/daily-logs", {
    multipart: form({ log_date: "2026-09-12" }, [jpg("site_48mp.jpg", 12 * MB)]),
  });
  expect(ok.status(), "a 12 MB photo is under the 25 MB limit").toBe(201);

  const tooBig = await page.request.post("/api/daily-logs", {
    multipart: form({ log_date: "2026-09-13" }, [jpg("huge_raw.jpg", 26 * MB)]),
  });
  expect(tooBig.status()).toBe(400);
  const { errors } = (await tooBig.json()) as { errors: Record<string, string> };
  expect(errors.attachments).toMatch(/huge_raw\.jpg is 26 MB; the limit is 25 MB/);
});
