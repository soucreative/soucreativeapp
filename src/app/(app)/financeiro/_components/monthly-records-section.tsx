'use client'

import { useState } from 'react'
import type { FinancialRecord } from '@/types/database'
import MonthlyRecordForm from './monthly-record-form'
import { MONTH_NAMES_SHORT } from '@/lib/constants'
import { formatEUR } from '@/lib/format'

const MONTHS = MONTH_NAMES_SHORT
const fmt    = formatEUR

export default function MonthlyRecordsSection({
  year,
  records,
  payrollEstimate,
}: {
  year: number
  records: FinancialRecord[]
  payrollEstimate: number
}) {
  const [editing, setEditing] = useState<FinancialRecord | null>(null)
  const [showNew, setShowNew] = useState(false)

  const recordMap        = Object.fromEntries(records.map(r => [r.month, r]))
  const totalRevenue     = records.reduce((s, r) => s + r.revenue + (r.other_revenue ?? 0), 0)
  const totalEbitda      = records.reduce((s, r) => s + r.ebitda, 0)
  // Juros e investimentos ficam abaixo do EBITDA, como no módulo de Orçamento
  const totalFinancial   = records.reduce((s, r) => s + (r.financial_costs ?? 0), 0)
  const totalInvestments = records.reduce((s, r) => s + (r.investments     ?? 0), 0)
  const totalResult      = totalEbitda - totalFinancial - totalInvestments
  const hasBelowEbitda   = totalFinancial !== 0 || totalInvestments !== 0

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
            Registos mensais {year}
          </h2>
          <button onClick={() => { setShowNew(true); setEditing(null) }}
            className="text-xs text-indigo-600 border border-indigo-300 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
            + Registar mês
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Mês</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Faturação TOC</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Outros prov.</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">FSE Total</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Custos diretos</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Massa salarial</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">EBITDA</th>
              {hasBelowEbitda && <>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Juros</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Investim.</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Resultado</th>
              </>}
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
              const r = recordMap[month]
              return (
                <tr key={month} className={r ? 'hover:bg-slate-50' : 'text-slate-300'}>
                  <td className="px-6 py-3 font-medium text-slate-700">{MONTHS[month - 1]}</td>
                  <td className="px-6 py-3 text-right">
                    {r ? <span className="font-medium text-slate-900">{fmt(r.revenue)}</span> : '—'}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {r && (r.other_revenue ?? 0) > 0 ? (
                      <span className="font-medium text-emerald-700" title={r.other_revenue_notes ?? undefined}>
                        {fmt(r.other_revenue)}
                        {r.other_revenue_notes && <span className="ml-1 text-emerald-400 text-xs">ℹ</span>}
                      </span>
                    ) : <span className="text-slate-200">—</span>}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-500">
                    {r ? (
                      <span title={r.fse_suppliers > 0 ? `Manual: ${fmt(r.fse)} + Fornecedores: ${fmt(r.fse_suppliers)}` : undefined}>
                        {fmt(r.fse + r.fse_suppliers)}
                        {(r.unmapped_accounts?.length ?? 0) > 0 && (
                          <span
                            className="ml-1 text-amber-500 text-xs"
                            title={`${r.unmapped_accounts.length} conta(s) de despesa sem classificação entraram neste FSE`}
                          >⚠</span>
                        )}
                        {r.fse_suppliers > 0 && (
                          <span className="ml-1 text-indigo-400 text-xs">(incl. forn.)</span>
                        )}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-500">{r ? fmt(r.direct_costs) : '—'}</td>
                  <td className="px-6 py-3 text-right text-slate-500">{r ? fmt(r.total_payroll) : '—'}</td>
                  <td className={`px-6 py-3 text-right font-medium ${r ? (r.ebitda >= 0 ? 'text-emerald-600' : 'text-red-500') : ''}`}>
                    {r ? fmt(r.ebitda) : '—'}
                  </td>
                  {hasBelowEbitda && (() => {
                    const resultado = r ? r.ebitda - (r.financial_costs ?? 0) - (r.investments ?? 0) : 0
                    return <>
                      <td className="px-6 py-3 text-right text-slate-500">{r ? fmt(r.financial_costs ?? 0) : '—'}</td>
                      <td className="px-6 py-3 text-right text-slate-500">{r ? fmt(r.investments     ?? 0) : '—'}</td>
                      <td className={`px-6 py-3 text-right font-medium ${r ? (resultado >= 0 ? 'text-emerald-600' : 'text-red-500') : ''}`}>
                        {r ? fmt(resultado) : '—'}
                      </td>
                    </>
                  })()}
                  <td className="px-6 py-3 text-right">
                    {r && (
                      <button onClick={() => { setEditing(r); setShowNew(false) }}
                        className="text-xs text-indigo-600 hover:underline">
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {records.length > 0 && (
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-slate-700">
                <td className="px-6 py-3">Total YTD</td>
                <td className="px-6 py-3 text-right text-slate-900">{fmt(totalRevenue)}</td>
                <td colSpan={4} />
                <td className={`px-6 py-3 text-right ${totalEbitda >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {fmt(totalEbitda)}
                </td>
                {hasBelowEbitda && <>
                  <td className="px-6 py-3 text-right text-slate-600">{fmt(totalFinancial)}</td>
                  <td className="px-6 py-3 text-right text-slate-600">{fmt(totalInvestments)}</td>
                  <td className={`px-6 py-3 text-right ${totalResult >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {fmt(totalResult)}
                  </td>
                </>}
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(showNew || editing) && (
        <MonthlyRecordForm
          year={year}
          record={editing}
          payrollEstimate={payrollEstimate}
          onClose={() => { setShowNew(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
