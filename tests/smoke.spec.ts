import { expect, test } from "@playwright/test";

test("signs in, shows the dashboard, and completes a transfer", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.getByLabel("Email").fill("demo@industrybank.test");
  await page.getByLabel("Password").fill("industry123");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Alex");
  await expect(page.getByText("Total available balance")).toBeVisible();

  await page.getByRole("link", { name: "Transfer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Send money" })).toBeVisible();

  await page.getByLabel("Recipient name").fill("Jordan Lee");
  await page
    .getByLabel("Recipient account number")
    .fill(process.env.E2E_RECIPIENT_ACCOUNT_NUMBER ?? "1000000001");
  await page.getByLabel("Amount").fill("125.50");
  await page.getByRole("button", { name: "Review transfer" }).click();

  await expect(page.getByRole("heading", { name: "Review transfer" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm transfer" }).click();

  await expect(page.getByRole("heading", { name: "Transfer complete" })).toBeVisible();
  await expect(page.getByText("Jordan Lee").first()).toBeVisible();
  await expect(page.getByText(/Confirmation IB\d{6}/)).toBeVisible();
});

test("rejects incorrect credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("does not match");
});
