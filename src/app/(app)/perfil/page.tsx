import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/auth'
import { ROLE_LABELS } from '@/lib/permissions'
import { ChangePasswordForm } from './_components/change-password-form'
import type { Employee, Objective, QuarterlyReview, Compensation, Contract, Absence } from '@/types/database'

const statusStyle: Record<string, string> = {
  active:   'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-500',
  on_leave: 'bg-amber-100 text-amber-700',
}
const statusLabel: Record<string, string> = {
  active: 'Ativo', inactive: 'Inativo', on_leave: 'Licença',
}
const contractTypeLabel: Record<string, string> = {
  permanent:         'Sem termo',
  fixed_term:        'A termo certo',
  internship:        'Estágio',
  service_agreement: 'Prestação de serviços',
}
const regimeLabel: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
}
const objStatusStyle: Record<string, string> = {
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-emerald-100 text-emerald-700',
  pending:     'bg-slate-100 text-slate-500',
  cancelled:   'bg-red-100 text-red-500',
}
const objStatusLabel: Record<string, string> = {
  in_progress: 'Em curso', completed: 'Concluído', pending: 'Pendente', cancelled: 'Cancelado',
}

const fmt = (v: number) =>
  v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export default async function PerfilPage() {
  const session = await getCurrentEmployee()
  if (!session) redirect('/login')

  const supabase    = createAdminClient()
  const currentYear = new Date().getFullYear()
  const isIntern    = session.app_role === 'intern'

  const [empResult, objectivesResult, reviewsResult, compensationResult, contractResult, absencesResult] =
    await Promise.all([
      supabase.from('employees').select('*').eq('id', session.id).single(),

      // Objectives: all roles except intern
      isIntern
        ? Promise.resolve({ data: [] as Objective[] })
        : supabase.from('objectives')
            .select('*')
            .eq('employee_id', session.id)
            .eq('year', currentYear)
            .neq('status', 'cancelled')
            .order('quarter', { ascending: true }),

      // Evaluations: all roles — only once submitted, a draft is still the reviewer's
      supabase.from('quarterly_reviews')
        .select('*')
        .eq('employee_id', session.id)
        .neq('status', 'draft')
        .order('year',    { ascending: false })
        .order('quarter', { ascending: false })
        .limit(8),

      // Compensation: not for interns
      isIntern
        ? Promise.resolve({ data: null })
        : supabase.from('compensation')
            .select('base_salary, variable_model, effective_date')
            .eq('employee_id', session.id)
            .is('end_date', null)
            .order('effective_date', { ascending: false })
            .limit(1)
            .maybeSingle(),

      // Current contract
      supabase.from('contracts')
        .select('contract_type, start_date, end_date, status')
        .eq('employee_id', session.id)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Absences for current year (employee and director see own)
      supabase.from('absences')
        .select('*')
        .eq('employee_id', session.id)
        .eq('status', 'approved')
        .gte('start_date', `${currentYear}-01-01`)
        .lte('end_date',   `${currentYear}-12-31`)
        .order('start_date', { ascending: false }),
    ])

  const employee    = empResult.data as Employee | null
  const objectives  = (objectivesResult.data ?? []) as Objective[]
  const reviews     = (reviewsResult.data ?? []) as QuarterlyReview[]
  const compensation = compensationResult.data as (Pick<Compensation, 'base_salary' | 'variable_model' | 'effective_date'> | null)
  const contract    = contractResult.data as (Pick<Contract, 'contract_type' | 'start_date' | 'end_date' | 'status'> | null)
  const absences    = (absencesResult.data ?? []) as Absence[]

  const vacationDaysUsed = absences
    .filter(a => a.type === 'vacation')
    .reduce((sum, a) => sum + a.working_days, 0)
  const VACATION_DAYS_TOTAL = 24
  const vacationDaysLeft = Math.max(0, VACATION_DAYS_TOTAL - vacationDaysUsed)

  if (!employee) {
    return (
      <div className="p-8 max-w-xl">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <p className="font-semibold text-amber-900">Perfil não encontrado</p>
          <p className="text-sm text-amber-700 mt-1">
            A tua conta de acesso ainda não está ligada a um registo de colaborador.
            Contacta um administrador para configurar o perfil.
          </p>
          <p className="text-xs text-amber-500 mt-3 font-mono">
            auth_user_id não configurado para: {session.email}
          </p>
        </div>
      </div>
    )
  }

  const initials = `${employee.first_name.charAt(0)}${employee.last_name.charAt(0)}`.toUpperCase()
  const fullName = `${employee.first_name} ${employee.last_name}`

  return (
    <div className="p-8 max-w-4xl">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl font-bold text-indigo-700 tracking-tight">{initials}</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{fullName}</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {employee.role}
              {employee.department && <span className="text-slate-400"> · {employee.department}</span>}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${statusStyle[employee.status] ?? 'bg-slate-100 text-slate-500'}`}>
                {statusLabel[employee.status] ?? employee.status}
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                {ROLE_LABELS[session.app_role] ?? session.app_role}
              </span>
            </div>
          </div>
        </div>

        {/* Everyone opens their own full card, except interns (Perfil and Avaliações only) */}
        {!isIntern && (
          <Link
            href={`/colaboradores/${session.id}`}
            className="text-xs text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
          >
            Ver ficha completa →
          </Link>
        )}
      </div>

      <div className="space-y-6">
        {/* ── Info card ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Dados pessoais
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Email</p>
              <p className="text-sm text-slate-700">{employee.email}</p>
            </div>
            {employee.phone && (
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Telefone</p>
                <p className="text-sm text-slate-700">{employee.phone}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Data de entrada</p>
              <p className="text-sm text-slate-700">
                {new Date(employee.start_date).toLocaleDateString('pt-PT')}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Regime</p>
              <p className="text-sm text-slate-700">
                {regimeLabel[employee.work_regime] ?? employee.work_regime}
                {employee.days_per_week && ` (${employee.days_per_week}d/semana)`}
              </p>
            </div>
            {contract && (
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Contrato</p>
                <p className="text-sm text-slate-700">
                  {contractTypeLabel[contract.contract_type] ?? contract.contract_type}
                  {contract.end_date && (
                    <span className="text-slate-400">
                      {' '}até {new Date(contract.end_date).toLocaleDateString('pt-PT')}
                    </span>
                  )}
                </p>
              </div>
            )}
            {!isIntern && compensation && (
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Remuneração base</p>
                <p className="text-sm font-semibold text-slate-800">
                  {fmt(compensation.base_salary)}<span className="text-slate-400 font-normal">/mês</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Objectives ─────────────────────────────────────────────── */}
        {!isIntern && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Os meus objetivos — {currentYear}
              </h2>
              <Link href="/objetivos" className="text-xs text-indigo-600 hover:underline">
                Ver todos →
              </Link>
            </div>
            {objectives.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">
                Ainda sem objetivos definidos para {currentYear}.
              </p>
            ) : (
              <div className="space-y-3">
                {objectives.map(obj => {
                  const pct = obj.target_value && obj.actual_value != null
                    ? Math.min(100, Math.round((obj.actual_value / obj.target_value) * 100))
                    : null
                  return (
                    <div key={obj.id} className="border border-slate-100 rounded-lg p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{obj.title}</p>
                          {obj.description && (
                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{obj.description}</p>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${objStatusStyle[obj.status] ?? 'bg-slate-100 text-slate-500'}`}>
                          {objStatusLabel[obj.status] ?? obj.status}
                        </span>
                      </div>
                      {obj.target_value != null && (
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-slate-400 mb-1">
                            <span>Progresso</span>
                            <span>
                              {obj.actual_value ?? 0} / {obj.target_value} {obj.unit ?? ''}
                              {pct !== null && <span className="ml-1 font-semibold text-slate-600">({pct}%)</span>}
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full transition-all"
                              style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Vacation summary ────────────────────────────────────────── */}
        {!isIntern && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Férias & Faltas — {currentYear}
            </h2>
            <div className="flex items-center gap-6 mb-5">
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-900">{vacationDaysUsed}</p>
                <p className="text-xs text-slate-400 mt-0.5">dias usados</p>
              </div>
              <div className="h-10 w-px bg-slate-200" />
              <div className="text-center">
                <p className={`text-2xl font-bold ${vacationDaysLeft <= 3 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {vacationDaysLeft}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">dias restantes</p>
              </div>
              <div className="flex-1">
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.round((vacationDaysUsed / VACATION_DAYS_TOTAL) * 100))}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1 text-right">
                  {Math.round((vacationDaysUsed / VACATION_DAYS_TOTAL) * 100)}% de {VACATION_DAYS_TOTAL} dias
                </p>
              </div>
            </div>
            {absences.length > 0 && (
              <div className="space-y-2">
                {absences.slice(0, 5).map(a => (
                  <div key={a.id} className="flex items-center justify-between text-sm py-1.5 border-t border-slate-50">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        a.type === 'vacation'    ? 'bg-indigo-100 text-indigo-700'
                        : a.type === 'sick_leave' ? 'bg-red-100 text-red-700'
                        : 'bg-slate-100 text-slate-600'
                      }`}>
                        {a.type === 'vacation' ? 'Férias' : a.type === 'sick_leave' ? 'Baixa' : 'Falta'}
                      </span>
                      <span className="text-slate-500 text-xs">
                        {new Date(a.start_date).toLocaleDateString('pt-PT')}
                        {a.start_date !== a.end_date && ` → ${new Date(a.end_date).toLocaleDateString('pt-PT')}`}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">{a.working_days}d</span>
                  </div>
                ))}
              </div>
            )}
            {absences.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-2">Sem ausências aprovadas em {currentYear}.</p>
            )}
          </div>
        )}

        {/* ── Change password ─────────────────────────────────────────── */}
        <ChangePasswordForm />

        {/* ── Evaluations ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              As minhas avaliações
            </h2>
            <Link href="/avaliacoes" className="text-xs text-indigo-600 hover:underline">
              Ver todas →
            </Link>
          </div>
          {reviews.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">
              Ainda sem avaliações registadas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Período</th>
                    <th className="text-center py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nota</th>
                    <th className="text-left py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider pl-4">Pontos fortes</th>
                    <th className="text-right py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {reviews.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="py-3 font-medium text-slate-700">
                        Q{r.quarter} {r.year}
                      </td>
                      <td className="py-3 text-center">
                        {r.score != null ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                            r.score >= 8 ? 'bg-emerald-100 text-emerald-700'
                            : r.score >= 6 ? 'bg-blue-100 text-blue-700'
                            : 'bg-amber-100 text-amber-700'
                          }`}>
                            {r.score}/10
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-3 text-slate-500 text-xs pl-4 max-w-xs truncate">
                        {r.strengths ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3 text-right">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          r.status === 'approved'  ? 'bg-emerald-100 text-emerald-700'
                          : r.status === 'submitted' ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-500'
                        }`}>
                          {r.status === 'approved' ? 'Aprovada' : r.status === 'submitted' ? 'Submetida' : 'Rascunho'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
