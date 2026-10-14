'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getSessionWithRole } from '@/lib/auth'
import { NAV_ACCESS } from '@/lib/permissions'
import { DEPARTMENTS } from '@/lib/departments'
import { fetchAllTocExpenseAccounts } from '@/lib/toc'

const KINDS = ['fse', 'investimento', 'financeiro', 'ignorar'] as const

async function canEdit(): Promise<boolean> {
  return !!(await getSessionWithRole(NAV_ACCESS['/financeiro']))
}

// ── Criar ou editar uma conta ─────────────────────────────────────────────

export async function upsertExpenseCode(
  _prev: unknown,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  if (!(await canEdit())) return { error: 'Sem permissão.' }

  const account_code = (formData.get('account_code') as string)?.trim()
  const rawCenter    = (formData.get('cost_center')  as string)?.trim() || null
  const rawKind      = (formData.get('kind')         as string)?.trim() || 'fse'
  const label        = (formData.get('label')        as string)?.trim() || `Conta ${account_code}`

  if (!account_code) return { error: 'Código de conta obrigatório.' }
  if (!(KINDS as readonly string[]).includes(rawKind)) return { error: 'Tipo inválido.' }
  if (rawCenter && !(DEPARTMENTS as readonly string[]).includes(rawCenter)) {
    return { error: 'Centro de custo inválido.' }
  }
  // Só um custo operacional pertence a um centro — a base de dados também o exige
  const cost_center = rawKind === 'fse' ? rawCenter : null

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('toc_expense_map')
    .upsert(
      { account_code, cost_center, label, kind: rawKind, updated_at: new Date().toISOString() },
      { onConflict: 'account_code' },
    )

  if (error) return { error: error.message }

  revalidatePath('/financeiro/expense-codes')
  revalidatePath('/financeiro')
  return { ok: true }
}

// ── Importar contas novas do TOC ──────────────────────────────────────────

export async function syncTocExpenseAccounts(): Promise<{
  imported: number
  skipped:  number
  error?:   string
}> {
  if (!(await canEdit())) return { imported: 0, skipped: 0, error: 'Sem permissão.' }

  let accounts: Awaited<ReturnType<typeof fetchAllTocExpenseAccounts>>
  try {
    accounts = await fetchAllTocExpenseAccounts()
  } catch (err) {
    return { imported: 0, skipped: 0, error: `Erro ao ler as contas do TOC: ${String(err)}` }
  }
  if (!accounts.length) {
    return { imported: 0, skipped: 0, error: 'O TOC devolveu 0 contas. Verifica a ligação.' }
  }

  const supabase = createAdminClient()
  const { data: existing, error } = await supabase.from('toc_expense_map').select('account_code')
  if (error) {
    return { imported: 0, skipped: 0, error: 'Falta a tabela toc_expense_map. Corre supabase/toc-expense-map.sql.' }
  }
  const known = new Set((existing ?? []).map(r => r.account_code))

  // Contas novas entram sem centro: quem classifica é quem sabe, não o palpite
  const novas = accounts.filter(a => !known.has(a.account_code))
  let imported = 0
  for (const a of novas) {
    const { error: insErr } = await supabase.from('toc_expense_map').insert({
      account_code: a.account_code,
      cost_center:  null,
      label:        a.description.slice(0, 200),
      kind:         'fse',
    })
    if (!insErr) imported++
  }

  if (imported > 0) {
    revalidatePath('/financeiro/expense-codes')
    revalidatePath('/financeiro')
  }
  return { imported, skipped: accounts.length - novas.length }
}

// ── Apagar ────────────────────────────────────────────────────────────────

export async function deleteExpenseCode(id: number): Promise<{ error?: string }> {
  if (!(await canEdit())) return { error: 'Sem permissão.' }

  const supabase = createAdminClient()
  const { error } = await supabase.from('toc_expense_map').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/financeiro/expense-codes')
  revalidatePath('/financeiro')
  return {}
}
