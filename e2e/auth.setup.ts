import { expect, test as setup } from '@playwright/test';

/** Signs the owner in once through the fake Google and keeps the session for the journeys. */
setup('owner signs in with Google', async ({ page }) => {
  await page.goto('/today');
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await page.waitForURL(/\/today/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.context().storageState({ path: 'e2e/.auth/owner.json' });
});
