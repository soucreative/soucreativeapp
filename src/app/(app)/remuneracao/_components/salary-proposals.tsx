'use client'

import { useState, useTransition } from 'react'
import { approveSalaryProposal, rejectSalaryProposal } from '../actions'

const fmt = (v: number) =>
  v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export type ProposalRow = {
  id: string
  nome: string
  departamento: string | null
  current_salary: number
  proposed_salary: number
  effective_date: string
  /** Custo anual para a empresa, já com 14 meses e TSU */
  custoAnual: number
}

export default function SalaryProposals({ rows }: { rows: ProposalRow[] }) {
  const [pending, start] = useTransition()
  const [msg, setMsg]    = useState<{ text: string; ok: boolean } | null>(null)
  const [confirmar, setConfirmar] = useState<string | null>(null)

  if (!rows.length) return null

  const totalAnual = rows.reduce((s, r) => s + r.custoAnual, 0)
  const dataEfeito = rows[0]?.effective_date

  function decidir(id: string, aprovar: boolean) {
    setMsg(null)
    setConfirmar(null)
    start(async () => {
      const res = aprovar ? await approveSalaryProposal(id) : await rejectSalaryProposal(id)
      setMsg(res.error
        ? { text: res.error, ok: false }
        : { text: aprovar ? 'Aprovado. A remuneração passa a contar a partir da data de efeito.' : 'Proposta rejeitada.', ok: true })
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
          Propostas de alteração salarial
        </h2>
        <p className="text-xs text-slate-400">
          {rows.length} por decidir · {fmt(totalAnual)}/ano de custo se forem todas aprovadas
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
        <span className="text-amber-400 text-sm leading-none mt-0.5">ℹ</span>
        <p className="text-xs text-amber-800">
          Enquanto estiverem por decidir, <strong>não contam para nada</strong>: a massa salarial, a
          produtividade e o orçamento continuam a ver os salários em vigor. Só a aprovação cria a
          remuneração nova, com efeito a {dataEfeito}.
        </p>
      </div>

      {msg && (
        <p className={`text-sm rounded-lg px-3 py-2 ${
          msg.ok
            ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
            : 'text-red-600 bg-red-50 border border-red-200'
        }`}>
          {msg.text}
        </p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left  px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Colaborador</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Atual</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Proposto</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Diferença</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Custo/ano</th>
              <th className="px-6 py-3 w-48"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-6 py-3">
                  <div className="font-medium text-slate-900">{r.nome}</div>
                  {r.departamento && <div className="text-xs text-slate-400">{r.departamento}</div>}
                </td>
                <td className="px-6 py-3 text-right text-slate-500 tabular-nums">{fmt(r.current_salary)}</td>
                <td className="px-6 py-3 text-right font-medium text-slate-900 tabular-nums">{fmt(r.proposed_salary)}</td>
                <td className="px-6 py-3 text-right text-emerald-600 tabular-nums">
                  +{fmt(r.proposed_salary - r.current_salary)}
                </td>
                <td className="px-6 py-3 text-right text-slate-500 tabular-nums">+{fmt(r.custoAnual)}</td>
                <td className="px-6 py-3 text-right">
                  {confirmar === r.id ? (
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs text-slate-500">Aprovar?</span>
                      <button
                        onClick={() => decidir(r.id, true)}
                        disabled={pending}
                        className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                      >
                        Sim
                      </button>
                      <button
                        onClick={() => setConfirmar(null)}
                        className="text-xs text-slate-500 hover:text-slate-700"
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => setConfirmar(r.id)}
                        disabled={pending}
                        className="text-xs text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-50 disabled:opacity-40 transition-colors"
                      >
                        Aprovar
                      </button>
                      <button
                        onClick={() => decidir(r.id, false)}
                        disabled={pending}
                        className="text-xs text-slate-400 hover:text-red-500 disabled:opacity-40 transition-colors"
                      >
                        Rejeitar
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t border-slate-200 font-semibold text-slate-700">
              <td className="px-6 py-3 text-xs">Total</td>
              <td colSpan={3} />
              <td className="px-6 py-3 text-right text-xs tabular-nums">+{fmt(totalAnual)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Aprova-se uma a uma, de propósito: uma escada salarial decide-se pessoa a pessoa.
      </p>
    </section>
  )
}
