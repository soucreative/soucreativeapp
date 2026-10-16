// Consignações: produtos de criadores que a SOU vende na loja e paga depois de vendidos.
// Contas puras, sem acesso à base de dados: a página carrega as tabelas e passa-as aqui.

export type TipoMovimento = 'entrada' | 'venda' | 'devolucao' | 'ajuste'

export interface Criador {
  id: string
  nome: string
  nif: string | null
  email: string | null
  telefone: string | null
  iban: string | null
  notas: string | null
  ativo: boolean
}

export interface ProdutoConsignacao {
  id: string
  criador_id: string
  nome: string
  referencia: string | null
  preco_criador: number // o que a SOU paga por unidade vendida
  preco_venda: number // preço na loja, com IVA
  iva: number // 0,23 = 23%
  notas: string | null
  ativo: boolean
}

export interface Movimento {
  id: string
  produto_id: string
  tipo: TipoMovimento
  quantidade: number
  data: string
  preco_criador: number | null
  preco_venda: number | null
  liquidacao_id: string | null
  notas: string | null
}

export interface Liquidacao {
  id: string
  criador_id: string
  data: string
  ate: string
  total: number
  pago_em: string | null
  referencia: string | null
  notas: string | null
}

export const NOME_TIPO: Record<TipoMovimento, string> = {
  entrada: 'Entrada',
  venda: 'Venda',
  devolucao: 'Devolução ao criador',
  ajuste: 'Ajuste de inventário',
}

/** Margem da SOU numa unidade: preço sem IVA menos o que se paga ao criador. */
export function margemUnidade(precoVenda: number, iva: number, precoCriador: number) {
  const semIva = precoVenda / (1 + iva)
  const euros = semIva - precoCriador
  return { semIva, euros, pct: semIva > 0 ? euros / semIva : 0 }
}

/** Efeito de um movimento no stock da loja. */
export function efeitoStock(m: Pick<Movimento, 'tipo' | 'quantidade'>): number {
  return m.tipo === 'entrada' ? m.quantidade : m.tipo === 'ajuste' ? m.quantidade : -m.quantidade
}

export interface ResumoProduto {
  produto: ProdutoConsignacao
  entradas: number
  vendidas: number
  devolvidas: number
  ajustes: number
  emStock: number
  // Vendas: o que rendeu (sem IVA), o que se deve ao criador e o que já foi pago
  vendasSemIva: number
  devidoCriador: number
  pagoCriador: number
  porPagar: number
}

export function resumirProdutos(produtos: ProdutoConsignacao[], movimentos: Movimento[], liquidacoes: Liquidacao[]): ResumoProduto[] {
  const pagas = new Set(liquidacoes.filter((l) => l.pago_em).map((l) => l.id))
  return produtos.map((produto) => {
    const ms = movimentos.filter((m) => m.produto_id === produto.id)
    const soma = (t: TipoMovimento) => ms.filter((m) => m.tipo === t).reduce((s, m) => s + m.quantidade, 0)
    const vendas = ms.filter((m) => m.tipo === 'venda')
    const devido = (m: Movimento) => m.quantidade * (m.preco_criador ?? produto.preco_criador)
    const devidoCriador = vendas.reduce((s, m) => s + devido(m), 0)
    const pagoCriador = vendas.filter((m) => m.liquidacao_id && pagas.has(m.liquidacao_id)).reduce((s, m) => s + devido(m), 0)
    return {
      produto,
      entradas: soma('entrada'),
      vendidas: soma('venda'),
      devolvidas: soma('devolucao'),
      ajustes: soma('ajuste'),
      emStock: ms.reduce((s, m) => s + efeitoStock(m), 0),
      vendasSemIva: vendas.reduce((s, m) => s + (m.quantidade * (m.preco_venda ?? produto.preco_venda)) / (1 + produto.iva), 0),
      devidoCriador,
      pagoCriador,
      porPagar: devidoCriador - pagoCriador,
    }
  })
}

export interface ResumoCriador {
  criador: Criador
  produtos: number
  emStock: number
  valorStockVenda: number // o stock ao preço da loja, com IVA
  valorStockCriador: number // o stock ao preço do criador
  vendidas: number
  vendasSemIva: number
  margem: number
  devido: number
  pago: number
  porPagar: number // vendas ainda sem pagamento feito (por liquidar ou liquidadas e não pagas)
  porLiquidar: number // vendas que ainda não entraram em nenhum pagamento
}

export function resumirCriadores(
  criadores: Criador[],
  resumos: ResumoProduto[],
  movimentos: Movimento[],
): ResumoCriador[] {
  return criadores.map((criador) => {
    const rs = resumos.filter((r) => r.produto.criador_id === criador.id)
    const ids = new Set(rs.map((r) => r.produto.id))
    const porLiquidar = movimentos
      .filter((m) => m.tipo === 'venda' && !m.liquidacao_id && ids.has(m.produto_id))
      .reduce((s, m) => s + m.quantidade * (m.preco_criador ?? rs.find((r) => r.produto.id === m.produto_id)!.produto.preco_criador), 0)
    const devido = rs.reduce((s, r) => s + r.devidoCriador, 0)
    const vendasSemIva = rs.reduce((s, r) => s + r.vendasSemIva, 0)
    return {
      criador,
      produtos: rs.length,
      emStock: rs.reduce((s, r) => s + r.emStock, 0),
      valorStockVenda: rs.reduce((s, r) => s + Math.max(0, r.emStock) * r.produto.preco_venda, 0),
      valorStockCriador: rs.reduce((s, r) => s + Math.max(0, r.emStock) * r.produto.preco_criador, 0),
      vendidas: rs.reduce((s, r) => s + r.vendidas, 0),
      vendasSemIva,
      margem: vendasSemIva - devido,
      devido,
      pago: rs.reduce((s, r) => s + r.pagoCriador, 0),
      porPagar: rs.reduce((s, r) => s + r.porPagar, 0),
      porLiquidar,
    }
  })
}
