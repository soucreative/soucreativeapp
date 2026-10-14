'use client'

import { useActionState, useMemo, useState, useTransition } from 'react'
import type { TocExpenseMapRow } from '@/lib/toc'
import { upsertExpenseCode, deleteExpenseCode, syncTocExpenseAccounts } from '../actions'

const KINDS = [
  { value: 'fse',          label: 'Custo operacional (FSE)' },
  { value: 'investimento', label: 'Investimento' },
  { value: 'financeiro',   label: 'Juros e encargos' },
  { value: 'ignorar',      label: 'Não é custo' },
] as const

const KIND_STYLE: Record<string, string> = {
  fse:          'bg-indigo-50 text-indigo-700',
  investimento: 'bg-sky-50 text-sky-700',
  financeiro:   'bg-amber-50 text-amber-700',
  ignorar:      'bg-slate-100 text-slate-500',
}

export default function ExpenseCodesClient({
  rows,
  departments,
}: {
  rows:        TocExpenseMapRow[]
  departments: readonly string[]
}) {
  const [editId, setEditId]                 = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm]   = useState<number | null>(null)
  const [filter, setFilter]                 = useState('')
  const [onlyUnassigned, setOnlyUnassigned] = useState(false)

  const [state, formAction, pending] = useActionState(upsertExpenseCode, {})
  const [isSyncing, startSync]       = useTransition()
  const [syncMsg, setSyncMsg]        = useState<{ text: string; ok: boolean } | null>(null)

  const editRow = editId != null ? rows.find(r => r.id === editId) ?? null : null

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return rows.filter(r => {
      if (onlyUnassigned && !(r.kind === 'fse' && !r.cost_center)) return false
      if (!q) return true
      return r.account_code.toLowerCase().includes(q) || r.label.toLowerCase().includes(q)
    })
  }, [rows, filter, onlyUnassigned])

  const semCentro = rows.filter(r => r.kind === 'fse' && !r.cost_center).length

  function handleSync() {
    setSyncMsg(null)
    startSync(async () => {
      const res = await syncTocExpenseAccounts()
      if (res.error) {
        setSyncMsg({ text: res.error, ok: false })
      } else {
        setSyncMsg({
          text: res.imported > 0
            ? `${res.imported} conta(s) nova(s) importada(s), por classificar. ${res.skipped} já existia(m).`
            : `Nada novo — as ${res.skipped} contas do TOC já estão aqui.`,
          ok: true,
        })
      }
    })
  }

  function handleDelete(id: number) {
    if (deleteConfirm === id) deleteExpenseCode(id).then(() => setDeleteConfirm(null))
    else setDeleteConfirm(id)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Procurar conta ou descrição…"
          className="flex-1 min-w-48 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={onlyUnassigned}
            onChange={e => setOnlyUnassigned(e.target.checked)}
            className="rounded border-slate-300"
          />
          Só as que faltam classificar ({semCentro})
        </label>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="px-3 py-2 text-xs font-medium text-indigo-700 border border-indigo-300 rounded-lg bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
        >
          {isSyncing ? 'A procurar…' : '↓ Procurar contas novas no TOC'}
        </button>
      </div>

      {syncMsg && (
        <p className={`text-sm rounded-lg px-3 py-2 ${
          syncMsg.ok
            ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
            : 'text-red-600 bg-red-50 border border-red-200'
        }`}>
          {syncMsg.text}
        </p>
      )}

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Conta</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Descrição</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider w-44">Tipo</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">Centro</th>
              <th className="px-4 py-2.5 w-28"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map(row => (
              <tr key={row.id} className={`hover:bg-slate-50 transition-colors ${editId === row.id ? 'bg-indigo-50' : ''}`}>
                <td className="px-4 py-3 font-mono text-slate-700">{row.account_code}</td>
                <td className="px-4 py-3 text-slate-600">{row.label}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${KIND_STYLE[row.kind] ?? ''}`}>
                    {KINDS.find(k => k.value === row.kind)?.label ?? row.kind}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {row.cost_center ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                      {row.cost_center}
                    </span>
                  ) : row.kind === 'fse' ? (
                    <span className="text-slate-400 text-xs italic">estrutura</span>
                  ) : (
                    <span className="text-slate-300 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    onClick={() => setEditId(editId === row.id ? null : row.id)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    {editId === row.id ? 'Cancelar' : 'Editar'}
                  </button>
                  <button
                    onClick={() => handleDelete(row.id)}
                    className={`text-xs font-medium transition-colors ${
                      deleteConfirm === row.id ? 'text-red-600 hover:text-red-800' : 'text-slate-400 hover:text-red-500'
                    }`}
                  >
                    {deleteConfirm === row.id ? 'Confirmar?' : 'Apagar'}
                  </button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400 italic">
                  Nenhuma conta corresponde ao filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">
          {editRow ? `Editar a conta ${editRow.account_code}` : 'Adicionar conta'}
        </h2>

        <form action={formAction} className="grid grid-cols-4 gap-4 items-end" key={editId ?? 'nova'}>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Conta {!editRow && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text"
              name="account_code"
              required
              readOnly={!!editRow}
              defaultValue={editRow?.account_code ?? ''}
              placeholder="ex: 6221002"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 read-only:bg-slate-100 read-only:text-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Descrição</label>
            <input
              type="text"
              name="label"
              defaultValue={editRow?.label ?? ''}
              placeholder="ex: Trabalhos Especializados - Design"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
            <select
              name="kind"
              defaultValue={editRow?.kind ?? 'fse'}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Centro de custo</label>
            <select
              name="cost_center"
              defaultValue={editRow?.cost_center ?? ''}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">— estrutura (reparte-se) —</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="col-span-4 flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              {pending ? 'A guardar…' : editRow ? 'Guardar alterações' : 'Adicionar'}
            </button>
            {editRow && (
              <button
                type="button"
                onClick={() => setEditId(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 border border-slate-300 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>

        {state?.error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {state.error}
          </p>
        )}
        {state?.ok && !state.error && (
          <p className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            Guardado.
          </p>
        )}

        <p className="mt-4 text-xs text-slate-400">
          O centro só se aplica a custos operacionais. Uma conta de investimento, de juros, ou que não
          seja custo, fica sempre sem centro.
        </p>
      </div>
    </div>
  )
}
