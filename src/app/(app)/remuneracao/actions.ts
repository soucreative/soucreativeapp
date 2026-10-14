'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getSessionWithRole } from '@/lib/auth'
import { NAV_ACCESS } from '@/lib/permissions'

/** Quem abre a Remuneração é quem decide sobre ela */
async function quemDecide() {
  return await getSessionWithRole(NAV_ACCESS['/remuneracao'] ?? ['master', 'admin'])
}

const diaAntes = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Aprova uma proposta: fecha a remuneração em vigor à data e cria a nova.
 * Só aqui é que `compensation` muda — até então nada na app vê o aumento.
 */
export async function approveSalaryProposal(id: string): Promise<{ error?: string; ok?: boolean }> {
  const session = await quemDecide()
  if (!session) return { error: 'Sem permissão.' }

  const supabase = createAdminClient()
  const { data: prop, error: pErr } = await supabase
    .from('salary_proposals')
    .select('id, employee_id, proposed_salary, effective_date, status, notes')
    .eq('id', id)
    .maybeSingle()

  if (pErr)   return { error: pErr.message }
  if (!prop)  return { error: 'Proposta não encontrada.' }
  if (prop.status !== 'proposta') return { error: 'Esta proposta já foi decidida.' }

  // A remuneração em vigor à data de efeito — e só essa. O histórico tem
  // registos inertes de propósito e não se mexe no resto.
  const { data: emVigor } = await supabase
    .from('compensation')
    .select('id, effective_date, end_date')
    .eq('employee_id', prop.employee_id)
    .lte('effective_date', prop.effective_date)
    .order('effective_date', { ascending: false })
    .limit(1)

  const anterior = (emVigor ?? [])[0]
  if (anterior && (anterior.end_date === null || anterior.end_date >= prop.effective_date)) {
    const { error } = await supabase
      .from('compensation')
      .update({ end_date: diaAntes(prop.effective_date) })
      .eq('id', anterior.id)
    if (error) return { error: `Não foi possível fechar a remuneração anterior: ${error.message}` }
  }

  const { error: insErr } = await supabase.from('compensation').insert({
    employee_id:    prop.employee_id,
    base_salary:    prop.proposed_salary,
    effective_date: prop.effective_date,
    end_date:       null,
    notes:          prop.notes ?? 'Aprovado a partir de proposta salarial',
  })
  if (insErr) {
    // Deixar a proposta por decidir é melhor do que dizer que foi aprovada
    // sem a remuneração ter sido criada
    return { error: `Não foi possível criar a remuneração: ${insErr.message}` }
  }

  const { error: updErr } = await supabase
    .from('salary_proposals')
    .update({ status: 'aprovada', decided_by: session.id, decided_at: new Date().toISOString() })
    .eq('id', id)
  if (updErr) return { error: `Remuneração criada, mas a proposta ficou por fechar: ${updErr.message}` }

  revalidatePath('/remuneracao')
  revalidatePath('/financeiro')
  revalidatePath('/orcamento')
  return { ok: true }
}

/** Rejeita: a proposta fica no histórico, sem tocar em `compensation` */
export async function rejectSalaryProposal(id: string): Promise<{ error?: string; ok?: boolean }> {
  const session = await quemDecide()
  if (!session) return { error: 'Sem permissão.' }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('salary_proposals')
    .update({ status: 'rejeitada', decided_by: session.id, decided_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'proposta')

  if (error) return { error: error.message }

  revalidatePath('/remuneracao')
  return { ok: true }
}
