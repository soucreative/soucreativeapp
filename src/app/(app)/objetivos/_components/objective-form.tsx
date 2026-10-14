'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Objective, Employee } from '@/types/database'
import { upsertObjective } from '../actions'
import { DEPARTMENTS } from '@/lib/departments'

export { DEPARTMENTS }

type EmployeeOption = Pick<Employee, 'id' | 'first_name' | 'last_name' | 'department' | 'app_role' | 'position_type'>

// ─────────────────────────────────────────────────
// Type card definitions
// ─────────────────────────────────────────────────
const TYPE_CARDS = [
  {
    value: 'individual',
    icon: '👤',
    label: 'Individual',
    summary: 'Objetivo para um colaborador específico',
    model: 'Modelo 2 de prémio',
    modelColor: 'text-amber-700 bg-amber-50 border-amber-200',
    help: (
      <p>
        Cada colaborador pode ter vários objetivos com <strong>pesos diferentes</strong>. Os pesos devem somar 100%&nbsp;—
        por exemplo: 40% comercial + 30% satisfação de cliente + 30% pontualidade.
        O grau de cumprimento pondera o prémio variável individual.
      </p>
    ),
  },
  {
    value: 'team',
    icon: '🏢',
    label: 'Equipa',
    summary: 'Meta de faturação da empresa',
    model: 'Modelo 3 de prémio',
    modelColor: 'text-violet-700 bg-violet-50 border-violet-200',
    help: (
      <p>
        Representa a <strong>meta de faturação anual</strong> da empresa. Se esta meta for atingida,
        desbloqueia o prémio de equipa para todos os colaboradores no Modelo&nbsp;3.
        O valor realizado é preenchido automaticamente a partir dos registos financeiros
        — não é necessário introduzir manualmente.
      </p>
    ),
  },
  {
    value: 'department',
    icon: '🏗️',
    label: 'Departamento',
    summary: 'Meta para uma área específica',
    model: 'Sem impacto direto no prémio',
    modelColor: 'text-slate-600 bg-slate-50 border-slate-200',
    help: (
      <p>
        Objetivo partilhado por todos os elementos de um departamento.
        O <strong>responsável</strong> é preenchido automaticamente com o diretor do departamento.
        Use para metas operacionais por área (ex: reduzir custos do dep. de produção em 10%).
      </p>
    ),
  },
] as const

