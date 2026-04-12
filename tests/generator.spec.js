// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Generator page tests
 * ─────────────────────
 * Two areas are covered:
 *
 * 1. Quick-start profiles (point 5)
 *    Three profile cards at the top of the generator allow users to
 *    pre-fill the entire form with one click.  Tests verify:
 *      - All three cards are rendered
 *      - The clicked card becomes `.active` and the others do not
 *      - Every important form field is set to the expected value
 *      - Goal chips are activated/deactivated correctly
 *      - Dates are set approximately 7 days (start) and N months (race) ahead
 *
 * 2. Step navigation
 *    The 8-step form wizard should advance/retreat and keep its step bar in sync.
 *
 * No network calls are made — this is pure client-side JS.
 */

/** Navigate to the generator page (shared setup). */
async function goToGenerator({ page }) {
  await page.goto('/');
  await page.locator('#nav-generator').click();
  await expect(page.locator('#page-generator')).toBeVisible();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Quick-start profiles
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Generator — Quick-start profiles (point 5)', () => {
  test.beforeEach(goToGenerator);

  // ── Section rendering ───────────────────────────────────────────────────

  test('should display the quick-start section', async ({ page }) => {
    await expect(page.locator('.qp-section')).toBeVisible();
  });

  test('should render exactly 3 profile cards', async ({ page }) => {
    await expect(page.locator('.qp-card')).toHaveCount(3);
  });

  test('should show the correct card titles', async ({ page }) => {
    await expect(page.locator('#qp-decouverte')).toContainText('Trail Découverte');
    await expect(page.locator('#qp-intermediaire')).toContainText('Trail Montagne');
    await expect(page.locator('#qp-ultra')).toContainText('Ultra Trail');
  });

  test('should display level badges on each card', async ({ page }) => {
    await expect(page.locator('#qp-decouverte .qp-badge')).toContainText('Débutant');
    await expect(page.locator('#qp-intermediaire .qp-badge')).toContainText('Intermédiaire');
    await expect(page.locator('#qp-ultra .qp-badge')).toContainText('Avancé');
  });

  // ── Active-card highlighting ────────────────────────────────────────────

  test('should mark the clicked card as active and deselect the others', async ({ page }) => {
    // Act: click the middle card
    await page.locator('#qp-intermediaire').click();

    // Assert
    await expect(page.locator('#qp-intermediaire')).toHaveClass(/active/);
    await expect(page.locator('#qp-decouverte')).not.toHaveClass(/active/);
    await expect(page.locator('#qp-ultra')).not.toHaveClass(/active/);
  });

  test('should transfer the active state when a different card is clicked', async ({ page }) => {
    // Arrange: first select découverte
    await page.locator('#qp-decouverte').click();
    await expect(page.locator('#qp-decouverte')).toHaveClass(/active/);

    // Act: then switch to ultra
    await page.locator('#qp-ultra').click();

    // Assert: ultra active, découverte no longer active
    await expect(page.locator('#qp-ultra')).toHaveClass(/active/);
    await expect(page.locator('#qp-decouverte')).not.toHaveClass(/active/);
  });

  // ── Trail Découverte profile ────────────────────────────────────────────

  test.describe('Trail Découverte profile', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('#qp-decouverte').click();
    });

    test('should set level to "débutant"', async ({ page }) => {
      await expect(page.locator('#level')).toHaveValue(/débutant/);
    });

    test('should set weekly volume to 3 hours', async ({ page }) => {
      await expect(page.locator('#volume')).toHaveValue('3');
    });

    test('should set race distance to 12 km', async ({ page }) => {
      await expect(page.locator('#race-distance-km')).toHaveValue('12');
    });

    test('should set preparation duration to 8 weeks', async ({ page }) => {
      await expect(page.locator('#duration')).toHaveValue('8 semaines');
    });

    test('should activate only the "Finisher" goal chip', async ({ page }) => {
      await expect(page.locator('#goal-chips .chip[data-value="finisher"]')).toHaveClass(/selected/);
      await expect(page.locator('#goal-chips .chip[data-value="améliorer mon chrono"]')).not.toHaveClass(/selected/);
    });

    test('should set start date to approximately 7 days from today', async ({ page }) => {
      const value = await page.locator('#start-date').inputValue();
      const diff = (new Date(value) - new Date()) / 86_400_000;
      // Allow a ±1-day window to handle timezone edge cases
      expect(diff).toBeGreaterThan(6);
      expect(diff).toBeLessThan(8);
    });
  });

  // ── Trail Montagne (intermédiaire) profile ──────────────────────────────

  test.describe('Trail Montagne profile', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('#qp-intermediaire').click();
    });

    test('should set level to "intermédiaire"', async ({ page }) => {
      await expect(page.locator('#level')).toHaveValue(/intermédiaire/);
    });

    test('should set weekly volume to 6 hours', async ({ page }) => {
      await expect(page.locator('#volume')).toHaveValue('6');
    });

    test('should set race distance to 42 km', async ({ page }) => {
      await expect(page.locator('#race-distance-km')).toHaveValue('42');
    });

    test('should set prep duration to 12 weeks', async ({ page }) => {
      await expect(page.locator('#duration')).toHaveValue('12 semaines');
    });

    test('should activate the "améliorer mon chrono" and "gérer le dénivelé" chips', async ({ page }) => {
      await expect(page.locator('#goal-chips .chip[data-value="améliorer mon chrono"]')).toHaveClass(/selected/);
      await expect(page.locator('#goal-chips .chip[data-value="gérer le dénivelé"]')).toHaveClass(/selected/);
      // Finisher should NOT be active for this profile
      await expect(page.locator('#goal-chips .chip[data-value="finisher"]')).not.toHaveClass(/selected/);
    });
  });

  // ── Ultra Trail profile ─────────────────────────────────────────────────

  test.describe('Ultra Trail profile', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('#qp-ultra').click();
    });

    test('should set level to "avancé"', async ({ page }) => {
      await expect(page.locator('#level')).toHaveValue(/avancé/);
    });

    test('should set weekly volume to 12 hours', async ({ page }) => {
      await expect(page.locator('#volume')).toHaveValue('12');
    });

    test('should set race distance to 101 km', async ({ page }) => {
      await expect(page.locator('#race-distance-km')).toHaveValue('101');
    });

    test('should set prep duration to 16 weeks', async ({ page }) => {
      await expect(page.locator('#duration')).toHaveValue('16 semaines');
    });

    test('should activate ultra-specific goal chips', async ({ page }) => {
      await expect(page.locator('#goal-chips .chip[data-value="finisher"]')).toHaveClass(/selected/);
      await expect(page.locator('#goal-chips .chip[data-value="endurance longue distance"]')).toHaveClass(/selected/);
      await expect(page.locator('#goal-chips .chip[data-value="préparation mentale"]')).toHaveClass(/selected/);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Step navigation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Generator — Step navigation', () => {
  test.beforeEach(goToGenerator);

  test('should start on step 1', async ({ page }) => {
    await expect(page.locator('#step-1')).toHaveClass(/active/);
    await expect(page.locator('#step-2')).not.toHaveClass(/active/);
  });

  test('should render a step bar with 8 segments', async ({ page }) => {
    await expect(page.locator('#step-bar .step-seg')).toHaveCount(8);
  });

  test('should mark the first step-bar segment as active on load', async ({ page }) => {
    await expect(page.locator('#step-bar .step-seg').first()).toHaveClass(/active/);
  });

  test('should advance to step 2 when clicking "Suivant"', async ({ page }) => {
    await page.getByRole('button', { name: 'Suivant →' }).click();

    await expect(page.locator('#step-2')).toHaveClass(/active/);
    await expect(page.locator('#step-1')).not.toHaveClass(/active/);
  });

  test('should return to step 1 from step 2 when clicking "Retour"', async ({ page }) => {
    // Arrange: advance to step 2
    await page.getByRole('button', { name: 'Suivant →' }).click();
    await expect(page.locator('#step-2')).toHaveClass(/active/);

    // Act
    await page.getByRole('button', { name: '← Retour' }).click();

    // Assert
    await expect(page.locator('#step-1')).toHaveClass(/active/);
  });

  test('should mark the first step-bar segment as "done" after advancing to step 2', async ({ page }) => {
    await page.getByRole('button', { name: 'Suivant →' }).click();

    // The first segment should now be marked done
    await expect(page.locator('#step-bar .step-seg').first()).toHaveClass(/done/);
    // The second segment should be active
    await expect(page.locator('#step-bar .step-seg').nth(1)).toHaveClass(/active/);
  });
});
