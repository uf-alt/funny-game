import { supabase, updateMessage } from './supabase.js'
import { enableClick, disableClick, addMarker, clearMarkers, calculateDistance, drawLine, loadStreetViewAt, toggleView, resetStreetView, toggleCoverageLayer } from './game.js'
import { initPeer, connectToPeer, sendData, setOnConnected, setOnData, setOnDisconnected } from './peer.js'
import { findNearestCity } from './cities.js'

// -- Challenge data --

const LANDLOCKED_COUNTRIES = new Set([
  'AD','AF','AM','AT','AZ','BY','BF','BI','BT','BO','BW','CF','TD','CZ',
  'ET','HU','KZ','KG','LA','LS','LI','LU','MW','ML','MD','MN','NE','MK',
  'NP','PY','RW','RS','SM','SK','SS','SZ','TJ','TM','UG','UZ','VA','XK',
  'ZM','ZW',
])

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

async function getCountryCode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&zoom=5&format=json`
  const resp = await fetch(url, { headers: { 'User-Agent': 'JetLagDigitalEdition/1.0' } })
  const data = await resp.json()
  return (data.address?.country_code || '').toUpperCase()
}

async function getDistanceToCoastKm(lat, lng) {
  const radii = [10000, 75000, 300000, 1500000, 6000000]
  for (const radius of radii) {
    const query = `[out:json][timeout:20];way["natural"="coastline"](around:${radius},${lat},${lng});out center 50;`
    try {
      const resp = await fetch(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
      )
      const data = await resp.json()
      if (data.elements?.length > 0) {
        let minDist = Infinity
        for (const el of data.elements) {
          if (el.center) {
            const d = haversineKm(lat, lng, el.center.lat, el.center.lon)
            if (d < minDist) minDist = d
          }
        }
        return Math.round(minDist)
      }
    } catch (_) { /* try next radius */ }
  }
  return 9999
}

// -- DOM refs
const roleEl = document.getElementById('role')
const statusEl = document.getElementById('game-status')
const distanceEl = document.getElementById('distance')
const confirmBtn = document.getElementById('confirm-location-btn')
const guessBtn = document.getElementById('send-guess-btn')
const toggleViewBtn = document.getElementById('toggle-view-btn')

const finalResultEl = document.getElementById('final-result')
const challengePanelEl = document.getElementById('challenge-panel')
const challengeResultEl = document.getElementById('challenge-result-display')
const passTurnBtn = document.getElementById('pass-turn-btn')

// Game state
let role = null        // 'hider' | 'seeker'
let state = 'waiting'  // waiting | picking | guessing | result
let hiddenLocation = null
let guessLocation = null
let isInitiator = false
let round = 1          // 1 or 2
let myGuessDistance = null   // distance when I was the seeker
let theirGuessDistance = null // distance when they were the seeker

// Lobby state
let myLobbyId = null
let myPeerId = null
let currentUsername = null
let currentUserId = null

async function createLobby() {
  // Delete any old lobbies this user left behind before creating a new one
  await supabase.from('lobbies').delete().eq('host_username', currentUsername)

  const { data, error } = await supabase
    .from('lobbies')
    .insert({ host_peer_id: myPeerId, host_username: currentUsername })
    .select()
    .single()

  if (error) {
    updateMessage('Failed to create lobby: ' + error.message, 0)
    return
  }

  myLobbyId = data.id
  document.getElementById('create-lobby-btn').style.display = 'none'
  document.getElementById('lobby-list-container').style.display = 'none'
  document.getElementById('peer-status').textContent = 'Lobby created — waiting for someone to join...'
}

async function deleteLobby() {
  if (!myLobbyId) return
  await supabase.from('lobbies').delete().eq('id', myLobbyId)
  myLobbyId = null
}


async function loadLobbies() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('lobbies')
    .select('*')
    .gte('created_at', thirtyMinutesAgo)
    .order('created_at', { ascending: true })

  if (error) {
    updateMessage('Failed to load lobbies: ' + error.message, 0)
    return
  }

  const listEl = document.getElementById('lobby-list')
  if (data.length === 0) {
    listEl.textContent = 'No open lobbies.'
    return
  }

  listEl.innerHTML = ''
  data.forEach(lobby => {
    const time = new Date(lobby.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const hue = [...String(lobby.id)].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
    const item = document.createElement('div')
    item.className = 'lobby-entry'
    item.style.setProperty('--lobby-color', `hsl(${hue}, 70%, 55%)`)
    const joinBtn = document.createElement('button')
    joinBtn.textContent = 'Join'
    joinBtn.addEventListener('click', () => {
      document.getElementById('lobby-list-container').style.display = 'none'
      document.getElementById('peer-status').textContent = 'Connecting...'
      connectToPeer(lobby.host_peer_id)
    })
    item.innerHTML = `
      <div class="lobby-info">
        <span class="lobby-title">${lobby.host_username}'s lobby</span>
        <span class="lobby-meta">${lobby.host_peer_id} · ${time}</span>
      </div>`
    item.prepend(joinBtn)
    listEl.appendChild(item)
  })
}

function setStatus(text) { statusEl.textContent = text }
function setRole(r) {
  role = r
  roleEl.textContent = 'Role: ' + role
}

// -- State transitions --

function startHiderPicking() {
  state = 'picking'
  setStatus('Click the map to pick your hiding location')
  clearMarkers()
  hiddenLocation = null
  toggleViewBtn.style.display = 'none'
  resetStreetView()

  enableClick(async (latlng) => {
    clearMarkers()
    confirmBtn.style.display = 'none'
    toggleViewBtn.style.display = 'none'
    setStatus('Checking for street view coverage...')

    const hasImagery = await loadStreetViewAt(latlng.lat, latlng.lng)
    if (!hasImagery) {
      setStatus('No street view coverage here — try another spot')
      return
    }

    hiddenLocation = latlng
    addMarker(latlng)
    confirmBtn.style.display = ''
    toggleViewBtn.style.display = ''
    setStatus('Location selected — use Toggle Street View to fine-tune, then Confirm')
  })
}

function startSeekerWaiting() {
  state = 'waiting'
  setStatus('Waiting for hider to pick a location...')
  disableClick()
}

function startSeekerGuessing() {
  state = 'guessing'
  setStatus('Hider is ready! Click the map to place your guess')
  clearMarkers()
  guessLocation = null
  toggleViewBtn.style.display = 'none'
  resetStreetView()
  challengePanelEl.style.display = ''
  challengeResultEl.textContent = ''
  streetviewClueInput.style.display = 'none'
  streetviewClueText.value = ''
  unlockChallenges()

  enableClick(async (latlng) => {
    clearMarkers()
    guessBtn.style.display = 'none'
    toggleViewBtn.style.display = 'none'
    setStatus('Checking for street view coverage...')

    const hasImagery = await loadStreetViewAt(latlng.lat, latlng.lng)
    if (!hasImagery) {
      setStatus('No street view coverage here — try another spot')
      return
    }

    guessLocation = latlng
    addMarker(latlng)
    guessBtn.style.display = ''
    toggleViewBtn.style.display = ''
    setStatus('Guess placed — use Toggle Street View to explore, then Send Guess')
  })
}

function showResult(distanceKm) {
  state = 'result'
  disableClick()
  confirmBtn.style.display = 'none'
  guessBtn.style.display = 'none'
  toggleViewBtn.style.display = 'none'
  passTurnBtn.style.display = 'none'
  challengePanelEl.style.display = 'none'
  resetStreetView()
  if (distanceKm <= 1) {
    distanceEl.textContent = '🎉 Found! Only ' + distanceKm + ' km away!'
  } else {
    distanceEl.textContent = 'Round ' + round + ' Distance: ' + distanceKm + ' km'
  }

  // Track which distance belongs to whom
  if (role === 'seeker') {
    myGuessDistance = distanceKm
  } else {
    theirGuessDistance = distanceKm
  }

  if (round === 1) {
    if (isInitiator) {
      setStatus('Round 1 complete! Swapping roles in 3s...')
      setTimeout(() => startRound2(), 3000)
    } else {
      setStatus('Round 1 complete! Waiting for role swap...')
    }
  } else {
    showFinalResult()
  }
}

function startRound2() {
  round = 2
  clearMarkers()
  hiddenLocation = null
  guessLocation = null
  distanceEl.textContent = ''

  // Swap roles
  const newRole = role === 'hider' ? 'seeker' : 'hider'

  if (isInitiator) {
    // Initiator tells remote peer their new role
    sendData({ type: 'role', role: newRole === 'hider' ? 'seeker' : 'hider' })
  }

  setRole(newRole)
  if (newRole === 'hider') {
    startHiderPicking()
  } else {
    startSeekerWaiting()
  }
}

async function saveScore(distanceKm) {
  if (!currentUserId || distanceKm == null) return
  const score = Math.round(5000 * Math.exp(-distanceKm / 2000))
  const { error } = await supabase.from('scores').insert({ player_id: currentUserId, score })
  if (error) updateMessage('Could not save score: ' + error.message, 0)
}

function showFinalResult() {
  setStatus('Game over!')
  finalResultEl.style.display = ''
  saveScore(myGuessDistance)

  const myDist = myGuessDistance
  const theirDist = theirGuessDistance

  let summary = 'Your guess: ' + myDist + ' km | Opponent\'s guess: ' + theirDist + ' km\n'

  if (myDist < theirDist) {
    summary += '<br>You win! Your guess was closer.'
  } else if (theirDist < myDist) {
    summary += '<br>You lose! Opponent\'s guess was closer.'
  } else {
    summary += '<br>It\'s a tie!'
  }

  finalResultEl.innerHTML = summary
}

// -- Button handlers --

confirmBtn.addEventListener('click', () => {
  if (!hiddenLocation) return
  disableClick()
  confirmBtn.style.display = 'none'
  toggleViewBtn.style.display = 'none'
  resetStreetView()
  setStatus('Location locked in. Waiting for seeker to guess...')
  sendData({ type: 'hider-ready' })
})

toggleViewBtn.addEventListener('click', () => {
  toggleView()
})

const coverageBtn = document.getElementById('coverage-btn')
coverageBtn.addEventListener('click', () => {
  const on = toggleCoverageLayer()
  coverageBtn.textContent = on ? 'Hide Coverage' : 'Show Coverage'
})

guessBtn.addEventListener('click', () => {
  if (!guessLocation) return
  disableClick()
  guessBtn.style.display = 'none'
  toggleViewBtn.style.display = 'none'
  resetStreetView()
  setStatus('Guess sent! Waiting for result...')
  sendData({ type: 'guess', lat: guessLocation.lat, lng: guessLocation.lng })
})

// -- Challenge helpers --

function lockChallenges() {
  document.querySelectorAll('#challenge-panel button').forEach(b => { b.disabled = true })
}

function unlockChallenges() {
  document.querySelectorAll('#challenge-panel button').forEach(b => { b.disabled = false })
}

// -- Challenge handlers (seeker side) --

function sendChallenge(challengeType, params) {
  sendData({ type: 'challenge', challengeType, ...params })
}

document.querySelectorAll('#challenge-distance button').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!guessLocation) {
      challengeResultEl.textContent = 'Place a marker first.'
      return
    }
    const threshold = Number(btn.dataset.threshold)
    sendChallenge('distance', { threshold, lat: guessLocation.lat, lng: guessLocation.lng })
    lockChallenges()
    challengeResultEl.textContent = 'Waiting for answer...'
  })
})

document.querySelectorAll('#challenge-city button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const minPop = Number(btn.dataset.pop)
    sendChallenge('city', { minPop })
    lockChallenges()
    challengeResultEl.textContent = 'Waiting for answer...'
  })
})

document.getElementById('challenge-lat-btn').addEventListener('click', () => {
  if (!guessLocation) {
    challengeResultEl.textContent = 'Place a marker first.'
    return
  }
  sendChallenge('latitude', { lat: guessLocation.lat })
  lockChallenges()
  challengeResultEl.textContent = 'Waiting for answer...'
})

document.getElementById('challenge-quadrant-btn').addEventListener('click', () => {
  if (!guessLocation) {
    challengeResultEl.textContent = 'Place a marker first.'
    return
  }
  sendChallenge('quadrant', { lat: guessLocation.lat, lng: guessLocation.lng })
  lockChallenges()
  challengeResultEl.textContent = 'Waiting for answer...'
})

document.getElementById('challenge-landlocked-btn').addEventListener('click', () => {
  sendChallenge('landlocked', {})
  lockChallenges()
  challengeResultEl.textContent = 'Waiting for answer...'
})

document.getElementById('challenge-water-btn').addEventListener('click', () => {
  if (!guessLocation) {
    challengeResultEl.textContent = 'Place a marker first.'
    return
  }
  sendChallenge('water', { lat: guessLocation.lat, lng: guessLocation.lng })
  lockChallenges()
  challengeResultEl.textContent = 'Looking up coast distances...'
})

document.querySelectorAll('#challenge-streetview button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const clueType = btn.dataset.clue
    sendChallenge('streetview', { clueType })
    lockChallenges()
    challengeResultEl.textContent = 'Waiting for hider to describe...'
  })
})

const streetviewClueInput = document.getElementById('streetview-clue-input')
const streetviewCluePrompt = document.getElementById('streetview-clue-prompt')
const streetviewClueText = document.getElementById('streetview-clue-text')

document.getElementById('streetview-clue-send-btn').addEventListener('click', () => {
  const text = streetviewClueText.value.trim()
  if (!text) return
  sendData({
    type: 'challenge-result',
    challengeType: 'streetview',
    clueType: streetviewClueInput.dataset.clueType,
    clueText: text,
  })
  streetviewClueText.value = ''
  streetviewClueInput.style.display = 'none'
  showHiderExplorePhase()
})

passTurnBtn.addEventListener('click', () => {
  sendData({ type: 'hider-pass' })
  passTurnBtn.style.display = 'none'
  toggleViewBtn.style.display = 'none'
  resetStreetView()
  setStatus('Location locked in. Waiting for seeker...')
})

// -- P2P / Lobby --

initPeer().then((id) => {
  myPeerId = id
  document.getElementById('create-lobby-btn').style.display = ''
  loadLobbies()
}).catch((err) => {
  updateMessage('Failed to initialize P2P: ' + err.message, 0)
})

document.getElementById('create-lobby-btn').addEventListener('click', createLobby)

supabase
  .channel('lobbies-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'lobbies' }, () => {
    loadLobbies()
  })
  .subscribe()

setInterval(() => {
  if (document.getElementById('lobby-section').style.display !== 'none') {
    loadLobbies()
  }
}, 3000)

window.addEventListener('beforeunload', () => {
  deleteLobby()
})

setOnConnected((peerId, isHost) => {
  isInitiator = isHost
  updateMessage('Connected to peer: ' + peerId, 1)
  deleteLobby()

  document.getElementById('create-lobby-btn').style.display = 'none'
  document.getElementById('lobby-list-container').style.display = 'none'
  document.getElementById('player-slots').style.display = ''
  document.getElementById('slot-you-name').textContent = currentUsername

  if (!isInitiator) {
    document.getElementById('peer-status').textContent = 'Connected — waiting for host to start...'
    sendData({ type: 'ready', username: currentUsername })
  } else {
    document.getElementById('peer-status').textContent = 'Player connected!'
  }
})

function beginGame() {
  document.getElementById('lobby-section').style.display = 'none'
  document.getElementById('view-container').style.display = ''
  coverageBtn.style.display = ''

  if (isInitiator) {
    const iAmHider = Math.random() < 0.5
    const myRole = iAmHider ? 'hider' : 'seeker'
    const theirRole = iAmHider ? 'seeker' : 'hider'
    sendData({ type: 'role', role: theirRole })
    setRole(myRole)
    if (myRole === 'hider') {
      startHiderPicking()
    } else {
      startSeekerWaiting()
    }
  }
}

document.getElementById('start-game-btn').addEventListener('click', () => {
  sendData({ type: 'start' })
  beginGame()
})

setOnData((data) => {
  if (!data || !data.type) return

  switch (data.type) {
    case 'ready':
      if (isInitiator) {
        document.getElementById('slot-them-name').textContent = data.username || 'Guest'
        document.getElementById('slot-them').classList.add('slot-filled')
        document.getElementById('peer-status').textContent = 'Ready!'
        document.getElementById('start-game-btn').style.display = ''
        sendData({ type: 'hello', username: currentUsername })
      }
      break

    case 'hello':
      document.getElementById('slot-them-name').textContent = data.username || 'Host'
      document.getElementById('slot-them').classList.add('slot-filled')
      break

    case 'start':
      beginGame()
      break

    case 'role':
      // If we're already past round 1, this is the round 2 role swap
      if (round === 1 && role !== null) {
        round = 2
        clearMarkers()
        hiddenLocation = null
        guessLocation = null
        distanceEl.textContent = ''
      }
      setRole(data.role)
      if (data.role === 'hider') {
        startHiderPicking()
      } else {
        startSeekerWaiting()
      }
      break

    case 'hider-ready':
      if (role === 'seeker') {
        startSeekerGuessing()
      }
      break

    case 'guess':
      if (role === 'hider' && hiddenLocation) {
        const distanceKm = calculateDistance(hiddenLocation, { lat: data.lat, lng: data.lng })
        // Show both markers and line on hider's map
        clearMarkers()
        addMarker(hiddenLocation)
        addMarker({ lat: data.lat, lng: data.lng })
        drawLine(hiddenLocation, { lat: data.lat, lng: data.lng })
        sendData({ type: 'result', distanceKm })
        showResult(distanceKm)
      }
      break

    case 'result':
      if (role === 'seeker') {
        showResult(data.distanceKm)
      }
      break

    case 'challenge':
      if (role === 'hider' && hiddenLocation) {
        handleChallenge(data)
      }
      break

    case 'challenge-result':
      if (role === 'seeker') {
        renderChallengeResult(data)
      }
      break

    case 'hider-pass':
      if (role === 'seeker') {
        unlockChallenges()
        setStatus('Hider passed — ask another challenge or send your final guess')
      }
      break
  }
})

async function handleChallenge(data) {
  if (data.challengeType === 'distance') {
    const dist = calculateDistance(hiddenLocation, { lat: data.lat, lng: data.lng })
    sendData({
      type: 'challenge-result',
      challengeType: 'distance',
      threshold: data.threshold,
      answer: dist <= data.threshold,
    })
    showHiderExplorePhase()
  } else if (data.challengeType === 'city') {
    const result = await findNearestCity(hiddenLocation.lat, hiddenLocation.lng, data.minPop)
    sendData({
      type: 'challenge-result',
      challengeType: 'city',
      minPop: data.minPop,
      cityName: result ? result.name : 'Unknown',
      country: result ? result.country : '',
      distanceKm: result ? result.distanceKm : 0,
    })
    showHiderExplorePhase()
  } else if (data.challengeType === 'latitude') {
    let answer
    if (hiddenLocation.lat > data.lat + 0.01) {
      answer = 'south'
    } else if (hiddenLocation.lat < data.lat - 0.01) {
      answer = 'north'
    } else {
      answer = 'same'
    }
    sendData({ type: 'challenge-result', challengeType: 'latitude', answer })
    showHiderExplorePhase()
  } else if (data.challengeType === 'quadrant') {
    const ns = hiddenLocation.lat >= data.lat ? 'N' : 'S'
    const ew = hiddenLocation.lng >= data.lng ? 'E' : 'W'
    sendData({ type: 'challenge-result', challengeType: 'quadrant', quadrant: ns + ew })
    showHiderExplorePhase()
  } else if (data.challengeType === 'landlocked') {
    try {
      const countryCode = await getCountryCode(hiddenLocation.lat, hiddenLocation.lng)
      const isLandlocked = LANDLOCKED_COUNTRIES.has(countryCode)
      sendData({ type: 'challenge-result', challengeType: 'landlocked', isLandlocked, countryCode })
    } catch (_) {
      sendData({ type: 'challenge-result', challengeType: 'landlocked', isLandlocked: null, countryCode: '' })
    }
    showHiderExplorePhase()
  } else if (data.challengeType === 'water') {
    try {
      const [hiderDist, seekerDist] = await Promise.all([
        getDistanceToCoastKm(hiddenLocation.lat, hiddenLocation.lng),
        getDistanceToCoastKm(data.lat, data.lng),
      ])
      let closer
      if (seekerDist < hiderDist - 5) closer = 'seeker'
      else if (hiderDist < seekerDist - 5) closer = 'hider'
      else closer = 'same'
      sendData({ type: 'challenge-result', challengeType: 'water', closer, hiderDist, seekerDist })
    } catch (_) {
      sendData({ type: 'challenge-result', challengeType: 'water', closer: 'unknown', hiderDist: 0, seekerDist: 0 })
    }
    showHiderExplorePhase()
  } else if (data.challengeType === 'streetview') {
    showStreetViewClueInput(data.clueType)
    // showHiderExplorePhase is called after the hider submits the clue text
  }
}

function showHiderExplorePhase() {
  toggleViewBtn.style.display = ''
  passTurnBtn.style.display = ''
  setStatus('Challenge answered — explore street view, then pass your turn')
}

function showStreetViewClueInput(clueType) {
  const prompts = {
    language: 'Describe any text or signs visible — what language or script is used?',
    road: 'Describe the road — number of lanes, markings, surface, any visible signs?',
    building: 'Describe a prominent building in view — architecture, color, any features?',
  }
  streetviewCluePrompt.textContent = prompts[clueType] || 'Describe what you see in street view.'
  streetviewClueInput.dataset.clueType = clueType
  streetviewClueInput.style.display = ''
  streetviewClueText.value = ''
  toggleViewBtn.style.display = ''
  setStatus('Open street view, then describe what you see and send the clue')
}

function renderChallengeResult(data) {
  if (data.challengeType === 'distance') {
    if (data.answer) {
      challengeResultEl.innerHTML = `<span class="challenge-yes">✅ Yes, within ${data.threshold} km</span>`
    } else {
      challengeResultEl.innerHTML = `<span class="challenge-no">❌ No, not within ${data.threshold} km</span>`
    }
  } else if (data.challengeType === 'city') {
    const popLabel =
      data.minPop >= 1000000
        ? (data.minPop / 1000000).toFixed(0) + 'M+'
        : data.minPop >= 1000
        ? (data.minPop / 1000).toFixed(0) + 'K+'
        : data.minPop + '+'
    const distPart = data.distanceKm > 0 ? ` (${data.distanceKm} km away)` : ''
    challengeResultEl.innerHTML = `<span class="challenge-info">🏙️ Nearest ${popLabel} city: ${data.cityName}${data.country ? ', ' + data.country : ''}${distPart}</span>`
  } else if (data.challengeType === 'latitude') {
    if (data.answer === 'north') {
      challengeResultEl.innerHTML = `<span class="challenge-info">🧭 You are north of the hider</span>`
    } else if (data.answer === 'south') {
      challengeResultEl.innerHTML = `<span class="challenge-info">🧭 You are south of the hider</span>`
    } else {
      challengeResultEl.innerHTML = `<span class="challenge-info">🧭 You are at roughly the same latitude as the hider</span>`
    }
  } else if (data.challengeType === 'quadrant') {
    const labels = { NE: 'northeast', NW: 'northwest', SE: 'southeast', SW: 'southwest' }
    const label = labels[data.quadrant] || data.quadrant
    challengeResultEl.innerHTML = `<span class="challenge-info">🗺️ The hider is to your <strong>${label}</strong></span>`
  } else if (data.challengeType === 'landlocked') {
    if (data.isLandlocked === null) {
      challengeResultEl.innerHTML = `<span class="challenge-info">🏔️ Could not determine (lookup failed)</span>`
    } else if (data.isLandlocked) {
      challengeResultEl.innerHTML = `<span class="challenge-yes">🏔️ Yes — hider's country is landlocked</span>`
    } else {
      challengeResultEl.innerHTML = `<span class="challenge-no">🌊 No — hider's country has sea access</span>`
    }
  } else if (data.challengeType === 'water') {
    if (data.closer === 'unknown') {
      challengeResultEl.innerHTML = `<span class="challenge-info">🌊 Could not determine (lookup failed)</span>`
    } else if (data.closer === 'seeker') {
      challengeResultEl.innerHTML = `<span class="challenge-info">🌊 Your marker is closer to the coast (~${data.seekerDist} km vs hider's ~${data.hiderDist} km)</span>`
    } else if (data.closer === 'hider') {
      challengeResultEl.innerHTML = `<span class="challenge-info">🌊 The hider is closer to the coast (~${data.hiderDist} km vs your ~${data.seekerDist} km)</span>`
    } else {
      challengeResultEl.innerHTML = `<span class="challenge-info">🌊 About the same distance from the coast (~${data.hiderDist} km each)</span>`
    }
  } else if (data.challengeType === 'streetview') {
    const clueLabels = { language: '🔤 Signs/Language', road: '🛣️ Road', building: '🏢 Building' }
    const label = clueLabels[data.clueType] || '👁️ Street View'
    const escaped = data.clueText.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    challengeResultEl.innerHTML = `<span class="challenge-info">${label}: "${escaped}"</span>`
  }
}

