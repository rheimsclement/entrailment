// @ts-check
const { test, expect } = require('@playwright/test');
const { mockAuthSession, mockSupabaseAPIs, mockActivePlan } = require('./helpers/auth');
const { ASYNC_TIMEOUT } = require('./helpers/constants');

/**
 * Dashboard tests
 * ────────────────
 * Two scenarios:
 *
 * 1. Unauthenticated: clicking "Dashboard" must redirect to the login page.
 *
 * 2. Authenticated (mocked session + intercepted Supabase APIs): verify that
 *    the key dashboard sections render, interactive controls (swap mode,
 *    adapt modal, week navigation) work correctly, and that the "no plans"
 *    empty state appears when the user has no saved programmes.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Unauthenticated access
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dashboard — unauthenticated', () => {
  test('should redirect to the login page', async ({ page }) => {
    await page.goto('/');
    // No "Dashboard" nav button exists for logged-out users.
    // showPage('dashboard') → loadDashboard() → currentUser null → showPage('login').
    await page.evaluate(() => window.showPage('dashboard'));

    await expect(page.locator('#page-login')).toBeVisible();
    await expect(page.locator('#page-dashboard')).not.toBeVisible();
  });

  test('should show the login form with email and password fields', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.showPage('dashboard'));

    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Authenticated dashboard
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dashboard — authenticated', () => {
  /**
   * Set up a mocked session and intercept all Supabase REST calls before
   * each test, then navigate directly to the dashboard.
   */
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
    // Pre-populate active plan so adapt-modal / swap-mode guards pass
    await mockActivePlan(page);
    await mockSupabaseAPIs(page);
    await page.goto('/');
    // When authenticated, renderNav() injects a "Mon espace" button in nav-auth-area.
    await page.getByRole('button', { name: 'Mon espace' }).click();
    // Wait for the dashboard to be fully visible (loadDashboard resolves)
    await expect(page.locator('#page-dashboard')).toBeVisible({ timeout: ASYNC_TIMEOUT });
  });

  // ── Header ──────────────────────────────────────────────────────────────

  test('should display the authenticated user name', async ({ page }) => {
    await expect(page.locator('#dash-name')).toContainText('Test Runner');
  });

  // ── Structural sections ──────────────────────────────────────────────────

  test('should render the KPI grid', async ({ page }) => {
    await expect(page.locator('.kpi-grid').first()).toBeVisible();
  });

  test('should render the week comparison section', async ({ page }) => {
    await expect(page.locator('#week-comparison')).toBeVisible();
  });

  test('should render the volume chart section', async ({ page }) => {
    await expect(page.locator('#chart-wrap')).toBeVisible();
  });

  test('should render the plan grid', async ({ page }) => {
    await expect(page.locator('#plan-grid')).toBeVisible();
  });

  // ── Empty state (no plans) ───────────────────────────────────────────────

  test('should show the empty state when the user has no programmes', async ({ page }) => {
    // The mockSupabaseAPIs returns [] for /rest/v1/plans so we get empty state
    const emptyState = page.locator('#plan-grid').getByText(/aucun programme/i);
    await expect(emptyState).toBeVisible({ timeout: ASYNC_TIMEOUT });
  });

  // ── Week navigation controls ─────────────────────────────────────────────

  test('should show the "Adapter la semaine" button', async ({ page }) => {
    await expect(page.locator('#adapt-week-btn')).toBeVisible();
  });

  test('should show the "Inverser séances" button', async ({ page }) => {
    await expect(page.locator('#swap-mode-btn')).toBeVisible();
  });

  test('should show the week range label', async ({ page }) => {
    // Week label format is "1 avr — 7 avr" — at minimum it should be non-empty
    const label = page.locator('#week-range-label');
    await expect(label).not.toBeEmpty({ timeout: ASYNC_TIMEOUT });
  });

  // ── Swap mode ────────────────────────────────────────────────────────────

  test('should activate swap mode when clicking "Inverser séances"', async ({ page }) => {
    await page.locator('#swap-mode-btn').click();

    await expect(page.locator('#swap-mode-bar')).toHaveClass(/active/);
    await expect(page.locator('#swap-mode-btn')).toHaveClass(/active/);
  });

  test('should cancel swap mode when clicking "Annuler"', async ({ page }) => {
    // Arrange: enter swap mode
    await page.locator('#swap-mode-btn').click();
    await expect(page.locator('#swap-mode-bar')).toHaveClass(/active/);

    // Act
    await page.locator('#swap-mode-bar').getByRole('button', { name: 'Annuler' }).click();

    // Assert
    await expect(page.locator('#swap-mode-bar')).not.toHaveClass(/active/);
    await expect(page.locator('#swap-mode-btn')).not.toHaveClass(/active/);
  });

  // ── Adapt modal ──────────────────────────────────────────────────────────

  test('should open the adapt modal when clicking "Adapter la semaine"', async ({ page }) => {
    await page.locator('#adapt-week-btn').click();

    await expect(page.locator('#adapt-modal')).toHaveClass(/open/);
  });

  test('should show the step-form panel when the adapt modal first opens', async ({ page }) => {
    await page.locator('#adapt-week-btn').click();

    await expect(page.locator('#adapt-step-form')).toBeVisible();
    await expect(page.locator('#adapt-step-loading')).not.toBeVisible();
    await expect(page.locator('#adapt-step-result')).not.toBeVisible();
  });

  test('should close the adapt modal when clicking the close button', async ({ page }) => {
    // Arrange
    await page.locator('#adapt-week-btn').click();
    await expect(page.locator('#adapt-modal')).toHaveClass(/open/);

    // Act
    await page.locator('#adapt-modal .modal-close').click();

    // Assert
    await expect(page.locator('#adapt-modal')).not.toHaveClass(/open/);
  });

  test('should close the adapt modal when clicking outside (on the overlay)', async ({ page }) => {
    // Arrange
    await page.locator('#adapt-week-btn').click();
    await expect(page.locator('#adapt-modal')).toHaveClass(/open/);

    // Act: click the overlay backdrop (not the modal itself)
    await page.locator('#adapt-modal').click({ position: { x: 5, y: 5 } });

    // Assert
    await expect(page.locator('#adapt-modal')).not.toHaveClass(/open/);
  });
});
