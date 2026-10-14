'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getCurrentEmployee } from '@/lib/auth'
import { fetchAllTocArticles } from '@/lib/toc'

// ── Upsert (criar ou editar) um item code ─────────────────────────────────

export async function upsertItemCode(
  _prev: unknown,
  formData: FormData,
): Promise<{ error?: string }> {
  const emp = await getCurrentEmployee()
  if (!emp || !['master', 'admin', 'management'].includes(emp.app_role)) {
    return { error: 'Sem permissão.' }
  }

  const item_code  = (formData.get('item_code')  as string)?.trim()
  const department = (formData.get('department') as string)?.trim() || null
  const label      = (formData.get('label')      as string)?.trim() || (department ? `Hora – ${department}` : `Hora (${item_code})`)

  if (!item_code) return { error: 'Código de artigo obrigatório.' }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('toc_item_map')
    .upsert(
      { item_code, department, label, updated_at: new Date().toISOString() },
      { onConflict: 'item_code' },
    )

  if (error) return { error: error.message }

  revalidatePath('/financeiro/item-codes')
  revalidatePath('/financeiro')
  return {}
}

// ── Sincronizar artigos do TOC Online ─────────────────────────────────────

export async function syncTocArticles(): Promise<{
  imported: number
  skipped:  number
  error?:   string
}> {
  const emp = await getCurrentEmployee()
  if (!emp || !['master', 'admin', 'management'].includes(emp.app_role)) {
    return { imported: 0, skipped: 0, error: 'Sem permissão.' }
  }

  let articles: Awaited<ReturnType<typeof fetchAllTocArticles>>
  try {
    articles = await fetchAllTocArticles()
  } catch (err) {
    return { imported: 0, skipped: 0, error: `Erro ao obter artigos do TOC: ${String(err)}` }
  }

  if (!articles.length) {
    return { imported: 0, skipped: 0, error: 'TOC Online devolveu 0 artigos. Verifica a ligação.' }
  }

  const supabase = createAdminClient()
  const { data: existing } = await supabase.from('toc_item_map').select('item_code')
  const existingCodes = new Set((existing ?? []).map(r => r.item_code))

  let imported = 0
  let skipped  = 0

  for (const art of articles) {
    const code = art.item_code.trim()
    if (!code) continue

    if (existingCodes.has(code)) {
      skipped++
      continue
    }

    const { error } = await supabase
      .from('toc_item_map')
      .insert({ item_code: code, department: null, label: art.description.trim() })

    if (!error) imported++
  }

  if (imported > 0) {
    revalidatePath('/financeiro/item-codes')
    revalidatePath('/financeiro')
  }

  return { imported, skipped }
}

// ── Eliminar um item code ─────────────────────────────────────────────────

export async function deleteItemCode(id: number): Promise<{ error?: string }> {
  const emp = await getCurrentEmployee()
  if (!emp || !['master', 'admin', 'management'].includes(emp.app_role)) {
    return { error: 'Sem permissão.' }
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from('toc_item_map').delete().eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/financeiro/item-codes')
  revalidatePath('/financeiro')
  return {}
}
