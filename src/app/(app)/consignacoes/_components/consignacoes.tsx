'use client'

import Link from 'next/link'
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { euros, percent, dataPt } from '@/lib/producao/format'
import {
  margemUnidade,
  NOME_TIPO,
  resumirCriadores,
  resumirProdutos,
  type Criador,
  type Liquidacao,
  type Movimento,
  type ProdutoConsignacao,
  type TipoMovimento,
} from '@/lib/consignacoes'
import {
  anularLiquidacao,
  apagarMovimento,
  criarLiquidacao,
  guardarCriador,
  guardarProduto,
  marcarPago,
  registarMovimento,
} from '../actions'
import { contarInventario } from '../toc'
import ImportarToc from './importar-toc'

type Aba = 'resumo' | 'produtos' | 'movimentos' | 'pagamentos' | 'criadores'
const hoje = () => new Date().toISOString().slice(0, 10)

export default function Consignacoes({
  criadores,
  produtos,
  movimentos,
  liquidacoes,
}: {
  criadores: Criador[]
  produtos: ProdutoConsignacao[]
  movimentos: Movimento[]
  liquidacoes: Liquidacao[]
}) {
  const [aba, setAba] = useState<Aba>(criadores.length ? 'resumo' : 'criadores')
  const resumosP = useMemo(() => resumirProdutos(produtos, movimentos, liquidacoes), [produtos, movimentos, liquidacoes])
  const resumosC = useMemo(() => resumirCriadores(criadores, resumosP, movimentos), [criadores, resumosP, movimentos])
  const nomeCriador = (id: string) => criadores.find((c) => c.id === id)?.nome ?? '—'

  const abas: [Aba, string][] = [
    ['resumo', 'Resumo'],
    ['produtos', `Produtos (${produtos.length})`],
    ['movimentos', 'Entradas e vendas'],
    ['pagamentos', `Pagamentos (${liquidacoes.filter((l) => !l.pago_em).length} por pagar)`],
    ['criadores', `Criadores (${criadores.length})`],
  ]

  return (
    <>
      <div className="mb-6">
        <h1 className="titulo text-3xl text-verde">Consignações</h1>
        <p className="mt-1 text-sm text-cinza">
          Produtos de criadores à venda na loja: o que entrou, o que se vendeu, o que continua em inventário e o que falta pagar a cada
          criador. Só a gestão vê esta área.
        </p>
      </div>
      <div className="mb-5 flex flex-wrap gap-1">
        {abas.map(([v, t]) => (
          <button key={v} className={aba === v ? 'botao-principal' : 'botao-secundario'} onClick={() => setAba(v)}>
            {t}
          </button>
        ))}
      </div>

      {aba === 'resumo' && (
        <>
          <ImportarToc />
          <Resumo resumos={resumosC} />
        </>
      )}
      {aba === 'produtos' && <Produtos criadores={criadores} resumos={resumosP} nomeCriador={nomeCriador} />}
      {aba === 'movimentos' && <Movimentos criadores={criadores} produtos={produtos} resumos={resumosP} movimentos={movimentos} nomeCriador={nomeCriador} />}
      {aba === 'pagamentos' && <Pagamentos liquidacoes={liquidacoes} nomeCriador={nomeCriador} resumos={resumosC} />}
      {aba === 'criadores' && <Criadores criadores={criadores} />}
    </>
  )
}

// ── Resumo por criador ────────────────────────────────────────────────────

