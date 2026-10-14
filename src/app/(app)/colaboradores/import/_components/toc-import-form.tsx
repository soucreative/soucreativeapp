'use client'

import { useActionState, useState } from 'react'
import { parseTocExcel, applyTocImport, type MatchedRow, type TocFormat } from '../actions'

// ── Step 1: Upload ────────────────────────────────────────────────────────

function UploadStep({ onParsed }: { onParsed: (rows: MatchedRow[], fmt: TocFormat) => void }) {
  const [state, action, pending] = useActionState(
    async (_: unknown, fd: FormData) => {
      const res = await parseTocExcel(_, fd)
      if (res.rows && res.format) onParsed(res.rows, res.format)
      return res
    },
    null,
  )

  return (
    <form action={action} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Carregar ficheiro</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-500 bg-slate-50 rounded-lg p-4 border border-slate-200">
        <div>
          <p className="font-semibold text-slate-700 mb-1">Ficheiro 1 — Mapa completo</p>
          <p>Salário + admissão + NIF + IBAN + data de nascimento</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700 mb-1">Ficheiro 2 — Por categoria</p>
          <p>Categoria profissional e função</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700 mb-1">Ficheiro 3 — Alterações cadastrais</p>
          <p>Sub. alimentação, estado fiscal, dependentes, modalidade de subsídio</p>
        </div>
      </div>
      <p className="text-xs text-slate-400">Carrega os 3 ficheiros <strong>um de cada vez</strong>. O sistema detecta o formato automaticamente.</p>
      <input type="file" name="file" accept=".xlsx,.xls" required
        className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer" />
      {state?.error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>}
      <button type="submit" disabled={pending}
        className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
        {pending ? 'A analisar…' : 'Analisar ficheiro'}
      </button>
    </form>
  )
}

// ── Step 2: Preview ───────────────────────────────────────────────────────

const FORMAT_LABEL: Record<TocFormat, string> = {
  salary_full:     'Mapa completo (salário + dados pessoais)',
  salary_category: 'Mapa por categoria profissional',
  cadastral:       'Alterações cadastrais (dados fiscais)',
  salary_basic:    'Mapa básico de remunerações',
}

const STATUS_STYLE: Record<string, string> = {
  match:     'bg-emerald-50 border-emerald-200 text-emerald-700',
  no_change: 'bg-slate-50 border-slate-200 text-slate-400',
  no_match:  'bg-red-50 border-red-200 text-red-600',
}
const STATUS_LABEL: Record<string, string> = {
  match:     '✓ Actualizar',
  no_change: '— Sem alteração',
  no_match:  '⚠ Não encontrado',
}

function fmt(n: number) {
  return n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
}

