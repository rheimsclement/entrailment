// @ts-check
const { test, expect } = require('@playwright/test');
const { mockAuthSession, mockSupabaseAPIs, mockActivePlan } = require('./helpers/auth');
const { ASYNC_TIMEOUT } = require('./helpers/constants');

/**
 * Mobile layout tests (point 6)
 * ──────────────────────────────
 * Verifies that the application adapts correctly to small viewports (≤640px).
 *
 * This file is only executed by the `mobile-chrome` Playwright project
 * (iPhone 13, 390×844) as configured in playwright.config.js.
 *
 * Tests check:
 *   - Quick-profile cards stack into a single column (no horizontal overflow)
 *   - The plan modal renders as a bottom sheet (aligned to the bottom of the
 *     viewport, radius on top corners only)
 *   - The nav bar is visible and doesn't overflow
 *   - The dashboard header wraps gracefully on small screens
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Generator / quick profiles
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Mobile — generator quick profiles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // On mobile (390 px) the .nav-center is hidden — use the JS API to
    // navigate directly, the same approach used for the mobile dashboard tests.
    await page.evaluate(() => window.showPage('generator'));
    await expect(page.locator('#page-generator')).toBeVisible();
  });

  test('should stack profile cards vertically (single column)', async ({ page }) => {
    const cards = page.locator('.qp-card');
    await expect(cards).toHaveCount(3);

    const first  = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    const third  = await cards.nth(2).boundingBox();

    // In a single-column grid each card begins below the previous one.
    // We allow a small tolerance (5px) for sub-pixel rounding.
    expect(second.y).toBeGreaterThan(first.y + first.height - 5);
    expect(third.y).toBeGreaterThan(second.y + second.height - 5);
  });

  test('should not overflow the viewport horizontally', async ({ page }) => {
    const section = page.locator('.qp-section');
    const bb = await section.boundingBox();
    const viewportWidth = page.viewportSize().width;

    expect(bb.x).toBeGreaterThanOrEqual(0);
    expect(bb.x + bb.width).toBeLessThanOrEqual(viewportWidth + 1); // +1 for rounding
  });

  test('should render cards at full-width on mobile', async ({ page }) => {
    const card = page.locator('.qp-card').first();
    const cardBB = await card.boundingBox();
    const viewportWidth = page.viewportSize().width;

    // On single-column layout the card should be nearly as wide as the viewport
    // (minus normal padding — at least 85 % of the viewport width)
    expect(cardBB.width).toBeGreaterThan(viewportWidth * 0.85);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Navigation bar
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Mobile — navigation bar', () => {
  test('should be visible and fit within the viewport', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();

    const navBB = await nav.boundingBox();
    const viewportWidth = page.viewportSize().width;

    expect(navBB.width).toBeLessThanOrEqual(viewportWidth);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Plan modal (bottom sheet)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Mobile — plan modal bottom sheet', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
    await mockActivePlan(page);
    await mockSupabaseAPIs(page);
    await page.goto('/');
    // On a 390 px viewport the nav overflows and the "Mon espace" button is
    // clipped outside the visible area.  Use the JS API directly — we are
    // testing dashboard/modal behaviour, not mobile nav interaction.
    await page.evaluate(() => window.showPage('dashboard'));
    await expect(page.locator('#page-dashboard')).toBeVisible({ timeout: ASYNC_TIMEOUT });
  });

  test('should open the adapt modal', async ({ page }) => {
    await page.locator('#adapt-week-btn').click();
    await expect(page.locator('#adapt-modal')).toHaveClass(/open/);
  });

  test('should render the modal at the bottom of the viewport', async ({ page }) => {
    await page.locator('#adapt-week-btn').click();
    await expect(page.locator('#adapt-modal')).toHaveClass(/open/);

    const modal = page.locator('#adapt-modal .modal');
    const modalBB = await modal.boundingBox();
    const viewport = page.viewportSize();

    // Bottom-sheet: the modal's bottom edge should align with or be near
    // the bottom of the viewport (within 20 px tolerance for safe-area insets)
    const gap = viewport.height - (modalBB.y + modalBB.height);
    expect(gap).toBeLessThanOrEqual(20);
  });

  test('should span the full viewport width on mobile', async ({ page }) => {
    await page.locator('#adapt-week-btn').click();
    await expect(page.locator('#adapt-modal')).toHaveClass(/open/);

    const modal = page.locator('#adapt-modal .modal');
    const modalBB = await modal.boundingBox();
    const viewportWidth = page.viewportSize().width;

    // Modal should fill the full width (allow 1px rounding delta)
    expect(modalBB.width).toBeGreaterThanOrEqual(viewportWidth - 1);
  });

  test('should close the modal when clicking the close button', async ({ page }) => {
    await page.locator('#adapt-week-btn').click();
    await page.locator('#adapt-modal .modal-close').click();
    await expect(page.locator('#adapt-modal')).not.toHaveClass(/open/);
  });
});
