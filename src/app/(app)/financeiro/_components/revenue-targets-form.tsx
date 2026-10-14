'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { upsertRevenueTargets } from '../actions'
import type { Objective } from '@/types/database'

const fmt = (v: number) => v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export default function RevenueTargetsForm({
  year,
  companyTarget,
  marginTarget,
  hourlyRate,
}: {
  year: number
  companyTarget: Objective | null
  marginTarget: Objective | null
  hourlyRate: Objective | null
}) {
  const [state, action, pending] = useActionState(upsertRevenueTargets, null)
  const router = useRouter()
  const currentYear = new Date().getFullYear()

  return (
    <form action={action} className="bg-white rounded-xl border border-slate-200 p-6 space-y-6 mb-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
            Objetivos de Faturação
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Meta anual da empresa — as metas por departamento gerem-se em <strong>Objetivos</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[currentYear - 1, currentYear, currentYear + 1].map(y => (
            <button
              key={y}
              type="button"
              onClick={() => router.push(`/financeiro?year=${y}`)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                y === year
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      <input type="hidden" name="year" value={year} />

      {/* Company target + base */}
      <div className="bg-slate-50 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
          Empresa — {year}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Meta global (€ / ano)
            </label>
            <input
              name="company_target"
              type="number"
              step="1000"
              min="0"
              defaultValue={companyTarget?.target_value ?? ''}
              placeholder="ex: 500 000"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
            {companyTarget?.target_value && (
              <p className="text-xs text-slate-400 mt-1">
                Atual: <strong>{fmt(companyTarget.target_value)}</strong>
                {companyTarget.actual_value != null && (
                  <span className="ml-2">· Realizado: <strong>{fmt(companyTarget.actual_value)}</strong></span>
                )}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Base mínima (€ / ano)
              <span className="ml-1.5 text-xs font-normal text-slate-400">abaixo deste valor não há prémio</span>
            </label>
            <input
              name="company_base"
              type="number"
              step="1000"
              min="0"
              defaultValue={companyTarget?.minimum_base ?? ''}
              placeholder="ex: 300 000"
              className="w-full px-3 py-2 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
            />
            {companyTarget?.minimum_base != null && companyTarget.target_value != null && (
              <p className="text-xs text-slate-400 mt-1">
                Zona de prémio: <strong className="text-indigo-600">
                  {fmt(companyTarget.target_value - companyTarget.minimum_base)}
                </strong>
                <span className="ml-1">({fmt(companyTarget.minimum_base)} → {fmt(companyTarget.target_value)})</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Management margin target */}
      <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">
            Objetivos de Gestão (Management)
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Colaboradores com posição <strong>Management</strong> ganham prémio quando a faturação supera a base mínima <em>e</em> a margem EBITDA é mantida.
          </p>
        </div>
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Margem EBITDA objetivo (%)
            <span className="ml-1.5 text-xs font-normal text-slate-400">condição de acesso ao prémio</span>
          </label>
          <input
            name="margin_target"
            type="number"
            step="0.5"
            min="0"
            max="100"
            defaultValue={marginTarget?.target_value ?? ''}
            placeholder="ex: 25"
            className="w-full px-3 py-2 text-sm border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />
          {marginTarget?.target_value != null && (
            <p className="text-xs text-slate-400 mt-1">
              Atual: <strong className="text-indigo-600">{marginTarget.target_value}%</strong>
            </p>
          )}
        </div>
      </div>

      {/* Tarifa hora praticada */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Tarifa hora praticada
          </p>
          <p className="text-xs text-slate-500 mt-1">
            O preço por hora que a SOU pratica. É uma decisão comercial, não um valor
            calculado — serve para comparar com o break-even e com a tarifa realizada.
          </p>
        </div>
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Tarifa (€ / hora)
          </label>
          <input
            name="hourly_rate"
            type="number"
            step="0.5"
            min="0"
            defaultValue={hourlyRate?.target_value ?? ''}
            placeholder="ex: 75"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />
          {hourlyRate?.target_value != null && (
            <p className="text-xs text-slate-400 mt-1">
              Atual: <strong className="text-slate-700">€{hourlyRate.target_value}/h</strong>
            </p>
          )}
        </div>
      </div>

      {state && 'error' in state && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error as string}</p>
      )}
      {state?.success && (
        <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
          Metas de faturação para {year} guardadas com sucesso.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {pending ? 'A guardar...' : `Guardar metas ${year}`}
      </button>
    </form>
  )
}
