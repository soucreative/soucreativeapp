'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionWithRole } from '@/lib/auth'
import { NAV_ACCESS } from '@/lib/permissions'
import { efeitoStock, type TipoMovimento } from '@/lib/consignacoes'

type Resposta = { error: string } | { ok: true }

/** Só a gestão: as ações recebem pedidos diretos, não basta esconder a página. */
async function sessao() {
  return getSessionWithRole(NAV_ACCESS['/consignacoes'] ?? [])
}

const texto = (f: FormData, k: string) => ((f.get(k) as string) || '').trim() || null
const numero = (f: FormData, k: string) => {
  const v = Number(String(f.get(k) ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : NaN
}
const feito = (): Resposta => {
  revalidatePath('/consignacoes')
  return { ok: true }
}

// ── Criadores ─────────────────────────────────────────────────────────────

export async function guardarCriador(_: unknown, f: FormData): Promise<Resposta> {
  if (!(await sessao())) return { error: 'Sem permissão.' }
  const nome = texto(f, 'nome')
  if (!nome) return { error: 'Falta o nome do criador.' }
  const linha = {
    nome,
    nif: texto(f, 'nif'),
    email: texto(f, 'email'),
    telefone: texto(f, 'telefone'),
    iban: texto(f, 'iban'),
    notas: texto(f, 'notas'),
    ativo: f.get('ativo') === 'on',
  }
  const id = texto(f, 'id')
  const admin = createAdminClient()
  const { error } = id
    ? await admin.from('consig_criadores').update(linha).eq('id', id)
    : await admin.from('consig_criadores').insert(linha)
  return error ? { error: error.message } : feito()
}

// ── Produtos ──────────────────────────────────────────────────────────────

export async function guardarProduto(_: unknown, f: FormData): Promise<Resposta> {
  if (!(await sessao())) return { error: 'Sem permissão.' }
  const nome = texto(f, 'nome')
  const criador = texto(f, 'criador_id')
  const precoCriador = numero(f, 'preco_criador')
  const precoVenda = numero(f, 'preco_venda')
  const ivaPct = numero(f, 'iva')
  if (!nome || !criador) return { error: 'Falta o nome do produto ou o criador.' }
  if (!(precoCriador >= 0) || !(precoVenda >= 0)) return { error: 'Preços inválidos.' }
  if (!(ivaPct >= 0 && ivaPct < 100)) return { error: 'IVA inválido.' }
  const linha = {
    nome,
    criador_id: criador,
    referencia: texto(f, 'referencia'),
    preco_criador: precoCriador,
    preco_venda: precoVenda,
    iva: ivaPct / 100,
    notas: texto(f, 'notas'),
    ativo: f.get('ativo') === 'on',
  }
  const id = texto(f, 'id')
  const admin = createAdminClient()
  const { error } = id
    ? await admin.from('consig_produtos').update(linha).eq('id', id)
    : await admin.from('consig_produtos').insert(linha)
  return error ? { error: error.message } : feito()
}

// ── Movimentos ────────────────────────────────────────────────────────────

const TIPOS: TipoMovimento[] = ['entrada', 'venda', 'devolucao', 'ajuste']

export async function registarMovimento(_: unknown, f: FormData): Promise<Resposta> {
  const s = await sessao()
  if (!s) return { error: 'Sem permissão.' }
  const tipo = f.get('tipo') as TipoMovimento
  const produtoId = texto(f, 'produto_id')
  const quantidade = Math.round(numero(f, 'quantidade'))
  const data = texto(f, 'data')
  if (!TIPOS.includes(tipo)) return { error: 'Tipo de movimento inválido.' }
  if (!produtoId || !data) return { error: 'Falta o produto ou a data.' }
  if (!Number.isFinite(quantidade) || quantidade === 0 || (tipo !== 'ajuste' && quantidade < 0)) {
    return { error: tipo === 'ajuste' ? 'Quantidade diferente de zero (negativa para retirar).' : 'Quantidade maior que zero.' }
  }

  const admin = createAdminClient()
  const { data: produto } = await admin.from('consig_produtos').select('preco_criador, preco_venda').eq('id', produtoId).maybeSingle()
  if (!produto) return { error: 'Produto não encontrado.' }

  // Não se vende nem devolve o que não está na loja
  if (tipo === 'venda' || tipo === 'devolucao' || quantidade < 0) {
    const { data: ms } = await admin.from('consig_movimentos').select('tipo, quantidade').eq('produto_id', produtoId)
    const stock = (ms ?? []).reduce((t, m) => t + efeitoStock(m as { tipo: TipoMovimento; quantidade: number }), 0)
    const sai = tipo === 'ajuste' ? -quantidade : quantidade
    if (sai > stock) return { error: `Só há ${stock} em stock deste produto.` }
  }

  // O preço de venda pode ser outro (promoção); o do criador fica o do produto nesse dia
  const precoVenda = tipo === 'venda' && f.get('preco_venda') ? numero(f, 'preco_venda') : Number(produto.preco_venda)
  if (!(precoVenda >= 0)) return { error: 'Preço de venda inválido.' }
  const { error } = await admin.from('consig_movimentos').insert({
    produto_id: produtoId,
    tipo,
    quantidade,
    data,
    preco_criador: Number(produto.preco_criador),
    preco_venda: precoVenda,
    notas: texto(f, 'notas'),
    created_by: s.id,
  })
  return error ? { error: error.message } : feito()
}

export async function apagarMovimento(id: string): Promise<Resposta> {
  if (!(await sessao())) return { error: 'Sem permissão.' }
  const admin = createAdminClient()
  const { data } = await admin.from('consig_movimentos').select('liquidacao_id').eq('id', id).maybeSingle()
  if (!data) return { error: 'Movimento não encontrado.' }
  if (data.liquidacao_id) return { error: 'Esta venda já está num pagamento: anule o pagamento primeiro.' }
  const { error } = await admin.from('consig_movimentos').delete().eq('id', id)
  return error ? { error: error.message } : feito()
}

// ── Pagamentos aos criadores ──────────────────────────────────────────────

/** Junta num pagamento as vendas de um criador ainda por pagar, até uma data. */
export async function criarLiquidacao(criadorId: string, ate: string): Promise<Resposta> {
  const s = await sessao()
  if (!s) return { error: 'Sem permissão.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ate)) return { error: 'Data inválida.' }
  const admin = createAdminClient()
  const { data: produtos } = await admin.from('consig_produtos').select('id, nome, preco_criador').eq('criador_id', criadorId)
  const ids = (produtos ?? []).map((p) => p.id as string)
  if (!ids.length) return { error: 'Este criador não tem produtos.' }
  const { data: vendasBrutas } = await admin
    .from('consig_movimentos')
    .select('id, produto_id, quantidade, preco_criador')
    .eq('tipo', 'venda')
    .is('liquidacao_id', null)
    .lte('data', ate)
    .in('produto_id', ids)
  if (!vendasBrutas?.length) return { error: 'Não há vendas por pagar até essa data.' }
  // Vendas importadas do TOC sem preço do criador usam o do produto; sem nenhum, não se paga às cegas
  const precoDe = (v: { produto_id: string; preco_criador: number | null }) =>
    v.preco_criador != null && Number(v.preco_criador) > 0
      ? Number(v.preco_criador)
      : Number(produtos!.find((p) => p.id === v.produto_id)?.preco_criador ?? 0)
  const semPreco = [...new Set(vendasBrutas.filter((v) => !(precoDe(v) > 0)).map((v) => produtos!.find((p) => p.id === v.produto_id)?.nome))]
  if (semPreco.length) {
    return { error: `Falta o preço do criador em: ${semPreco.slice(0, 5).join(', ')}${semPreco.length > 5 ? ` e mais ${semPreco.length - 5}` : ''}. Preencha-o em Produtos.` }
  }
  const vendas = vendasBrutas.map((v) => ({ ...v, preco_criador: precoDe(v) }))
  const total = vendas.reduce((t, v) => t + Number(v.quantidade) * v.preco_criador, 0)

  const { data: liq, error } = await admin
    .from('consig_liquidacoes')
    .insert({ criador_id: criadorId, ate, total: Math.round(total * 100) / 100, created_by: s.id })
    .select('id')
    .single()
  if (error || !liq) return { error: error?.message ?? 'Não foi possível criar o pagamento.' }
  // Cada venda fica com o preço com que foi paga, para o extrato não mudar depois
  const porPreco = new Map<number, string[]>()
  for (const v of vendas) porPreco.set(v.preco_criador, [...(porPreco.get(v.preco_criador) ?? []), v.id as string])
  let e2: { message: string } | null = null
  for (const [preco, idsVenda] of porPreco) {
    const { error } = await admin.from('consig_movimentos').update({ liquidacao_id: liq.id, preco_criador: preco }).in('id', idsVenda)
    if (error) e2 = error
  }
  if (e2) {
    await admin.from('consig_movimentos').update({ liquidacao_id: null }).eq('liquidacao_id', liq.id)
    await admin.from('consig_liquidacoes').delete().eq('id', liq.id)
    return { error: e2.message }
  }
  return feito()
}

export async function marcarPago(id: string, pagoEm: string | null, referencia: string | null): Promise<Resposta> {
  if (!(await sessao())) return { error: 'Sem permissão.' }
  if (pagoEm && !/^\d{4}-\d{2}-\d{2}$/.test(pagoEm)) return { error: 'Data inválida.' }
  const { error } = await createAdminClient()
    .from('consig_liquidacoes')
    .update({ pago_em: pagoEm, referencia: referencia?.trim() || null })
    .eq('id', id)
  return error ? { error: error.message } : feito()
}

/** Desfaz um pagamento ainda não pago: as vendas voltam a ficar por pagar. */
export async function anularLiquidacao(id: string): Promise<Resposta> {
  if (!(await sessao())) return { error: 'Sem permissão.' }
  const admin = createAdminClient()
  const { data } = await admin.from('consig_liquidacoes').select('pago_em').eq('id', id).maybeSingle()
  if (!data) return { error: 'Pagamento não encontrado.' }
  if (data.pago_em) return { error: 'Já está marcado como pago: tire a data de pagamento primeiro.' }
  await admin.from('consig_movimentos').update({ liquidacao_id: null }).eq('liquidacao_id', id)
  const { error } = await admin.from('consig_liquidacoes').delete().eq('id', id)
  return error ? { error: error.message } : feito()
}
