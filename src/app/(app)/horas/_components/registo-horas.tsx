'use client'

import { useActionState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { apagarHoras, registarHoras } from '../actions'

export type Entrada = {
  id: string
  employee_id: string
  date: string
  hours: number
  billable: boolean
  orcamento_id: string | null
  description: string | null
}

type Opcao = { id: string; nome: string }

const fmtH = (h: number) => `${(Math.round(h * 10) / 10).toLocaleString('pt-PT')} h`

export default function RegistoHoras({
  mes, pessoa, gestor, euId, entradas, pessoas, orcamentos,
}: {
  mes: string
  pessoa: string
  gestor: boolean
  euId: string
  entradas: Entrada[]
  pessoas: Opcao[]
  orcamentos: Opcao[]
}) {
  const router = useRouter()
  const [estado, enviar, aEnviar] = useActionState(registarHoras, null)
  const [aApagar, iniciar] = useTransition()
  const form = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (estado && 'ok' in estado) form.current?.reset()
  }, [estado])

  const nome = (id: string) => pessoas.find(p => p.id === id)?.nome ?? '—'
  const orc = (id: string | null) => (id ? orcamentos.find(o => o.id === id)?.nome ?? 'orçamento' : '')
  const total = entradas.reduce((s, e) => s + Number(e.hours), 0)
  const faturaveis = entradas.filter(e => e.billable).reduce((s, e) => s + Number(e.hours), 0)

  const irPara = (params: Record<string, string>) => {
    const q = new URLSearchParams({ mes, ...(pessoa ? { pessoa } : {}), ...params })
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k)
    router.push(`/horas?${q}`)
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="titulo text-3xl text-verde">Registo de horas</h1>
        <p className="mt-1 text-sm text-cinza">
          Alimenta a Produtividade e o custo/hora do Financeiro. Ligar ao orçamento sempre que o trabalho for de um cliente.
        </p>
      </div>

      <form ref={form} action={enviar} className="cartao mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {gestor && (
          <label>
            <span className="rotulo">Pessoa</span>
            <select name="employee_id" className="campo" defaultValue={pessoa || euId}>
              {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
        )}
        <label>
          <span className="rotulo">Data</span>
          <input name="date" type="date" required className="campo" defaultValue={new Date().toISOString().slice(0, 10)} />
        </label>
        <label>
          <span className="rotulo">Horas</span>
          <input name="hours" inputMode="decimal" required className="campo text-right" placeholder="ex.: 1,5" />
        </label>
        <label className="lg:col-span-2">
          <span className="rotulo">Orçamento (opcional)</span>
          <select name="orcamento_id" className="campo" defaultValue="">
            <option value="">— trabalho interno —</option>
            {orcamentos.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" name="billable" defaultChecked className="h-4 w-4 accent-[var(--color-verde)]" />
          Faturável
        </label>
        <label className="sm:col-span-2 lg:col-span-5">
          <span className="rotulo">O que foi feito</span>
          <input name="description" className="campo" placeholder="ex.: digitalização do logo, bordado de 40 peças" />
        </label>
        <div className="flex items-end">
          <button className="botao-principal w-full" disabled={aEnviar}>{aEnviar ? 'A gravar…' : 'Registar'}</button>
        </div>
        {estado && 'error' in estado && <p className="text-sm text-alerta sm:col-span-2 lg:col-span-6">{estado.error}</p>}
      </form>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label>
          <span className="rotulo">Mês</span>
          <input type="month" className="campo" value={mes} onChange={e => irPara({ mes: e.target.value })} />
        </label>
        {gestor && (
          <label>
            <span className="rotulo">Mostrar</span>
            <select className="campo" value={pessoa} onChange={e => irPara({ pessoa: e.target.value })}>
              <option value="">Toda a gente</option>
              {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
        )}
        <p className="ml-auto text-sm">
          <b>{fmtH(total)}</b> registadas · {fmtH(faturaveis)} faturáveis
          {total > 0 && <span className="text-cinza"> ({Math.round((faturaveis / total) * 100)}%)</span>}
        </p>
      </div>

      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead>
            <tr>
              <th>Data</th>
              {gestor && <th>Pessoa</th>}
              <th className="num">Horas</th>
              <th>Faturável</th>
              <th>Orçamento</th>
              <th>Descrição</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entradas.map(e => (
              <tr key={e.id}>
                <td>{e.date.split('-').reverse().join('/')}</td>
                {gestor && <td>{nome(e.employee_id)}</td>}
                <td className="num">{fmtH(Number(e.hours))}</td>
                <td>{e.billable ? 'sim' : 'não'}</td>
                <td className="text-xs">{orc(e.orcamento_id)}</td>
                <td className="text-xs text-cinza">{e.description}</td>
                <td>
                  <button
                    className="botao-perigo"
                    disabled={aApagar}
                    onClick={() => confirm('Apagar este registo de horas?') && iniciar(async () => { await apagarHoras(e.id) })}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {!entradas.length && (
              <tr><td colSpan={7} className="py-8 text-center text-cinza">Sem horas registadas neste mês.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
