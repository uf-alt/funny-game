export const ROUND_COMPLETE_DISTANCE_KM = 100

export function isRoundComplete(distanceKm, thresholdKm = ROUND_COMPLETE_DISTANCE_KM) {
  return distanceKm <= thresholdKm
}

export function buildGuessResult(distanceKm, thresholdKm = ROUND_COMPLETE_DISTANCE_KM) {
  return {
    distanceKm,
    found: isRoundComplete(distanceKm, thresholdKm),
  }
}
