import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke: sign in (magic link via local Mailpit) → upload → ask → see citation.
 * The ingest + answer half needs real provider keys and a running ingest service;
 * set E2E_FULL=1 to run it. Without it, the test stops after upload is accepted.
 */
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55324";
const FULL = process.env.E2E_FULL === "1";

/** Minimal valid one-page PDF with real text (no deps). */
function tinyPdf(lines: string[]): Buffer {
  // one text line per entry, 16pt apart (the ingest service rejects < 200 chars as "scanned")
  const content = `BT /F1 11 Tf 72 720 Td 16 TL ${lines.map((l) => `(${l.replace(/[()\\]/g, "")}) Tj T*`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

async function magicLink(email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const body = (await res.json()) as { messages?: { ID: string }[] };
    const id = body.messages?.[0]?.ID;
    if (id) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Text?: string; HTML?: string };
      const m = (msg.Text ?? msg.HTML ?? "").match(/https?:\/\/[^\s"<>)]+\/auth\/v1\/verify[^\s"<>)]+/);
      if (m) return m[0].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("magic link email not received");
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: /sign-in link/i }).click();
  await expect(page.getByText(/check/i)).toBeVisible();
  await page.goto(await magicLink(email));
  await expect(page).toHaveURL(/\/library/);
}

test("sign in → upload → ask → see citation", async ({ page }) => {
  const email = `e2e-${Date.now()}@test.local`;
  await signIn(page, email);
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();

  // upload
  const fact = "The Asset IQ test permit expires after exactly seventeen days on site";
  const pdf = tinyPdf([
    "Asset IQ test permit policy.",
    `${fact}.`,
    "Permits are issued by the site manager before any hot work or confined space entry begins.",
    "Each permit lists the hazards, the precautions and the people authorised to do the work.",
    "Expired permits must be returned to the site office and filed for twelve months.",
  ]);
  await page.getByTestId("file-input").setInputFiles({ name: "permit-policy.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByLabel("Title", { exact: true }).fill("E2E permit policy");
  await page.getByLabel("Industry", { exact: true }).fill("construction");
  await page.getByRole("button", { name: "Upload" }).click();
  const row = page.getByTestId("doc-row").filter({ hasText: "E2E permit policy" });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("doc-status")).toHaveText(/pending|processing|ready|failed/);

  test.skip(!FULL, "E2E_FULL=1 not set: skipping ingest + answer (needs provider keys + ingest service)");

  await expect(row.getByTestId("doc-status")).toHaveText("ready", { timeout: 120_000 });

  // ask
  await page.getByRole("link", { name: "Chat" }).click();
  await page.getByLabel("Question").fill("How long is the Asset IQ test permit valid for?");
  await page.getByRole("button", { name: "Ask" }).click();
  const answer = page.getByTestId("assistant-message").last();
  await expect(answer).toContainText(/seventeen|17/i, { timeout: 60_000 });
  const chip = answer.getByTestId("citation-chip").first();
  await expect(chip).toBeVisible();

  // the citation opens the source at the cited page with the excerpt highlighted
  const [viewer] = await Promise.all([page.waitForEvent("popup"), chip.click()]);
  await expect(viewer.getByTestId("cited-excerpt")).toContainText(/seventeen/i);
  await expect(viewer).toHaveURL(/page=1/);
});
