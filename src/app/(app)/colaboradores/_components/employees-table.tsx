'use client'

import { useState, useRef, useSyncExternalStore, useTransition, KeyboardEvent } from 'react'
import Link from 'next/link'
import { quickUpdateEmployee } from '../actions'
import type { Employee } from '@/types/database'
import { EMPLOYEE_DEPARTMENTS } from '@/lib/departments'

// ── Constants ──────────────────────────────────────────────────────────────

const DEPT_OPTIONS = [...EMPLOYEE_DEPARTMENTS]

// ── Resultado da última gravação ───────────────────────────────────────────
// As células gravam no momento; este aviso por cima da tabela diz se correu
// bem, em vez de o valor voltar atrás em silêncio.

type Resultado = { ok: boolean; texto: string } | null
let ultimo: Resultado = null
const ouvintes = new Set<() => void>()
function anunciar(r: { error?: string | null }) {
  const hora = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
  ultimo = r.error ? { ok: false, texto: `Não foi possível gravar: ${r.error}` } : { ok: true, texto: `Gravado às ${hora}` }
  for (const f of ouvintes) f()
}
function AvisoGravacao() {
  const r = useSyncExternalStore(
    f => { ouvintes.add(f); return () => { ouvintes.delete(f) } },
    () => ultimo,
    () => null,
  )
  if (!r) return <p className="mb-2 text-xs text-slate-400">Clique num valor para o mudar: grava no momento.</p>
  return <p className={`mb-2 text-xs ${r.ok ? 'text-emerald-600' : 'text-red-600'}`}>{r.ok ? '✓ ' : ''}{r.texto}</p>
}

const POSITION_OPTIONS = [
  { value: 'management',          label: 'Management' },
  { value: 'director',            label: 'Diretor' },
  { value: 'employee',            label: 'Colaborador' },
  { value: 'professional_intern', label: 'Est. Profissional' },
  { value: 'curricular_intern',   label: 'Est. Curricular' },
]

const STATUS_OPTIONS = [
  { value: 'active',   label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
  { value: 'on_leave', label: 'Licença' },
]

const statusStyle: Record<string, string> = {
  active:   'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-600',
  on_leave: 'bg-amber-100 text-amber-700',
}

// ── QuickText — click to edit, Enter/blur to save ─────────────────────────

function QuickText({
  id, field, value,
}: { id: string; field: string; value: string | null }) {
  const [display,  setDisplay]  = useState(value ?? '')
  const [editing,  setEditing]  = useState(false)
  const [draft,    setDraft]    = useState(display)
  const [saving,   setSaving]   = useState(false)
  const [errored,  setErrored]  = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [, startTransition] = useTransition()

  function startEdit() {
    setDraft(display)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  async function save() {
    if (draft === display) { setEditing(false); return }
    setSaving(true)
    startTransition(async () => {
      const res = await quickUpdateEmployee(id, field, draft)
      setSaving(false)
      anunciar(res)
      if (res.error) {
        setErrored(true)
        setTimeout(() => setErrored(false), 1500)
        setDraft(display)
      } else {
        setDisplay(draft)
      }
      setEditing(false)
    })
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter')  { e.preventDefault(); save() }
    if (e.key === 'Escape') { setEditing(false); setDraft(display) }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={onKey}
        disabled={saving}
        className="w-full px-1.5 py-0.5 text-sm border border-indigo-400 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
        autoFocus
      />
    )
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      title="Clique para editar"
      className={`text-left w-full group rounded px-1 py-0.5 transition-colors hover:bg-indigo-50 ${
        errored ? 'ring-1 ring-red-400' : ''
      } ${saving ? 'opacity-50' : ''}`}
    >
      <span className="text-slate-700">{display || <span className="text-slate-300 italic">—</span>}</span>
      <span className="ml-1 opacity-0 group-hover:opacity-40 text-indigo-400 text-xs transition-opacity">✎</span>
    </button>
  )
}

// ── QuickSelect — click to show select, change = immediate save ───────────

function QuickSelect({
  id, field, value, options, renderValue, readOnly = false,
}: {
  id: string
  field: string
  value: string
  options: { value: string; label: string }[]
  renderValue: (v: string) => React.ReactNode
  readOnly?: boolean
}) {
  const [display,  setDisplay]  = useState(value)
  const [editing,  setEditing]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [, startTransition] = useTransition()

  async function onChange(next: string) {
    setSaving(true)
    setEditing(false)
    const prev = display
    setDisplay(next) // optimistic
    startTransition(async () => {
      const res = await quickUpdateEmployee(id, field, next)
      setSaving(false)
      anunciar(res)
      if (res.error) setDisplay(prev) // revert on error
    })
  }

  if (readOnly) return <span className="inline-flex items-center px-1 py-0.5">{renderValue(display)}</span>

  if (editing) {
    return (
      <select
        autoFocus
        value={display}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        className="text-sm border border-indigo-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Clique para editar"
      disabled={saving}
      className={`group inline-flex items-center gap-1 rounded transition-colors hover:bg-indigo-50 px-1 py-0.5 ${
        saving ? 'opacity-50' : ''
      }`}
    >
      {renderValue(display)}
      <span className="opacity-0 group-hover:opacity-40 text-indigo-400 text-xs transition-opacity">✎</span>
    </button>
  )
}

// ── QuickDate — click to edit a date field ────────────────────────────────

function QuickDate({
  id, field, value, readOnly = false,
}: { id: string; field: string; value: string; readOnly?: boolean }) {
  const [display,  setDisplay]  = useState(value)       // ISO yyyy-mm-dd
  const [editing,  setEditing]  = useState(false)
  const [draft,    setDraft]    = useState(display)
  const [saving,   setSaving]   = useState(false)
  const [errored,  setErrored]  = useState(false)
  const [, startTransition] = useTransition()

  async function save() {
    if (!draft || draft === display) { setEditing(false); return }
    setSaving(true)
    startTransition(async () => {
      const res = await quickUpdateEmployee(id, field, draft)
      setSaving(false)
      if (res.error) {
        setErrored(true)
        setTimeout(() => setErrored(false), 1500)
        setDraft(display)
      } else {
        setDisplay(draft)
      }
      setEditing(false)
    })
  }

  const formatted = display
    ? new Date(display + 'T00:00:00').toLocaleDateString('pt-PT')
    : '—'

  if (readOnly) return <span className="px-1 py-0.5 text-slate-600">{formatted}</span>

  if (editing) {
    return (
      <input
        type="date"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setDraft(display) } }}
        disabled={saving}
        className="text-sm border border-indigo-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
        autoFocus
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(display); setEditing(true) }}
      title="Clique para editar"
      className={`text-left group rounded px-1 py-0.5 transition-colors hover:bg-indigo-50 ${
        errored ? 'ring-1 ring-red-400' : ''
      } ${saving ? 'opacity-50' : ''}`}
    >
      <span className="text-slate-600">{formatted}</span>
      <span className="ml-1 opacity-0 group-hover:opacity-40 text-indigo-400 text-xs transition-opacity">✎</span>
    </button>
  )
}

