'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionWithRole } from '@/lib/auth'
import { NAV_ACCESS } from '@/lib/permissions'
import { getValidAccessToken } from '@/lib/toc'
import { efeitoStock, type TipoMovimento } from '@/lib/consignacoes'
import { importarConsignacoesToc, lerFamiliasToc, type FamiliaToc, type ResultadoImportacao } from '@/lib/consignacoes-toc'

export type { FamiliaToc, ResultadoImportacao }

/** Só a gestão: as ações recebem pedidos diretos, não basta esconder a página. */
async function sessao() {
  return getSessionWithRole(NAV_ACCESS['/consignacoes'] ?? [])
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : 'Erro ao ler o TOC.')

/** Famílias do TOC com produtos, para escolher quais são consignações. */
export async function familiasDoToc(): Promise<{ error: string } | { ok: true; valor: FamiliaToc[] }> {
  if (!(await sessao())) return { error: 'Sem permissão.' }
  try {
    return { ok: true, valor: await lerFamiliasToc(await getValidAccessToken()) }
  } catch (e) {
    return { error: mensagem(e) }
  }
}

/** Puxa do TOC os criadores, produtos e vendas das famílias escolhidas. */
export async function importarDoToc(familiaIds: string[]): Promise<{ error: string } | { ok: true; valor: ResultadoImportacao }> {
  const s = await sessao()
  if (!s) return { error: 'Sem permissão.' }
  try {
    const r = await importarConsignacoesToc(createAdminClient(), await getValidAccessToken(), familiaIds, s.id)
    if ('ok' in r) revalidatePath('/consignacoes')
    return r
  } catch (e) {
    return { error: mensagem(e) }
  }
}

/**
 * Contagem na loja: o stock passa a ser o contado. A diferença para cima entra
 * como entrada (peças que o criador deixou e não estavam registadas); para
 * baixo, como ajuste.
 */
export async function contarInventario(produtoId: string, contado: number, data: string): Promise<{ error: string } | { ok: true }> {
  const s = await sessao()
  if (!s) return { error: 'Sem permissão.' }
  if (!Number.isInteger(contado) || contado < 0) return { error: 'A contagem tem de ser um número inteiro, zero ou mais.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { error: 'Data inválida.' }
  const admin = createAdminClient()
  const { data: ms } = await admin.from('consig_movimentos').select('tipo, quantidade').eq('produto_id', produtoId)
  const stock = (ms ?? []).reduce((t, m) => t + efeitoStock(m as { tipo: TipoMovimento; quantidade: number }), 0)
  const diferenca = contado - stock
  if (diferenca === 0) return { ok: true }
  const { data: produto } = await admin.from('consig_produtos').select('preco_criador, preco_venda').eq('id', produtoId).maybeSingle()
  const { error } = await admin.from('consig_movimentos').insert({
    produto_id: produtoId,
    tipo: diferenca > 0 ? 'entrada' : 'ajuste',
    quantidade: diferenca,
    data,
    preco_criador: produto?.preco_criador ?? null,
    preco_venda: produto?.preco_venda ?? null,
    notas: `Contagem de inventário: ${contado} na loja (estava ${stock})`,
    created_by: s.id,
  })
  if (error) return { error: error.message }
  revalidatePath('/consignacoes')
  return { ok: true }
}
