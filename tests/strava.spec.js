// @ts-check
const { test, expect } = require('@playwright/test');
const { mockAuthSession, mockSupabaseAPIs } = require('./helpers/auth');
const { MOCK_STRAVA_ACTIVITIES } = require('./helpers/fixtures');
const { ASYNC_TIMEOUT } = require('./helpers/constants');

/**
 * Strava activities section tests (point 7)
 * ──────────────────────────────────────────
 * Verifies:
 *   - The `#strava-activities` / `#activity-grid` HTML structure exists
 *   - The section becomes visible after a connected Strava token is returned
 *   - Activity cards are rendered with the correct content
 *   - The type filter bar (Tout / Trail / Course / Rando) works
 *   - The period filter bar (Tout / 7j / 30j / 3 mois) works
 *   - Combined type + period filters work
 *   - The active-button highlight follows the clicked button
 *   - "Tout" resets the filter back to all activities
 *
 * All external network calls (Supabase, Strava API) are intercepted.
 * The four mock activities are spread across dates and types so that
 * every filter combination produces a predictable count.
 *
 * Fixture summary (see tests/helpers/fixtures.js for full definitions):
 *   id 1 — TrailRun  — today         (passes all filters)
 *   id 2 — Run       — 3 days ago    (passes all filters)
 *   id 3 — Hike      — 40 days ago   (passes "Tout" + 90j only)
 *   id 4 — TrailRun  — 60 days ago   (passes "Tout" + 90j only)
 */

