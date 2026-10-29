import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The core journeys of a fresh workspace (WI-052), in order, as the owner signed in through the
 * fake Google: setup, a block through Focus, the roadmap, a job loop, Rumi's plan and Settings.
 * Each page is checked with axe (WCAG 2.2 AA) and at phone width for horizontal overflow.
 */
test.describe.configure({ mode: 'serial' });

async function accessible(page: Page) {
  // Next streams the <title> after the body; judge the page once it has one.
  await expect(page).toHaveTitle(/\S/);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    result.violations.map(
      (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target).join(' ')}`,
    ),
  ).toEqual([]);
}

async function fitsPhone(page: Page, path: string) {
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(path);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.setViewportSize(size);
}

test('a new workspace starts with the welcome, its three steps and the first routine', async ({
  page,
}) => {
  // An empty account (WI-065): one welcoming action and three optional steps, no form forced.
  await page.goto('/today');
  await expect(
    page.getByRole('heading', { name: 'Start small. Build your rhythm.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Plan my first focus/ }),
  ).toBeVisible();
  const steps = page.getByRole('region', { name: 'Your first 3 steps' });
  await expect(steps).toContainText('0 of 3');
  await accessible(page);
  await fitsPhone(page, '/today');

  // The first routine from the steps, every day, early enough to never sit on today's clock.
  await steps
    .getByRole('button', { name: 'Add: Set your study times' })
    .click();
  const routine = page.getByRole('form', { name: 'Add routine' });
  await routine.getByLabel('Title').fill('Morning DSA');
  for (const day of ['Sat', 'Sun']) await routine.getByLabel(day).check();
  await routine.getByLabel('Start time').fill('05:00');
  await routine.getByLabel('End time').fill('05:30');
  await routine.getByRole('button', { name: 'Add routine' }).click();
  // The day now has a plan: Today's timeline, and the setup steps in the rail.
  await expect(
    page.getByRole('heading', { name: "Today's plan" }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Make Silsila yours' }),
  ).toContainText('1 of 6 done');
  await accessible(page);
});

test('a block for today runs through Focus to Done', async ({ page }) => {
  await page.goto('/today');
  await page.getByRole('button', { name: 'Add a block' }).first().click();
  const form = page.getByRole('form', { name: 'Add a block' });
  await form.getByLabel('Title').fill('Graphs: BFS practice');
  await form.getByLabel('Start time').fill('00:05');
  await form.getByLabel('End time').fill('00:35');
  await form.getByRole('button', { name: 'Add block' }).click();
  const row = page.locator('li.agenda-row', {
    hasText: 'Graphs: BFS practice',
  });
  await expect(row).toBeVisible();

  // Start opens Focus for that block, wherever the row keeps the link.
  const href = await page
    .locator('a[href^="/focus?block="]')
    .filter({ hasText: 'Graphs: BFS practice' })
    .first()
    .getAttribute('href');
  await page.goto(href!);
  await page
    .getByLabel('Intention (optional)')
    .fill('Level-order with a queue');
  await page.getByRole('button', { name: /^Begin/ }).click();
  await expect(page.getByRole('button', { name: /^Complete/ })).toBeVisible();
  await accessible(page);
  await page.getByRole('button', { name: /^Complete/ }).click();
  await page.waitForURL(/\/today/);
  await expect(
    page.locator('li.agenda-row', { hasText: 'Graphs: BFS practice' }),
  ).toContainText('Done');
});

test('a roadmap item is added and marked done', async ({ page }) => {
  await page.goto('/roadmap');
  await page.getByRole('button', { name: 'New roadmap' }).click();
  await page.getByLabel('Title').fill('System design');
  await page.getByRole('button', { name: 'Create roadmap' }).click();
  await expect(
    page.getByRole('link', { name: /System design/ }).first(),
  ).toBeVisible();
  await accessible(page);
  await page
    .getByRole('link', { name: /System design/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Add items' }).first().click();
  const add = page.getByRole('form', { name: 'Add items' });
  await add.getByLabel('Section').fill('Building blocks');
  await add
    .getByRole('textbox', { name: /^Items, one per line/ })
    .fill('Consistent hashing\n? Design a rate limiter');
  await add.getByRole('button', { name: 'Add items' }).click();
  const item = page.locator('li.item-row', { hasText: 'Consistent hashing' });
  // The first item opens by itself; its Done is in the panel, or the row's quick button.
  await item
    .getByRole('button', { name: /^Done(: Consistent hashing)?$/ })
    .first()
    .click();
  await expect(page.getByText(/1 done/).first()).toBeVisible();
  await accessible(page);
  await fitsPhone(page, page.url().replace(/^https?:\/\/[^/]+/, ''));
});

test('an application gets its interview formats and practice links', async ({
  page,
}) => {
  await page.goto('/jobs');
  await page.getByLabel('Company').fill('Northwind Labs');
  await page.getByLabel('Role').fill('Backend Engineer');
  await page.getByRole('button', { name: 'Add application' }).click();
  // The first application turns the page from Start here into the list.
  await page
    .getByRole('link', { name: /Northwind Labs/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Backend Engineer' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Set formats' }).click();
  await page.getByLabel('Code review').check();
  await page.getByLabel('System design').check();
  await page.getByRole('button', { name: 'Save formats' }).click();
  const formats = page.getByRole('region', { name: 'Interview formats' });
  await expect(formats).toContainText('Code review');
  await expect(formats).toContainText('System design');
  await accessible(page);

  // Two more applications put the funnel on the Jobs page (WI-056).
  await page.goto('/jobs');
  for (const company of ['Fabrikam', 'Contoso']) {
    // The form stays open after an add; open it only when it is closed.
    const toggle = page.locator('button.disclosure-trigger', {
      hasText: 'Add application',
    });
    if ((await toggle.getAttribute('aria-expanded')) !== 'true')
      await toggle.click();
    const add = page.getByRole('form', { name: 'Add application' });
    await add.getByLabel('Company').fill(company);
    await add.getByLabel('Role').fill('Backend Engineer');
    await add.getByRole('button', { name: 'Add application' }).click();
    await expect(
      page.getByRole('link', { name: new RegExp(company) }).first(),
    ).toBeVisible();
  }
  const funnel = page.getByRole('table', {
    name: /Applications by the week they were sent/,
  });
  await expect(funnel).toBeVisible();
  await expect(funnel.getByRole('row', { name: /All time/ })).toContainText(
    '3',
  );
  await accessible(page);
  await fitsPhone(page, '/jobs');
});

test('Rumi proposes tomorrow, the plan is added and undone', async ({
  page,
}) => {
  await page.goto('/rumi');
  await page
    .getByPlaceholder('Ask Rumi about your week, roadmap or interviews')
    .fill('kal ka plan bana do');
  await page.getByRole('button', { name: 'Send' }).click();
  const card = page.getByRole('group', { name: /^Plan for / });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole('button', { name: /to plan$/ }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(
    page.getByText(/cancelled|undone|removed/i).first(),
  ).toBeVisible();
  await accessible(page);
});

test('Settings saves the dark theme and stays accessible', async ({ page }) => {
  await page.goto('/settings');
  await expect(
    page.getByRole('heading', { name: 'Settings', level: 1 }),
  ).toBeVisible();
  await page.getByRole('radio', { name: 'Dark' }).check();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await accessible(page);
  await page.goto('/today');
  await accessible(page);
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Light' }).check();
  await fitsPhone(page, '/settings');

  // Sessions (WI-057): this device is listed and marked.
  await page
    .getByRole('button', { name: /Signed in on this device only/ })
    .click();
  const panel = page.getByRole('dialog', { name: 'Sessions' });
  await expect(panel).toContainText('This device');
  await accessible(page);
  // Crawlers get a plain refusal, not the login page.
  const robots = await page.request.get('/robots.txt');
  expect(await robots.text()).toContain('Disallow: /');
});
