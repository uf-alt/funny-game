import { supabase, updateMessage } from './supabase.js'

async function loadLeaderboard() {
  const { data: scores, error } = await supabase
    .from('scores')
    .select('player_id, score, played_at')
    .order('score', { ascending: false })
    .limit(20)

  if (error) {
    updateMessage('Failed to load leaderboard: ' + error.message, 0)
    return
  }

  if (!scores || scores.length === 0) {
    document.getElementById('leaderboard-container').textContent = 'No scores yet — play a game!'
    return
  }

  // Fetch usernames for all players in one query
  const playerIds = [...new Set(scores.map(s => s.player_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', playerIds)

  const profileMap = {}
  profiles?.forEach(p => { profileMap[p.id] = p.username })

  // Build the table
  const table = document.createElement('table')
  table.id = 'leaderboard-table'
  table.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        <th>Player</th>
        <th>Score</th>
        <th>Date</th>
      </tr>
    </thead>`

  const tbody = document.createElement('tbody')
  scores.forEach((row, i) => {
    const tr = document.createElement('tr')
    const date = new Date(row.played_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    const username = profileMap[row.player_id] || 'Unknown'
    tr.innerHTML = `
      <td class="lb-rank">${i + 1}</td>
      <td class="lb-player">${username}</td>
      <td class="lb-score">${row.score.toLocaleString()}</td>
      <td class="lb-date">${date}</td>`
    tbody.appendChild(tr)
  })

  table.appendChild(tbody)
  const container = document.getElementById('leaderboard-container')
  container.innerHTML = ''
  container.appendChild(table)
}

// Auth guard
supabase.auth.onAuthStateChange((event, session) => {
  if (!session) {
    window.location.href = 'index.html'
    return
  }

  const usernameSpan = document.getElementById('username')
  usernameSpan.textContent = session.user.user_metadata?.username || session.user.email

  supabase
    .from('profiles')
    .select('username')
    .eq('id', session.user.id)
    .single()
    .then(({ data: profile }) => {
      if (profile?.username) usernameSpan.textContent = profile.username
    })

  loadLeaderboard()
})
