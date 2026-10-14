'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { MONTH_NAMES_LONG, MONTH_NAMES_SHORT } from '@/lib/constants'
import { DEPARTMENTS, OPERATIONAL_DEPTS } from '@/lib/departments'
import { formatEUR } from '@/lib/format'
import {
  LIMITS, RUBRICS, STATUS_LABEL, STATUS_STYLE,
  centerAnalysis, distributeEven, formatAmount, parseAmount, rubricOf, sumMonths, summarize,
  versionMonthly, zeros,
} from '@/types/orcamento'
import type { BudgetLine, BudgetStatus, ByRubric, RubricKey, RubricKind } from '@/types/orcamento'
import { approveBudget, createRevision, deleteDraft, saveBudget } from '../actions'
import CenterAnalysisTable from './center-analysis'

type EditorVersion = {
  id: string
  year: number
  status: BudgetStatus
  actual_through_month: number
  notes: string | null
  updated_at: string
}

const cell = (v: number) => Math.round(v).toLocaleString('pt-PT')
const toneOf = (v: number) => (v >= 0 ? 'text-emerald-700' : 'text-red-600')

export default function BudgetEditor({
  version,
  label,
  savedLabel,
  initialLines,
  real,
  canCreateRevision,
}: {
  version: EditorVersion
  label: string
  /** Data da última gravação, já formatada no servidor */
  savedLabel: string
  initialLines: BudgetLine[]
  real: ByRubric
  canCreateRevision: boolean
}) {
  const editable = version.status === 'rascunho'
  const cutoff   = version.actual_through_month

  const [lines, setLines]           = useState<BudgetLine[]>(initialLines)
  const [notes, setNotes]           = useState(version.notes ?? '')
  const [dirty, setDirty]           = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const [saveState, saveAction, saving]           = useActionState(saveBudget, null)
  const [approveState, approveAction, approving]  = useActionState(approveBudget, null)
  const [deleteState, deleteAction, deleting]     = useActionState(deleteDraft, null)
  const [revisionState, revisionAction, revising] = useActionState(createRevision, null)

  // Sair da página com alterações por guardar perde-as — o browser avisa
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const byRubric = useMemo(() => versionMonthly(lines, real, cutoff), [lines, real, cutoff])
  const summary  = useMemo(() => summarize(byRubric), [byRubric])
  const centers  = useMemo(() => centerAnalysis(lines, OPERATIONAL_DEPTS), [lines])

  function change(next: (ls: BudgetLine[]) => BudgetLine[]) {
    setLines(next)
    setDirty(true)
  }
  const update = (id: string, patch: (l: BudgetLine) => Partial<BudgetLine>) =>
    change(ls => ls.map(l => (l.id === id ? { ...l, ...patch(l) } : l)))
  const setMonth = (id: string, i: number, v: number) =>
    update(id, l => ({ months: l.months.map((m, j) => (j === i ? v : m)) }))
  const setTotal = (id: string, total: number) =>
    update(id, l => ({ months: distributeEven(total, rubricOf(l.rubric).locksWithReal ? cutoff : 0) }))
  const setDescription = (id: string, description: string) => update(id, () => ({ description }))
  const setCenter = (id: string, cost_center: string | null) => update(id, () => ({ cost_center }))
  const addLine = (rubric: RubricKey) =>
    change(ls => [...ls, { id: crypto.randomUUID(), rubric, description: 'Nova linha', cost_center: null, months: zeros() }])
  function removeLine(line: BudgetLine) {
    if (line.months.some(v => v !== 0) && !confirm(`Remover a linha "${line.description}"?`)) return
    change(ls => ls.filter(l => l.id !== line.id))
  }

  function checkBeforeSave(e: React.FormEvent) {
    if (lines.some(l => l.description.trim() === '')) {
      e.preventDefault()
      setLocalError('Há linhas sem descrição.')
      return
    }
    setLocalError(null)
  }

  const confirmSubmit = (message: string) => (e: React.FormEvent) => {
    if (!confirm(message)) e.preventDefault()
  }

  const actionError = localError
    ?? [saveState, approveState, deleteState, revisionState]
      .map(s => (s && 'error' in s ? s.error : null))
      .find(Boolean)
    ?? null

  const payload = JSON.stringify(lines.map(l => ({
    id: l.id, rubric: l.rubric, description: l.description, cost_center: l.cost_center, months: l.months,
  })))

  const sectionProps = { lines, byRubric, real, cutoff, editable, setMonth, setTotal, setDescription, setCenter, removeLine, addLine }

  return (
    <div className="space-y-6">

      {/* ── Versão e ações ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-slate-900">{label} {version.year}</h2>
            <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_STYLE[version.status]}`}>
              {STATUS_LABEL[version.status]}
            </span>
            {dirty && (
              <span className="px-2 py-0.5 rounded-full border text-xs font-medium bg-amber-50 text-amber-700 border-amber-200">
                Alterações por guardar
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {editable
              ? `Rascunho — última gravação ${savedLabel}.`
              : version.status === 'aprovado'
                ? 'Em vigor e congelada. Para corrigir, cria uma revisão.'
                : 'Substituída por uma revisão mais recente. Fica só para consulta.'}
          </p>
          {cutoff > 0 && (
            <p className="text-xs text-indigo-600 mt-1">
              Janeiro a {MONTH_NAMES_LONG[cutoff - 1].toLowerCase()}: valores reais, bloqueados (exceto investimentos).
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {editable && (
            <form action={saveAction} onSubmit={checkBeforeSave}>
              <input type="hidden" name="version_id" value={version.id} />
              <input type="hidden" name="updated_at" value={version.updated_at} />
              <input type="hidden" name="notes" value={notes} />
              <input type="hidden" name="lines" value={payload} />
              <button
                type="submit"
                disabled={!dirty || saving}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'A guardar…' : 'Guardar alterações'}
              </button>
            </form>
          )}
          {editable && (
            <form
              action={approveAction}
              onSubmit={confirmSubmit('Aprovar esta versão? Passa a ser o orçamento em vigor e fica congelada — para a corrigir cria-se uma revisão.')}
            >
              <input type="hidden" name="version_id" value={version.id} />
              <input type="hidden" name="updated_at" value={version.updated_at} />
              <button
                type="submit"
                disabled={dirty || approving}
                title={dirty ? 'Guarda as alterações antes de aprovar' : undefined}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {approving ? 'A aprovar…' : 'Aprovar'}
              </button>
            </form>
          )}
          {editable && (
            <form action={deleteAction} onSubmit={confirmSubmit('Apagar este rascunho? As linhas desta versão perdem-se.')}>
              <input type="hidden" name="version_id" value={version.id} />
              <button
                type="submit"
                disabled={deleting}
                className="border border-slate-300 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:border-red-300 hover:text-red-600 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'A apagar…' : 'Apagar rascunho'}
              </button>
            </form>
          )}
          {canCreateRevision && (
            <form
              action={revisionAction}
              onSubmit={confirmSubmit('Criar uma revisão a partir desta versão? Os meses já fechados passam a mostrar o real.')}
            >
              <input type="hidden" name="year" value={version.year} />
              <button
                type="submit"
                disabled={revising}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {revising ? 'A criar…' : 'Criar revisão'}
              </button>
            </form>
          )}
        </div>
      </div>

      {actionError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-2.5 rounded-lg">{actionError}</p>
      )}

      {/* ── Resumo ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard label="Receitas" value={formatEUR(summary.totalReceitas)} />
        <SummaryCard label="Custos" value={formatEUR(summary.totalCustos)} />
        <SummaryCard label="EBITDA" value={formatEUR(summary.totalEbitda)} tone={toneOf(summary.totalEbitda)} />
        <SummaryCard
          label="Margem EBITDA"
          value={summary.margem != null ? `${(summary.margem * 100).toFixed(1).replace('.', ',')}%` : '—'}
          tone={summary.margem != null && summary.margem < 0 ? 'text-red-600' : undefined}
        />
        <SummaryCard
          label="Depois de investimentos"
          value={formatEUR(summary.totalAposInvestimentos)}
          hint={summary.totalInvestimentos !== 0 ? `investimentos ${formatEUR(summary.totalInvestimentos)}` : undefined}
          tone={toneOf(summary.totalAposInvestimentos)}
        />
      </div>

      {/* ── Grelha ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1480px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                <th className="sticky left-0 z-10 bg-slate-50 text-left px-4 py-2.5 font-semibold min-w-[22rem]">
                  Rubrica <span className="normal-case font-normal">· linha e centro de custo</span>
                </th>
                {MONTH_NAMES_SHORT.map((m, i) => (
                  <th key={m} className={`text-right px-2 py-2.5 font-semibold ${i < cutoff ? 'text-indigo-500' : ''}`}>
                    {m}
                    {i < cutoff && <span className="block text-[10px] font-normal normal-case">real</span>}
                  </th>
                ))}
                <th className="text-right px-3 py-2.5 font-semibold">Anual</th>
                {editable && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              <SectionRows kind="receita" totals={summary.receitas} {...sectionProps} />
              <SectionRows kind="custo" totals={summary.custos} {...sectionProps} />

              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td className="sticky left-0 z-10 bg-slate-50 px-4 py-2.5 font-bold text-slate-900">EBITDA</td>
                {summary.ebitda.map((v, i) => (
                  <td key={i} className={`text-right px-2 py-2.5 font-bold tabular-nums ${toneOf(v)}`}>{cell(v)}</td>
                ))}
                <td className={`text-right px-3 py-2.5 font-bold tabular-nums ${toneOf(summary.totalEbitda)}`}>
                  {cell(summary.totalEbitda)}
                </td>
                {editable && <td className="bg-slate-50" />}
              </tr>
              <tr className="bg-slate-50 text-xs text-slate-500">
                <td className="sticky left-0 z-10 bg-slate-50 px-4 pb-2.5">Margem</td>
                {summary.ebitda.map((v, i) => (
                  <td key={i} className="text-right px-2 pb-2.5 tabular-nums">
                    {summary.receitas[i] > 0 ? `${Math.round((v / summary.receitas[i]) * 100)}%` : '—'}
                  </td>
                ))}
                <td className="text-right px-3 pb-2.5 tabular-nums">
                  {summary.margem != null ? `${Math.round(summary.margem * 100)}%` : '—'}
                </td>
                {editable && <td className="bg-slate-50" />}
              </tr>

              <SectionRows kind="investimento" totals={summary.investimentos} {...sectionProps} />

              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td className="sticky left-0 z-10 bg-slate-50 px-4 py-2.5 font-bold text-slate-900">
                  Resultado depois de investimentos
                </td>
                {summary.aposInvestimentos.map((v, i) => (
                  <td key={i} className={`text-right px-2 py-2.5 font-bold tabular-nums ${toneOf(v)}`}>{cell(v)}</td>
                ))}
                <td className={`text-right px-3 py-2.5 font-bold tabular-nums ${toneOf(summary.totalAposInvestimentos)}`}>
                  {cell(summary.totalAposInvestimentos)}
                </td>
                {editable && <td className="bg-slate-50" />}
              </tr>
            </tbody>
          </table>
        </div>
        {editable && (
          <p className="px-4 py-2.5 text-xs text-slate-400 border-t border-slate-100">
            Escreve um valor na coluna Anual para o repartir em partes iguais pelos meses{cutoff > 0 ? ' em aberto' : ''}.
            Linhas sem centro de custo contam como estrutura.
          </p>
        )}
      </div>

      {/* ── Por centro de custo ─────────────────────────────────────── */}
      <CenterAnalysisTable analysis={centers} closedMonths={cutoff} />

      {/* ── Notas ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Notas e pressupostos</h3>
        {editable ? (
          <textarea
            rows={8}
            maxLength={LIMITS.maxNotes}
            value={notes}
            onChange={e => { setNotes(e.target.value); setDirty(true) }}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
          />
        ) : (
          <p className="text-sm text-slate-600 whitespace-pre-line">{notes || '—'}</p>
        )}
      </div>
    </div>
  )
}

// ── Peças da grelha ────────────────────────────────────────────────────────

function SummaryCard({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1.5 tabular-nums ${tone ?? 'text-slate-900'}`}>{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  )
}

const SECTION_LABEL: Record<RubricKind, { title: string; total: string }> = {
  receita:      { title: 'Receitas',      total: 'Total receitas' },
  custo:        { title: 'Custos',        total: 'Total custos' },
  investimento: { title: 'Investimentos', total: 'Total investimentos' },
}

function SectionRows({
  kind, totals, lines, byRubric, real, cutoff, editable,
  setMonth, setTotal, setDescription, setCenter, removeLine, addLine,
}: {
  kind: RubricKind
  totals: number[]
  lines: BudgetLine[]
  byRubric: ByRubric
  real: ByRubric
  cutoff: number
  editable: boolean
  setMonth: (id: string, i: number, v: number) => void
  setTotal: (id: string, total: number) => void
  setDescription: (id: string, description: string) => void
  setCenter: (id: string, center: string | null) => void
  removeLine: (line: BudgetLine) => void
  addLine: (rubric: RubricKey) => void
}) {
  const extraCol = editable ? 1 : 0

  return (
    <>
      <tr className="border-t border-slate-200">
        <td colSpan={14 + extraCol} className="px-4 pt-4 pb-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
          {SECTION_LABEL[kind].title}
          {kind === 'investimento' && <span className="ml-2 normal-case font-normal">— abaixo do EBITDA</span>}
        </td>
      </tr>

      {RUBRICS.filter(r => r.kind === kind).map(r => {
        const own    = lines.filter(l => l.rubric === r.key)
        const locked = (i: number) => i < cutoff && r.locksWithReal
        return (
          <RubricRows key={r.key}>
            <tr className="border-t border-slate-100 bg-slate-50/70">
              <td className="sticky left-0 z-10 bg-slate-50 px-4 py-2 font-semibold text-slate-800">
                {r.label}
                {r.key === 'marketing' && <span className="ml-2 text-xs font-normal text-slate-400">no real está no FSE</span>}
              </td>
              {byRubric[r.key].map((v, i) => (
                <td key={i} className="text-right px-2 py-2 font-semibold tabular-nums text-slate-800">{cell(v)}</td>
              ))}
              <td className="text-right px-3 py-2 font-semibold tabular-nums text-slate-900">{cell(sumMonths(byRubric[r.key]))}</td>
              {editable && <td className="bg-slate-50/70" />}
            </tr>

            {cutoff > 0 && r.locksWithReal && (
              <tr className="text-xs text-indigo-600">
                <td className="sticky left-0 z-10 bg-white pl-8 pr-4 py-1">Real</td>
                {real[r.key].map((v, i) => (
                  <td key={i} className="text-right px-2 py-1 tabular-nums">{i < cutoff ? cell(v) : ''}</td>
                ))}
                <td className="text-right px-3 py-1 tabular-nums">{cell(sumMonths(real[r.key].slice(0, cutoff)))}</td>
                {editable && <td />}
              </tr>
            )}

            {own.map(line => (
              <tr key={line.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                <td className="sticky left-0 z-10 bg-white pl-6 pr-2 py-1">
                  {editable ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={line.description}
                        maxLength={LIMITS.maxDescription}
                        onChange={e => setDescription(line.id, e.target.value)}
                        className={`flex-1 min-w-0 text-sm rounded px-2 py-1 border focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
                          line.description.trim() === '' ? 'border-red-300 bg-red-50' : 'border-transparent hover:border-slate-200 bg-transparent'
                        }`}
                      />
                      <select
                        value={line.cost_center ?? ''}
                        onChange={e => setCenter(line.id, e.target.value || null)}
                        title="Centro de custo"
                        className={`w-36 shrink-0 text-xs rounded px-1.5 py-1 border focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
                          line.cost_center ? 'border-slate-200 text-slate-700 bg-white' : 'border-dashed border-slate-300 text-slate-400 bg-white'
                        }`}
                      >
                        <option value="">Estrutura</option>
                        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  ) : (
                    <span className="flex items-center justify-between gap-2 px-2">
                      <span className="text-slate-600 truncate">{line.description}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">{line.cost_center ?? 'Estrutura'}</span>
                    </span>
                  )}
                </td>
                {line.months.map((v, i) => (
                  <td key={i} className="px-1 py-1 text-right">
                    {locked(i)
                      ? <span className="text-slate-300 text-xs pr-1.5">—</span>
                      : editable
                        ? <AmountInput value={v} onCommit={nv => setMonth(line.id, i, nv)} />
                        : <span className="pr-1.5 tabular-nums text-slate-600">{cell(v)}</span>}
                  </td>
                ))}
                <td className="px-1 py-1 text-right">
                  {editable
                    ? <AmountInput strong value={sumMonths(line.months)} onCommit={t => setTotal(line.id, t)} />
                    : <span className="pr-2 tabular-nums font-medium text-slate-700">{cell(sumMonths(line.months))}</span>}
                </td>
                {editable && (
                  <td className="px-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(line)}
                      title="Remover linha"
                      className="text-slate-300 hover:text-red-500 transition-colors"
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}

            {editable && (
              <tr>
                <td className="sticky left-0 z-10 bg-white pl-8 pr-4 py-1">
                  <button
                    type="button"
                    onClick={() => addLine(r.key)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    + Acrescentar linha
                  </button>
                </td>
                <td colSpan={14} />
              </tr>
            )}
          </RubricRows>
        )
      })}

      <tr className="border-t border-slate-300">
        <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-bold text-slate-900">{SECTION_LABEL[kind].total}</td>
        {totals.map((v, i) => (
          <td key={i} className="text-right px-2 py-2.5 font-bold tabular-nums text-slate-900">{cell(v)}</td>
        ))}
        <td className="text-right px-3 py-2.5 font-bold tabular-nums text-slate-900">{cell(sumMonths(totals))}</td>
        {editable && <td />}
      </tr>
    </>
  )
}

function RubricRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

/**
 * Campo de montante: mostra o valor formatado e, ao editar, aceita escrita à
 * portuguesa. Só grava ao sair do campo ou com Enter; Escape desiste.
 */
function AmountInput({ value, onCommit, strong }: { value: number; onCommit: (v: number) => void; strong?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)
  const parsed    = draft === null ? value : parseAmount(draft)
  const invalid   = parsed === null || Math.abs(parsed) > LIMITS.maxAmount

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft ?? formatAmount(value)}
      placeholder="0"
      onFocus={e => {
        cancelled.current = false
        setDraft(formatAmount(value))
        const el = e.currentTarget
        requestAnimationFrame(() => el.select())
      }}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && !cancelled.current && !invalid && parsed !== value) onCommit(parsed as number)
        setDraft(null)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur() }
      }}
      className={`w-full min-w-[78px] text-right tabular-nums text-sm rounded px-1.5 py-1 border bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
        invalid ? 'border-red-400 bg-red-50' : 'border-transparent hover:border-slate-200 focus:border-indigo-400'
      } ${strong ? 'font-medium text-slate-800' : 'text-slate-700'}`}
    />
  )
}
