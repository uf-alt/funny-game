import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rifumnnvaoknoldtmqtv.supabase.co'
const supabaseAnonKey = 'sb_publishable_lBd8jzEhPbCJRTCfDDa0yw_F8QJco8K'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export function updateMessage(message, colorType) {
  const messageElement = document.getElementById('message')
  if (!messageElement) return

  messageElement.innerHTML = message
  if (colorType == 0) {
    messageElement.style.color = '#ff2348'
  } else if (colorType == 1) {
    messageElement.style.color = '#0bcd31'
  }
}