setOnDisconnected(() => {
  updateMessage('Peer disconnected', 0)
  state = 'waiting'
  role = null
  round = 1
  myGuessDistance = null
  theirGuessDistance = null
  isInitiator = false
  disableClick()
  confirmBtn.style.display = 'none'
  guessBtn.style.display = 'none'
  toggleViewBtn.style.display = 'none'
  passTurnBtn.style.display = 'none'
  challengePanelEl.style.display = 'none'
  challengeResultEl.textContent = ''
  streetviewClueInput.style.display = 'none'
  streetviewClueText.value = ''
  unlockChallenges()
  finalResultEl.style.display = 'none'
  finalResultEl.textContent = ''
  resetStreetView()
  roleEl.textContent = ''
  statusEl.textContent = ''
  distanceEl.textContent = ''
  document.getElementById('view-container').style.display = 'none'
  coverageBtn.style.display = 'none'
  coverageBtn.textContent = 'Show Coverage'
  deleteLobby()
  document.getElementById('lobby-section').style.display = ''
  document.getElementById('lobby-list-container').style.display = ''
  document.getElementById('player-slots').style.display = 'none'
  document.getElementById('slot-them-name').textContent = 'Waiting...'
  document.getElementById('slot-them').classList.remove('slot-filled')
  document.getElementById('start-game-btn').style.display = 'none'
  loadLobbies()
})

// Auth guard
supabase.auth.onAuthStateChange((event, session) => {
  if (!session) {
    window.location.href = 'index.html'
    return
  }

  currentUserId = session.user.id
  const usernameSpan = document.getElementById('username')
  currentUsername = session.user.user_metadata?.username || session.user.email
  usernameSpan.textContent = currentUsername

  supabase
    .from('profiles')
    .select('username')
    .eq('id', session.user.id)
    .single()
    .then(({ data: profile }) => {
      if (profile?.username) {
        currentUsername = profile.username
        usernameSpan.textContent = profile.username
      }
    })
})

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut()
  if (error) {
    updateMessage('Logout failed: ' + error.message, 0)
  } else {
    window.location.href = 'index.html'
  }
})
