// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Navigation tests
 * ─────────────────
 * Verify the SPA routing layer: pages show/hide on nav-link clicks,
 * the active link is highlighted, and the scroll-shadow behaviour works.
 *
 * These tests require no authentication and make no network calls.
 */
test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ── Page load ─────────────────────────────────────────────────────────────

  test('should load with the correct document title', async ({ page }) => {
    await expect(page).toHaveTitle(/En Trailment/i);
  });

  test('should show the home page by default', async ({ page }) => {
    await expect(page.locator('#page-home')).toBeVisible();
  });

  test('should hide all other pages on initial load', async ({ page }) => {
    await expect(page.locator('#page-generator')).not.toBeVisible();
    await expect(page.locator('#page-dashboard')).not.toBeVisible();
    await expect(page.locator('#page-login')).not.toBeVisible();
  });

  // ── Nav link clicks ───────────────────────────────────────────────────────

  test('should navigate to the generator page', async ({ page }) => {
    // Act
    await page.locator('#nav-generator').click();

    // Assert: generator visible, home hidden
    await expect(page.locator('#page-generator')).toBeVisible();
    await expect(page.locator('#page-home')).not.toBeVisible();
  });

  test('should navigate back to home from the generator', async ({ page }) => {
    // Arrange
    await page.locator('#nav-generator').click();

    // Act
    await page.getByRole('button', { name: 'Accueil' }).click();

    // Assert
    await expect(page.locator('#page-home')).toBeVisible();
    await expect(page.locator('#page-generator')).not.toBeVisible();
  });

  test('should redirect to the login page when visiting dashboard unauthenticated', async ({ page }) => {
    // Call showPage('dashboard') directly — no nav button exists for it when logged out.
    // loadDashboard() detects currentUser === null and redirects to login.
    await page.evaluate(() => window.showPage('dashboard'));

    await expect(page.locator('#page-login')).toBeVisible();
    await expect(page.locator('#page-dashboard')).not.toBeVisible();
  });

  // ── Active link state ─────────────────────────────────────────────────────

  test('should mark the home nav link as active initially', async ({ page }) => {
    await expect(page.locator('#nav-home')).toHaveClass(/active/);
  });

  test('should update the active nav link when switching pages', async ({ page }) => {
    // Arrange
    await expect(page.locator('#nav-home')).toHaveClass(/active/);

    // Act
    await page.locator('#nav-generator').click();

    // Assert: generator active, home inactive
    await expect(page.locator('#nav-generator')).toHaveClass(/active/);
    await expect(page.locator('#nav-home')).not.toHaveClass(/active/);
  });

  // ── Nav scroll shadow ─────────────────────────────────────────────────────

  test('should apply the "scrolled" class when the page is scrolled down', async ({ page }) => {
    // Scroll well past the 20px threshold defined in the scroll listener
    await page.evaluate(() => window.scrollTo(0, 100));

    await expect(page.locator('nav')).toHaveClass(/scrolled/);
  });

  test('should remove the "scrolled" class when back at the top', async ({ page }) => {
    // Arrange
    await page.evaluate(() => window.scrollTo(0, 100));
    await expect(page.locator('nav')).toHaveClass(/scrolled/);

    // Act
    await page.evaluate(() => window.scrollTo(0, 0));

    // Assert
    await expect(page.locator('nav')).not.toHaveClass(/scrolled/);
  });
});
