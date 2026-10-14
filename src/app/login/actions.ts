'use server'

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export async function login(_: unknown, formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email:    formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) return { error: 'Email ou password incorretos.' }
  redirect('/')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

// O endereço de volta vem do próprio pedido: assim o login funciona igual em
// localhost e na Vercel, sem depender de NEXT_PUBLIC_APP_URL estar certo.
async function siteUrl() {
  const h = await headers()
  const origin = h.get('origin')
  if (origin) return origin
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3200')
}

export async function loginWithGoogle() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${await siteUrl()}/auth/callback?next=/` },
  })

  redirect(error || !data.url ? '/login?error=google_indisponivel' : data.url)
}

export async function requestPasswordReset(_: unknown, formData: FormData) {
  const supabase  = await createClient()
  const email     = formData.get('email') as string
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteUrl()}/auth/callback?next=/auth/set-password`,
  })

  if (error) return { error: error.message }
  return { success: true }
}