function Resumo({ resumos }: { resumos: ReturnType<typeof resumirCriadores> }) {
  const soma = (k: 'emStock' | 'valorStockVenda' | 'vendidas' | 'vendasSemIva' | 'margem' | 'porPagar') => resumos.reduce((s, r) => s + r[k], 0)
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador nome="Em inventário" valor={`${soma('emStock')} un`} detalhe={`${euros(soma('valorStockVenda'))} ao preço da loja`} />
        <Indicador nome="Vendido" valor={`${soma('vendidas')} un`} detalhe={`${euros(soma('vendasSemIva'))} sem IVA`} />
        <Indicador nome="Margem da SOU" valor={euros(soma('margem'))} detalhe={soma('vendasSemIva') > 0 ? `${percent(soma('margem') / soma('vendasSemIva'))} das vendas` : '—'} />
        <Indicador nome="Por pagar aos criadores" valor={euros(soma('porPagar'))} alerta={soma('porPagar') > 0} />
      </div>
      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead>
            <tr>
              <th>Criador</th>
              <th className="num">Em stock</th>
              <th className="num">Valor stock (criador)</th>
              <th className="num">Vendidas</th>
              <th className="num">Vendas s/ IVA</th>
              <th className="num">Margem SOU</th>
              <th className="num">Já pago</th>
              <th className="num">Por pagar</th>
              <th className="num">Por incluir num pagamento</th>
            </tr>
          </thead>
          <tbody>
            {resumos.map((r) => (
              <tr key={r.criador.id} className={r.criador.ativo ? '' : 'text-cinza'}>
                <td className="font-medium">{r.criador.nome}</td>
                <td className="num">{r.emStock}</td>
                <td className="num">{euros(r.valorStockCriador)}</td>
                <td className="num">{r.vendidas}</td>
                <td className="num">{euros(r.vendasSemIva)}</td>
                <td className={`num ${r.margem < 0 ? 'text-alerta' : ''}`}>{euros(r.margem)}</td>
                <td className="num">{euros(r.pago)}</td>
                <td className={`num font-medium ${r.porPagar > 0.004 ? 'text-alerta' : ''}`}>{euros(r.porPagar)}</td>
                <td className="num">{euros(r.porLiquidar)}</td>
              </tr>
            ))}
            {!resumos.length && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-cinza">
                  Ainda não há criadores. Comece pelo separador Criadores.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-cinza">
        Por pagar: vendas que o criador ainda não recebeu. Por incluir num pagamento: a parte dessas vendas que ainda não entrou em
        nenhum pagamento (crie-o no separador Pagamentos).
      </p>
    </>
  )
}

// ── Produtos ──────────────────────────────────────────────────────────────

