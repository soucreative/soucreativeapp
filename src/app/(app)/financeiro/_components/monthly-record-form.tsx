'use client'

import { useActionState } from 'react'
import { upsertMonthlyRecord } from '../actions'
import type { FinancialRecord } from '@/types/database'
import { MONTH_NAMES_LONG } from '@/lib/constants'

const MONTHS = MONTH_NAMES_LONG

export default function MonthlyRecordForm({
  year,
  record,
  payrollEstimate,
  onClose,
}: {
  year: number
  record: FinancialRecord | null
  payrollEstimate: number
  onClose: () => void
}) {
  const [state, action, pending] = useActionState(upsertMonthlyRecord, null)
  const currentMonth = new Date().getMonth() + 1
  const porMapear = record?.unmapped_accounts ?? []
  const fmtEUR = (v: number) =>
    v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

  return (
    <form action={action} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
        {record ? `Editar — ${MONTHS[(record.month ?? 1) - 1]} ${year}` : `Registar faturação — ${year}`}
      </h3>

      {/* O aviso da sincronização desaparecia ao gravar e o mês ficava com um FSE
          que ninguém sabia estar em causa. Fica aqui até a conta ser classificada
          e o mês ressincronizado. */}
      {porMapear.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
          <p className="text-xs font-semibold text-amber-900">
            {porMapear.length === 1
              ? '1 conta de despesa sem classificação entrou neste FSE'
              : `${porMapear.length} contas de despesa sem classificação entraram neste FSE`}
          </p>
          <div className="space-y-0.5">
            {porMapear.map(c => (
              <p key={c.account_code} className="text-xs text-amber-800">
                <span className="font-mono">{c.account_code}</span>
                {c.amount ? ` · ${fmtEUR(c.amount)}` : ''}
                {c.description ? ` · ${c.description}` : ''}
              </p>
            ))}
          </div>
          <p className="text-xs text-amber-700">
            Classifica-as em{' '}
            <a href="/financeiro/expense-codes" className="underline underline-offset-2 hover:text-amber-900">
              Contas de despesa
            </a>{' '}
            e volta a sincronizar este mês. O aviso só desaparece depois disso.
          </p>
        </div>
      )}

      <input type="hidden" name="year" value={year} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Mês <span className="text-red-400">*</span></label>
          <select name="month" required defaultValue={record?.month ?? currentMonth}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Faturação TOC (€) <span className="text-red-400">*</span></label>
          <input name="revenue" type="number" step="0.01" min="0" required
            defaultValue={record?.revenue ?? ''}
            placeholder="ex: 45000"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>

      {/* Other revenue — subsidies, grants */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
          Outros proveitos (subsídios / apoios)
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Valor (€)</label>
            <input name="other_revenue" type="number" step="0.01" min="0"
              defaultValue={record?.other_revenue || ''}
              placeholder="0"
              className="w-full px-3 py-2 text-sm border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Origem / Descrição</label>
            <input name="other_revenue_notes" type="text"
              defaultValue={record?.other_revenue_notes ?? ''}
              placeholder="ex: Subsídio IEFP, Apoio COVID-19…"
              className="w-full px-3 py-2 text-sm border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">FSE manual (€)</label>
          <input name="fse" type="number" step="0.01" min="0"
            defaultValue={record?.fse ?? ''}
            placeholder="0"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          {record && record.fse_suppliers > 0 && (
            <p className="text-xs text-indigo-600 mt-1">
              + {record.fse_suppliers.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })} de fornecedores
              {' '}→ Total FSE:{' '}
              <strong>
                {(record.fse + record.fse_suppliers).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}
              </strong>
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Custos diretos (€)</label>
          <input name="direct_costs" type="number" step="0.01" min="0"
            defaultValue={record?.direct_costs ?? ''}
            placeholder="0"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Massa salarial (€)</label>
          <input name="total_payroll" type="number" step="0.01" min="0"
            defaultValue={record?.total_payroll ?? (payrollEstimate > 0 ? payrollEstimate : '')}
            placeholder="0"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          {!record && payrollEstimate > 0 && (
            <p className="text-xs text-slate-400 mt-1">
              Calculado automaticamente com base nos salários ativos
            </p>
          )}
        </div>
      </div>

      {state?.error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error as string}</p>}
      {state?.success && <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">Registo guardado.</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending}
          className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {pending ? 'A guardar...' : 'Guardar registo'}
        </button>
        <button type="button" onClick={onClose}
          className="text-sm text-slate-500 hover:text-slate-700 transition-colors">
          Cancelar
        </button>
      </div>
    </form>
  )
}
