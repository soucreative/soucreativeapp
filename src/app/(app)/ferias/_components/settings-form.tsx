'use client'

import { useActionState } from 'react'
import { upsertVacationSettings } from '../actions'
import type { VacationSettings } from '@/types/database'

const INITIAL = null

export default function SettingsForm({
  year,
  settings,
}: {
  year: number
  settings: VacationSettings | null
}) {
  const [state, action, pending] = useActionState(upsertVacationSettings, INITIAL)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="year" value={year} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Company gift day */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Dia oferecido pela empresa
          </label>
          <select
            name="company_gift_day"
            defaultValue={settings?.company_gift_day ?? ''}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">— Nenhum —</option>
            <option value={`${year}-12-24`}>24 de dezembro</option>
            <option value={`${year}-12-31`}>31 de dezembro</option>
          </select>
          <p className="text-xs text-slate-400 mt-0.5">Dia 24 ou 31 de dezembro (opcional)</p>
        </div>

        {/* Bridge day */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Ponte do ano (2ª ou 6ª feira)
          </label>
          <input
            type="date"
            name="bridge_day"
            defaultValue={settings?.bridge_day ?? ''}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-slate-400 mt-0.5">Deve ser segunda-feira ou sexta-feira</p>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Notas</label>
        <input
          type="text"
          name="notes"
          defaultValue={settings?.notes ?? ''}
          placeholder="Observações sobre os dias…"
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {state && 'error' in state && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>
      )}
      {state && 'success' in state && (
        <p className="text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
          Configurações guardadas.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {pending ? 'A guardar…' : 'Guardar configurações'}
      </button>
    </form>
  )
}
