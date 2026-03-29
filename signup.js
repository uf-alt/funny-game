import { supabase, updateMessage } from './supabase.js'

// If already logged in, redirect to dashboard
supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    window.location.href = 'dashboard.html'
  }
})

document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault()

  const username = document.getElementById('signup-username').value
  const email = document.getElementById('signup-email').value
  const password = document.getElementById('signup-password').value

  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { username } }
  })

  if (error) {
    updateMessage('Sign up failed: ' + error.message, 0)
  } else {
    updateMessage('Check your email to confirm your account!', 1)
  }
})