/** Register a Strava-connected token mock and Strava activities mock. */
async function mockStravaConnected(page) {
  // Override the strava_tokens mock to simulate a connected account.
  // The inline Supabase client calls `.single()` which fetches with `&limit=1`
  // and does `data[0]` on the JSON response — the body MUST be an array.
  await page.route(/\/rest\/v1\/strava_tokens/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        access_token: 'mock_strava_token',
        refresh_token: 'mock_refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        athlete_name: 'Test Athlete',
        athlete_id: 12345,
      }]),
    })
  );

  // Mock Strava REST API — return the fixture activities
  await page.route(/strava\.com\/api\/v3\/athlete\/activities/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_STRAVA_ACTIVITIES),
    })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  DOM structure
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Strava — DOM structure', () => {
  test('should have the #strava-activities container in the DOM', async ({ page }) => {
    await page.goto('/');
    // The element exists but is hidden before any auth/loading
    await expect(page.locator('#strava-activities')).toBeAttached();
  });

  test('should have the #activity-grid container in the DOM', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#activity-grid')).toBeAttached();
  });

  test('should have the #strava-filter-bar container in the DOM', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#strava-filter-bar')).toBeAttached();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Connected Strava — rendering + filtering
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Strava — connected account', () => {
  test.beforeEach(async ({ page }) => {
    // Route registration order matters — Playwright uses LIFO (last registered wins).
    // Register broad mocks first, specific overrides last so they take priority.
    await mockAuthSession(page);
    await mockSupabaseAPIs(page);     // broad defaults (strava_tokens → null)
    await mockStravaConnected(page);  // overrides strava_tokens with connected token

    await page.goto('/');
    await page.getByRole('button', { name: 'Mon espace' }).click();
    await expect(page.locator('#page-dashboard')).toBeVisible({ timeout: ASYNC_TIMEOUT });
  });

  // ── Section visibility ─────────────────────────────────────────────────

  test('should make the activities section visible after loading', async ({ page }) => {
    await expect(page.locator('#strava-activities')).toBeVisible({ timeout: ASYNC_TIMEOUT });
  });

  // ── Activity cards ─────────────────────────────────────────────────────

  test('should render one card per activity (4 total)', async ({ page }) => {
    await page.waitForSelector('.activity-card', { timeout: ASYNC_TIMEOUT });
    await expect(page.locator('.activity-card')).toHaveCount(4);
  });

  test('should display correct type labels on activity cards', async ({ page }) => {
    await page.waitForSelector('.activity-card', { timeout: ASYNC_TIMEOUT });
    const typeLabels = page.locator('.activity-type');
    // First card: TrailRun → "🏔️ Trail"
    await expect(typeLabels.nth(0)).toContainText('Trail');
    // Second card: Run → "🏃 Course"
    await expect(typeLabels.nth(1)).toContainText('Course');
    // Third card: Hike → "🥾 Rando"
    await expect(typeLabels.nth(2)).toContainText('Rando');
  });

  test('should display distance, time and elevation stats on each card', async ({ page }) => {
    await page.waitForSelector('.activity-card', { timeout: ASYNC_TIMEOUT });
    // First activity: 15 200 m → "15.2" km
    const firstCard = page.locator('.activity-card').first();
    await expect(firstCard.locator('.activity-stat-val').first()).toContainText('15.2');
  });

  // ── Filter bar rendering ───────────────────────────────────────────────

  test('should render the type filter group', async ({ page }) => {
    await page.waitForSelector('#strava-type-filters', { timeout: ASYNC_TIMEOUT });
    await expect(page.locator('[data-type="all"]')).toBeVisible();
    await expect(page.locator('[data-type="TrailRun"]')).toBeVisible();
    await expect(page.locator('[data-type="Run"]')).toBeVisible();
    await expect(page.locator('[data-type="Hike"]')).toBeVisible();
  });

  test('should render the period filter group', async ({ page }) => {
    await page.waitForSelector('#strava-period-filters', { timeout: ASYNC_TIMEOUT });
    await expect(page.locator('[data-period="0"]')).toBeVisible();
    await expect(page.locator('[data-period="7"]')).toBeVisible();
    await expect(page.locator('[data-period="30"]')).toBeVisible();
    await expect(page.locator('[data-period="90"]')).toBeVisible();
  });

  test('should start with "Tout" active in both filter groups', async ({ page }) => {
    await page.waitForSelector('#strava-type-filters', { timeout: ASYNC_TIMEOUT });
    await expect(page.locator('[data-type="all"]')).toHaveClass(/active/);
    await expect(page.locator('[data-period="0"]')).toHaveClass(/active/);
  });

  // ── Type filtering ─────────────────────────────────────────────────────

  test('should show 2 cards when filtering by TrailRun', async ({ page }) => {
    await page.waitForSelector('#strava-type-filters', { timeout: ASYNC_TIMEOUT });
    await page.locator('[data-type="TrailRun"]').click();

    await expect(page.locator('.activity-card')).toHaveCount(2);
  });

  test('should show 1 card when filtering by Run', async ({ page }) => {
    await page.waitForSelector('#strava-type-filters', { timeout: ASYNC_TIMEOUT });
    await page.locator('[data-type="Run"]').click();

    await expect(page.locator('.activity-card')).toHaveCount(1);
  });

  test('should show 1 card when filtering by Hike', async ({ page }) => {
    await page.waitForSelector('#strava-type-filters', { timeout: ASYNC_TIMEOUT });
    await page.locator('[data-type="Hike"]').click();

    await expect(page.locator('.activity-card')).toHaveCount(1);
  });

  // ── Period filtering ───────────────────────────────────────────────────

  test('should show 2 cards when filtering by last 7 days', async ({ page }) => {
    // Activities within 7 days: id 1 (today) + id 2 (3 days ago)
    await page.waitForSelector('#strava-period-filters', { timeout: ASYNC_TIMEOUT });
    await page.locator('[data-period="7"]').click();

    await expect(page.locator('.activity-card')).toHaveCount(2);
  });

  test('should show 2 cards when filtering by last 30 days', async ({ page }) => {
    // Activities within 30 days: id 1 (today) + id 2 (3 days ago)
    // id 3 is 40 days ago → excluded
    await page.waitForSelector('#strava-period-filters', { timeout: ASYNC_TIMEOUT });
    await page.locator('[data-period="30"]').click();

    await expect(page.locator('.activity-card')).toHaveCount(2);
  });

  test('should show 3 cards when filtering by last 90 days', async ({ page }) => {
    // Activities within 90 days: id 1, id 2, id 3 (40 days) — id 4 is 60 days, also included
    await page.waitForSelector('#strava-period-filters', { timeout: ASYNC_TIMEOUT });
    await page.locator('[data-period="90"]').click();

    await expect(page.locator('.activity-card')).toHaveCount(4);
  });

  // ── Combined type + period filters ─────────────────────────────────────

  test('should show 1 card when filtering TrailRun + last 7 days', async ({ page }) => {
    // Only id 1 (TrailRun, today) should pass both filters
    await page.waitForSelector('#strava-type-filters', { timeout: ASYNC_TIMEOUT });
    await page.locator('[data-type="TrailRun"]').click();
    await page.locator('[data-period="7"]').click();

    await expect(page.locator('.activity-card')).toHaveCount(1);
  });

  test('should show 0 cards and an empty message when no activities match', async ({ page }) => {
    // Hike + 7 days → no match (the hike is 40 days old)
    await page.waitForSelector('#strava-type-filters', { timeout: ASYNC_TIMEOUT });
    await page.locator('[data-type="Hike"]').click();
    await page.locator('[data-period="7"]').click();

    await expect(page.locator('.activity-card')).toHaveCount(0);
    await expect(page.locator('#activity-grid')).toContainText(/aucune activité/i);
  });

  // ── Active-button state ────────────────────────────────────────────────

  test('should mark the clicked type button as active', async ({ page }) => {
    await page.waitForSelector('#strava-type-filters', { timeout: ASYNC_TIMEOUT });
    await page.locator('[data-type="TrailRun"]').click();

    await expect(page.locator('[data-type="TrailRun"]')).toHaveClass(/active/);
    await expect(page.locator('[data-type="all"]')).not.toHaveClass(/active/);
  });

  test('should mark the clicked period button as active', async ({ page }) => {
    await page.waitForSelector('#strava-period-filters', { timeout: ASYNC_TIMEOUT });
    await page.locator('[data-period="30"]').click();

    await expect(page.locator('[data-period="30"]')).toHaveClass(/active/);
    await expect(page.locator('[data-period="0"]')).not.toHaveClass(/active/);
  });

  test('should restore all activities when clicking "Tout" after a type filter', async ({ page }) => {
    await page.waitForSelector('#strava-type-filters', { timeout: ASYNC_TIMEOUT });

    // Arrange: apply a filter
    await page.locator('[data-type="Run"]').click();
    await expect(page.locator('.activity-card')).toHaveCount(1);

    // Act: reset
    await page.locator('[data-type="all"]').click();

    // Assert: all 4 cards back
    await expect(page.locator('.activity-card')).toHaveCount(4);
  });
});
