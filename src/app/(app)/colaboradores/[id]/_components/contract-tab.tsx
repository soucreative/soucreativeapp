'use client'

import { useActionState, useState } from 'react'
import type { Contract } from '@/types/database'
import { upsertContract } from '../actions'

const contractTypeLabel: Record<string, string> = {
  permanent:         'Sem Termo',
  fixed_term:        'A Termo Certo',
  internship:        'Estágio',
  service_agreement: 'Prestação de Serviços',
}
const contractStatusLabel: Record<string, string> = {
  active:     'Ativo',
  terminated: 'Cessado',
  expired:    'Expirado',
}
const contractStatusStyle: Record<string, string> = {
  active:     'bg-emerald-100 text-emerald-700',
  terminated: 'bg-red-100 text-red-700',
  expired:    'bg-slate-100 text-slate-600',
}

export default function ContractTab({
  employeeId,
  contracts,
}: {
  employeeId: string
  contracts: Contract[]
}) {
  const active = contracts.find(c => c.status === 'active') ?? null
  const history = contracts.filter(c => c.status !== 'active')
  const [editing, setEditing] = useState<Contract | null>(null)
  const [showForm, setShowForm] = useState(!active)

  return (
    <div className="space-y-6 max-w-3xl">
      {active && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-3">Contrato ativo</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div>
                <p className="text-xs text-emerald-500">Tipo</p>
                <p className="text-lg font-bold text-emerald-800">{contractTypeLabel[active.contract_type]}</p>
              </div>
              <div>
                <p className="text-xs text-emerald-500">Início</p>
                <p className="text-sm font-medium text-emerald-800">
                  {new Date(active.start_date).toLocaleDateString('pt-PT')}
                </p>
              </div>
              {active.end_date && (
                <div>
                  <p className="text-xs text-emerald-500">Fim</p>
                  <p className="text-sm font-medium text-emerald-800">
                    {new Date(active.end_date).toLocaleDateString('pt-PT')}
                  </p>
                </div>
              )}
            </div>
            <button onClick={() => { setEditing(active); setShowForm(true) }}
              className="text-xs text-emerald-700 border border-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
              Editar
            </button>
          </div>
          {active.notes && <p className="text-xs text-emerald-600 mt-3 border-t border-emerald-200 pt-3">{active.notes}</p>}
        </div>
      )}

      {!showForm && (
        <button onClick={() => { setEditing(null); setShowForm(true) }}
          className="text-sm text-indigo-600 border border-indigo-300 px-4 py-2 rounded-lg hover:bg-indigo-50 transition-colors">
          + Adicionar contrato
        </button>
      )}

      {showForm && (
        <ContractForm
          employeeId={employeeId}
          contract={editing}
          onCancel={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Histórico</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Início</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Fim</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map(c => (
                <tr key={c.id} className="text-slate-600">
                  <td className="px-6 py-3">{contractTypeLabel[c.contract_type]}</td>
                  <td className="px-6 py-3">{new Date(c.start_date).toLocaleDateString('pt-PT')}</td>
                  <td className="px-6 py-3">{c.end_date ? new Date(c.end_date).toLocaleDateString('pt-PT') : '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${contractStatusStyle[c.status]}`}>
                      {contractStatusLabel[c.status]}
                    </span>
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

function ContractForm({
  employeeId,
  contract,
  onCancel,
}: {
  employeeId: string
  contract: Contract | null
  onCancel: () => void
}) {
  const [state, action, pending] = useActionState(upsertContract, null)

  return (
    <form action={action} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
        {contract ? 'Editar contrato' : 'Novo contrato'}
      </h3>
      <input type="hidden" name="employee_id" value={employeeId} />
      {contract && <input type="hidden" name="contract_id" value={contract.id} />}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Tipo de contrato <span className="text-red-400">*</span>
          </label>
          <select name="contract_type" required defaultValue={contract?.contract_type ?? 'permanent'}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
            <option value="permanent">Sem Termo</option>
            <option value="fixed_term">A Termo Certo</option>
            <option value="internship">Estágio</option>
            <option value="service_agreement">Prestação de Serviços</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado</label>
          <select name="status" defaultValue={contract?.status ?? 'active'}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
            <option value="active">Ativo</option>
            <option value="terminated">Cessado</option>
            <option value="expired">Expirado</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Data de início <span className="text-red-400">*</span>
          </label>
          <input name="start_date" type="date" required defaultValue={contract?.start_date ?? ''}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Data de fim</label>
          <input name="end_date" type="date" defaultValue={contract?.end_date ?? ''}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas</label>
        <textarea name="notes" rows={2} defaultValue={contract?.notes ?? ''}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
      </div>

      {state?.error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">Contrato guardado.</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending}
          className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {pending ? 'A guardar...' : 'Guardar contrato'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">
          Cancelar
        </button>
      </div>
    </form>
  )
}
