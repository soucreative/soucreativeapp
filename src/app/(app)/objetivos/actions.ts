'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionWithRole } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function upsertObjective(_: unknown, formData: FormData) {
  if (!(await getSessionWithRole(['management']))) return { error: 'Sem permissão.' }
  const supabase = createAdminClient()
  const id = formData.get('id') as string | null

  const data = {
    employee_id:  (formData.get('employee_id') as string) || null,
    title:        formData.get('title') as string,
    description:  (formData.get('description') as string) || null,
    type:         formData.get('type') as string,
    year:         Number(formData.get('year')),
    quarter:      formData.get('quarter') ? Number(formData.get('quarter')) : null,
    weight:       formData.get('weight') ? Number(formData.get('weight')) / 100 : null,
    target_value:  formData.get('target_value')  ? Number(formData.get('target_value'))  : null,
    minimum_base:  formData.get('minimum_base')  ? Number(formData.get('minimum_base'))  : null,
    actual_value:  formData.get('actual_value')  ? Number(formData.get('actual_value'))  : null,
    unit:         (formData.get('unit') as string) || null,
    status:       formData.get('status') as string,
    department:      (formData.get('department') as string) || null,
    responsible_id:  (formData.get('responsible_id') as string) || null,
  }

  const { error } = id
    ? await supabase.from('objectives').update(data).eq('id', id)
    : await supabase.from('objectives').insert(data)

  if (error) return { error: `Erro ao guardar objetivo: ${error.message}` }
  revalidatePath('/objetivos')
  return { success: true }
}

export async function deleteObjective(id: string) {
  if (!(await getSessionWithRole(['management']))) return { error: 'Sem permissão.' }
  const supabase = createAdminClient()
  const { error } = await supabase.from('objectives').delete().eq('id', id)
  if (error) return { error: 'Erro ao eliminar objetivo.' }
  revalidatePath('/objetivos')
  return { success: true }
}
