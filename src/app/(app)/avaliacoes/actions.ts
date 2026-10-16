'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionWithRole } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function upsertReview(_: unknown, formData: FormData) {
  if (!(await getSessionWithRole(['management']))) return { error: 'Sem permissão.' }
  const supabase = createAdminClient()

  const id          = formData.get('id') as string | null
  const employee_id = formData.get('employee_id') as string
  const reviewer_id = (formData.get('reviewer_id') as string) || null
  const year        = Number(formData.get('year'))
  const quarter     = Number(formData.get('quarter'))
  const scoreRaw    = formData.get('score') as string
  const score       = scoreRaw && scoreRaw.trim() !== '' ? Number(scoreRaw) : null
  const status      = (formData.get('status') as string) || 'draft'

  const qualitative_notes    = (formData.get('qualitative_notes') as string)    || null
  const strengths            = (formData.get('strengths') as string)            || null
  const areas_for_improvement = (formData.get('areas_for_improvement') as string) || null

  if (!employee_id || !year || !quarter) return { error: 'Campos obrigatórios em falta.' }
  if (score !== null && (score < 0 || score > 10)) return { error: 'Pontuação deve ser entre 0 e 10.' }

  const submitted_at = status !== 'draft'  ? new Date().toISOString() : null
  const approved_at  = status === 'approved' ? new Date().toISOString() : null

  const payload = {
    employee_id,
    reviewer_id,
    year,
    quarter,
    score,
    qualitative_notes,
    strengths,
    areas_for_improvement,
    status,
    submitted_at,
    approved_at,
  }

  if (id) {
    const { error } = await supabase.from('quarterly_reviews').update(payload).eq('id', id)
    if (error) return { error: `Erro ao atualizar: ${error.message}` }
  } else {
    const { data: existing } = await supabase
      .from('quarterly_reviews')
      .select('id')
      .eq('employee_id', employee_id)
      .eq('year', year)
      .eq('quarter', quarter)
      .maybeSingle()

    if (existing) return { error: 'Já existe uma avaliação para este colaborador neste trimestre.' }

    const { error } = await supabase.from('quarterly_reviews').insert(payload)
    if (error) return { error: `Erro ao criar: ${error.message}` }
  }

  revalidatePath('/avaliacoes')
  return { success: true as const }
}

export async function deleteReview(_: unknown, formData: FormData) {
  if (!(await getSessionWithRole(['management']))) return { error: 'Sem permissão.' }
  const supabase = createAdminClient()
  const id = formData.get('id') as string
  const { error } = await supabase.from('quarterly_reviews').delete().eq('id', id)
  if (error) return { error: 'Erro ao eliminar avaliação.' }
  revalidatePath('/avaliacoes')
  return { success: true as const }
}
