import { Peer } from 'peerjs'

let peer = null
let conn = null

// Create a peer with a random ID
export function initPeer() {
  return new Promise((resolve, reject) => {
    peer = new Peer()

    peer.on('open', (id) => {
      console.log('My peer ID:', id)
      document.getElementById('my-peer-id').textContent = id
      document.getElementById('peer-status').textContent = 'Ready'
      resolve(id)
    })

    peer.on('connection', (connection) => {
      conn = connection
      setupConnection(conn, true)
    })

    peer.on('error', (err) => {
      console.error('Peer error:', err)
      reject(err)
    })
  })
}

// Connect to another peer by their ID
export function connectToPeer(remotePeerId) {
  conn = peer.connect(remotePeerId)
  setupConnection(conn, false)
}

// Send data to the connected peer
export function sendData(data) {
  if (conn && conn.open) {
    conn.send(data)
  } else {
    console.warn('No open connection to send data')
  }
}

// Callbacks that other modules can override
export let onConnected = () => {}
export let onData = () => {}
export let onDisconnected = () => {}

export function setOnConnected(cb) { onConnected = cb }
export function setOnData(cb) { onData = cb }
export function setOnDisconnected(cb) { onDisconnected = cb }

function setupConnection(connection, isHost) {
  connection.on('open', () => {
    console.log('Connected to peer:', connection.peer)
    document.getElementById('peer-status').textContent = 'Connected'
    onConnected(connection.peer, isHost)
  })

  connection.on('data', (data) => {
    console.log('Received data:', data)
    onData(data)
  })

  connection.on('close', () => {
    console.log('Connection closed')
    document.getElementById('peer-status').textContent = 'Ready'
    conn = null
    onDisconnected()
  })
}
