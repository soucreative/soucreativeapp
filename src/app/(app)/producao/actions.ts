'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionWithRole } from '@/lib/auth'
import { calcularOrcamento, totalParaListas } from '@/lib/producao/engine'
import { PARAMETROS_INICIAIS } from '@/lib/producao/defaults'
import type { Artigo, Cliente, Orcamento, Parametros } from '@/lib/producao/types'
import { artigoDeLinha, carregarParametros } from './_lib/dados'

/** A equipa de produção usa a calculadora; os parâmetros de custo são da gestão. */
const PRODUCAO = ['management', 'director', 'employee'] as const
const GESTAO   = ['management', 'director'] as const

type Resultado<T = null> = { ok: true; valor: T } | { ok: false; erro: string }

const falha = (erro: string): Resultado<never> => ({ ok: false, erro })

// ── Parâmetros ────────────────────────────────────────────────────────────

export async function guardarParametros(p: Parametros): Promise<Resultado> {
  const s = await getSessionWithRole(GESTAO)
  if (!s) return falha('Só a gestão altera os parâmetros.')
  const { error } = await createAdminClient()
    .from('prod_parametros')
    .upsert({ id: 1, dados: p, updated_at: new Date().toISOString(), updated_by: s.id })
  return error ? falha(error.message) : { ok: true, valor: null }
}

export async function reporParametros(): Promise<Resultado<Parametros>> {
  const r = await guardarParametros(structuredClone(PARAMETROS_INICIAIS))
  return r.ok ? { ok: true, valor: structuredClone(PARAMETROS_INICIAIS) } : r
}

/** Contagem de stock: a produção acerta o stock sem poder mexer nos preços e custos. */
export async function atualizarStock(
  id: string,
  stock: number | undefined,
  stockMinimo: number | undefined,
): Promise<Resultado<Parametros>> {
  if (!(await getSessionWithRole(PRODUCAO))) return falha('Sem permissão.')
  const params = await carregarParametros()
  const consumiveis = params.consumiveis.map(c => (c.id === id ? { ...c, stock, stockMinimo } : c))
  const novos = { ...params, consumiveis }
  const { error } = await createAdminClient()
    .from('prod_parametros')
    .upsert({ id: 1, dados: novos, updated_at: new Date().toISOString() })
  return error ? falha(error.message) : { ok: true, valor: novos }
}

// ── Artigos ───────────────────────────────────────────────────────────────

export async function guardarArtigo(a: Artigo): Promise<Resultado> {
  if (!(await getSessionWithRole(PRODUCAO))) return falha('Sem permissão.')
  const { error } = await createAdminClient().from('prod_artigos').upsert({
    id: a.id, nome: a.nome, categoria: a.categoria, fornecedor: a.fornecedor,
    custo: a.custo, minimo: a.minimo, portes: a.portes, nota: a.nota ?? null,
  })
  return error ? falha(error.message) : { ok: true, valor: null }
}

/** Primeira gravação do catálogo: os artigos de partida passam a existir na base de dados. */
export async function semearArtigos(artigos: Artigo[]): Promise<Resultado> {
  if (!(await getSessionWithRole(PRODUCAO))) return falha('Sem permissão.')
  const { error } = await createAdminClient().from('prod_artigos').upsert(
    artigos.map(a => ({
      id: a.id, nome: a.nome, categoria: a.categoria, fornecedor: a.fornecedor,
      custo: a.custo, minimo: a.minimo, portes: a.portes, nota: a.nota ?? null,
    })),
  )
  return error ? falha(error.message) : { ok: true, valor: null }
}

export async function apagarArtigo(id: string): Promise<Resultado> {
  if (!(await getSessionWithRole(PRODUCAO))) return falha('Sem permissão.')
  const { error } = await createAdminClient().from('prod_artigos').delete().eq('id', id)
  return error ? falha(error.message) : { ok: true, valor: null }
}

// ── Clientes ──────────────────────────────────────────────────────────────

export async function guardarCliente(c: Cliente): Promise<Resultado> {
  if (!(await getSessionWithRole(PRODUCAO))) return falha('Sem permissão.')
  const { error } = await createAdminClient().from('prod_clientes').upsert({
    id: c.id, nome: c.nome, tipo: c.tipo, nif: c.nif || null, email: c.email || null,
    telefone: c.telefone || null, notas: c.notas || null, created_at: c.criadoEm,
  })
  return error ? falha(error.message) : { ok: true, valor: null }
}

// ── Orçamentos ────────────────────────────────────────────────────────────

/** Próximo número do ano: SOU-2026-0001, SOU-2026-0002, … */
async function proximoNumero(): Promise<string> {
  const ano = new Date().getFullYear()
  const { data } = await createAdminClient()
    .from('prod_orcamentos')
    .select('numero')
    .like('numero', `SOU-${ano}-%`)
    .order('numero', { ascending: false })
    .limit(1)
  const ultimo = data?.[0]?.numero ? Number(String(data[0].numero).slice(-4)) : 0
  return `SOU-${ano}-${String(ultimo + 1).padStart(4, '0')}`
}