export default function ObjectiveForm({
  objective,
  employees,
}: {
  objective?: Objective
  employees: EmployeeOption[]
}) {
  const [state, action, pending] = useActionState(upsertObjective, null)
  const router = useRouter()
  const currentYear = new Date().getFullYear()

  const [type, setType]             = useState<string>(objective?.type ?? 'individual')
  const [department, setDepartment] = useState<string>(objective?.department ?? '')

  const selectedCard = TYPE_CARDS.find(c => c.value === type)!

  return (
    <div className="max-w-2xl space-y-5">

      {/* ── Type selector ───────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          1 — Que tipo de objetivo é este?
        </p>
        <div className="grid grid-cols-3 gap-3">
          {TYPE_CARDS.map(card => (
            <button
              key={card.value}
              type="button"
              onClick={() => { setType(card.value); setDepartment('') }}
              className={`text-left rounded-xl border-2 p-4 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                type === card.value
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <span className="text-2xl block mb-2">{card.icon}</span>
              <span className="block text-sm font-semibold text-slate-900 mb-0.5">{card.label}</span>
              <span className="block text-xs text-slate-500 leading-snug">{card.summary}</span>
            </button>
          ))}
        </div>

        {/* Context help + prize model badge */}
        <div className={`mt-3 rounded-lg border p-3.5 text-xs text-slate-600 leading-relaxed ${selectedCard.modelColor}`}>
          <span className={`inline-block text-xs font-semibold rounded-full px-2 py-0.5 border mb-2 ${selectedCard.modelColor}`}>
            {selectedCard.model}
          </span>
          {selectedCard.help}
        </div>
      </div>

      {/* ── Main form ──────────────────────────────────────── */}
      <form action={action} className="space-y-5">
        {objective && <input type="hidden" name="id" value={objective.id} />}
        <input type="hidden" name="type" value={type} />

        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            2 — Detalhes do objetivo
          </p>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Título <span className="text-red-400">*</span>
            </label>
            <input
              name="title" type="text" required
              defaultValue={objective?.title ?? ''}
              placeholder={
                type === 'team'
                  ? 'ex: Meta de faturação 2026'
                  : type === 'department'
                  ? 'ex: Reduzir custos operacionais 10%'
                  : 'ex: Fechar 15 novos contratos'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Descrição <span className="text-xs text-slate-400 font-normal">(opcional)</span>
            </label>
            <textarea
              name="description" rows={2}
              defaultValue={objective?.description ?? ''}
              placeholder="Contexto adicional ou critérios de avaliação"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* ── Type-specific scope fields ── */}
          {type === 'individual' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Colaborador <span className="text-red-400">*</span>
              </label>
              <select
                name="employee_id" required
                defaultValue={objective?.employee_id ?? ''}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">Selecionar colaborador...</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                ))}
              </select>
            </div>
          )}

          {type === 'department' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Departamento <span className="text-red-400">*</span>
              </label>
              <select
                name="department" required
                value={department} onChange={e => setDepartment(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">Selecionar...</option>
                {DEPARTMENTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}

          {/* Period */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Ano <span className="text-red-400">*</span>
              </label>
              <input
                name="year" type="number" required
                defaultValue={objective?.year ?? currentYear}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Trimestre
                {type === 'team' && (
                  <span className="ml-1.5 text-xs text-slate-400 font-normal">— deixe em branco para anual</span>
                )}
              </label>
              <select
                name="quarter"
                defaultValue={objective?.quarter ?? ''}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">Anual</option>
                <option value="1">Q1 — Jan a Mar</option>
                <option value="2">Q2 — Abr a Jun</option>
                <option value="3">Q3 — Jul a Set</option>
                <option value="4">Q4 — Out a Dez</option>
              </select>
            </div>
          </div>

          {/* Metrics */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              3 — Métricas
            </p>
            <div className={`grid gap-4 ${type === 'individual' ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {type === 'individual' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Peso (%)
                    <span className="ml-1.5 text-xs text-slate-400 font-normal">— soma deve ser 100%</span>
                  </label>
                  <input
                    name="weight" type="number" min="0" max="100" step="5"
                    defaultValue={objective?.weight != null ? objective.weight * 100 : ''}
                    placeholder="ex: 30"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {type === 'team' ? 'Meta de faturação' : 'Valor target'}
                </label>
                <input
                  name="target_value" type="number" step="any"
                  defaultValue={objective?.target_value ?? ''}
                  placeholder={type === 'team' ? 'ex: 500000' : 'ex: 15'}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Base mínima
                  <span className="ml-1 text-xs text-slate-400 font-normal">(opcional — limiar para zona de prémio)</span>
                </label>
                <input
                  name="minimum_base" type="number" step="any"
                  defaultValue={objective?.minimum_base ?? ''}
                  placeholder="ex: 400000"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Unidade</label>
                <input
                  name="unit" type="text"
                  defaultValue={objective?.unit ?? ''}
                  placeholder={type === 'team' ? '€' : 'ex: contratos, %, €'}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {type === 'team' && (
              <p className="mt-2 text-xs text-violet-600 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                💡 O valor <strong>realizado</strong> é preenchido automaticamente a partir dos registos mensais
                em <strong>Financeiro → Registos Mensais</strong>. Não é necessário preencher aqui.
              </p>
            )}
          </div>

          {/* Actual value — edit only */}
          {objective && type !== 'team' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Valor realizado</label>
              <input
                name="actual_value" type="number" step="any"
                defaultValue={objective.actual_value ?? ''}
                placeholder="ex: 12"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado</label>
            <select
              name="status"
              defaultValue={objective?.status ?? 'pending'}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="pending">⏳ Por iniciar</option>
              <option value="in_progress">🔄 Em curso</option>
              <option value="completed">✅ Concluído</option>
              <option value="cancelled">❌ Cancelado</option>
            </select>
          </div>

          {state?.error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
              {state.error}
            </p>
          )}
          {state?.success && (
            <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-lg">
              ✓ Objetivo guardado com sucesso.
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit" disabled={pending}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {pending ? 'A guardar...' : 'Guardar objetivo'}
            </button>
            <button
              type="button" onClick={() => router.push('/objetivos')}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
