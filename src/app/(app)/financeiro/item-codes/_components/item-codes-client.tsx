'use client'

import { useActionState, useMemo, useState, useTransition } from 'react'
import type { TocItemMapRow } from '@/lib/toc'
import { upsertItemCode, deleteItemCode, syncTocArticles } from '../actions'

type SortKey = 'item_code' | 'label' | 'department'

function SortableTh({
  label,
  column,
  active,
  asc,
  onSort,
  className,
}: {
  label:      string
  column:     SortKey
  active:     boolean
  asc:        boolean
  onSort:     (k: SortKey) => void
  className?: string
}) {
  return (
    <th
      aria-sort={active ? (asc ? 'ascending' : 'descending') : 'none'}
      className={`text-left px-4 py-2.5 ${className ?? ''}`}
    >
      <button
        onClick={() => onSort(column)}
        className="flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-700 transition-colors"
      >
        {label}
        <span className={active ? 'text-indigo-600' : 'text-slate-300'}>
          {active ? (asc ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}

interface Props {
  rows:         TocItemMapRow[]
  departments:  readonly string[]
  tableExists:  boolean
}

export default function ItemCodesClient({ rows, departments, tableExists }: Props) {
  const [editId, setEditId]         = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const [upsertState, upsertAction, upsertPending] = useActionState(upsertItemCode, {})

  const [sortKey, setSortKey]     = useState<SortKey>('item_code')
  const [sortAsc, setSortAsc]     = useState(true)

  const [isSyncing, startSync]    = useTransition()
  const [syncMsg, setSyncMsg]     = useState<{ text: string; ok: boolean } | null>(null)

  function handleSync() {
    setSyncMsg(null)
    startSync(async () => {
      const res = await syncTocArticles()
      if (res.error) {
        setSyncMsg({ text: res.error, ok: false })
      } else {
        setSyncMsg({
          text: res.imported > 0
            ? `${res.imported} artigo(s) importado(s) — ${res.skipped} já existia(m).`
            : `Nada a importar — ${res.skipped} artigo(s) já existia(m).`,
          ok: true,
        })
      }
    })
  }

  const editRow = editId != null ? rows.find(r => r.id === editId) : null

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const sortedRows = useMemo(() => {
    const dir = sortAsc ? 1 : -1
    // O código é texto mas lê-se como número: { numeric: true } põe o 2 antes do 10
    const cmp = (a: string, b: string) => a.localeCompare(b, 'pt', { numeric: true })

    return [...rows].sort((a, b) => {
      if (sortKey === 'department') {
        // Sem departamento fica sempre no fim, nos dois sentidos
        if (!a.department && !b.department) return cmp(a.item_code, b.item_code)
        if (!a.department) return 1
        if (!b.department) return -1
        const d = dir * cmp(a.department, b.department)
        return d !== 0 ? d : cmp(a.item_code, b.item_code)
      }
      const d = dir * cmp(a[sortKey], b[sortKey])
      return d !== 0 ? d : cmp(a.item_code, b.item_code)
    })
  }, [rows, sortKey, sortAsc])

  function handleDelete(id: number) {
    if (deleteConfirm === id) {
      deleteItemCode(id).then(() => setDeleteConfirm(null))
    } else {
      setDeleteConfirm(id)
    }
  }

  return (
    <div className="space-y-8">
      {/* Tabela de mapeamentos existentes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">
            Mapeamentos actuais
            {!tableExists && <span className="ml-2 text-xs font-normal text-amber-600">(a usar fallback hardcoded)</span>}
          </h2>
          {tableExists && (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-300 rounded-lg bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
            >
              {isSyncing ? 'A sincronizar…' : '↓ Sincronizar artigos do TOC'}
            </button>
          )}
        </div>
        {syncMsg && (
          <p className={`mb-3 text-sm rounded-lg px-3 py-2 ${
            syncMsg.ok
              ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
              : 'text-red-600 bg-red-50 border border-red-200'
          }`}>
            {syncMsg.text}
          </p>
        )}

        {rows.length === 0 && tableExists ? (
          <p className="text-sm text-slate-400 italic">Sem mapeamentos. Adiciona o primeiro abaixo.</p>
        ) : rows.length === 0 && !tableExists ? (
          <p className="text-sm text-slate-400 italic">
            Tabela não existe — cria-a com o SQL acima e os valores hardcoded passarão a ser geridos aqui.
          </p>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <SortableTh label="Código"       column="item_code"  active={sortKey === 'item_code'}  asc={sortAsc} onSort={toggleSort} className="w-24" />
                  <SortableTh label="Label"        column="label"      active={sortKey === 'label'}      asc={sortAsc} onSort={toggleSort} />
                  <SortableTh label="Departamento" column="department" active={sortKey === 'department'} asc={sortAsc} onSort={toggleSort} />
                  {tableExists && <th className="px-4 py-2.5 w-28"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map(row => (
                  <tr key={row.id} className={`hover:bg-slate-50 transition-colors ${editId === row.id ? 'bg-indigo-50' : ''}`}>
                    <td className="px-4 py-3 font-mono text-slate-700">{row.item_code}</td>
                    <td className="px-4 py-3 text-slate-600">{row.label}</td>
                    <td className="px-4 py-3">
                      {row.department ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                          {row.department}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">genérica (sem dept)</span>
                      )}
                    </td>
                    {tableExists && (
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
                            deleteConfirm === row.id
                              ? 'text-red-600 hover:text-red-800'
                              : 'text-slate-400 hover:text-red-500'
                          }`}
                        >
                          {deleteConfirm === row.id ? 'Confirmar?' : 'Apagar'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Formulário de adição / edição */}
      {tableExists && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">
            {editRow ? `Editar código ${editRow.item_code}` : 'Adicionar código de artigo'}
          </h2>

          <form action={upsertAction} className="grid grid-cols-3 gap-4 items-end" key={editId ?? 'new'}>
            {/* Um só campo item_code: em edição é a chave de conflito e fica bloqueado.
                Dois campos com o mesmo name faziam formData.get() devolver o primeiro. */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Código de artigo {!editRow && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                name="item_code"
                required
                readOnly={!!editRow}
                defaultValue={editRow?.item_code ?? ''}
                placeholder="ex: 7"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 read-only:bg-slate-100 read-only:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Label</label>
              <input
                type="text"
                name="label"
                defaultValue={editRow?.label ?? ''}
                placeholder="ex: Hora – Conteúdos"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Departamento</label>
              <select
                name="department"
                defaultValue={editRow?.department ?? ''}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">— genérica (sem dept) —</option>
                {departments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={upsertPending}
                className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                {upsertPending ? 'A guardar…' : editRow ? 'Guardar alterações' : 'Adicionar'}
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

          {upsertState?.error && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {upsertState.error}
            </p>
          )}
        </div>
      )}

      {/* Nota sobre Conteúdos */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">⏳ Conteúdos ainda não mapeado</p>
        <p>
          O departamento Conteúdos precisa de um código de artigo no TOC Online para aparecer no breakdown de horas faturadas.
          Quando souberes o código, adiciona-o aqui com departamento = <strong>Conteúdos</strong>.
        </p>
      </div>
    </div>
  )
}
