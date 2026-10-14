'use server'

import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/site-url'
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