function PreviewStep({ rows, format, onReset }: {
  rows: MatchedRow[]
  format: TocFormat
  onReset: () => void
}) {
  const [applyState, applyAction, pending] = useActionState(applyTocImport, null)

  const toUpdate  = rows.filter(r => r.status === 'match').length
  const noChange  = rows.filter(r => r.status === 'no_change').length
  const noMatch   = rows.filter(r => r.status === 'no_match').length
  const hasSalaryChanges = rows.some(r => r.status === 'match' && r.salario != null && r.current_salary !== r.salario)

  const showSalary   = format !== 'cadastral'
  const showPersonal = format === 'salary_full'
  const showCategory = format === 'salary_category'
  const showCadastral = format === 'cadastral'

  if (applyState?.updated !== undefined) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 space-y-3">
        <h2 className="text-sm font-semibold text-emerald-800">✓ Importação concluída</h2>
        <p className="text-sm text-emerald-700">
          {applyState.updated} colaborador{applyState.updated !== 1 ? 'es' : ''} actualizados.
          {(applyState.skipped ?? 0) > 0 && ` ${applyState.skipped} sem alteração.`}
        </p>
        {applyState.details && applyState.details.length > 0 && (
          <ul className="text-xs text-emerald-700 space-y-0.5 list-disc list-inside">
            {applyState.details.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        )}
        <button onClick={onReset} className="text-xs text-emerald-700 underline hover:no-underline">
          Importar outro ficheiro
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">{FORMAT_LABEL[format]}</p>
          <p className="text-xs text-slate-400 mt-0.5">Revê e confirma antes de aplicar</p>
        </div>
        <div className="flex items-center gap-3">
          {toUpdate > 0 && <span className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-2.5 py-0.5">{toUpdate} para actualizar</span>}
          {noChange > 0 && <span className="text-xs bg-slate-50 border border-slate-200 text-slate-500 rounded-full px-2.5 py-0.5">{noChange} sem alteração</span>}
          {noMatch  > 0 && <span className="text-xs bg-red-50 border border-red-200 text-red-600 rounded-full px-2.5 py-0.5">{noMatch} não encontrado</span>}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nome TOC</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Match HRM</th>
              {showSalary && <>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actual</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Novo</th>
              </>}
              {showPersonal && <>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nasc.</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">NIF</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">IBAN</th>
              </>}
              {showCategory && (
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Categoria</th>
              )}
              {showCadastral && <>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Sub. alim.</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado civil</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dep.</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Subsídios</th>
              </>}
              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={i} className={r.status === 'no_match' ? 'opacity-50' : 'hover:bg-slate-50'}>
                <td className="px-4 py-2.5 text-xs text-slate-700">{r.nome}</td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{r.db_name ?? '—'}</td>
                {showSalary && <>
                  <td className="px-3 py-2.5 text-right text-xs text-slate-400 tabular-nums">
                    {r.current_salary != null ? fmt(r.current_salary) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-semibold text-slate-900 tabular-nums">
                    {r.salario != null ? fmt(r.salario) : '—'}
                  </td>
                </>}
                {showPersonal && <>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{r.date_of_birth ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600 font-mono">{r.nif ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600 font-mono">{r.iban ? r.iban.slice(0, 12) + '…' : '—'}</td>
                </>}
                {showCategory && (
                  <td className="px-3 py-2.5 text-xs text-slate-600">{r.job_title ?? '—'}</td>
                )}
                {showCadastral && <>
                  <td className="px-3 py-2.5 text-xs text-slate-600">
                    {r.meal_allowance_daily != null ? `${r.meal_allowance_daily}€ ${r.meal_allowance_type === 'card' ? 'cartão' : 'dinheiro'}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">
                    {r.marital_status === 'single' ? 'Solteiro/a'
                      : r.marital_status === 'married_two_earners' ? 'Casado/a 2T'
                      : r.marital_status === 'married_single_earner' ? 'Casado/a 1T'
                      : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-slate-600">{r.dependents_count ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">
                    {r.subsidy_payment_mode === 'twelfths' ? 'Duodécimos'
                      : r.subsidy_payment_mode === 'full' ? 'Integral'
                      : r.subsidy_payment_mode === 'none' ? 'Sem subsídios' : '—'}
                  </td>
                </>}
                <td className="px-3 py-2.5">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirm */}
      {toUpdate > 0 ? (
        <form action={applyAction} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <input type="hidden" name="rows" value={JSON.stringify(rows)} />
          <div className="flex items-end gap-4 flex-wrap">
            {hasSalaryChanges && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Data efectiva da remuneração</label>
                <input type="date" name="effective_date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            )}
            <button type="submit" disabled={pending}
              className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {pending ? 'A aplicar…' : `Aplicar ${toUpdate} actualizações`}
            </button>
            <button type="button" onClick={onReset}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              Cancelar
            </button>
          </div>
          {applyState?.error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{applyState.error}</p>
          )}
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-500">Nenhuma alteração a aplicar.</p>
          <button onClick={onReset} className="text-xs text-indigo-600 underline hover:no-underline">Carregar outro ficheiro</button>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function TocImportForm() {
  const [parsed, setParsed] = useState<{ rows: MatchedRow[]; format: TocFormat } | null>(null)

  return parsed
    ? <PreviewStep rows={parsed.rows} format={parsed.format} onReset={() => setParsed(null)} />
    : <UploadStep onParsed={(rows, format) => setParsed({ rows, format })} />
}
