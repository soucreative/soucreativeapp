'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionWithRole } from '@/lib/auth'
import { calcularOrcamento } from '@/lib/producao/engine'
import { PARAMETROS_INICIAIS } from '@/lib/producao/defaults'
import type { Artigo, Cliente, Orcamento, Parametros } from '@/lib/producao/types'
import { carregarParametros } from './_lib/dados'

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
    total: o.congelado?.total ?? r.total,
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
