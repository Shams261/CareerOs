import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { appEnv } from './env';

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
  // The end reads as a line until "change" opens its field (WI-071).
  await form.getByRole('button', { name: 'change' }).click();
  await form.getByLabel('End time').fill('00:35');
  await form.getByRole('button', { name: 'Add block' }).click();
  const row = page.locator('li.agenda-row', {
    hasText: 'Graphs: BFS practice',
  });
  await expect(row).toBeVisible();

  // Focus for that block: Start begins at once (WI-066); a direct link still asks to Begin.
  const blockId = (await row.getAttribute('id'))!.replace('block-', '');
  await page.goto(`/focus?block=${blockId}`);
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
  // The goal card leads the page (WI-088), with its form while no goal is set.
  await expect(page.getByRole('heading', { name: 'Set a goal' })).toBeVisible();
  await page.getByRole('button', { name: 'Add your own roadmap' }).click();
  await page.getByLabel('Title').fill('System design');
  await page.getByRole('button', { name: 'Create roadmap' }).click();
  // The roadmap is a band that opens to its weeks; its last row adds items.
  const band = page.getByRole('button', { name: /System design/ });
  await expect(band).toBeVisible();
  await accessible(page);
  await band.click();
  await page
    .getByRole('button', { name: /Add a week or items to System design/ })
    .click();
  const add = page.getByRole('form', { name: 'Add items' });
  await add.getByLabel('Section').fill('Building blocks');
  await add
    .getByRole('textbox', { name: /^Items, one per line/ })
    .fill('Consistent hashing\n? Design a rate limiter');
  await add.getByRole('button', { name: 'Add items' }).click();
  await page.keyboard.press('Escape');
  // The new week lists under the band and opens as its own page.
  await page.getByRole('link', { name: /Building blocks/ }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Building blocks' }),
  ).toBeVisible();
  await expect(page.getByText('0 done · 2 left')).toBeVisible();
  // The first item still to do is open on arrival, as a card with one primary.
  const first = page.locator('.week-item', { hasText: 'Consistent hashing' });
  await expect(first).toHaveClass(/is-open/);
  await expect(
    first.getByRole('button', { name: /Not started: Consistent hashing/ }),
  ).toHaveAttribute('aria-expanded', 'true');
  await first.getByRole('button', { name: 'Mark done' }).click();
  await expect(page.getByText('1 done · 1 left')).toBeVisible();
  await expect(first).toHaveClass(/is-done/);
  // Mark done opens the next item left; its answer floats in view with Undo (WI-089).
  await expect(
    page.locator('.week-item', { hasText: 'Design a rate limiter' }),
  ).toHaveClass(/is-open/);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeInViewport();
  // The browser tab names the week (WI-089).
  await expect(page).toHaveTitle(/^Building blocks · System design/);
  await accessible(page);
  await fitsPhone(page, page.url().replace(/^https?:\/\/[^/]+/, ''));
});

