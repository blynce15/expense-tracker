import { supabase } from './supabase'

// The user's settings row (table user_settings): budget start day, "About you" answers, onboarding status.
// Created on first save; until then fetchProfile() returns null.

// The table doesn't exist yet (migration 005_user_settings not run): behave as if there's no profile
const isMissingTable = (error) => error?.code === '42P01' || error?.code === 'PGRST205'

export async function fetchProfile() {
  const { data, error } = await supabase.from('user_settings').select('*').maybeSingle()
  if (error && !isMissingTable(error)) throw error
  return data ?? null
}

// Creates the row if needed and updates only the given fields
export async function saveProfile(patch) {
  const { error } = await supabase.from('user_settings').upsert(patch, { onConflict: 'user_id' })
  if (error) throw error
}

// Name and profile photo, shown in Profile and the avatar. Kept inside `answers` (no extra column needed);
// the photo is a small square JPEG stored as a data URL.
export const nameOf = (profile) => profile?.answers?.name?.trim() || ''
export const photoOf = (profile) => profile?.answers?.photo || null

async function saveAnswers(patch) {
  const profile = await fetchProfile()
  await saveProfile({ answers: { ...(profile?.answers ?? {}), ...patch } })
  window.dispatchEvent(new CustomEvent('profile:look', { detail: patch }))
}

export const saveName = (name) => saveAnswers({ name: name.trim() })
export const savePhoto = (dataUrl) => saveAnswers({ photo: dataUrl })

// Center-crops a picked image to a square and shrinks it to `size` px
export function squareJpeg(file, size = 256) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file could not be opened as a picture.'))
    }
    img.src = url
  })
}
