import { createAdminClient } from '@/lib/supabase/admin'
import { requirePageAccess } from '@/lib/auth'
import Link from 'next/link'
import type { Objective, Employee } from '@/types/database'
import { DEPARTMENTS } from '@/lib/departments'
import { DeleteObjectiveButton } from './_components/delete-objective-button'

const statusLabel: Record<string, string> = {
  pending:     'Por iniciar',
  in_progress: 'Em curso',
  completed:   'Concluído',
  cancelled:   'Cancelado',
}
const statusStyle: Record<string, string> = {
  pending:     'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-emerald-100 text-emerald-700',
  cancelled:   'bg-red-100 text-red-600',
}

export default async function ObjetivosPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string; dept?: string }>
}) {
  const { year, quarter, dept } = await searchParams
  const currentYear = new Date().getFullYear()
  const filterYear = Number(year ?? currentYear)

  const supabase = createAdminClient()
  const session  = await requirePageAccess('/objetivos')
  const isEmployee = session.app_role === 'employee'

  const [objResult, empResult] = await Promise.all([
    supabase.from('objectives').select('*').eq('year', filterYear)
      .order('type').order('status'),
    supabase.from('employees').select('id, first_name, last_name, position_type, app_role').eq('status', 'active'),
  ])

  let objectives = (objResult.data ?? []) as Objective[]

  // Employees only see team objectives + their own individual objectives
  if (isEmployee && session) {
    objectives = objectives.filter(o =>
      o.type === 'team' ||
      (o.type === 'individual' && o.employee_id === session.id)
    )
  }
  const employees = (empResult.data ?? []) as Pick<Employee, 'id' | 'first_name' | 'last_name' | 'position_type' | 'app_role'>[]
  const empMap     = Object.fromEntries(employees.map(e => [e.id, `${e.first_name} ${e.last_name}`]))

  if (quarter) objectives = objectives.filter(o => o.quarter === Number(quarter))
  if (dept)    objectives = objectives.filter(o => o.type === 'department' && o.department === dept)

  const teamObjs  = objectives.filter(o => o.type === 'team')
  const deptObjs  = objectives.filter(o => o.type === 'department')
  const indivObjs = objectives.filter(o => o.type === 'individual')

  // Group department objectives by department name
  const deptGroups: Record<string, Objective[]> = {}
  for (const d of DEPARTMENTS) {
    const items = deptObjs.filter(o => o.department === d)
    if (items.length > 0) deptGroups[d] = items
  }
  const otherDepts = deptObjs.filter(o => !(DEPARTMENTS as readonly string[]).includes(o.department ?? ''))
  if (otherDepts.length > 0) deptGroups['Outros'] = [...(deptGroups['Outros'] ?? []), ...otherDepts]

  function achievementPct(obj: Objective): number | null {
    if (!obj.target_value || obj.actual_value == null) return null
    return Math.round((obj.actual_value / obj.target_value) * 100)
  }

  // Summary stats
  const totalCount   = objectives.length
  const completedCount = objectives.filter(o => o.status === 'completed').length
  const inProgressCount = objectives.filter(o => o.status === 'in_progress').length
  const withActual   = objectives.filter(o => achievementPct(o) != null)
  const avgAchievement = withActual.length > 0
    ? Math.round(withActual.reduce((sum, o) => sum + achievementPct(o)!, 0) / withActual.length)
    : null

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Objetivos</h1>
          <p className="text-slate-500 text-sm mt-1">{totalCount} objetivo{totalCount !== 1 ? 's' : ''} em {filterYear}</p>
        </div>
        {!isEmployee && (
          <Link
            href="/objetivos/novo"
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + Novo objetivo
          </Link>
        )}
      </div>

      {/* Summary cards */}
      {totalCount > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <SummaryCard icon="🎯" label="Total" value={totalCount} />
          <SummaryCard icon="🔄" label="Em curso" value={inProgressCount} color="text-blue-700" />
          <SummaryCard icon="✅" label="Concluídos" value={completedCount} color="text-emerald-700" />
          <SummaryCard
            icon="📊"
            label="Realização média"
            value={avgAchievement != null ? `${avgAchievement}%` : '—'}
            color={avgAchievement != null ? (avgAchievement >= 100 ? 'text-emerald-700' : avgAchievement >= 80 ? 'text-amber-600' : 'text-red-600') : 'text-slate-400'}
          />
        </div>
      )}

      {/* Filters — year */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {[currentYear - 1, currentYear, currentYear + 1].map(y => (
          <FilterLink key={y} label={String(y)}
            href={`/objetivos?year=${y}`}
            active={filterYear === y} />
        ))}
        <span className="text-slate-300">|</span>
        <FilterLink label="Todos os trimestres" href={`/objetivos?year=${filterYear}`} active={!quarter && !dept} />
        {[1, 2, 3, 4].map(q => (
          <FilterLink key={q} label={`Q${q}`}
            href={`/objetivos?year=${filterYear}&quarter=${q}`}
            active={quarter === String(q)} />
        ))}
      </div>

      {/* Filters — department */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <span className="text-xs text-slate-400 font-medium">Dept:</span>
        <FilterLink label="Todos" href={`/objetivos?year=${filterYear}${quarter ? `&quarter=${quarter}` : ''}`} active={!dept} />
        {DEPARTMENTS.map(d => (
          <FilterLink key={d} label={d}
            href={`/objetivos?year=${filterYear}${quarter ? `&quarter=${quarter}` : ''}&dept=${encodeURIComponent(d)}`}
            active={dept === d} />
        ))}
      </div>

      {/* Empty state */}
      {totalCount === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <h3 className="text-base font-semibold text-slate-900 mb-1">
            Nenhum objetivo em {filterYear}
          </h3>
          <p className="text-sm text-slate-500 mb-6">
            Crie o primeiro objetivo para este ano. Existem três tipos:
          </p>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <span className="text-2xl">👤</span>
              <p className="mt-2 font-semibold text-sm text-slate-900">Individual</p>
              <p className="text-xs text-slate-500 mt-1 leading-snug">
                Para um colaborador específico. Tem peso (%) e contribui para o prémio individual (Modelo 2).
              </p>
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
              <span className="text-2xl">🏢</span>
              <p className="mt-2 font-semibold text-sm text-slate-900">Equipa</p>
              <p className="text-xs text-slate-500 mt-1 leading-snug">
                Meta de faturação da empresa. O valor realizado vem dos registos financeiros (Modelo 3).
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <span className="text-2xl">🏗️</span>
              <p className="mt-2 font-semibold text-sm text-slate-900">Departamento</p>
              <p className="text-xs text-slate-500 mt-1 leading-snug">
                Meta por área. O responsável é o diretor do departamento.
              </p>
            </div>
          </div>
          {!isEmployee && (
            <Link
              href="/objetivos/novo"
              className="inline-block bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Criar primeiro objetivo
            </Link>
          )}
        </div>
      )}

      {/* Team objectives */}
      {teamObjs.length > 0 && (
        <ObjectiveTable
          title="Equipa"
          badge="🏢 Empresa"
          badgeColor="bg-violet-100 text-violet-700"
          hint="Meta de faturação — Modelo 3"
          objectives={teamObjs}
          empMap={empMap}
          achievementPct={achievementPct}
          readOnly={isEmployee}
        />
      )}

      {/* Department objectives — hidden for employees */}
      {!isEmployee && Object.entries(deptGroups).map(([deptName, objs]) => (
        <ObjectiveTable
          key={deptName}
          title={deptName}
          badge="🏗️ Departamento"
          badgeColor="bg-blue-100 text-blue-700"
          objectives={objs}
          empMap={empMap}
          achievementPct={achievementPct}
          readOnly={false}
        />
      ))}

      {/* Individual objectives */}
      {indivObjs.length > 0 && (
        <ObjectiveTable
          title="Individuais"
          badge="👤 Individual"
          badgeColor="bg-amber-100 text-amber-700"
          hint="Peso (%) pondera prémio variável — Modelo 2"
          objectives={indivObjs}
          empMap={empMap}
          achievementPct={achievementPct}
          readOnly={isEmployee}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────

function SummaryCard({
  icon, label, value, color = 'text-slate-900',
}: {
  icon: string
  label: string
  value: number | string
  color?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-3">
      <span className="text-xl">{icon}</span>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
      </div>
    </div>
  )
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link href={href}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active
          ? 'bg-indigo-600 text-white'
          : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
      }`}>
      {label}
    </Link>
  )
}

function ObjectiveTable({
  title, badge, badgeColor, hint, objectives, empMap, achievementPct, readOnly,
}: {
  title: string
  badge: string
  badgeColor: string
  hint?: string
  objectives: Objective[]
  empMap: Record<string, string>
  achievementPct: (o: Objective) => number | null
  readOnly?: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 mb-5">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
        {hint && <span className="text-xs text-slate-400 italic">{hint}</span>}
        <span className="text-xs text-slate-400 ml-auto">{objectives.length} objetivo{objectives.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Objetivo</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Colaborador / Dept.</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Período</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Peso</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Target</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Real.</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Progresso</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
              {!readOnly && <th className="px-6 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {objectives.map(obj => {
              const pct = achievementPct(obj)
              const scopeLabel =
                obj.type === 'individual' && obj.employee_id ? empMap[obj.employee_id] ?? '—'
                : obj.type === 'department' && obj.department ? obj.department
                : obj.type === 'team' ? 'Toda a empresa'
                : '—'
              return (
                <tr key={obj.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3">
                    <p className="font-medium text-slate-900">{obj.title}</p>
                    {obj.description && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[200px]">{obj.description}</p>
                    )}
                  </td>
                  <td className="px-6 py-3 text-slate-500 text-xs">{scopeLabel}</td>
                  <td className="px-6 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {obj.quarter ? `Q${obj.quarter} ${obj.year}` : String(obj.year)}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-500 text-xs">
                    {obj.weight != null ? `${Math.round(obj.weight * 100)}%` : '—'}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-600 text-xs whitespace-nowrap">
                    {obj.target_value != null ? `${obj.target_value.toLocaleString('pt-PT')}${obj.unit ? ` ${obj.unit}` : ''}` : '—'}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-600 text-xs whitespace-nowrap">
                    {obj.actual_value != null ? `${obj.actual_value.toLocaleString('pt-PT')}${obj.unit ? ` ${obj.unit}` : ''}` : '—'}
                  </td>
                  <td className="px-6 py-3 w-28">
                    {pct != null ? (
                      <div className="space-y-1">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              pct >= 100 ? 'bg-emerald-500' : pct >= 80 ? 'bg-amber-400' : 'bg-red-400'
                            }`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <p className={`text-xs font-semibold tabular-nums ${
                          pct >= 100 ? 'text-emerald-600' : pct >= 80 ? 'text-amber-600' : 'text-red-500'
                        }`}>
                          {pct}%
                        </p>
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">sem dados</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${statusStyle[obj.status]}`}>
                      {statusLabel[obj.status]}
                    </span>
                  </td>
                  {!readOnly && (
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/objetivos/${obj.id}`} className="text-xs text-indigo-600 hover:underline whitespace-nowrap">
                          Editar
                        </Link>
                        <DeleteObjectiveButton id={obj.id} />
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