function linhaOrcamento(o: Orcamento, params: Parametros) {
  const r = calcularOrcamento(params, o)
  return {
    id: o.id,
    numero: o.numero,
    cliente_id: o.clienteId ?? null,
    estado: o.estado,
    data: o.data,
    conteudo: o,
    total: totalParaListas(o, r),
    margem: o.congelado?.margem ?? r.margem,
    updated_at: new Date().toISOString(),
  }
}

export async function criarOrcamento(o: Orcamento): Promise<Resultado<Orcamento>> {
  const s = await getSessionWithRole(PRODUCAO)
  if (!s) return falha('Sem permissão.')
  const params = await carregarParametros()
  const admin = createAdminClient()
  // Dois pedidos ao mesmo tempo podem calcular o mesmo número: o índice único
  // recusa o segundo e tenta-se outra vez.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const novo = { ...o, numero: await proximoNumero() }
    const { error } = await admin.from('prod_orcamentos').insert({ ...linhaOrcamento(novo, params), created_by: s.id })
    if (!error) return { ok: true, valor: novo }
    if (error.code !== '23505') return falha(error.message)
  }
  return falha('Não foi possível atribuir um número ao orçamento. Tente outra vez.')
}

export async function guardarOrcamento(o: Orcamento): Promise<Resultado> {
  if (!(await getSessionWithRole(PRODUCAO))) return falha('Sem permissão.')
  const params = await carregarParametros()
  const { error } = await createAdminClient()
    .from('prod_orcamentos')
    .update(linhaOrcamento(o, params))
    .eq('id', o.id)
  return error ? falha(error.message) : { ok: true, valor: null }
}

export async function apagarOrcamento(id: string): Promise<Resultado> {
  if (!(await getSessionWithRole(PRODUCAO))) return falha('Sem permissão.')
  const { error } = await createAdminClient().from('prod_orcamentos').delete().eq('id', id)
  return error ? falha(error.message) : { ok: true, valor: null }
}

/**
 * Fim da produção: o consumo estimado sai do stock e o orçamento fica marcado.
 * O consumo é recalculado aqui, a partir do orçamento gravado, e não aceite do
 * browser — senão qualquer pedido podia mexer no stock à vontade.
 */
export async function marcarProduzido(id: string): Promise<Resultado<Parametros>> {
  if (!(await getSessionWithRole(PRODUCAO))) return falha('Sem permissão.')
  const admin = createAdminClient()
  const { data, error } = await admin.from('prod_orcamentos').select('conteudo').eq('id', id).maybeSingle()
  if (error || !data) return falha(error?.message ?? 'Orçamento não encontrado.')
  const o = data.conteudo as Orcamento
  if (o.estado !== 'ganho') return falha('Só um orçamento ganho pode ser marcado como produzido.')
  if (o.produzidoEm) return falha('Este orçamento já foi marcado como produzido.')

  const params = await carregarParametros()
  const { consumos } = calcularOrcamento(params, o)
  const consumiveis = params.consumiveis.map(c =>
    consumos[c.id] && c.stock != null ? { ...c, stock: Math.max(0, c.stock - consumos[c.id]) } : c,
  )
  const novosParams = { ...params, consumiveis }
  const produzido = { ...o, produzidoEm: new Date().toISOString() }

  const [p, q] = await Promise.all([
    admin.from('prod_parametros').upsert({ id: 1, dados: novosParams, updated_at: new Date().toISOString() }),
    admin.from('prod_orcamentos').update(linhaOrcamento(produzido, params)).eq('id', id),
  ])
  if (p.error || q.error) return falha((p.error ?? q.error)!.message)
  return { ok: true, valor: novosParams }
}

// ── Artigos do TOC Online ─────────────────────────────────────────────────

type ProdutoToc = {
  id: string
  attributes: {
    item_code: string
    item_description: string
    purchase_price: number | null
    estimated_total_cost: number | null
    sales_price: number | null
    sales_price_includes_vat: boolean | null
    is_active: boolean
  }
  relationships?: { item_families?: { data: { id: string } | { id: string }[] | null } }
}