// ── Main table component ───────────────────────────────────────────────────

export default function EmployeesTable({
  employees,
  readOnly = false,
}: {
  employees: Employee[]
  /** Só a gestão altera — os diretores veem a tabela sem edição */
  readOnly?: boolean
}) {
  return (
    <>
    {!readOnly && <AvisoGravacao />}
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {['Nome', 'Posição', 'Departamento', 'Regime', 'Estado', 'Início', ''].map((h) => (
              <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {employees.length > 0 ? employees.map(emp => (
            <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">

              {/* Nome + email — não editável inline */}
              <td className="px-6 py-4">
                <div className="font-medium text-slate-900">{emp.first_name} {emp.last_name}</div>
                <div className="text-slate-400 text-xs mt-0.5">{emp.email}</div>
              </td>

              {/* Posição */}
              <td className="px-5 py-3">
                <QuickSelect
                  id={emp.id}
                  field="position_type"
                  value={emp.position_type ?? 'employee'}
                  options={POSITION_OPTIONS}
                  readOnly={readOnly}
                  renderValue={v => (
                    <span className="text-slate-700">{POSITION_OPTIONS.find(o => o.value === v)?.label ?? v}</span>
                  )}
                />
              </td>

              {/* Departamento — select */}
              <td className="px-5 py-3">
                <QuickSelect
                  id={emp.id}
                  field="department"
                  value={emp.department ?? ''}
                  options={[
                    { value: '', label: '—' },
                    ...DEPT_OPTIONS.map(d => ({ value: d, label: d })),
                  ]}
                  readOnly={readOnly}
                  renderValue={v => (
                    <span className="text-slate-700">{v || <span className="text-slate-300">—</span>}</span>
                  )}
                />
              </td>

              {/* Regime — read-only (full/part-time tem mais campos, melhor na ficha) */}
              <td className="px-6 py-4 text-slate-600">
                {emp.work_regime === 'part_time'
                  ? `Part-time${emp.days_per_week ? ` (${emp.days_per_week}d)` : ''}`
                  : 'Full-time'}
              </td>

              {/* Estado — select */}
              <td className="px-5 py-3">
                <QuickSelect
                  id={emp.id}
                  field="status"
                  value={emp.status}
                  options={STATUS_OPTIONS}
                  readOnly={readOnly}
                  renderValue={v => (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle[v] ?? statusStyle.inactive}`}>
                      {STATUS_OPTIONS.find(o => o.value === v)?.label ?? v}
                    </span>
                  )}
                />
              </td>

              {/* Data início */}
              <td className="px-5 py-3">
                <QuickDate id={emp.id} field="start_date" value={emp.start_date} readOnly={readOnly} />
              </td>

              {/* Ver ficha */}
              <td className="px-6 py-4 text-right">
                <Link
                  href={`/colaboradores/${emp.id}`}
                  className="text-indigo-600 hover:text-indigo-700 font-medium text-xs"
                >
                  Ver
                </Link>
              </td>
            </tr>
          )) : (
            <tr>
              <td colSpan={7} className="px-6 py-14 text-center text-slate-400 text-sm">
                Nenhum resultado encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </>
  )
}
