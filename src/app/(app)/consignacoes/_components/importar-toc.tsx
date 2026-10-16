'use client'

import { useState, useTransition } from 'react'
import { familiasDoToc, importarDoToc, type FamiliaToc, type ResultadoImportacao } from '../toc'
import { dataPt } from '@/lib/producao/format'

const CHAVE = 'consignacoes:familias-toc'

function lembradas(): string[] | null {
  try {
    const v = localStorage.getItem(CHAVE)
    return v ? (JSON.parse(v) as string[]) : null
  } catch {
    return null
  }
}

/**
 * Importa do TOC os criadores (famílias de consignação), os produtos e as
 * vendas. As famílias com "consignação" no nome vêm marcadas; as outras
 * escolhem-se à mão, e a escolha fica lembrada neste browser.
 */
export default function ImportarToc() {
  const [aberto, setAberto] = useState(false)
  const [familias, setFamilias] = useState<FamiliaToc[] | null>(null)
  const [escolhidas, setEscolhidas] = useState<string[]>([])
  const [mensagem, setMensagem] = useState<{ texto: string; erro?: boolean } | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [aCorrer, iniciar] = useTransition()

  const abrir = () => {
    setAberto(true)
    if (familias) return
    iniciar(async () => {
      const r = await familiasDoToc()
      if ('error' in r) return setMensagem({ texto: r.error, erro: true })
      setFamilias(r.valor)
      const guardadas = lembradas()
      setEscolhidas(guardadas?.filter((id) => r.valor.some((f) => f.id === id)) ?? r.valor.filter((f) => f.consignacao).map((f) => f.id))
    })
  }

  const importar = () =>
    iniciar(async () => {
      setMensagem(null)
      try {
        localStorage.setItem(CHAVE, JSON.stringify(escolhidas))
      } catch {}
      const r = await importarDoToc(escolhidas)
      if ('error' in r) return setMensagem({ texto: r.error, erro: true })
      setResultado(r.valor)
    })

  const comNome = familias?.filter((f) => f.consignacao) ?? []
  const outras = familias?.filter((f) => !f.consignacao) ?? []
  const marcar = (id: string, v: boolean) => setEscolhidas(v ? [...escolhidas, id] : escolhidas.filter((x) => x !== id))

  return (
    <section className="cartao mb-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h2 className="titulo text-lg text-verde">Importar do TOC Online</h2>
          <p className="text-xs text-cinza">
            Criadores (uma família de artigos por criador), produtos e vendas. Pode repetir-se: o que já foi importado não entra duas
            vezes. As entradas de peças não estão no TOC: acerte o stock com a contagem na loja.
          </p>
        </div>
        {!aberto ? (
          <button className="botao-secundario" onClick={abrir}>
            Escolher famílias e importar
          </button>
        ) : (
          <button className="botao-principal" disabled={aCorrer || !escolhidas.length} onClick={importar}>
            {aCorrer ? 'A ler o TOC…' : `Importar ${escolhidas.length} famílias`}
          </button>
        )}
      </div>

      {mensagem && <p className={`mt-2 text-sm ${mensagem.erro ? 'text-alerta' : 'text-verde'}`}>{mensagem.texto}</p>}
      {resultado && (
        <div className="mt-3 rounded-md bg-verde-claro px-3 py-2 text-sm text-verde-escuro">
          Feito: {resultado.criadoresNovos} criadores novos, {resultado.produtosNovos} produtos novos ({resultado.produtosAtualizados}{' '}
          atualizados), {resultado.vendasNovas} vendas novas ({resultado.pecasVendidas} peças
          {resultado.desde ? ` desde ${dataPt(resultado.desde)}` : ''}).
          {resultado.semPrecoCriador > 0 && (
            <div className="mt-1 text-alerta">
              {resultado.semPrecoCriador} produtos sem preço do criador no TOC: preencha-os em Produtos antes de pagar.
            </div>
          )}
          {resultado.vendasNovas > 0 && (
            <div className="mt-1 text-xs text-cinza">
              As vendas entram como por pagar. As que já foram pagas aos criadores: em Pagamentos, crie um pagamento até à data do
              último acerto e marque-o como pago.
            </div>
          )}
        </div>
      )}

      {aberto && familias && (
        <div className="mt-3 border-t border-linha pt-3">
          <div className="mb-2 flex gap-3 text-xs">
            <button className="text-verde hover:underline" onClick={() => setEscolhidas(comNome.map((f) => f.id))}>
              Só as de consignação
            </button>
            <button className="text-verde hover:underline" onClick={() => setEscolhidas([])}>
              Desmarcar todas
            </button>
          </div>
          <p className="mb-1 text-xs font-medium text-cinza">Com &quot;consignação&quot; no nome</p>
          <ListaFamilias lista={comNome} escolhidas={escolhidas} marcar={marcar} />
          <p className="mb-1 mt-3 text-xs font-medium text-cinza">
            Outras famílias: marque só as que forem de criadores em consignação (não as coleções de clientes)
          </p>
          <ListaFamilias lista={outras} escolhidas={escolhidas} marcar={marcar} />
        </div>
      )}
    </section>
  )
}

function ListaFamilias({ lista, escolhidas, marcar }: { lista: FamiliaToc[]; escolhidas: string[]; marcar: (id: string, v: boolean) => void }) {
  return (
    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
      {lista.map((f) => (
        <label key={f.id} className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--color-verde)]"
            checked={escolhidas.includes(f.id)}
            onChange={(e) => marcar(f.id, e.target.checked)}
          />
          <span>
            {f.nome} <span className="text-xs text-cinza">{f.produtos}</span>
            {f.consignacao && f.criador !== f.nome && <span className="block text-[11px] text-cinza">criador: {f.criador}</span>}
          </span>
        </label>
      ))}
    </div>
  )
}
