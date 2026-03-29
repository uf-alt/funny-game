import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.vectorgrid'
import { Viewer } from 'mapillary-js'
import 'mapillary-js/dist/mapillary.css'

// Replace with your real Mapillary client token
const MAPILLARY_CLIENT_TOKEN = 'MLY|25844880571805344|6ba16628259e52b4c83c5780a1dd1608'

export const map = L.map('map').setView([0, 0], 4)

// Fullscreen control
const FullscreenControl = L.Control.extend({
  onAdd() {
    const btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control-fullscreen-btn')
    btn.innerHTML = '⛶'
    btn.title = 'Toggle fullscreen'
    L.DomEvent.on(btn, 'click', L.DomEvent.stop)
    L.DomEvent.on(btn, 'click', () => {
      const container = document.getElementById('view-container')
      if (!document.fullscreenElement) {
        container.requestFullscreen()
      } else {
        document.exitFullscreen()
      }
    })
    return btn
  },
})
map.addControl(new FullscreenControl({ position: 'topleft' }))

document.addEventListener('fullscreenchange', () => {
  map.invalidateSize()
})

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map)

const markers = []
let line = null
let clickEnabled = false
let clickCallback = null

// Mapillary viewer
const streetViewEl = document.getElementById('street-view')
const mapEl = document.getElementById('map')
let viewer = null
let viewerInitialized = false

function ensureViewer() {
  if (!viewerInitialized) {
    viewer = new Viewer({
      accessToken: MAPILLARY_CLIENT_TOKEN,
      container: streetViewEl,
    })
    viewerInitialized = true
  }
  return viewer
}

/**
 * Look up the nearest Mapillary image to (lat, lng) and preload it in the viewer.
 * Returns true if imagery was found, false otherwise.
 * Does NOT switch the visible view — use toggleView() for that.
 */
export async function loadStreetViewAt(lat, lng) {
  const delta = 0.005 // ~500m bounding box
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`
  const url = `https://graph.mapillary.com/images?access_token=${MAPILLARY_CLIENT_TOKEN}&fields=id&bbox=${bbox}&limit=1`
  try {
    const res = await fetch(url)
    const json = await res.json()
    if (json.data && json.data.length > 0) {
      const v = ensureViewer()
      v.moveTo(json.data[0].id).catch((err) => console.warn('Mapillary moveTo failed:', err))
      return true
    }
  } catch (e) {
    console.warn('Mapillary lookup failed:', e)
  }
  return false
}

function hideStreetView() {
  streetViewEl.style.display = 'none'
  mapEl.style.display = ''
  map.invalidateSize()
}

let streetViewVisible = false

export function toggleView() {
  if (streetViewVisible) {
    hideStreetView()
  } else {
    streetViewEl.style.display = ''
    mapEl.style.display = 'none'
  }
  streetViewVisible = !streetViewVisible
}

export function resetStreetView() {
  streetViewVisible = false
  hideStreetView()
}

map.on('click', (e) => {
  if (!clickEnabled) return
  if (clickCallback) clickCallback(e.latlng)
})

export function enableClick(cb) {
  clickEnabled = true
  clickCallback = cb
}

export function disableClick() {
  clickEnabled = false
  clickCallback = null
}

export function addMarker(latlng) {
  const marker = L.marker(latlng).addTo(map)
  markers.push(marker)
  return marker
}

export function clearMarkers() {
  markers.forEach((m) => map.removeLayer(m))
  markers.length = 0
  if (line) {
    map.removeLayer(line)
    line = null
  }
}

export function calculateDistance(latlng1, latlng2) {
  const distanceMeters = L.latLng(latlng1).distanceTo(L.latLng(latlng2))
  return +(distanceMeters / 1000).toFixed(2)
}

export function drawLine(latlng1, latlng2) {
  if (line) map.removeLayer(line)
  line = L.polyline([latlng1, latlng2], { color: 'red' }).addTo(map)
}

let coverageLayer = null

export function toggleCoverageLayer() {
  if (coverageLayer) {
    map.removeLayer(coverageLayer)
    coverageLayer = null
    return false
  }
  coverageLayer = L.vectorGrid.protobuf(
    `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${MAPILLARY_CLIENT_TOKEN}`,
    {
      vectorTileLayerStyles: {
        sequence: { color: '#05cbf0', weight: 2, opacity: 0.8 },
        image:    { radius: 2, fillColor: '#05cbf0', fill: true, fillOpacity: 0.6, stroke: false },
        overview: { color: '#05cbf0', weight: 1, opacity: 0.5 },
      },
      interactive: false,
      maxNativeZoom: 14,
      pane: 'overlayPane',
    }
  ).addTo(map)
  return true
}