async function lerToc<T>(caminho: string): Promise<T> {
  const { getValidAccessToken } = await import('@/lib/toc')
  const token = await getValidAccessToken()
  const api = process.env.TOC_API_URL ?? 'https://api9.toconline.pt'
  const res = await fetch(`${api}${caminho}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`TOC respondeu ${res.status} em ${caminho}`)
  return res.json() as Promise<T>
}

async function produtosEFamilias() {
  const [prod, fam] = await Promise.all([
    lerToc<{ data: ProdutoToc[] }>('/api/products'),
    lerToc<{ data: { id: string; attributes: { description?: string; name?: string } }[] }>('/api/item_families'),
  ])
  const nomeFamilia = new Map(fam.data.map(f => [f.id, (f.attributes.description ?? f.attributes.name ?? f.id).trim()]))
  const familiaDe = (p: ProdutoToc) => {
    const d = p.relationships?.item_families?.data
    const id = Array.isArray(d) ? d[0]?.id : d?.id
    return id ? nomeFamilia.get(id) ?? 'Sem família' : 'Sem família'
  }
  return { produtos: prod.data, familiaDe }
}

/** Famílias de produtos do TOC, com quantos produtos ativos tem cada uma. */
export async function familiasToc(): Promise<Resultado<{ nome: string; produtos: number }[]>> {
  if (!(await getSessionWithRole(PRODUCAO))) return falha('Sem permissão.')
  try {
    const { produtos, familiaDe } = await produtosEFamilias()
    const conta = new Map<string, number>()
    for (const p of produtos) if (p.attributes.is_active) conta.set(familiaDe(p), (conta.get(familiaDe(p)) ?? 0) + 1)
    return {
      ok: true,
      valor: [...conta.entries()].map(([nome, n]) => ({ nome, produtos: n })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt')),
    }
  } catch (e) {
    return falha(e instanceof Error ? e.message : 'Erro ao ler o TOC.')
  }
}

/**
 * Traz para o catálogo os produtos ativos das famílias escolhidas. O TOC manda
 * no nome, na família e no custo (preço de compra); o fornecedor, o mínimo e os
 * portes ficam como foram editados na app. Os artigos criados à mão não mexem.
 */
export async function sincronizarArtigosToc(
  familias: string[],
  apagarOutros = false,
): Promise<Resultado<{ artigos: Artigo[]; novos: number; atualizados: number; removidos: number; parametros: Parametros }>> {
  if (!(await getSessionWithRole(PRODUCAO))) return falha('Sem permissão.')
  try {
    const { produtos, familiaDe } = await produtosEFamilias()
    const escolhidos = produtos.filter(p => p.attributes.is_active && familias.includes(familiaDe(p)))
    const admin = createAdminClient()
    const { data: existentes } = await admin.from('prod_artigos').select('*').like('id', 'toc:%')
    const porId = new Map((existentes ?? []).map(a => [a.id as string, a]))

    let novos = 0
    let atualizados = 0
    const linhas = escolhidos.map(p => {
      const a = p.attributes
      const id = `toc:${a.item_code}`
      const antigo = porId.get(id)
      if (antigo) atualizados++
      else novos++
      const custo = Number(a.purchase_price) || Number(a.estimated_total_cost) || 0
      const pvp = Number(a.sales_price) || 0
      return {
        id,
        nome: a.item_description || a.item_code,
        categoria: familiaDe(p),
        fornecedor: antigo?.fornecedor ?? '',
        custo,
        minimo: antigo?.minimo ?? 1,
        portes: antigo?.portes ?? 0,
        nota: `TOC ${a.item_code}${pvp ? ` · PVP ${pvp.toFixed(2).replace('.', ',')} €${a.sales_price_includes_vat ? ' c/ IVA' : ''}` : ''}`,
      }
    })
    if (linhas.length) {
      const { error } = await admin.from('prod_artigos').upsert(linhas)
      if (error) return falha(error.message)
    }

    // O catálogo do TOC espelha a escolha: saem os produtos de famílias
    // desmarcadas ou que deixaram de estar ativos. Os criados na app só saem
    // se for pedido.
    const ficam = new Set(linhas.map(l => l.id))
    const { data: todosIds } = await admin.from('prod_artigos').select('id')
    const sair = (todosIds ?? [])
      .map(r => r.id as string)
      .filter(id => !ficam.has(id) && (apagarOutros || id.startsWith('toc:')))
    for (let i = 0; i < sair.length; i += 200) {
      const { error } = await admin.from('prod_artigos').delete().in('id', sair.slice(i, i + 200))
      if (error) return falha(error.message)
    }

    // Guarda a escolha das famílias e a hora, para a próxima sincronização
    const params = await carregarParametros()
    const novosParams = { ...params, tocFamiliasArtigos: familias, tocUltimaSincronizacao: new Date().toISOString() }
    await admin.from('prod_parametros').upsert({ id: 1, dados: novosParams, updated_at: new Date().toISOString() })

    const { data: todos } = await admin.from('prod_artigos').select('*').order('categoria').order('nome')
    return {
      ok: true,
      valor: { artigos: (todos ?? []).map(artigoDeLinha), novos, atualizados, removidos: sair.length, parametros: novosParams },
    }
  } catch (e) {
    return falha(e instanceof Error ? e.message : 'Erro ao sincronizar com o TOC.')
  }
}
