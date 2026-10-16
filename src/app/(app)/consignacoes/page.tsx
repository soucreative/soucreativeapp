import { requirePageAccess } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Criador, Liquidacao, Movimento, ProdutoConsignacao } from '@/lib/consignacoes'
import Consignacoes from './_components/consignacoes'

export const dynamic = 'force-dynamic'
// A importação do TOC lê todas as faturas: pode levar mais de meio minuto
export const maxDuration = 120

const num = (v: unknown) => Number(v ?? 0)

export default async function PaginaConsignacoes() {
  await requirePageAccess('/consignacoes')
  const admin = createAdminClient()
  const [cr, pr, mv, lq] = await Promise.all([
    admin.from('consig_criadores').select('id, nome, nif, email, telefone, iban, notas, ativo').order('nome'),
    admin.from('consig_produtos').select('id, criador_id, nome, referencia, preco_criador, preco_venda, iva, notas, ativo').order('nome'),
    admin.from('consig_movimentos').select('id, produto_id, tipo, quantidade, data, preco_criador, preco_venda, liquidacao_id, notas').order('data', { ascending: false }).order('created_at', { ascending: false }),
    admin.from('consig_liquidacoes').select('id, criador_id, data, ate, total, pago_em, referencia, notas').order('data', { ascending: false }),
  ])

  const erro = cr.error ?? pr.error ?? mv.error ?? lq.error
  if (erro) {
    return (
      <div className="min-h-full bg-papel p-6 sm:p-8">
        <h1 className="titulo text-3xl text-verde">Consignações</h1>
        <div className="cartao mt-6 max-w-2xl text-sm">
          <p className="font-medium text-alerta">As tabelas das consignações ainda não existem na base de dados.</p>
          <p className="mt-2 text-cinza">
            No Supabase → SQL Editor → New query, cole o conteúdo de <code>supabase/consignacoes.sql</code> e carregue em Run.
          </p>
          <p className="mt-2 text-xs text-cinza">Detalhe: {erro.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-papel p-6 sm:p-8">
      <Consignacoes
        criadores={(cr.data ?? []) as Criador[]}
        produtos={(pr.data ?? []).map((p) => ({ ...p, preco_criador: num(p.preco_criador), preco_venda: num(p.preco_venda), iva: num(p.iva) })) as ProdutoConsignacao[]}
        movimentos={(mv.data ?? []).map((m) => ({
          ...m,
          quantidade: num(m.quantidade),
          preco_criador: m.preco_criador == null ? null : num(m.preco_criador),
          preco_venda: m.preco_venda == null ? null : num(m.preco_venda),
        })) as Movimento[]}
        liquidacoes={(lq.data ?? []).map((l) => ({ ...l, total: num(l.total) })) as Liquidacao[]}
      />
    </div>
  )
}
