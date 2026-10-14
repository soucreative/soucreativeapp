'use client'

import { useActionState, useTransition, useState } from 'react'
import { DEPARTMENTS, OPERATIONAL_DEPTS, OVERHEAD_DEPTS } from '@/lib/departments'
import Link from 'next/link'
import { syncCostCenterRevenue, syncCostCenterFse, upsertDeptObjective, upsertRevenueDistribution } from '../actions'
import type { CostCenterRecord, Objective } from '@/types/database'

const fmt    = (v: number) => v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const pctFmt = (v: number) => `${(v * 100).toFixed(1)}%`

export default function CostCentersSection({
  year,
  ccRecords,
  payrollByDept,
  deptTargets = {},
  revenueShares = {},
}: {
  year: number
  ccRecords: CostCenterRecord[]
  payrollByDept: Record<string, number>
  deptTargets?: Record<string, Objective | undefined>
  /** Percentagens da repartição da receita genérica; tudo a zero = horas do registo de horas */
  revenueShares?: Record<string, number>
}) {
  // "Outros" mostra-se com resultado próprio, ao lado dos operacionais
  const OPERATIONAL = [...OPERATIONAL_DEPTS, 'Outros'] as const
  const OVERHEAD    = OVERHEAD_DEPTS

  // Annual totals per cost center (raw)
  const rawByCenter = DEPARTMENTS.map(dept => {
    const rows      = ccRecords.filter(r => r.cost_center === dept)
    const revenue   = rows.reduce((s, r) => s + r.revenue, 0)
    // O que a fatura confirma; o resto do `revenue` foi repartido por uma regra
    const direct    = rows.reduce((s, r) => s + (r.revenue_direct ?? 0), 0)
    const fse       = rows.reduce((s, r) => s + r.fse, 0)
    const dc        = rows.reduce((s, r) => s + r.direct_costs, 0)
    const ccPayroll = rows.reduce((s, r) => s + r.payroll, 0)
    const payroll   = ccPayroll > 0 ? ccPayroll : (payrollByDept[dept] ?? 0)
    return { dept, revenue, direct, fse, dc, payroll }
  })

  // Sum overhead costs to redistribute
  const overheadTotals = OVERHEAD.reduce(
    (acc, dept) => {
      const row = rawByCenter.find(r => r.dept === dept)
      if (!row) return acc
      return { fse: acc.fse + row.fse, dc: acc.dc + row.dc, payroll: acc.payroll + row.payroll }
    },
    { fse: 0, dc: 0, payroll: 0 }
  )
  const overheadPerOp = {
    fse:     Math.round(overheadTotals.fse     / OPERATIONAL.length),
    dc:      Math.round(overheadTotals.dc      / OPERATIONAL.length),
    payroll: Math.round(overheadTotals.payroll / OPERATIONAL.length),
  }

  // Final view: only operational depts, with overhead redistributed
  const annualByCenter = rawByCenter
    .filter(r => (OPERATIONAL as readonly string[]).includes(r.dept))
    .map(r => {
      const payroll     = r.payroll + overheadPerOp.payroll
      const fse         = r.fse     + overheadPerOp.fse
      const dc          = r.dc      + overheadPerOp.dc
      const ccPayroll   = ccRecords.filter(c => c.cost_center === r.dept).reduce((s, c) => s + c.payroll, 0)
      const isAutoPayroll = ccPayroll === 0 && payroll > 0
      const ebitda      = r.revenue - fse - dc - payroll
      // Quanto do resultado assenta em receita que a fatura confirma
      const directPct   = r.revenue > 0 ? r.direct / r.revenue : null
      return { dept: r.dept, revenue: r.revenue, direct: r.direct, directPct, fse, dc, payroll, isAutoPayroll, ebitda }
    })

  const totalRevenue  = annualByCenter.reduce((s, c) => s + c.revenue, 0)
  const hasAnnualData = annualByCenter.some(c => c.revenue > 0 || c.fse > 0 || c.payroll > 0)
  const hasAutoPayroll = annualByCenter.some(c => c.isAutoPayroll)

  const [syncPending, startSync] = useTransition()
  const [syncMsg, setSyncMsg]    = useState<string | null>(null)

  const [fsePending, startFse] = useTransition()
  const [fseMsg, setFseMsg]    = useState<string | null>(null)

  const [sharesState, sharesAction, sharesPending] = useActionState(upsertRevenueDistribution, {})
  const somaShares = OPERATIONAL.reduce((s, d) => s + (revenueShares[d] ?? 0), 0)

  // Reparte o FSE pelos centros a partir da conta SNC de cada linha de compra
  function handleSyncFse() {
    setFseMsg(null)
    startFse(async () => {
      const res = await syncCostCenterFse(year)
      if (!res.success) { setFseMsg(`Erro: ${res.error}`); return }
      const porClassificar = res.unmapped.length
      setFseMsg(
        `✓ ${fmt(res.totalFse)} de FSE repartido.` +
        (res.ignorado   ? ` ${fmt(res.ignorado)} de empréstimos e leasing ficaram de fora.` : '') +
        (porClassificar ? ` ${porClassificar} conta(s) por classificar entraram como estrutura.` : '')
      )
    })
  }

  // Inline objective editing
  type EditingDept = { dept: string; target: string; base: string }
  const [editing, setEditing]     = useState<EditingDept | null>(null)
  const [savePending, startSave]  = useTransition()
  const [saveMsg, setSaveMsg]     = useState<Record<string, string>>({})

  function startEdit(dept: string) {
    const existing = deptTargets[dept]
    setEditing({
      dept,
      target: existing?.target_value != null ? String(existing.target_value) : '',
      base:   existing?.minimum_base  != null ? String(existing.minimum_base)  : '',
    })
  }

  function saveEdit() {
    if (!editing) return
    const targetValue = Number(editing.target) || 0
    const minimumBase = editing.base ? Number(editing.base) : null
    const dept = editing.dept
    setEditing(null)
    startSave(async () => {
      const res = await upsertDeptObjective(year, dept, targetValue, minimumBase)
      setSaveMsg(prev => ({
        ...prev,
        [dept]: res.error ? `Erro: ${res.error}` : '✓ Guardado',
      }))
      setTimeout(() => setSaveMsg(prev => { const n = {...prev}; delete n[dept]; return n }), 3000)
    })
  }

  function handleSync() {
    setSyncMsg(null)
    startSync(async () => {
      const result = await syncCostCenterRevenue(year)
      if (result.success) {
        const semHoras = (result as { mesesSemHoras?: number[] }).mesesSemHoras ?? []
        const porMapear = (result as { artigosPorMapear?: { item_code: string }[] }).artigosPorMapear ?? []
        setSyncMsg(
          `✓ ${result.updated} registos actualizados do TOC Online.` +
          (semHoras.length
            ? ` Meses sem horas no registo de horas (${semHoras.join(', ')}) usaram a repartição do ano.`
            : '') +
          (porMapear.length
            ? ` ${porMapear.length} artigo(s) fora do mapa (${porMapear.slice(0, 5).map(a => a.item_code).join(', ')}) foram repartidos como genéricos.`
            : '')
        )
      } else setSyncMsg(`Erro: ${result.error}`)
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
            Centros de Custo — {year}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Breakdown anual por departamento/serviço — lança os valores mês a mês na secção acima
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/financeiro/expense-codes"
            className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
          >
            Contas de despesa
          </Link>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncPending}
            className="text-xs text-teal-600 border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50 disabled:opacity-40 transition-colors"
          >
            {syncPending ? 'A sincronizar…' : '↻ Receita do TOC'}
          </button>
          <button
            type="button"
            onClick={handleSyncFse}
            disabled={fsePending}
            className="text-xs text-teal-600 border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50 disabled:opacity-40 transition-colors"
          >
            {fsePending ? 'A repartir…' : '↻ Custos do TOC'}
          </button>
        </div>
      </div>

      {(syncMsg || fseMsg) && (
        <div className="space-y-1">
          {syncMsg && <p className={`text-xs ${syncMsg.startsWith('Erro') ? 'text-red-500' : 'text-emerald-600'}`}>{syncMsg}</p>}
          {fseMsg  && <p className={`text-xs ${fseMsg.startsWith('Erro')  ? 'text-red-500' : 'text-emerald-600'}`}>{fseMsg}</p>}
        </div>
      )}

      {/* Repartição da receita genérica — o pacote de horas e os outros proveitos */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <form action={sharesAction} className="space-y-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Repartição da receita sem departamento
            </p>
            <p className="text-xs text-slate-400">
              {somaShares > 0
                ? `A usar estas percentagens${Math.abs(somaShares - 100) > 0.01 ? ` (somam ${somaShares.toFixed(0)}%, são normalizadas)` : ''}`
                : 'A usar as horas faturáveis do registo de horas'}
            </p>
          </div>
          <p className="text-xs text-slate-500">
            O pacote de horas e os outros proveitos não têm departamento próprio. Estas percentagens
            dizem a quem pertencem. <strong>Deixa tudo a zero</strong> para voltar às horas do registo de horas.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {OPERATIONAL.map(dept => (
              <div key={dept}>
                <label className="block text-xs text-slate-500 mb-1">{dept}</label>
                <div className="relative">
                  <input
                    name={`share:${dept}`}
                    type="number" min="0" max="100" step="0.5"
                    defaultValue={revenueShares[dept] ?? 0}
                    className="w-full pr-6 pl-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={sharesPending}
              className="text-xs bg-slate-700 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              {sharesPending ? 'A guardar…' : 'Guardar percentagens'}
            </button>
            <span className="text-xs text-slate-400">
              Depois de guardar, carrega em ↻ Receita do TOC para aplicar.
            </span>
          </div>
          {sharesState?.error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{sharesState.error}</p>
          )}
          {sharesState?.ok && !sharesState.error && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Guardado. Falta carregar em ↻ Receita do TOC.
            </p>
          )}
        </form>
      </div>

      {/* Overhead redistribution note */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-2">
        <span className="text-slate-400 text-sm leading-none mt-0.5">ℹ</span>
        <p className="text-xs text-slate-500">
          Os custos de <strong>Gestão</strong> — onde fica também a estrutura vinda do TOC
          (renda, seguros, água, luz) — são distribuídos igualmente pelos centros operacionais.
          <strong> Outros</strong> é o que não pertence a nenhum centro.
          Overhead por centro: <strong>{fmt(overheadPerOp.payroll)} massa sal.</strong>
          {overheadPerOp.fse > 0 && ` · ${fmt(overheadPerOp.fse)} FSE`}
        </p>
      </div>

      {/* Auto-payroll info banner */}
      {hasAutoPayroll && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex items-start gap-2.5">
          <span className="text-indigo-400 text-sm leading-none mt-0.5">ℹ</span>
          <p className="text-xs text-indigo-700">
            A coluna <strong>Massa Salarial</strong> é estimada automaticamente com base nos
            salários históricos dos colaboradores (considera alterações de vencimento ao longo do ano).
            Em itálico = estimativa; sem itálico = valor lançado manualmente.
          </p>
        </div>
      )}

      {/* Annual summary table */}
      {hasAnnualData ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Resumo anual — {year}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left  px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Centro</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Faturação
                    <span className="block font-normal normal-case tracking-normal text-slate-300">medido vs repartido</span>
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Meta</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Base mín.</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">% obj.</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">FSE</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Custos dir.</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Massa sal.</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">EBITDA aprox.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {annualByCenter
                  .filter(c => c.revenue > 0 || c.fse > 0 || c.dc > 0 || c.payroll > 0 || true)
                  .map(c => {
                    const target    = deptTargets[c.dept]?.target_value ?? null
                    const base      = deptTargets[c.dept]?.minimum_base ?? null
                    const vsObj     = target && target > 0 ? c.revenue / target : null
                    const isEditing = editing?.dept === c.dept
                    return (
                      <tr key={c.dept} className="hover:bg-slate-50">
                        <td className="px-6 py-3 font-medium text-slate-900">{c.dept}</td>
                        <td className="px-6 py-3 text-right tabular-nums">
                          <div className="text-slate-700">{fmt(c.revenue)}</div>
                          {c.revenue > 0 && (
                            <div
                              className={`text-xs ${c.directPct !== null && c.directPct < 0.5 ? 'text-amber-600' : 'text-slate-400'}`}
                              title={`${fmt(c.direct)} confirmados pela fatura · ${fmt(c.revenue - c.direct)} repartidos por uma regra`}
                            >
                              {c.directPct !== null ? `${(c.directPct * 100).toFixed(0)}% medido` : '—'}
                            </div>
                          )}
                        </td>

                        {/* Meta — editável inline */}
                        <td className="px-4 py-2 text-right">
                          {isEditing ? (
                            <input
                              type="number" min="0" step="1000" autoFocus
                              value={editing.target}
                              onChange={e => setEditing(prev => prev ? { ...prev, target: e.target.value } : null)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null) }}
                              className="w-28 text-right text-sm border border-indigo-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(c.dept)}
                              className="text-right w-full text-xs tabular-nums text-slate-500 hover:text-indigo-600 hover:underline cursor-pointer"
                            >
                              {target ? fmt(target) : <span className="text-slate-300 italic">+ meta</span>}
                            </button>
                          )}
                          {saveMsg[c.dept] && (
                            <p className={`text-xs mt-0.5 ${saveMsg[c.dept].startsWith('Erro') ? 'text-red-500' : 'text-emerald-600'}`}>
                              {saveMsg[c.dept]}
                            </p>
                          )}
                        </td>

                        {/* Base mín. — editável inline */}
                        <td className="px-4 py-2 text-right">
                          {isEditing ? (
                            <div className="flex items-center gap-1 justify-end">
                              <input
                                type="number" min="0" step="1000"
                                value={editing.base}
                                onChange={e => setEditing(prev => prev ? { ...prev, base: e.target.value } : null)}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null) }}
                                placeholder="opcional"
                                className="w-28 text-right text-sm border border-indigo-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                              />
                              <button type="button" onClick={saveEdit} disabled={savePending}
                                className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700 disabled:opacity-40">
                                ✓
                              </button>
                              <button type="button" onClick={() => setEditing(null)}
                                className="text-xs text-slate-400 hover:text-slate-600 px-1">
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(c.dept)}
                              className="text-right w-full text-xs tabular-nums text-slate-400 hover:text-indigo-600 hover:underline cursor-pointer"
                            >
                              {base ? fmt(base) : <span className="text-slate-200 italic">+ base</span>}
                            </button>
                          )}
                        </td>

                        <td className="px-6 py-3 text-right tabular-nums text-xs font-semibold">
                          {vsObj !== null
                            ? <span className={vsObj >= 1 ? 'text-emerald-600' : vsObj >= 0.75 ? 'text-amber-600' : 'text-red-500'}>
                                {pctFmt(vsObj)}
                              </span>
                            : <span className="text-slate-200">—</span>}
                        </td>
                        <td className="px-6 py-3 text-right text-slate-500 tabular-nums">{fmt(c.fse)}</td>
                        <td className="px-6 py-3 text-right text-slate-500 tabular-nums">{fmt(c.dc)}</td>
                        <td className="px-6 py-3 text-right text-slate-500 tabular-nums">
                          {c.payroll > 0
                            ? <span className={c.isAutoPayroll ? 'italic text-slate-400' : ''}>{fmt(c.payroll)}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className={`px-6 py-3 text-right font-medium tabular-nums ${
                          c.ebitda >= 0 ? 'text-emerald-600' : 'text-red-500'
                        }`}>
                          {fmt(c.ebitda)}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
              <tfoot>
                {/* O que não pertence a nenhum centro operacional e é repartido
                    pelos centros operacionais */}
                {(overheadTotals.fse !== 0 || overheadTotals.dc !== 0 || overheadTotals.payroll !== 0) && (
                  <tr className="border-t border-slate-200 text-slate-400">
                    <td className="px-6 py-2.5 text-xs italic">
                      Estrutura
                      <span className="ml-1.5 text-slate-300">repartida pelos {OPERATIONAL.length} centros</span>
                    </td>
                    <td className="px-6 py-2.5"></td>
                    <td className="px-6 py-2.5"></td>
                    <td className="px-6 py-2.5"></td>
                    <td className="px-6 py-2.5"></td>
                    <td className="px-6 py-2.5 text-right text-xs italic tabular-nums">{fmt(overheadTotals.fse)}</td>
                    <td className="px-6 py-2.5 text-right text-xs italic tabular-nums">{fmt(overheadTotals.dc)}</td>
                    <td className="px-6 py-2.5 text-right text-xs italic tabular-nums">{fmt(overheadTotals.payroll)}</td>
                    <td className="px-6 py-2.5"></td>
                  </tr>
                )}
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td className="px-6 py-3 text-xs font-semibold text-slate-600">Total</td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    <div className="text-sm font-bold text-slate-900">{fmt(totalRevenue)}</div>
                    {totalRevenue > 0 && (
                      <div className="text-xs font-normal text-slate-400">
                        {((annualByCenter.reduce((s, c) => s + c.direct, 0) / totalRevenue) * 100).toFixed(0)}% medido
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-3"></td>
                  <td className="px-6 py-3"></td>
                  <td className="px-6 py-3"></td>
                  <td className="px-6 py-3 text-right text-xs font-semibold text-slate-600 tabular-nums">
                    {fmt(annualByCenter.reduce((s, c) => s + c.fse, 0))}
                  </td>
                  <td className="px-6 py-3 text-right text-xs font-semibold text-slate-600 tabular-nums">
                    {fmt(annualByCenter.reduce((s, c) => s + c.dc, 0))}
                  </td>
                  <td className="px-6 py-3 text-right text-xs font-semibold text-slate-600 tabular-nums">
                    {fmt(annualByCenter.reduce((s, c) => s + c.payroll, 0))}
                  </td>
                  <td className={`px-6 py-3 text-right text-xs font-semibold tabular-nums ${
                    annualByCenter.reduce((s, c) => s + c.ebitda, 0) >= 0 ? 'text-emerald-600' : 'text-red-500'
                  }`}>
                    {fmt(annualByCenter.reduce((s, c) => s + c.ebitda, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-8">
          Ainda sem dados por centro de custo para {year}. Usa o formulário mensal acima para lançar os valores.
        </p>
      )}
    </div>
  )
}