test('a problem is added without a link and an attempt is recorded', async ({
  page,
}) => {
  await page.goto('/dsa');
  // An empty workspace starts with its first topic.
  await page
    .getByRole('form', { name: 'Add topic' })
    .getByLabel('Topic')
    .fill('Arrays');
  await page.getByRole('button', { name: 'Add topic' }).click();
  await expect(
    page.getByRole('heading', { name: 'Practice', level: 1 }),
  ).toBeVisible();
  // Add a problem needs a title and a topic only (WI-091); the topic is the current one. The
  // form opens in a modal (WI-093).
  await page.getByRole('button', { name: 'Add a problem' }).click();
  const add = page.getByRole('form', { name: 'Add problem' });
  await add.getByLabel('Title').fill('Two Sum');
  await add.getByRole('button', { name: 'Add problem' }).click();
  const row = page.locator('.problem-line', { hasText: 'Two Sum' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Unattempted');
  await accessible(page);
  await row.getByRole('link', { name: 'Two Sum' }).click();
  await expect(
    page.getByRole('heading', { name: 'Two Sum', level: 1 }),
  ).toBeVisible();
  // The attempt form as three lines: a chip sets the confidence, Save records it.
  await page.getByLabel('With hints').check();
  // The answer chooses the confidence chip (WI-093); the owner can still change it.
  await expect(page.getByRole('radio', { name: 'Okay' })).toBeChecked();
  await page.getByRole('button', { name: 'Save attempt' }).click();
  await expect(page.locator('.facts-strip')).toContainText('Okay');
  await expect(page.locator('.facts-strip')).toContainText(/Attempts\s*1/);
  // The first attempt starts the revision ladder: step 1 in three days (WI-094).
  await expect(page.locator('.facts-strip')).toContainText('1 of 3');
  await expect(page.locator('.ladder-step').first()).toContainText(
    'Revision 1',
  );
  // The form is fresh again: nothing chosen, no stale confidence.
  await expect(page.getByRole('radio', { name: 'Okay' })).not.toBeChecked();
  await expect(
    page.getByRole('radio', { name: 'With hints' }),
  ).not.toBeChecked();
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
  // The formats live in a panel; the stage row's Move to… lists the same names (WI-096).
  const panel = page.getByRole('dialog', { name: 'Interview formats' });
  await panel.getByLabel('Code review').check();
  await panel.getByLabel('System design').check();
  await panel.getByRole('button', { name: 'Save formats' }).click();
  const formats = page.getByRole('region', { name: 'Interview formats' });
  await expect(formats).toContainText('Code review');
  await expect(formats).toContainText('System design');
  await accessible(page);

  // Two more applications put the funnel on the Jobs page (WI-056).
  await page.goto('/jobs');
  for (const company of ['Fabrikam', 'Contoso']) {
    // Add application opens a modal that closes once saved (WI-096).
    await page.getByRole('button', { name: 'Add application' }).click();
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

test('the weekly review walks its three steps and closes the week', async ({
  page,
}) => {
  // WI-097: the steps are The week, Reflect, Next week; a week with blocks (the Focus journey
  // planned one) leads with Next: Reflect, an empty one with Reflect anyway.
  await page.goto('/review');
  await expect(
    page.getByRole('heading', { name: 'Weekly review', level: 1 }),
  ).toBeVisible();
  const steps = page.getByRole('navigation', { name: 'Review steps' });
  await expect(steps).toContainText('The week');
  await accessible(page);
  await page
    .getByRole('link', { name: /Next: Reflect|Reflect anyway/ })
    .click();
  await expect(page).toHaveURL(/step=reflect/);
  await page.getByLabel('What went well?').fill('Four mornings in a row');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page).toHaveURL(/step=plan/);
  await expect(page.locator('.today-summary')).toContainText('Draft');
  await accessible(page);
  // A priority with Undo, then the week closes from the rail.
  await page
    .getByLabel('Priority', { exact: true })
    .fill('Finish Sliding Window');
  await page.getByRole('button', { name: 'Add priority' }).click();
  const row = page.locator('.prep-item', { hasText: 'Finish Sliding Window' });
  await expect(row).toBeVisible();
  await expect(page.locator('#priorities-heading')).toContainText('1 of 5');
  await page
    .getByRole('button', { name: 'Remove: Finish Sliding Window' })
    .click();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(row).toBeVisible();
  await expect(page.locator('.close-week')).toContainText(
    'Reflection saved as a draft · 1 priority',
  );
  await page.getByRole('button', { name: 'Complete review' }).click();
  await expect(page.locator('.today-summary')).toContainText('Completed');
  await expect(page.locator('.close-week')).toContainText('Review completed');
  // The review looks back: no link past this week.
  await expect(page.getByRole('link', { name: 'Later week' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Earlier week' })).toBeVisible();
  await page.goto('/review?step=details');
  await expect(
    page.getByRole('heading', { name: 'Past reviews' }),
  ).toBeVisible();
  await accessible(page);
  await fitsPhone(page, '/review?step=plan');
});

test('Rumi writes the morning line and Reply prefills the drawer', async ({
  page,
}) => {
  // The owner's clock (America/Toronto): the morning line goes out within three hours of
  // its time, so the time is set a few minutes back, with no quiet hours and every day on.
  const [h, m] = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Toronto',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date())
    .split(':')
    .map(Number);
  const minutes = Math.max(0, (h % 24) * 60 + m - 5);
  const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  await page.goto('/settings');
  const row = page.locator('button[data-panel="reminder-study"]');
  await row.click();
  const panel = page.getByRole('dialog', { name: 'Study nudges' });
  await panel.getByLabel('Send a morning line on study days').check();
  await panel.getByLabel('Time', { exact: true }).fill(time);
  await panel.getByLabel(/^One line from today/).check();
  await panel.getByLabel('Mornings only on days with a study block').uncheck();
  for (const d of ['Sat', 'Sun'])
    await panel.getByLabel(d, { exact: true }).check();
  await panel.getByLabel('Quiet from').fill('00:00');
  await panel.getByLabel('until').fill('00:00');
  await panel.getByRole('button', { name: 'Save' }).click();
  // The panel closes on success; the row's context shows the saved setting.
  await expect(row).toContainText('Rumi writes');
  // The scheduler's run queues the row and Rumi writes the line in the same request.
  const run = await page.request.post('/api/notifications/process', {
    headers: { Authorization: `Bearer ${appEnv.CRON_SECRET}` },
  });
  expect(run.ok()).toBe(true);
  expect(await run.json()).toMatchObject({ lines: 1 });
  await page.goto('/today');
  const card = page.getByRole('region', { name: 'Rumi · Morning' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Your plan for today is set');
  await accessible(page);
  await card.getByRole('button', { name: 'Reply' }).click();
  const drawer = page.getByRole('dialog', { name: 'Ask Rumi' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('textbox', { name: 'Ask Rumi' })).toHaveValue(
    /^Re “Your plan for today is set/,
  );
  await page.keyboard.press('Escape');
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
  // Text size (WI-087): Large scales the app; Default puts it back.
  await page.getByRole('radio', { name: 'Large', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-size', 'large');
  await accessible(page);
  await page.getByRole('radio', { name: 'Default' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-size', 'default');
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
