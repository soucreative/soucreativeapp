'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/auth'
import { isFullAccess } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export type EstadoIdeia = 'nova' | 'aceite' | 'em_curso' | 'feita' | 'rejeitada'

const ESTADOS: EstadoIdeia[] = ['nova', 'aceite', 'em_curso', 'feita', 'rejeitada']

/** Qualquer pessoa da equipa regista ideias; só a gestão decide o que lhes acontece. */
function decide(role: UserRole) {
  return isFullAccess(role) || role === 'management'
}

export async function registarIdeia(_: unknown, formData: FormData) {
  const s = await getCurrentEmployee()
  if (!s) return { error: 'Sem permissão.' }
  const titulo = ((formData.get('titulo') as string) || '').trim()
  if (!titulo) return { error: 'Falta o título.' }
  const { error } = await createAdminClient().from('dev_ideias').insert({
    titulo,
    descricao: ((formData.get('descricao') as string) || '').trim() || null,
    area: (formData.get('area') as string) || 'Geral',
    tipo: (formData.get('tipo') as string) === 'melhoria' ? 'melhoria' : 'ideia',
    autor_id: s.id,
  })
  if (error) return { error: error.message }
  revalidatePath('/sistema/devlog')
  return { ok: true }
}

export async function mudarEstadoIdeia(id: string, estado: EstadoIdeia) {
  const s = await getCurrentEmployee()
  if (!s || !decide(s.app_role)) return { error: 'Só a gestão muda o estado das ideias.' }
  if (!ESTADOS.includes(estado)) return { error: 'Estado inválido.' }
  const { error } = await createAdminClient()
    .from('dev_ideias')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/sistema/devlog')
  return { ok: true }
}
