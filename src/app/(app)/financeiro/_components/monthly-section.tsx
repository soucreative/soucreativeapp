'use client'

import { useActionState, useState, useEffect, useRef, useTransition } from 'react'
import { upsertMonthlyData, recalculateMonthlyPayroll } from '../actions'
import { OPERATIONAL_DEPTS } from '@/lib/departments'
import { MONTH_NAMES_LONG, MONTH_NAMES_SHORT } from '@/lib/constants'
import { formatEUR } from '@/lib/format'
import type { FinancialRecord, CostCenterRecord } from '@/types/database'

const MONTHS = MONTH_NAMES_LONG
const MS     = MONTH_NAMES_SHORT
const fmt    = formatEUR

function ccKey(name: string): string {
  return name.replace(/\s+/g, '_')
    .replace(/[áàãâ]/gi, 'a').replace(/[éèê]/gi, 'e')
    .replace(/[íì]/gi, 'i').replace(/[óòõô]/gi, 'o').replace(/[úù]/gi, 'u')
    .replace(/ç/gi, 'c').toLowerCase()
}

// ── Unified month entry form ───────────────────────────────────────────────

function MonthForm({
  year, month, record, ccRecords, payrollEstimate, payrollByDept, onClose,
}: {
  year: number
  month: number
  record: FinancialRecord | null
  ccRecords: CostCenterRecord[]
  payrollEstimate: number  // for this specific month
  payrollByDept: Record<string, number>  // for this specific month
  onClose: () => void
}) {
  const [state, action, pending] = useActionState(upsertMonthlyData, null)

  useEffect(() => {
    if (state?.success) onClose()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.success])

  // Controlled inputs for live EBITDA preview
  const [revenue,       setRevenue]       = useState(record?.revenue ?? 0)
  const [otherRevenue,  setOtherRevenue]  = useState(record?.other_revenue ?? 0)
  const [plunetRevenue, setPlunetRevenue] = useState(record?.plunet_revenue ?? 0)
  const [fse,           setFse]           = useState(record?.fse ?? 0)
  const [dc,           setDc]           = useState(record?.direct_costs ?? 0)
  const [payroll,      setPayroll]      = useState(
    record?.total_payroll && record.total_payroll > 0
      ? record.total_payroll
      : payrollEstimate
  )

  const fseSuppliers = record?.fse_suppliers ?? 0
  const totalFse     = fse + fseSuppliers
  const totalRevenue = revenue + otherRevenue + plunetRevenue
  const ebitda       = totalRevenue - totalFse - dc - payroll
  const marginPct    = revenue > 0 ? (ebitda / revenue) * 100 : null

  const isAutoPayroll =
    !(record?.total_payroll && record.total_payroll > 0) && payrollEstimate > 0

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="year"  value={year} />
      <input type="hidden" name="month" value={month} />

      {/* ── Global values ─────────────────────────────────────────── */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Valores globais
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Faturação TOC (€) *
            </label>
            <input name="revenue" type="number" step="0.01" min="0" required
              value={revenue || ''}
              onChange={e => setRevenue(Number(e.target.value) || 0)}
              placeholder="0"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notas</label>
            <input name="notes" type="text"
              defaultValue={record?.notes ?? ''}
              placeholder="Observações, contexto do mês..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        {/* Faturação fora do TOC: na app de origem era a Plunet; na SOU não se usa */}
        <input type="hidden" name="plunet_revenue" value={plunetRevenue || 0} />

        {/* Other revenue — subsidies / grants */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
            Outros proveitos — subsídios / apoios
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Valor (€)</label>
              <input name="other_revenue" type="number" step="0.01" min="0"
                value={otherRevenue || ''}
                onChange={e => setOtherRevenue(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-3 py-2 text-sm border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Origem / Descrição</label>
              <input name="other_revenue_notes" type="text"
                defaultValue={record?.other_revenue_notes ?? ''}
                placeholder="ex: Subsídio IEFP, Apoio COMPETE…"
                className="w-full px-3 py-2 text-sm border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white" />
            </div>
          </div>
          {otherRevenue > 0 && (
            <p className="text-xs text-emerald-700">
              Faturação total: <strong>{fmt(totalRevenue)}</strong>
              <span className="text-emerald-500 ml-1">
                ({fmt(revenue)} TOC{plunetRevenue > 0 ? ` + ${fmt(plunetRevenue)} manual` : ''} + {fmt(otherRevenue)} outros)
              </span>
            </p>
          )}
          {otherRevenue === 0 && plunetRevenue > 0 && (
            <p className="text-xs text-blue-700">
              Faturação total: <strong>{fmt(totalRevenue)}</strong>
              <span className="text-blue-500 ml-1">({fmt(revenue)} TOC + {fmt(plunetRevenue)} manual)</span>
            </p>
          )}
        </div>

        {/* Costs row + live EBITDA card */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {/* FSE manual */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">FSE manual (€)</label>
            <input name="fse" type="number" step="0.01" min="0"
              value={fse || ''}
              onChange={e => setFse(Number(e.target.value) || 0)}
              placeholder="0"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            {fseSuppliers > 0 && (
              <p className="text-xs text-indigo-500 mt-1 leading-tight">
                + {fmt(fseSuppliers)} fornecedores
                <br />
                <strong>Total FSE: {fmt(totalFse)}</strong>
              </p>
            )}
            {(record?.fse_exclusion ?? 0) > 0 && (
              <p className="text-xs text-amber-600 mt-1 leading-tight">
                ⚠ Excluído da sync TOC: <strong>{fmt(record!.fse_exclusion)}</strong>
                {record?.fse_exclusion_notes && (
                  <span className="text-amber-500"> — {record.fse_exclusion_notes}</span>
                )}
              </p>
            )}
          </div>

          {/* Custos diretos */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Custos diretos (€)</label>
            <input name="direct_costs" type="number" step="0.01" min="0"
              value={dc || ''}
              onChange={e => setDc(Number(e.target.value) || 0)}
              placeholder="0"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Massa salarial (auto) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Massa salarial (€)
              {isAutoPayroll && (
                <span className="ml-1.5 text-indigo-400 font-normal">auto</span>
              )}
            </label>
            <input name="total_payroll" type="number" step="0.01" min="0"
              value={payroll || ''}
              onChange={e => setPayroll(Number(e.target.value) || 0)}
              placeholder="0"
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                isAutoPayroll
                  ? 'border-indigo-200 bg-indigo-50/60'
                  : 'border-slate-300'
              }`} />
            {isAutoPayroll && (
              <p className="text-xs text-indigo-400 mt-1">Com base nos salários activos</p>
            )}
          </div>

          {/* Live EBITDA preview */}
          <div className={`rounded-xl p-3 flex flex-col justify-center border ${
            ebitda >= 0
              ? 'bg-emerald-50 border-emerald-100'
              : 'bg-red-50 border-red-100'
          }`}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              EBITDA
            </p>
            <p className={`text-xl font-bold tabular-nums ${
              ebitda >= 0 ? 'text-emerald-700' : 'text-red-600'
            }`}>
              {fmt(ebitda)}
            </p>
            {marginPct !== null && (
              <p className="text-xs text-slate-400 mt-0.5">
                {marginPct.toFixed(1)}% margem
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Cost centers ──────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Centros de custo
          </h4>
          <span className="text-xs text-slate-400">
            A massa salarial é pré-preenchida pela equipa de cada departamento
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">
                  Dept.
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Faturação
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  FSE
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Custos dir.
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Massa sal.
                  <span className="block text-indigo-400 font-normal normal-case tracking-normal text-xs">
                    auto
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {OPERATIONAL_DEPTS.map(dept => {
                const existing    = ccRecords.find(r => r.cost_center === dept)
                const key         = ccKey(dept)
                const autoPayroll = payrollByDept[dept] ?? 0
                const isAuto      = !(existing?.payroll && existing.payroll > 0) && autoPayroll > 0

                const defaultPay = existing?.payroll && existing.payroll > 0
                  ? existing.payroll
                  : autoPayroll > 0 ? autoPayroll : undefined

                return (
                  <tr key={dept} className="hover:bg-slate-50/40">
                    <td className="px-4 py-2 font-medium text-sm text-slate-700">
                      {dept}
                    </td>
                    <td className="px-3 py-1.5">
                      <input name={`rev_${key}`} type="number" step="0.01" min="0"
                        defaultValue={existing?.revenue && existing.revenue > 0 ? existing.revenue : ''}
                        placeholder="0"
                        className="w-full px-2 py-1.5 text-xs text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input name={`fse_${key}`} type="number" step="0.01" min="0"
                        defaultValue={existing?.fse && existing.fse > 0 ? existing.fse : ''}
                        placeholder="0"
                        className="w-full px-2 py-1.5 text-xs text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input name={`dc_${key}`} type="number" step="0.01" min="0"
                        defaultValue={existing?.direct_costs && existing.direct_costs > 0 ? existing.direct_costs : ''}
                        placeholder="0"
                        className="w-full px-2 py-1.5 text-xs text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input name={`pay_${key}`} type="number" step="0.01" min="0"
                        defaultValue={defaultPay ?? ''}
                        placeholder="0"
                        className={`w-full px-2 py-1.5 text-xs text-right border rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                          isAuto
                            ? 'border-indigo-200 bg-indigo-50/60 text-indigo-800'
                            : 'border-slate-200 bg-white'
                        }`} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Feedback + submit ─────────────────────────────────────── */}
      {state?.error && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>
      )}

      <button type="submit" disabled={pending}
        className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
        {pending ? 'A guardar...' : `Guardar ${MONTHS[month - 1]}`}
      </button>
    </form>
  )
}

// ── Main section ───────────────────────────────────────────────────────────

export default function MonthlySection({
  year, records, ccRecords, payrollEstimateByMonth, payrollByDeptByMonth,
}: {
  year: number
  records: FinancialRecord[]
  ccRecords: CostCenterRecord[]
  payrollEstimateByMonth: Record<number, number>
  payrollByDeptByMonth: Record<number, Record<string, number>>
}) {
  const now          = new Date()
  const currentMonth = year === now.getFullYear() ? now.getMonth() + 1 : 1
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  // Scroll the edit form into view whenever a month is selected
  useEffect(() => {
    if (selectedMonth !== null) {
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }
  }, [selectedMonth])

  const recordMap         = Object.fromEntries(records.map(r => [r.month, r]))
  const totalTocRevenue    = records.reduce((s, r) => s + r.revenue, 0)
  const totalPlunetSummary = records.reduce((s, r) => s + (r.plunet_revenue ?? 0), 0)
  const totalOtherRevenue  = records.reduce((s, r) => s + (r.other_revenue ?? 0), 0)
  const totalEbitda        = records.reduce((s, r) => s + r.ebitda, 0)

  const hasCcData = (m: number) => ccRecords.some(r => r.month === m)

  const [refreshPending, startRefresh] = useTransition()
  const [refreshMsg, setRefreshMsg]    = useState<string | null>(null)

  function handleRefresh() {
    setRefreshMsg(null)
    startRefresh(async () => {
      const result = await recalculateMonthlyPayroll(year)
      if (result.success) setRefreshMsg(`✓ Massa salarial actualizada em ${result.updated} registos.`)
      else setRefreshMsg(`Erro: ${result.error}`)
    })
  }

  return (
    <div className="space-y-4">

      {/* ── Annual summary table ──────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
            Registos mensais {year}
          </h2>
          <div className="flex items-center gap-2">
            {refreshMsg && (
              <span className="text-xs text-emerald-600">{refreshMsg}</span>
            )}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshPending}
              title="Recalcular massa salarial com base no histórico de compensação"
              className="text-xs text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors">
              {refreshPending ? 'A actualizar…' : '↻ Massa salarial'}
            </button>
            <button
              onClick={() => setSelectedMonth(prev => prev ? null : currentMonth)}
              className="text-xs text-indigo-600 border border-indigo-300 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
              + Lançar mês
            </button>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left  px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Mês</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Faturação</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-blue-500 uppercase tracking-wider">Fat. manual</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Outros prov.</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">FSE Total</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Custos dir.</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Massa sal.</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">EBITDA</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
              const r          = recordMap[m]
              const isSelected = selectedMonth === m
              return (
                <tr key={m} className={`transition-colors ${
                  isSelected   ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200'
                  : r          ? 'hover:bg-slate-50'
                  : 'opacity-60'
                }`}>
                  <td className="px-5 py-3 font-medium text-slate-700">
                    {MS[m - 1]}
                    {hasCcData(m) && (
                      <span className="ml-2 text-xs text-indigo-300" title="Tem dados por centro de custo">
                        CC
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-slate-900">
                    {r ? fmt(r.revenue) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {r && (r.plunet_revenue ?? 0) > 0 ? (
                      <span className="font-medium text-blue-700">{fmt(r.plunet_revenue)}</span>
                    ) : <span className="text-slate-200">—</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {r && (r.other_revenue ?? 0) > 0 ? (
                      <span className="font-medium text-emerald-700" title={r.other_revenue_notes ?? undefined}>
                        {fmt(r.other_revenue)}
                        {r.other_revenue_notes && <span className="ml-1 text-emerald-400 text-xs">ℹ</span>}
                      </span>
                    ) : <span className="text-slate-200">—</span>}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-500">
                    {r ? (
                      <span title={[
                        r.fse_suppliers > 0 ? `Manual: ${fmt(r.fse)} + Fornecedores: ${fmt(r.fse_suppliers)}` : null,
                        (r.fse_exclusion ?? 0) > 0 ? `Excluído TOC: ${fmt(r.fse_exclusion)}${r.fse_exclusion_notes ? ` (${r.fse_exclusion_notes})` : ''}` : null,
                      ].filter(Boolean).join(' | ') || undefined}>
                        {fmt(r.fse + r.fse_suppliers)}
                        {r.fse_suppliers > 0 && (
                          <span className="ml-1 text-xs text-indigo-300">(+forn.)</span>
                        )}
                        {(r.fse_exclusion ?? 0) > 0 && (
                          <span className="ml-1 text-xs text-amber-400" title={`Excluído: ${fmt(r.fse_exclusion)}${r.fse_exclusion_notes ? ` — ${r.fse_exclusion_notes}` : ''}`}>⚠</span>
                        )}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-500">{r ? fmt(r.direct_costs) : '—'}</td>
                  <td className="px-5 py-3 text-right text-slate-500">{r ? fmt(r.total_payroll) : '—'}</td>
                  <td className={`px-5 py-3 text-right font-semibold ${
                    r ? (r.ebitda >= 0 ? 'text-emerald-600' : 'text-red-500') : 'text-slate-300'
                  }`}>
                    {r ? fmt(r.ebitda) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => setSelectedMonth(isSelected ? null : m)}
                      className={`text-xs transition-colors ${
                        isSelected
                          ? 'text-slate-400 hover:text-slate-600'
                          : 'text-indigo-600 hover:underline'
                      }`}>
                      {isSelected ? '▲ Fechar' : r ? 'Editar' : 'Lançar'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {records.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <td className="px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">YTD</td>
                <td className="px-5 py-3 text-right text-sm font-bold text-slate-900">{fmt(totalTocRevenue)}</td>
                {totalPlunetSummary > 0 ? (
                  <td className="px-5 py-3 text-right text-sm font-bold text-blue-700">{fmt(totalPlunetSummary)}</td>
                ) : (
                  <td />
                )}
                {totalOtherRevenue > 0 ? (
                  <td className="px-5 py-3 text-right text-sm font-bold text-emerald-700">{fmt(totalOtherRevenue)}</td>
                ) : (
                  <td />
                )}
                <td colSpan={3} />
                <td className={`px-5 py-3 text-right text-sm font-bold ${
                  totalEbitda >= 0 ? 'text-emerald-700' : 'text-red-600'
                }`}>
                  {fmt(totalEbitda)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Unified entry form (slides in when a month is selected) ── */}
      {selectedMonth !== null && (
        <div ref={formRef} className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6 space-y-6 scroll-mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              {MONTHS[selectedMonth - 1]} {year}
            </h3>
            <button type="button" onClick={() => setSelectedMonth(null)}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              ✕ Fechar
            </button>
          </div>

          {/* key= forces full re-mount when switching months — resets controlled state */}
          <MonthForm
            key={selectedMonth}
            year={year}
            month={selectedMonth}
            record={recordMap[selectedMonth] ?? null}
            ccRecords={ccRecords.filter(r => r.month === selectedMonth)}
            payrollEstimate={payrollEstimateByMonth[selectedMonth] ?? 0}
            payrollByDept={payrollByDeptByMonth[selectedMonth] ?? {}}
            onClose={() => setSelectedMonth(null)}
          />
        </div>
      )}
    </div>
  )
}
