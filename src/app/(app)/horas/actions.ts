'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/auth'
import { isFullAccess } from '@/lib/permissions'

/** Quem regista e apaga horas de outras pessoas; as restantes só tratam das suas */
const GESTORES = ['management', 'director'] as const

export async function registarHoras(_: unknown, formData: FormData) {
  const s = await getCurrentEmployee()
  if (!s) return { error: 'Sem permissão.' }
  const gestor = isFullAccess(s.app_role) || (GESTORES as readonly string[]).includes(s.app_role)

  const employeeId = (formData.get('employee_id') as string) || s.id
  if (!gestor && employeeId !== s.id) return { error: 'Só pode registar as suas horas.' }

  const date = formData.get('date') as string
  const hours = Number(String(formData.get('hours') ?? '').replace(',', '.'))
  if (!date) return { error: 'Falta a data.' }
  if (!Number.isFinite(hours) || hours <= 0 || hours > 16) return { error: 'Horas entre 0 e 16.' }

  const { error } = await createAdminClient().from('time_entries').insert({
    employee_id: employeeId,
    date,
    hours,
    billable: formData.get('billable') === 'on',
    orcamento_id: (formData.get('orcamento_id') as string) || null,
    description: ((formData.get('description') as string) || '').trim() || null,
    created_by: s.id,
  })
  if (error) return { error: error.message }
  revalidatePath('/horas')
  return { ok: true }
}

export async function apagarHoras(id: string) {
  const s = await getCurrentEmployee()
  if (!s) return { error: 'Sem permissão.' }
  const gestor = isFullAccess(s.app_role) || (GESTORES as readonly string[]).includes(s.app_role)
  const admin = createAdminClient()
  const { data } = await admin.from('time_entries').select('employee_id').eq('id', id).maybeSingle()
  if (!data) return { error: 'Registo não encontrado.' }
  if (!gestor && data.employee_id !== s.id) return { error: 'Só pode apagar as suas horas.' }
  const { error } = await admin.from('time_entries').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/horas')
  return { ok: true }
}
