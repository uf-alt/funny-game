import test from 'node:test'
import assert from 'node:assert/strict'

import { ROUND_COMPLETE_DISTANCE_KM, buildGuessResult, isRoundComplete } from './roundLogic.mjs'

test('marks guesses above 100 km as incomplete', () => {
  assert.equal(isRoundComplete(100.01), false)

  const result = buildGuessResult(140)
  assert.deepEqual(result, { distanceKm: 140, found: false })
})

test('marks guesses at exactly 100 km as complete', () => {
  assert.equal(isRoundComplete(ROUND_COMPLETE_DISTANCE_KM), true)

  const result = buildGuessResult(ROUND_COMPLETE_DISTANCE_KM)
  assert.deepEqual(result, { distanceKm: ROUND_COMPLETE_DISTANCE_KM, found: true })
})

test('marks guesses below 100 km as complete', () => {
  assert.equal(isRoundComplete(3.5), true)

  const result = buildGuessResult(3.5)
  assert.deepEqual(result, { distanceKm: 3.5, found: true })
})
