'use client'

import { useActionState, useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import type { Compensation } from '@/types/database'
import { upsertCompensation, deleteCompensation } from '../actions'

const variableModelLabel: Record<string, string> = {
  '1': 'Modelo 1 — Escalões por % de target',
  '2': 'Modelo 2 — MBO ponderado (múltiplos objetivos)',
  '3': 'Modelo 3 — Split 70% equipa / 30% individual',
}

export default function CompensationTab({
  employeeId,
  current,
  history,
  readOnly = false,
}: {
  employeeId: string
  current: Compensation | null
  history: Compensation[]
  /** Diretores do departamento veem a remuneração, mas só a gestão a altera */
  readOnly?: boolean
}) {
  const [state, action, pending] = useActionState(upsertCompensation, null)
  const [model, setModel] = useState<string>(current?.variable_model ?? '')
  const [deletePending, startDelete] = useTransition()

  function handleDelete(id: string) {
    if (!confirm('Eliminar este registo de remuneração? Esta acção não pode ser desfeita.')) return
    startDelete(async () => { await deleteCompensation(id, employeeId) })
  }

  const fmt = (v: number) => v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Remuneração atual */}
      {current && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-3">Remuneração ativa</p>
          <div className="flex items-center gap-8">
            <div>
              <p className="text-xs text-indigo-400">Salário base</p>
              <p className="text-2xl font-bold text-indigo-700">{fmt(current.base_salary)}</p>
            </div>
            {current.variable_model && (
              <div>
                <p className="text-xs text-indigo-400">Componente variável</p>
                <p className="text-sm font-medium text-indigo-700">{variableModelLabel[current.variable_model]}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-indigo-400">Desde</p>
              <p className="text-sm font-medium text-indigo-700">
                {new Date(current.effective_date).toLocaleDateString('pt-PT')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Formulário */}
      {!readOnly && (
      <form action={action} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
          {current ? 'Atualizar remuneração' : 'Adicionar remuneração'}
        </h3>
        <input type="hidden" name="employee_id" value={employeeId} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Salário base (€) <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                name="base_salary"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={current?.base_salary ?? ''}
                placeholder="ex: 2500.00"
                className="w-full px-3 py-2 pr-8 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Data de entrada em vigor <span className="text-red-400">*</span>
            </label>
            <input
              name="effective_date"
              type="date"
              required
              defaultValue={current?.effective_date ?? new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Componente variável</label>
          <select
            name="variable_model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="">Sem variável — só fixo</option>
            <option value="1">Modelo 1 — Escalões por % de target</option>
            <option value="2">Modelo 2 — MBO ponderado (múltiplos objetivos)</option>
            <option value="3">Modelo 3 — Split 70% equipa / 30% individual</option>
          </select>
        </div>

        {model === '1' && (
          <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600 border border-slate-200">
            <p className="font-medium text-slate-700 mb-1">Modelo 1 — Escalões</p>
            <p>Ex: 0-79% target → 0% var. · 80-99% → 50% · 100-119% → 100% · ≥120% → 120%</p>
            <p className="text-slate-400 mt-1">Os escalões são configurados em <strong>Objetivos</strong>.</p>
          </div>
        )}
        {model === '2' && (
          <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600 border border-slate-200">
            <p className="font-medium text-slate-700 mb-1">Modelo 2 — MBO ponderado</p>
            <p>Múltiplos objetivos com pesos distintos. Ex: Receita 60% + NPS 40%.</p>
            <p className="text-slate-400 mt-1">Os objetivos e pesos são configurados em <strong>Objetivos</strong>.</p>
          </div>
        )}
        {model === '3' && (
          <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600 border border-slate-200">
            <p className="font-medium text-slate-700 mb-1">Modelo 3 — Split equipa/individual</p>
            <p>70% baseado na performance da equipa + 30% na performance individual.</p>
            <p className="text-slate-400 mt-1">Os targets são configurados em <strong>Objetivos</strong>.</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas</label>
          <textarea
            name="notes"
            rows={2}
            defaultValue={current?.notes ?? ''}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        {state?.error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>
        )}
        {state?.success && (
          <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">Remuneração guardada.</p>
        )}

        <button type="submit" disabled={pending}
          className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {pending ? 'A guardar...' : 'Guardar remuneração'}
        </button>
      </form>
      )}

      {/* Histórico */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Histórico</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Salário base</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Variável</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Desde</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Até</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((c) => (
                <tr key={c.id} className="text-slate-600 hover:bg-slate-50">
                  <td className="px-6 py-3 font-medium text-slate-900">{fmt(c.base_salary)}</td>
                  <td className="px-6 py-3">{c.variable_model ? `Modelo ${c.variable_model}` : '—'}</td>
                  <td className="px-6 py-3">{new Date(c.effective_date).toLocaleDateString('pt-PT')}</td>
                  <td className="px-6 py-3">{c.end_date ? new Date(c.end_date).toLocaleDateString('pt-PT') : <span className="text-emerald-600 font-medium">Atual</span>}</td>
                  <td className="px-6 py-3 text-right">
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        disabled={deletePending}
                        title="Eliminar registo"
                        className="p-1 text-slate-300 hover:text-red-500 disabled:opacity-40 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
