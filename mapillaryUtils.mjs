const MAX_MAPILLARY_LAT = 85

export function normalizeLongitude(lng) {
  return ((lng + 180) % 360 + 360) % 360 - 180
}

export function clampLatitude(lat) {
  return Math.max(-MAX_MAPILLARY_LAT, Math.min(MAX_MAPILLARY_LAT, lat))
}

export function buildMapillaryBbox(lat, lng, delta = 0.005) {
  const safeLat = clampLatitude(lat)
  const safeLng = normalizeLongitude(lng)
  const west = Math.max(-180, safeLng - delta)
  const south = Math.max(-MAX_MAPILLARY_LAT, safeLat - delta)
  const east = Math.min(180, safeLng + delta)
  const north = Math.min(MAX_MAPILLARY_LAT, safeLat + delta)
  return `${west},${south},${east},${north}`
}
