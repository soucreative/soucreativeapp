import type { createAdminClient } from '@/lib/supabase/admin'
import type { TipoMovimento } from '@/lib/consignacoes'

/**
 * Consignações a partir do TOC Online.
 *
 * No TOC, cada criador em consignação tem uma família de artigos ("Consignação
 * Eunice Ferreira", "Feijanito (Consignação)"…). Daí saem os criadores, os
 * produtos (código, descrição, preço de venda, IVA e, quando existe, o preço de
 * compra = preço do criador) e as vendas (linhas das faturas FR/FS/FT, menos as
 * notas de crédito). As entradas de peças não estão no TOC: o stock acerta-se
 * com uma contagem na loja.
 *
 * Pode correr-se várias vezes: os produtos ligam-se pelo código do TOC e cada
 * venda leva no campo das notas a marca do documento, para não entrar duas vezes.
 */


const API = process.env.TOC_API_URL ?? 'https://api9.toconline.pt'
const IVA_TOC: Record<string, number> = { NOR: 0.23, INT: 0.13, RED: 0.06, ISE: 0 }
const VENDAS = new Set(['FR', 'FS', 'FT'])
const MARCA = 'TOC '

async function toc<T>(caminho: string, token: string): Promise<T> {
  const r = await fetch(API + caminho, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store' })
  if (!r.ok) throw new Error(`TOC respondeu ${r.status} em ${caminho}`)
  return r.json() as Promise<T>
}

type Familia = { id: string; attributes: { name: string } }
type Produto = {
  id: string
  attributes: {
    item_code: string
    item_description: string
    sales_price: number | null
    sales_price_includes_vat: boolean | null
    tax_code: string | null
    purchase_price: number | null
    is_active: boolean | null
  }
  relationships?: { item_families?: { data?: { id: string } | null } }
}
type Linha = { item_code?: string; quantity?: number; unit_price?: number; tax_percentage?: number; item_unit_price_includes_vat?: boolean }
type Documento = { document_type: string; document_no: string; date: string; status: number; lines?: Linha[] }

const ehConsignacao = (nome: string) => /consigna/i.test(nome)

/** Nome do criador a partir do nome da família: sem "Consignação" nem sinais soltos. */
function nomeCriador(familia: string): string {
  const n = familia
    .replace(/\(?\s*consigna[çc][ãa]o\s*\)?/gi, ' ')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : familia.trim()
}

export interface FamiliaToc {
  id: string
  nome: string
  criador: string
  produtos: number
  consignacao: boolean // tem "consignação" no nome: escolhida à partida
}

/** Famílias do TOC com produtos, para escolher quais são consignações. */
export async function lerFamiliasToc(token: string): Promise<FamiliaToc[]> {
  {
    const [fam, prod] = await Promise.all([
      toc<{ data: Familia[] }>('/api/item_families', token),
      toc<{ data: Produto[] }>('/api/products', token),
    ])
    const contagem = new Map<string, number>()
    for (const p of prod.data ?? []) {
      const f = p.relationships?.item_families?.data?.id
      if (f) contagem.set(f, (contagem.get(f) ?? 0) + 1)
    }
    const lista = (fam.data ?? [])
      .map((f) => ({
        id: f.id,
        nome: f.attributes.name.trim(),
        criador: nomeCriador(f.attributes.name),
        produtos: contagem.get(f.id) ?? 0,
        consignacao: ehConsignacao(f.attributes.name),
      }))
      .filter((f) => f.produtos > 0)
      .sort((a, b) => Number(b.consignacao) - Number(a.consignacao) || a.nome.localeCompare(b.nome, 'pt'))
    return lista
  }
}

export interface ResultadoImportacao {
  criadoresNovos: number
  produtosNovos: number
  produtosAtualizados: number
  vendasNovas: number
  pecasVendidas: number
  semPrecoCriador: number
  desde: string | null
}

/** Puxa do TOC os criadores, produtos e vendas das famílias escolhidas. */
export async function importarConsignacoesToc(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
  familiaIds: string[],
  autorId: string | null,
): Promise<{ error: string } | { ok: true; valor: ResultadoImportacao }> {
  if (!familiaIds.length) return { error: 'Escolha pelo menos uma família.' }
  const s = { id: autorId }

  let familias: Familia[], produtosToc: Produto[], documentos: Documento[]
  try {
    const [f, p, d] = await Promise.all([
      toc<{ data: Familia[] }>('/api/item_families', token),
      toc<{ data: Produto[] }>('/api/products', token),
      toc<Documento[]>('/api/v1/commercial_sales_documents', token),
    ])
    familias = (f.data ?? []).filter((x) => familiaIds.includes(x.id))
    produtosToc = (p.data ?? []).filter((x) => familiaIds.includes(x.relationships?.item_families?.data?.id ?? ''))
    documentos = d
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao ler o TOC.' }
  }

  const res: ResultadoImportacao = { criadoresNovos: 0, produtosNovos: 0, produtosAtualizados: 0, vendasNovas: 0, pecasVendidas: 0, semPrecoCriador: 0, desde: null }

  // ── Criadores: o de uma família é o dos seus produtos já importados; senão, pelo nome
  const [{ data: criadoresApp }, { data: produtosApp }] = await Promise.all([
    admin.from('consig_criadores').select('id, nome'),
    admin.from('consig_produtos').select('id, criador_id, referencia, preco_criador'),
  ])
  const criadores = [...(criadoresApp ?? [])] as { id: string; nome: string }[]
  const produtos = [...(produtosApp ?? [])] as { id: string; criador_id: string; referencia: string | null; preco_criador: number }[]
  const porCodigo = new Map(produtos.filter((p) => p.referencia).map((p) => [p.referencia!, p]))

  const criadorDaFamilia = new Map<string, string>()
  for (const f of familias) {
    const codigos = produtosToc.filter((p) => p.relationships?.item_families?.data?.id === f.id).map((p) => p.attributes.item_code)
    const jaLigado = codigos.map((c) => porCodigo.get(c)?.criador_id).find(Boolean)
    if (jaLigado) {
      criadorDaFamilia.set(f.id, jaLigado)
      continue
    }
    const nome = nomeCriador(f.attributes.name)
    const existente = criadores.find((c) => c.nome.trim().toLowerCase() === nome.toLowerCase())
    if (existente) {
      criadorDaFamilia.set(f.id, existente.id)
      continue
    }
    const { data, error } = await admin
      .from('consig_criadores')
      .insert({ nome, notas: `Família do TOC: ${f.attributes.name.trim()}` })
      .select('id, nome')
      .single()
    if (error || !data) return { error: error?.message ?? 'Não foi possível criar o criador.' }
    criadores.push(data)
    criadorDaFamilia.set(f.id, data.id)
    res.criadoresNovos++
  }

  // ── Produtos: novos entram; os existentes atualizam nome, preço e IVA
  // O preço do criador só vem do TOC se a app ainda não o tiver
  // Em blocos: um pedido por produto é lento demais para centenas de produtos
  const novos: Record<string, unknown>[] = []
  const atualizar: Record<string, unknown>[] = []
  for (const p of produtosToc) {
    const a = p.attributes
    const iva = IVA_TOC[a.tax_code ?? 'NOR'] ?? 0.23
    const pv = Number(a.sales_price ?? 0)
    const precoVenda = Math.round((a.sales_price_includes_vat === false ? pv * (1 + iva) : pv) * 100) / 100
    const precoToc = Number(a.purchase_price ?? 0)
    const existente = porCodigo.get(a.item_code)
    const base = { nome: a.item_description.trim().slice(0, 200) || a.item_code, referencia: a.item_code, preco_venda: precoVenda, iva, ativo: a.is_active !== false }
    if (existente) {
      // O criador e o preço do criador que estão na app mantêm-se
      atualizar.push({ ...base, id: existente.id, criador_id: existente.criador_id, preco_criador: existente.preco_criador > 0 ? existente.preco_criador : precoToc > 0 ? precoToc : 0 })
      if (!(existente.preco_criador > 0) && !(precoToc > 0)) res.semPrecoCriador++
    } else {
      novos.push({ ...base, criador_id: criadorDaFamilia.get(p.relationships!.item_families!.data!.id)!, preco_criador: precoToc > 0 ? precoToc : 0 })
      if (!(precoToc > 0)) res.semPrecoCriador++
    }
  }
  for (let i = 0; i < atualizar.length; i += 200) {
    const { error } = await admin.from('consig_produtos').upsert(atualizar.slice(i, i + 200), { onConflict: 'id' })
    if (error) return { error: error.message }
  }
  for (let i = 0; i < novos.length; i += 200) {
    const { data, error } = await admin.from('consig_produtos').insert(novos.slice(i, i + 200)).select('id, criador_id, referencia, preco_criador')
    if (error || !data) return { error: error?.message ?? 'Não foi possível criar os produtos.' }
    for (const d of data) porCodigo.set(d.referencia, d)
  }
  res.produtosAtualizados = atualizar.length
  res.produtosNovos = novos.length

  // ── Vendas: uma por documento e produto; as notas de crédito abatem à venda anterior
  const codigos = new Set(produtosToc.map((p) => p.attributes.item_code))
  type Venda = { marca: string; codigo: string; data: string; quantidade: number; precoVenda: number }
  const vendas: Venda[] = []
  const validos = documentos.filter((d) => d.status !== 4 && d.status !== 0).sort((a, b) => a.date.localeCompare(b.date))
  for (const d of validos) {
    if (!VENDAS.has(d.document_type) && d.document_type !== 'NC') continue
    const porCodigoDoc = new Map<string, { q: number; valor: number }>()
    for (const l of d.lines ?? []) {
      const c = String(l.item_code ?? '').trim()
      if (!codigos.has(c)) continue
      const q = Number(l.quantity ?? 0)
      const unit = Number(l.unit_price ?? 0) * (l.item_unit_price_includes_vat === false ? 1 + Number(l.tax_percentage ?? 23) / 100 : 1)
      const atual = porCodigoDoc.get(c) ?? { q: 0, valor: 0 }
      porCodigoDoc.set(c, { q: atual.q + q, valor: atual.valor + q * unit })
    }
    for (const [codigo, { q, valor }] of porCodigoDoc) {
      if (!(q > 0)) continue
      if (d.document_type === 'NC') {
        // Devolução do cliente: tira à venda mais recente deste produto
        let falta = q
        for (let i = vendas.length - 1; i >= 0 && falta > 0; i--) {
          if (vendas[i].codigo !== codigo) continue
          const tira = Math.min(falta, vendas[i].quantidade)
          vendas[i].quantidade -= tira
          vendas[i].marca += ` −${d.document_type} ${d.document_no}`
          falta -= tira
        }
        continue
      }
      vendas.push({ marca: `${MARCA}${d.document_type} ${d.document_no} · ${codigo}`, codigo, data: d.date, quantidade: q, precoVenda: Math.round((valor / q) * 100) / 100 })
    }
  }

  // O que já entrou noutra importação (pelo documento e produto) não entra outra vez
  const { data: jaImportadas } = await admin.from('consig_movimentos').select('notas').eq('tipo', 'venda').like('notas', `${MARCA}%`)
  const chave = (marca: string) => marca.split(' −')[0]
  const vistas = new Set((jaImportadas ?? []).map((m) => chave(String(m.notas))))
  const novas = vendas
    .filter((v) => v.quantidade > 0 && !vistas.has(chave(v.marca)))
    .map((v) => ({
      produto_id: porCodigo.get(v.codigo)!.id,
      tipo: 'venda' as TipoMovimento,
      quantidade: v.quantidade,
      data: v.data,
      // Sem preço do criador no movimento: usa-se o do produto, que pode ser preenchido depois
      preco_criador: null,
      preco_venda: v.precoVenda,
      notas: v.marca,
      created_by: s.id,
    }))
  for (let i = 0; i < novas.length; i += 200) {
    const { error } = await admin.from('consig_movimentos').insert(novas.slice(i, i + 200))
    if (error) return { error: error.message }
  }
  res.vendasNovas = novas.length
  res.pecasVendidas = novas.reduce((t, v) => t + v.quantidade, 0)
  res.desde = novas.map((v) => v.data).sort()[0] ?? null

  return { ok: true, valor: res }
}
