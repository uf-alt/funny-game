import { supabase, updateMessage } from './supabase.js'

// If already logged in, redirect to dashboard
supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    window.location.href = 'dashboard.html'
  }
})

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault()

  const email = document.getElementById('email').value
  const password = document.getElementById('password').value

  const { data, error } = await supabase.auth.signInWithPassword({
    email, password
  })

  if (error) {
    updateMessage('Login failed: ' + error.message, 0)
  } else {
    window.location.href = 'dashboard.html'
  }
})
