'use server'

import { createClient } from '@/lib/supabase/server'

export async function updatePassword(_: unknown, formData: FormData) {
  const password = formData.get('password') as string
  const confirm  = formData.get('confirm') as string

  if (!password || password.length < 8) return { error: 'A password deve ter pelo menos 8 caracteres.' }
  if (password !== confirm) return { error: 'As passwords não coincidem.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })

  if (error) return { error: `Erro ao alterar password: ${error.message}` }
  return { success: true }
}