function Produtos({
  criadores,
  resumos,
  nomeCriador,
}: {
  criadores: Criador[]
  resumos: ReturnType<typeof resumirProdutos>
  nomeCriador: (id: string) => string
}) {
  const [filtro, setFiltro] = useState('')
  const [soSemPreco, setSoSemPreco] = useState(false)
  const [emEdicao, setEmEdicao] = useState<ProdutoConsignacao | 'novo' | null>(null)
  const semPreco = resumos.filter((r) => !(r.produto.preco_criador > 0)).length
  const lista = resumos.filter((r) => (!filtro || r.produto.criador_id === filtro) && (!soSemPreco || !(r.produto.preco_criador > 0)))

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="campo w-auto" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todos os criadores</option>
          {criadores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        {semPreco > 0 && (
          <label className="flex items-center gap-2 text-sm text-alerta">
            <input type="checkbox" className="h-4 w-4" checked={soSemPreco} onChange={(e) => setSoSemPreco(e.target.checked)} />
            Só os {semPreco} sem preço do criador
          </label>
        )}
        <button className="botao-principal ml-auto" disabled={!criadores.length} onClick={() => setEmEdicao('novo')}>
          + Novo produto
        </button>
      </div>
      {emEdicao && (
        <FormProduto
          key={emEdicao === 'novo' ? 'novo' : emEdicao.id}
          produto={emEdicao === 'novo' ? undefined : emEdicao}
          criadores={criadores}
          criadorInicial={filtro}
          aoFechar={() => setEmEdicao(null)}
        />
      )}
      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Criador</th>
              <th className="num">Preço criador</th>
              <th className="num">Nosso preço (c/ IVA)</th>
              <th className="num">Sem IVA</th>
              <th className="num">Margem</th>
              <th className="num">Entradas</th>
              <th className="num">Vendidas</th>
              <th className="num">Devolvidas</th>
              <th className="num">Em stock</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((r) => {
              const p = r.produto
              const m = margemUnidade(p.preco_venda, p.iva, p.preco_criador)
              return (
                <tr key={p.id} className={p.ativo ? '' : 'text-cinza'}>
                  <td>
                    <span className="font-medium">{p.nome}</span>
                    {p.referencia && <div className="text-[11px] text-cinza">{p.referencia}</div>}
                  </td>
                  <td>{nomeCriador(p.criador_id)}</td>
                  <td className={`num ${p.preco_criador > 0 ? '' : 'font-medium text-alerta'}`} title={p.preco_criador > 0 ? undefined : 'Falta o preço do criador'}>
                    {p.preco_criador > 0 ? euros(p.preco_criador) : 'em falta'}
                  </td>
                  <td className="num">{euros(p.preco_venda)}</td>
                  <td className="num text-cinza">{euros(m.semIva)}</td>
                  <td className={`num ${m.euros < 0 ? 'text-alerta' : ''}`}>
                    {euros(m.euros)} <span className="text-xs text-cinza">· {percent(m.pct)}</span>
                  </td>
                  <td className="num">{r.entradas}</td>
                  <td className="num">{r.vendidas}</td>
                  <td className="num">{r.devolvidas}</td>
                  <td className={`num font-medium ${r.emStock < 0 ? 'text-alerta' : ''}`} title={r.emStock < 0 ? 'Há mais vendas do que entradas: faça a contagem' : undefined}>
                    <Contagem produtoId={p.id} stock={r.emStock} />
                  </td>
                  <td className="text-right">
                    <button className="text-xs text-verde hover:underline" onClick={() => setEmEdicao(p)}>
                      editar
                    </button>
                  </td>
                </tr>
              )
            })}
            {!lista.length && (
              <tr>
                <td colSpan={11} className="py-10 text-center text-cinza">
                  {criadores.length ? 'Ainda não há produtos.' : 'Crie primeiro um criador.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-cinza">
        Margem = preço da loja sem IVA menos o preço do criador. As vendas registadas na app guardam os preços do dia; as importadas do TOC
        usam o preço do criador do produto até entrarem num pagamento. Stock negativo: há vendas sem entradas registadas — clique no
        número e escreva quantas peças há na loja.
      </p>
    </>
  )
}

function FormProduto({
  produto,
  criadores,
  criadorInicial,
  aoFechar,
}: {
  produto?: ProdutoConsignacao
  criadores: Criador[]
  criadorInicial: string
  aoFechar: () => void
}) {
  const [estado, enviar, aEnviar] = useActionState(guardarProduto, null)
  const [precoCriador, setPrecoCriador] = useState(String(produto?.preco_criador ?? '').replace('.', ','))
  const [precoVenda, setPrecoVenda] = useState(String(produto?.preco_venda ?? '').replace('.', ','))
  const [iva, setIva] = useState(String(Math.round((produto?.iva ?? 0.23) * 100)))
  useEffect(() => {
    if (estado && 'ok' in estado) aoFechar()
  }, [estado, aoFechar])
  const n = (t: string) => Number(t.replace(',', '.')) || 0
  const m = margemUnidade(n(precoVenda), n(iva) / 100, n(precoCriador))

  return (
    <form action={enviar} className="cartao mb-4 grid gap-3 border-verde/40 sm:grid-cols-2 lg:grid-cols-6">
      <input type="hidden" name="id" value={produto?.id ?? ''} />
      <h2 className="titulo text-lg text-verde sm:col-span-2 lg:col-span-6">{produto ? 'Editar produto' : 'Novo produto em consignação'}</h2>
      <label className="lg:col-span-2">
        <span className="rotulo">Produto</span>
        <input name="nome" required className="campo" defaultValue={produto?.nome} placeholder="ex.: Colar de cerâmica azul" />
      </label>
      <label>
        <span className="rotulo">Criador</span>
        <select name="criador_id" required className="campo" defaultValue={produto?.criador_id ?? criadorInicial}>
          <option value="">— escolher —</option>
          {criadores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="rotulo">Referência / código TOC</span>
        <input name="referencia" className="campo" defaultValue={produto?.referencia ?? ''} />
      </label>
      <label>
        <span className="rotulo">Preço do criador</span>
        <input name="preco_criador" inputMode="decimal" required className="campo text-right" value={precoCriador} onChange={(e) => setPrecoCriador(e.target.value)} />
      </label>
      <label>
        <span className="rotulo">Nosso preço (c/ IVA)</span>
        <input name="preco_venda" inputMode="decimal" required className="campo text-right" value={precoVenda} onChange={(e) => setPrecoVenda(e.target.value)} />
      </label>
      <label>
        <span className="rotulo">IVA %</span>
        <input name="iva" inputMode="decimal" required className="campo text-right" value={iva} onChange={(e) => setIva(e.target.value)} />
      </label>
      <div className="self-end rounded-md bg-papel px-3 py-2 text-sm lg:col-span-2">
        Sem IVA {euros(m.semIva)} · margem <b className={m.euros < 0 ? 'text-alerta' : 'text-verde'}>{euros(m.euros)}</b> ({percent(m.pct)})
      </div>
      <label className="lg:col-span-2">
        <span className="rotulo">Notas</span>
        <input name="notas" className="campo" defaultValue={produto?.notas ?? ''} />
      </label>
      <label className="flex items-end gap-2 pb-2 text-sm">
        <input type="checkbox" name="ativo" value="on" defaultChecked={produto?.ativo ?? true} className="h-4 w-4 accent-[var(--color-verde)]" />
        À venda
      </label>
      <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-6">
        <button className="botao-principal" disabled={aEnviar}>
          {aEnviar ? 'A gravar…' : 'Gravar'}
        </button>
        <button type="button" className="botao-secundario" onClick={aoFechar}>
          Cancelar
        </button>
        {estado && 'error' in estado && <span className="text-sm text-alerta">{estado.error}</span>}
      </div>
    </form>
  )
}

// ── Entradas, vendas, devoluções e ajustes ────────────────────────────────

function Movimentos({
  criadores,
  produtos,
  resumos,
  movimentos,
  nomeCriador,
}: {
  criadores: Criador[]
  produtos: ProdutoConsignacao[]
  resumos: ReturnType<typeof resumirProdutos>
  movimentos: Movimento[]
  nomeCriador: (id: string) => string
}) {
  const [produtoId, setProdutoId] = useState('')
  const [estado, enviar, aEnviar] = useActionState(async (antes: unknown, fd: FormData) => {
    const r = await registarMovimento(antes, fd)
    if ('ok' in r) setProdutoId('')
    return r
  }, null)
  const [aApagar, iniciar] = useTransition()
  const [erroApagar, setErroApagar] = useState<string | null>(null)
  const [tipo, setTipo] = useState<TipoMovimento>('venda')
  const [filtroCriador, setFiltroCriador] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<TipoMovimento | ''>('')
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado && 'ok' in estado) form.current?.reset()
  }, [estado])

  const produto = (id: string) => produtos.find((p) => p.id === id)
  const stock = (id: string) => resumos.find((r) => r.produto.id === id)?.emStock ?? 0
  const escolhido = produto(produtoId)
  const lista = movimentos.filter((m) => {
    const p = produto(m.produto_id)
    return (!filtroCriador || p?.criador_id === filtroCriador) && (!filtroTipo || m.tipo === filtroTipo)
  })

  return (
    <>
      <form ref={form} action={enviar} className="cartao mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label>
          <span className="rotulo">Movimento</span>
          <select name="tipo" className="campo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimento)}>
            {(Object.keys(NOME_TIPO) as TipoMovimento[]).map((t) => (
              <option key={t} value={t}>
                {NOME_TIPO[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="lg:col-span-2">
          <span className="rotulo">Produto</span>
          <select name="produto_id" required className="campo" value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
            <option value="">— escolher —</option>
            {criadores.map((c) => (
              <optgroup key={c.id} label={c.nome}>
                {produtos
                  .filter((p) => p.criador_id === c.id && (p.ativo || tipo !== 'entrada'))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} · {stock(p.id)} em stock
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          <span className="rotulo">Quantidade</span>
          <input name="quantidade" inputMode="numeric" required className="campo text-right" placeholder={tipo === 'ajuste' ? 'ex.: -1' : 'ex.: 2'} />
        </label>
        <label>
          <span className="rotulo">Data</span>
          <input name="data" type="date" required className="campo" defaultValue={hoje()} />
        </label>
        {tipo === 'venda' ? (
          <label>
            <span className="rotulo">Preço de venda c/ IVA</span>
            <input name="preco_venda" inputMode="decimal" className="campo text-right" placeholder={escolhido ? String(escolhido.preco_venda).replace('.', ',') : 'o do produto'} />
          </label>
        ) : (
          <div />
        )}
        <label className="lg:col-span-4">
          <span className="rotulo">Notas</span>
          <input
            name="notas"
            className="campo"
            placeholder={tipo === 'entrada' ? 'ex.: guia de remessa n.º 12' : tipo === 'ajuste' ? 'porquê (partido, perdido, contagem…)' : 'ex.: fatura FR 2026/123'}
          />
        </label>
        <div className="flex items-end gap-2 lg:col-span-2">
          <button className="botao-principal" disabled={aEnviar}>
            {aEnviar ? 'A registar…' : `Registar ${NOME_TIPO[tipo].toLowerCase()}`}
          </button>
        </div>
        {estado && 'error' in estado && <p className="text-sm text-alerta sm:col-span-2 lg:col-span-6">{estado.error}</p>}
        {escolhido && (
          <p className="text-xs text-cinza sm:col-span-2 lg:col-span-6">
            {escolhido.nome}: {stock(escolhido.id)} em stock · preço do criador {euros(escolhido.preco_criador)} · nosso preço{' '}
            {euros(escolhido.preco_venda)}
          </p>
        )}
      </form>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="campo w-auto" value={filtroCriador} onChange={(e) => setFiltroCriador(e.target.value)}>
          <option value="">Todos os criadores</option>
          {criadores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <select className="campo w-auto" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as TipoMovimento | '')}>
          <option value="">Todos os movimentos</option>
          {(Object.keys(NOME_TIPO) as TipoMovimento[]).map((t) => (
            <option key={t} value={t}>
              {NOME_TIPO[t]}
            </option>
          ))}
        </select>
        {erroApagar && <span className="text-sm text-alerta">{erroApagar}</span>}
      </div>
      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead>
            <tr>
              <th>Data</th>
              <th>Movimento</th>
              <th>Produto</th>
              <th>Criador</th>
              <th className="num">Qtd</th>
              <th className="num">Preço venda</th>
              <th className="num">A pagar ao criador</th>
              <th>Notas</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((m) => {
              const p = produto(m.produto_id)
              return (
                <tr key={m.id}>
                  <td>{dataPt(m.data)}</td>
                  <td>{NOME_TIPO[m.tipo]}</td>
                  <td>{p?.nome ?? '—'}</td>
                  <td>{p ? nomeCriador(p.criador_id) : '—'}</td>
                  <td className="num">{m.quantidade}</td>
                  <td className="num">{m.tipo === 'venda' ? euros(m.preco_venda ?? 0) : ''}</td>
                  <td className="num">
                    {m.tipo === 'venda' ? euros(m.quantidade * (m.preco_criador ?? p?.preco_criador ?? 0)) : ''}
                    {m.liquidacao_id && <div className="text-[11px] text-verde">num pagamento</div>}
                  </td>
                  <td className="text-xs text-cinza">{m.notas}</td>
                  <td className="text-right">
                    {!m.liquidacao_id && (
                      <button
                        className="text-xs text-alerta hover:underline"
                        disabled={aApagar}
                        onClick={() =>
                          confirm('Apagar este movimento?') &&
                          iniciar(async () => {
                            const r = await apagarMovimento(m.id)
                            setErroApagar('error' in r ? r.error : null)
                          })
                        }
                      >
                        apagar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {!lista.length && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-cinza">
                  Sem movimentos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-cinza">
        Entrada: o criador deixa peças na loja. Venda: vendida ao cliente (fica a dever-se ao criador). Devolução: volta para o criador.
        Ajuste: correção de inventário, positiva ou negativa (peça partida, contagem).
      </p>
    </>
  )
}

// ── Pagamentos aos criadores ──────────────────────────────────────────────

function Pagamentos({
  liquidacoes,
  nomeCriador,
  resumos,
}: {
  liquidacoes: Liquidacao[]
  nomeCriador: (id: string) => string
  resumos: ReturnType<typeof resumirCriadores>
}) {
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [criador, setCriador] = useState('')
  const [ate, setAte] = useState(hoje())
  const correr = (f: () => Promise<{ error: string } | { ok: true }>) =>
    iniciar(async () => {
      const r = await f()
      setErro('error' in r ? r.error : null)
    })
  const comVendas = resumos.filter((r) => r.porLiquidar > 0.004)

  return (
    <>
      <div className="cartao mb-6 flex flex-wrap items-end gap-3">
        <div className="w-full text-sm">
          <h2 className="titulo text-lg text-verde">Novo pagamento</h2>
          <p className="text-xs text-cinza">Junta as vendas ainda por pagar de um criador até à data escolhida. Gera um extrato para lhe enviar.</p>
        </div>
        <label>
          <span className="rotulo">Criador</span>
          <select className="campo w-auto" value={criador} onChange={(e) => setCriador(e.target.value)}>
            <option value="">— escolher —</option>
            {comVendas.map((r) => (
              <option key={r.criador.id} value={r.criador.id}>
                {r.criador.nome} · {euros(r.porLiquidar)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="rotulo">Vendas até</span>
          <input type="date" className="campo" value={ate} onChange={(e) => setAte(e.target.value)} />
        </label>
        <button className="botao-principal" disabled={!criador || pendente} onClick={() => correr(() => criarLiquidacao(criador, ate))}>
          Criar pagamento
        </button>
        {!comVendas.length && <span className="text-sm text-cinza">Não há vendas por incluir num pagamento.</span>}
        {erro && <span className="text-sm text-alerta">{erro}</span>}
      </div>

      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead>
            <tr>
              <th>Criado</th>
              <th>Criador</th>
              <th>Vendas até</th>
              <th className="num">Total</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {liquidacoes.map((l) => (
              <LinhaPagamento key={l.id} l={l} nome={nomeCriador(l.criador_id)} pendente={pendente} correr={correr} />
            ))}
            {!liquidacoes.length && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-cinza">
                  Ainda não há pagamentos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function LinhaPagamento({
  l,
  nome,
  pendente,
  correr,
}: {
  l: Liquidacao
  nome: string
  pendente: boolean
  correr: (f: () => Promise<{ error: string } | { ok: true }>) => void
}) {
  const [aPagar, setAPagar] = useState(false)
  const [data, setData] = useState(hoje())
  const [ref, setRef] = useState('')
  return (
    <tr>
      <td>{dataPt(l.data)}</td>
      <td className="font-medium">{nome}</td>
      <td>{dataPt(l.ate)}</td>
      <td className="num font-medium">{euros(l.total)}</td>
      <td>
        {l.pago_em ? (
          <span className="etiqueta bg-verde-claro text-verde">
            Pago a {dataPt(l.pago_em)}
            {l.referencia ? ` · ${l.referencia}` : ''}
          </span>
        ) : aPagar ? (
          <span className="flex flex-wrap items-center gap-1">
            <input type="date" className="campo w-auto py-1" value={data} onChange={(e) => setData(e.target.value)} />
            <input className="campo w-40 py-1" placeholder="referência (opcional)" value={ref} onChange={(e) => setRef(e.target.value)} />
            <button className="botao-principal py-1" disabled={pendente} onClick={() => correr(() => marcarPago(l.id, data, ref))}>
              OK
            </button>
            <button className="botao-secundario py-1" onClick={() => setAPagar(false)}>
              ✕
            </button>
          </span>
        ) : (
          <span className="etiqueta bg-beige text-tinta">Por pagar</span>
        )}
      </td>
      <td className="whitespace-nowrap text-right text-xs">
        <Link className="mr-3 text-verde hover:underline" href={`/consignacoes/pagamento/${l.id}`}>
          extrato
        </Link>
        {l.pago_em ? (
          <button className="text-cinza hover:underline" disabled={pendente} onClick={() => confirm('Tirar a data de pagamento?') && correr(() => marcarPago(l.id, null, null))}>
            desmarcar
          </button>
        ) : (
          <>
            {!aPagar && (
              <button className="mr-3 text-verde hover:underline" onClick={() => setAPagar(true)}>
                marcar pago
              </button>
            )}
            <button
              className="text-alerta hover:underline"
              disabled={pendente}
              onClick={() => confirm('Anular este pagamento? As vendas voltam a ficar por pagar.') && correr(() => anularLiquidacao(l.id))}
            >
              anular
            </button>
          </>
        )}
      </td>
    </tr>
  )
}

// ── Criadores ─────────────────────────────────────────────────────────────

function Criadores({ criadores }: { criadores: Criador[] }) {
  const [emEdicao, setEmEdicao] = useState<Criador | 'novo' | null>(criadores.length ? null : 'novo')
  return (
    <>
      <div className="mb-3 flex">
        <button className="botao-principal ml-auto" onClick={() => setEmEdicao('novo')}>
          + Novo criador
        </button>
      </div>
      {emEdicao && <FormCriador key={emEdicao === 'novo' ? 'novo' : emEdicao.id} criador={emEdicao === 'novo' ? undefined : emEdicao} aoFechar={() => setEmEdicao(null)} />}
      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead>
            <tr>
              <th>Criador</th>
              <th>NIF</th>
              <th>Contacto</th>
              <th>IBAN</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {criadores.map((c) => (
              <tr key={c.id} className={c.ativo ? '' : 'text-cinza'}>
                <td className="font-medium">
                  {c.nome}
                  {!c.ativo && <span className="ml-2 text-xs">(inativo)</span>}
                </td>
                <td>{c.nif}</td>
                <td className="text-sm">{[c.email, c.telefone].filter(Boolean).join(' · ')}</td>
                <td className="font-mono text-xs">{c.iban}</td>
                <td className="text-right">
                  <button className="text-xs text-verde hover:underline" onClick={() => setEmEdicao(c)}>
                    editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function FormCriador({ criador, aoFechar }: { criador?: Criador; aoFechar: () => void }) {
  const [estado, enviar, aEnviar] = useActionState(guardarCriador, null)
  useEffect(() => {
    if (estado && 'ok' in estado) aoFechar()
  }, [estado, aoFechar])
  return (
    <form action={enviar} className="cartao mb-4 grid gap-3 border-verde/40 sm:grid-cols-2 lg:grid-cols-6">
      <input type="hidden" name="id" value={criador?.id ?? ''} />
      <h2 className="titulo text-lg text-verde sm:col-span-2 lg:col-span-6">{criador ? 'Editar criador' : 'Novo criador'}</h2>
      <label className="lg:col-span-2">
        <span className="rotulo">Nome</span>
        <input name="nome" required className="campo" defaultValue={criador?.nome} />
      </label>
      <label>
        <span className="rotulo">NIF</span>
        <input name="nif" className="campo" defaultValue={criador?.nif ?? ''} />
      </label>
      <label>
        <span className="rotulo">Email</span>
        <input name="email" type="email" className="campo" defaultValue={criador?.email ?? ''} />
      </label>
      <label className="lg:col-span-2">
        <span className="rotulo">Telefone</span>
        <input name="telefone" className="campo" defaultValue={criador?.telefone ?? ''} />
      </label>
      <label className="lg:col-span-3">
        <span className="rotulo">IBAN (para os pagamentos)</span>
        <input name="iban" className="campo font-mono" defaultValue={criador?.iban ?? ''} />
      </label>
      <label className="lg:col-span-3">
        <span className="rotulo">Notas</span>
        <input name="notas" className="campo" defaultValue={criador?.notas ?? ''} placeholder="ex.: condições combinadas, prazo de pagamento" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="ativo" value="on" defaultChecked={criador?.ativo ?? true} className="h-4 w-4 accent-[var(--color-verde)]" />
        Ativo
      </label>
      <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-6">
        <button className="botao-principal" disabled={aEnviar}>
          {aEnviar ? 'A gravar…' : 'Gravar'}
        </button>
        <button type="button" className="botao-secundario" onClick={aoFechar}>
          Cancelar
        </button>
        {estado && 'error' in estado && <span className="text-sm text-alerta">{estado.error}</span>}
      </div>
    </form>
  )
}

function Indicador({ nome, valor, detalhe, alerta }: { nome: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div className="cartao py-4">
      <div className="text-xs text-cinza">{nome}</div>
      <div className={`titulo mt-1 text-2xl ${alerta ? 'text-alerta' : 'text-verde'}`}>{valor}</div>
      {detalhe && <div className="text-xs text-cinza">{detalhe}</div>}
    </div>
  )
}

/** Stock do produto; ao clicar, escreve-se quantas peças há na loja e a app acerta a diferença. */
function Contagem({ produtoId, stock }: { produtoId: string; stock: number }) {
  const [aContar, setAContar] = useState(false)
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  if (!aContar) {
    return (
      <button className="tabular-nums underline decoration-dotted underline-offset-2 hover:text-verde" title="Contagem na loja" onClick={() => setAContar(true)}>
        {stock}
      </button>
    )
  }
  const gravar = () =>
    iniciar(async () => {
      const r = await contarInventario(produtoId, Number(valor), hoje())
      if ('error' in r) setErro(r.error)
      else {
        setAContar(false)
        setValor('')
        setErro(null)
      }
    })
  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        inputMode="numeric"
        className="campo w-16 py-0.5 text-right"
        placeholder="na loja"
        value={valor}
        onChange={(e) => setValor(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && valor !== '') gravar()
          if (e.key === 'Escape') setAContar(false)
        }}
      />
      <button className="text-xs text-verde" disabled={pendente || valor === ''} onClick={gravar}>
        OK
      </button>
      {erro && <span className="text-xs text-alerta">{erro}</span>}
    </span>
  )
}
