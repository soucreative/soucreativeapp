import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePageAccess } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { dataPt, euros } from '@/lib/producao/format'
import BotaoImprimir from './imprimir'

export const dynamic = 'force-dynamic'

/**
 * Extrato de um pagamento, para enviar ao criador: as vendas incluídas, ao
 * preço do criador. Não mostra o nosso preço nem a margem.
 */
export default async function ExtratoPagamento({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAccess('/consignacoes')
  const { id } = await params
  const admin = createAdminClient()
  const { data: l } = await admin.from('consig_liquidacoes').select('*').eq('id', id).maybeSingle()
  if (!l) notFound()
  const [{ data: criador }, { data: vendas }, { data: empresa }] = await Promise.all([
    admin.from('consig_criadores').select('nome, nif, email, iban').eq('id', l.criador_id).maybeSingle(),
    admin
      .from('consig_movimentos')
      .select('id, data, quantidade, preco_criador, consig_produtos(nome, referencia)')
      .eq('liquidacao_id', id)
      .order('data'),
    admin.from('prod_parametros').select('dados->empresa').limit(1).maybeSingle(),
  ])
  const rodape = (empresa as { empresa?: { rodape?: string } } | null)?.empresa?.rodape
  const linhas = (vendas ?? []).map((v) => {
    const p = (Array.isArray(v.consig_produtos) ? v.consig_produtos[0] : v.consig_produtos) as { nome: string; referencia: string | null } | null
    const preco = Number(v.preco_criador ?? 0)
    return { id: v.id as string, data: v.data as string, produto: p?.nome ?? '—', referencia: p?.referencia, qtd: Number(v.quantidade), preco, total: preco * Number(v.quantidade) }
  })
  const primeira = linhas[0]?.data

  return (
    <div className="min-h-full bg-papel p-6 sm:p-8">
      <div className="nao-imprimir mb-4 flex flex-wrap items-center gap-2">
        <Link href="/consignacoes" className="botao-secundario">
          ← Consignações
        </Link>
        <BotaoImprimir />
        <span className="text-xs text-cinza">Para enviar ao criador: só tem as vendas e o preço dele.</span>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white p-[14mm] text-[10.5pt] leading-relaxed shadow-sm print:shadow-none">
        <header className="mb-8 flex items-start justify-between gap-6">
          <Image src="/brand/logo-verde.png" alt="SOU creative" width={110} height={81} priority />
          <div className="text-right">
            <div className="text-xs uppercase tracking-[0.2em] text-mostarda">Extrato de consignação</div>
            <div className="mt-1 text-sm">Emitido a {dataPt(l.data)}</div>
            <div className="text-sm">
              Vendas {primeira ? `de ${dataPt(primeira)} ` : ''}até {dataPt(l.ate)}
            </div>
          </div>
        </header>

        <section className="mb-6">
          <div className="text-xs uppercase tracking-[0.2em] text-cinza">Criador</div>
          <div className="text-lg font-semibold text-verde">{criador?.nome}</div>
          <div className="text-sm text-cinza">
            {[criador?.nif && `NIF ${criador.nif}`, criador?.email].filter(Boolean).join(' · ')}
          </div>
        </section>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-verde text-left text-xs text-cinza">
              <th className="py-2 pr-2 font-medium">Data</th>
              <th className="py-2 pr-2 font-medium">Produto</th>
              <th className="py-2 px-2 text-right font-medium">Qtd</th>
              <th className="py-2 px-2 text-right font-medium">Valor/un</th>
              <th className="py-2 pl-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((x) => (
              <tr key={x.id} className="border-b border-linha">
                <td className="py-2 pr-2">{dataPt(x.data)}</td>
                <td className="py-2 pr-2">
                  {x.produto}
                  {x.referencia && <span className="text-xs text-cinza"> · {x.referencia}</span>}
                </td>
                <td className="py-2 px-2 text-right tabular-nums">{x.qtd}</td>
                <td className="py-2 px-2 text-right tabular-nums">{euros(x.preco)}</td>
                <td className="py-2 pl-2 text-right tabular-nums">{euros(x.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-72 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-cinza">Peças vendidas</span>
            <span className="tabular-nums">{linhas.reduce((s, x) => s + x.qtd, 0)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-verde pt-2 text-base font-semibold">
            <span>Total a pagar</span>
            <span className="tabular-nums">{euros(Number(l.total))}</span>
          </div>
        </div>

        <section className="mt-8 rounded-md border border-linha bg-papel/60 px-4 py-3 text-sm">
          {l.pago_em ? (
            <p>
              <b>Pago a {dataPt(l.pago_em)}</b>
              {l.referencia ? ` · ${l.referencia}` : ''}
              {criador?.iban ? ` · para o IBAN ${criador.iban}` : ''}
            </p>
          ) : (
            <p>
              Pagamento por transferência {criador?.iban ? <>para o IBAN <span className="font-mono">{criador.iban}</span></> : '(falta o IBAN do criador)'}.
            </p>
          )}
        </section>

        {rodape && <footer className="mt-12 border-t border-linha pt-3 text-center text-[8pt] text-cinza">{rodape}</footer>}
      </article>
    </div>
  )
}
