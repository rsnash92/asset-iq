import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/** Regenerates README screenshots for the seeded demo user. Run: SCREENSHOTS=1 pnpm test:e2e screenshots */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate README screenshots");
test.use({ viewport: { width: 1360, height: 900 } });

const OUT = "../../docs/screenshots";

test("README screenshots", async ({ page }) => {
  await signIn(page, process.env.DEMO_USER_EMAIL ?? "demo@asset-iq.local");
  await expect(page.getByTestId("doc-row").first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/library.png` });

  await page.getByRole("link", { name: "Chat" }).click();
  await page.getByLabel("Retrieval debug").check();
  await page.getByLabel("Question").fill("Who should carry out face-fit testing of respiratory protective equipment?");
  await page.getByRole("button", { name: "Ask" }).click();
  const answer = page.getByTestId("assistant-message").last();
  await expect(answer.getByTestId("citation-chip").first()).toBeVisible({ timeout: 60_000 });
  await expect(answer.getByTestId("debug-panel")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop" })).toBeHidden({ timeout: 60_000 }); // stream finished
  await page.screenshot({ path: `${OUT}/chat.png` }); // viewport: the sticky input would overlap a full-page capture

  await page.getByRole("link", { name: "Agent" }).click();
  await page.getByRole("button", { name: /reading list/i }).click();
  await expect(page.getByTestId("agent-step").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Working…")).toBeHidden({ timeout: 120_000 });
  await page.screenshot({ path: `${OUT}/agent.png`, fullPage: true });
});
