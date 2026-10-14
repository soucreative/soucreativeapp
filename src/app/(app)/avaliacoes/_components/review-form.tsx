'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { upsertReview } from '../actions'
import type { QuarterlyReview, Objective, Employee } from '@/types/database'

type EmpOption = Pick<Employee, 'id' | 'first_name' | 'last_name' | 'department' | 'position_type'>

function scoreColor(s: number) {
  if (s >= 8) return 'text-emerald-600'
  if (s >= 6) return 'text-amber-600'
  return 'text-red-500'
}
function scoreBarColor(s: number) {
  if (s >= 8) return 'bg-emerald-500'
  if (s >= 6) return 'bg-amber-400'
  return 'bg-red-400'
}
function scoreLabel(s: number) {
  if (s >= 9)  return 'Excecional'
  if (s >= 8)  return 'Muito bom'
  if (s >= 7)  return 'Bom'
  if (s >= 6)  return 'Satisfatório'
  if (s >= 5)  return 'Suficiente'
  if (s >= 3)  return 'Insuficiente'
  return 'Muito insuficiente'
}

const statusLabel: Record<string, string> = {
  draft:     'Rascunho',
  submitted: 'Submetida',
  approved:  'Aprovada',
}

export default function ReviewForm({
  review,
  employees,
  objectives = [],
  defaultYear,
  defaultQuarter,
}: {
  review?: QuarterlyReview
  employees: EmpOption[]
  objectives?: Objective[]
  defaultYear?: number
  defaultQuarter?: number
}) {
  const [state, action, pending] = useActionState(upsertReview, null)
  const router = useRouter()
  const currentYear = new Date().getFullYear()

  const [score, setScore] = useState<number>(review?.score ?? 7)
  const [status, setStatus] = useState<string>(review?.status ?? 'draft')

  const objWithPct = objectives.filter(o => o.target_value && o.actual_value != null)

  return (
    <form action={action} className="space-y-6">
      {review && <input type="hidden" name="id" value={review.id} />}
      <input type="hidden" name="status" value={status} />

      {/* ── Identificação ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
          Identificação
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Colaborador <span className="text-red-400">*</span>
            </label>
            {review ? (
              <p className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                {employees.find(e => e.id === review.employee_id)
                  ? `${employees.find(e => e.id === review.employee_id)!.first_name} ${employees.find(e => e.id === review.employee_id)!.last_name}`
                  : '—'}
                <input type="hidden" name="employee_id" value={review.employee_id} />
              </p>
            ) : (
              <select name="employee_id" required
                defaultValue=""
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                <option value="" disabled>Selecionar colaborador...</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.first_name} {e.last_name}
                    {e.department ? ` — ${e.department}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Avaliador</label>
            <select name="reviewer_id" defaultValue={review?.reviewer_id ?? ''}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="">— Não atribuído —</option>
              {employees
                .filter(e => e.position_type === 'director' || !review || e.id !== review.employee_id)
                .map(e => (
                  <option key={e.id} value={e.id}>
                    {e.first_name} {e.last_name}
                    {e.position_type === 'director' ? ' (Diretor)' : ''}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Ano <span className="text-red-400">*</span>
            </label>
            <input name="year" type="number" required
              defaultValue={review?.year ?? defaultYear ?? currentYear}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Trimestre <span className="text-red-400">*</span>
            </label>
            <select name="quarter" required defaultValue={review?.quarter ?? defaultQuarter ?? ''}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="" disabled>Selecionar...</option>
              <option value="1">Q1 — Janeiro a Março</option>
              <option value="2">Q2 — Abril a Junho</option>
              <option value="3">Q3 — Julho a Setembro</option>
              <option value="4">Q4 — Outubro a Dezembro</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Pontuação ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Pontuação</h3>

        <div className="space-y-3">
          <div className="flex items-end gap-6">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700">
                  Classificação global (0 – 10)
                </label>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-3xl font-bold tabular-nums ${scoreColor(score)}`}>
                    {score.toFixed(1)}
                  </span>
                  <span className="text-slate-400 text-sm">/ 10</span>
                  <span className={`ml-2 text-xs font-semibold ${scoreColor(score)}`}>
                    {scoreLabel(score)}
                  </span>
                </div>
              </div>
              {/* Slider */}
              <input
                name="score"
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={score}
                onChange={e => setScore(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
              {/* Score bar */}
              <div className="w-full bg-slate-100 rounded-full h-2 mt-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all ${scoreBarColor(score)}`}
                  style={{ width: `${(score / 10) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-300 mt-1">
                <span>0</span>
                <span>2.5</span>
                <span>5</span>
                <span>7.5</span>
                <span>10</span>
              </div>
            </div>
          </div>

          {/* Scale legend */}
          <div className="grid grid-cols-4 gap-2 pt-1">
            {[
              { range: '0–4', label: 'Insuficiente', color: 'bg-red-100 text-red-600' },
              { range: '5–5.9', label: 'Suficiente', color: 'bg-orange-100 text-orange-600' },
              { range: '6–7.9', label: 'Bom', color: 'bg-amber-100 text-amber-700' },
              { range: '8–10', label: 'Muito bom / Excecional', color: 'bg-emerald-100 text-emerald-700' },
            ].map(s => (
              <div key={s.range} className={`rounded-lg px-2 py-1.5 text-center ${s.color}`}>
                <p className="text-xs font-bold">{s.range}</p>
                <p className="text-xs">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Feedback qualitativo ──────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
          Feedback qualitativo
        </h3>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Notas gerais
          </label>
          <textarea
            name="qualitative_notes"
            rows={4}
            defaultValue={review?.qualitative_notes ?? ''}
            placeholder="Resumo geral do desempenho no trimestre..."
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Pontos fortes
              </span>
            </label>
            <textarea
              name="strengths"
              rows={5}
              defaultValue={review?.strengths ?? ''}
              placeholder="O que o colaborador faz bem..."
              className="w-full px-3 py-2 text-sm border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                Áreas de melhoria
              </span>
            </label>
            <textarea
              name="areas_for_improvement"
              rows={5}
              defaultValue={review?.areas_for_improvement ?? ''}
              placeholder="O que pode ser melhorado..."
              className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>
        </div>
      </div>

      {/* ── Objetivos do período (contexto) ──────────────────────── */}
      {objectives.length > 0 && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-4">
            Objetivos do período — contexto
          </h3>
          <div className="space-y-2">
            {objectives.map(obj => {
              const pct = obj.target_value && obj.actual_value != null
                ? Math.round((obj.actual_value / obj.target_value) * 100)
                : null
              return (
                <div key={obj.id} className="flex items-center gap-4 bg-white rounded-lg px-4 py-2.5 border border-slate-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{obj.title}</p>
                    {obj.description && (
                      <p className="text-xs text-slate-400 truncate">{obj.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
                    {obj.target_value != null && (
                      <span>
                        {obj.actual_value != null ? `${obj.actual_value}` : '—'}
                        {' / '}{obj.target_value}{obj.unit ? ` ${obj.unit}` : ''}
                      </span>
                    )}
                    {pct != null && (
                      <span className={`font-bold ${pct >= 100 ? 'text-emerald-600' : pct >= 80 ? 'text-amber-600' : 'text-red-500'}`}>
                        {pct}%
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full font-medium ${
                      obj.status === 'completed' ? 'bg-emerald-100 text-emerald-700'
                      : obj.status === 'in_progress' ? 'bg-blue-100 text-blue-700'
                      : 'bg-slate-100 text-slate-500'
                    }`}>
                      {obj.status === 'completed' ? 'Concluído'
                        : obj.status === 'in_progress' ? 'Em curso'
                        : obj.status === 'cancelled' ? 'Cancelado'
                        : 'Por iniciar'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          {objWithPct.length > 0 && (
            <p className="text-xs text-slate-400 mt-3">
              Média de cumprimento dos objetivos:{' '}
              <strong className="text-slate-600">
                {Math.round(objWithPct.reduce((s, o) => s + o.actual_value! / o.target_value!, 0) / objWithPct.length * 100)}%
              </strong>
            </p>
          )}
        </div>
      )}

      {/* ── Estado + mensagens ────────────────────────────────────── */}
      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-sm text-emerald-600 bg-emerald-50 px-4 py-3 rounded-lg">
          Avaliação guardada com sucesso.
        </p>
      )}

      {/* ── Botões de ação ────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="submit"
          disabled={pending}
          onClick={() => setStatus('draft')}
          className="bg-slate-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {pending && status === 'draft' ? 'A guardar...' : 'Guardar rascunho'}
        </button>

        {(!review || review.status === 'draft') && (
          <button
            type="submit"
            disabled={pending}
            onClick={() => setStatus('submitted')}
            className="bg-amber-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {pending && status === 'submitted' ? 'A submeter...' : 'Submeter avaliação'}
          </button>
        )}

        {review && review.status === 'submitted' && (
          <button
            type="submit"
            disabled={pending}
            onClick={() => setStatus('approved')}
            className="bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {pending && status === 'approved' ? 'A aprovar...' : 'Aprovar avaliação'}
          </button>
        )}

        {review && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-400">Estado atual:</span>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
              review.status === 'approved'  ? 'bg-emerald-100 text-emerald-700'
              : review.status === 'submitted' ? 'bg-amber-100 text-amber-700'
              : 'bg-slate-100 text-slate-600'
            }`}>
              {statusLabel[review.status]}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => router.push('/avaliacoes')}
          className="text-sm text-slate-500 hover:text-slate-700 transition-colors px-3 py-2"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
