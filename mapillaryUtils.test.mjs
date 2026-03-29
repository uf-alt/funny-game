import test from 'node:test'
import assert from 'node:assert/strict'

import { buildMapillaryBbox, clampLatitude, normalizeLongitude } from './mapillaryUtils.mjs'

function assertClose(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) < epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`)
}

test('normalizeLongitude wraps repeated world copies back into valid range', () => {
  assertClose(normalizeLongitude(-439.373217186106), -79.373217186106)
  assert.equal(normalizeLongitude(540), -180)
})

test('clampLatitude keeps values inside Mapillary-safe bounds', () => {
  assert.equal(clampLatitude(90), 85)
  assert.equal(clampLatitude(-90), -85)
  assert.equal(clampLatitude(43.65), 43.65)
})

test('buildMapillaryBbox returns a valid bbox for wrapped seeker clicks', () => {
  const bbox = buildMapillaryBbox(43.64870352895814, -439.373217186106)
  const [west, south, east, north] = bbox.split(',').map(Number)
  assertClose(west, -79.378217186106, 1e-9)
  assertClose(south, 43.64370352895814, 1e-9)
  assertClose(east, -79.368217186106, 1e-9)
  assertClose(north, 43.65370352895814, 1e-9)
})
