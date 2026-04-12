// @ts-check
/**
 * @file fixtures.js
 * Shared test-data fixtures — keeps test files free of inline magic data.
 */

/**
 * A set of mock Strava activities covering all three supported types
 * (TrailRun, Run, Hike) and varying dates so period filters can be tested.
 *
 * Dates are computed at module-load time to stay relative to "today".
 *
 * @type {object[]}
 */
const MOCK_STRAVA_ACTIVITIES = [
  {
    id: 1,
    name: 'Morning Trail Run',
    type: 'TrailRun',
    distance: 15_200,
    total_elevation_gain: 450,
    moving_time: 4_800,
    // Today → passes all period filters
    start_date_local: new Date().toISOString(),
  },
  {
    id: 2,
    name: 'Easy Road Run',
    type: 'Run',
    distance: 8_000,
    total_elevation_gain: 80,
    moving_time: 2_700,
    // 3 days ago → passes 7-day and 30-day filters
    start_date_local: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  },
  {
    id: 3,
    name: 'Mountain Hike',
    type: 'Hike',
    distance: 12_000,
    total_elevation_gain: 700,
    moving_time: 7_200,
    // 40 days ago → passes only "Tout" and 90-day filter
    start_date_local: new Date(Date.now() - 40 * 86_400_000).toISOString(),
  },
  {
    id: 4,
    name: 'Long Trail',
    type: 'TrailRun',
    distance: 32_000,
    total_elevation_gain: 1_200,
    moving_time: 9_000,
    // 60 days ago → passes only "Tout" and 90-day filter
    start_date_local: new Date(Date.now() - 60 * 86_400_000).toISOString(),
  },
];

module.exports = { MOCK_STRAVA_ACTIVITIES };
