// @ts-check
/**
 * @file constants.js
 * Shared test constants — single source of truth for URLs, timeouts, etc.
 */

/** Hostname of the Supabase project (used for route matching). */
const SUPABASE_HOST = 'zjxrcbnwdbakmmpctwzx.supabase.co';

/**
 * Default timeout (ms) for waiting on elements that depend on network calls
 * (dashboard analytics, Strava activities, etc.).
 */
const ASYNC_TIMEOUT = 8_000;

module.exports = { SUPABASE_HOST, ASYNC_TIMEOUT };
