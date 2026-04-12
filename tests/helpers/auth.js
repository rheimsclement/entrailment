// @ts-check
/**
 * @file auth.js
 * Authentication mock helpers for Playwright tests.
 *
 * The app uses a hand-rolled Supabase client that reads its initial session
 * from `localStorage.sb_session` at page-load time.  By injecting a fake
 * session *before* the page script executes (via `addInitScript`) we can
 * simulate an authenticated user without touching the real Supabase project.
 *
 * All network calls to Supabase REST and Auth APIs are then intercepted by
 * `mockSupabaseAPIs` so the tests run fully offline.
 */

const { SUPABASE_HOST } = require('./constants');

/**
 * Fake authenticated user used across all dashboard/Strava tests.
 *
 * @type {object}
 */
const MOCK_USER = {
  id: 'test-user-00000000-0000-0000-0000-000000000001',
  email: 'test@entrailment.app',
  user_metadata: { name: 'Test Runner' },
};

/**
 * Injects a fake Supabase session into `localStorage` *before* the page
 * script runs.  The session is valid for 1 hour so `ensureValidToken()` will
 * not attempt a refresh during tests.
 *
 * Must be called before `page.goto()`.
 *
 * @param {import('@playwright/test').Page} page
 */
async function mockAuthSession(page) {
  const session = {
    access_token: 'test_access_token',
    refresh_token: 'test_refresh_token',
    // expires_at is in Unix seconds — 1 hour from now
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: MOCK_USER,
  };

  await page.addInitScript((serialisedSession) => {
    localStorage.setItem('sb_session', serialisedSession);
  }, JSON.stringify(session));
}

/**
 * Intercepts all Supabase REST + Auth network calls and returns
 * deterministic empty / success responses.
 *
 * This keeps tests isolated from the real backend and makes them fast.
 * Individual tests can override specific routes with a more specific
 * `page.route()` call (Playwright uses the first matching handler).
 *
 * Must be called before `page.goto()`.
 *
 * @param {import('@playwright/test').Page} page
 */
async function mockSupabaseAPIs(page) {
  /**
   * Helper: register a route that responds with a JSON body.
   *
   * @param {RegExp} pattern
   * @param {unknown} body
   * @param {number} [status=200]
   */
  const jsonRoute = async (pattern, body, status = 200) => {
    await page.route(pattern, (route) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
    );
  };

  // ── Auth endpoints ────────────────────────────────────────────────────────

  // Token refresh — return a session valid for another hour
  await jsonRoute(/\/auth\/v1\/token/, {
    access_token: 'refreshed_access_token',
    refresh_token: 'refreshed_refresh_token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: MOCK_USER,
  });

  // Current user lookup
  await jsonRoute(/\/auth\/v1\/user$/, MOCK_USER);

  // ── REST data tables ──────────────────────────────────────────────────────

  // plans — empty list, triggers the "no plans" empty-state UI
  await jsonRoute(/\/rest\/v1\/plans/, []);

  // strava_tokens — null signals "Strava not connected"
  await jsonRoute(/\/rest\/v1\/strava_tokens/, null);

  // week_analysis — no cached analysis for the current week
  await jsonRoute(/\/rest\/v1\/week_analysis/, []);
}

/**
 * Pre-populates `window._activePlanContent` *before* the page script runs so
 * that features guarded by "an active plan must exist" (adapt modal, swap mode
 * display, etc.) become testable even when Supabase returns an empty plan list.
 *
 * Must be called before `page.goto()`.
 *
 * @param {import('@playwright/test').Page} page
 */
async function mockActivePlan(page) {
  await page.addInitScript(() => {
    // Minimal plan content — just enough to satisfy openAdaptModal() guard
    window._activePlanId = 'test-plan-00000000-0000-0000-0000-000000000001';
    window._activePlanContent =
      '# Programme trail — Test\n## Semaine 1\n- Lundi: Repos\n- Mardi: EF 45min';
    window._activePlanSessionsJson = null;
  });
}

module.exports = { mockAuthSession, mockSupabaseAPIs, mockActivePlan, MOCK_USER };
