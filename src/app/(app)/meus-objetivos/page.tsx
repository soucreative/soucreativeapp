import { createAdminClient } from '@/lib/supabase/admin'
import { requirePageAccess } from '@/lib/auth'
import Link from 'next/link'
import type {
  Objective, QuarterlyReview, Absence, Compensation, VariableRule,
  VariableModel2Data,
} from '@/types/database'

export const dynamic = 'force-dynamic'

// ── Constants ─────────────────────────────────────────────────────────────
const VACATION_DAYS_PER_YEAR = 24
const Q_ENDS: Record<number, [number, number]> = {
  1: [2, 31],   // Mar 31
  2: [5, 30],   // Jun 30
  3: [8, 30],   // Sep 30
  4: [11, 31],  // Dec 31
}

// ── Helpers ───────────────────────────────────────────────────────────────

function quarterEnd(q: number, year: number): Date {
  const [month, day] = Q_ENDS[q]
  return new Date(year, month, day)
}

function daysUntil(target: Date, from: Date): number {
  const ms = target.getTime() - from.getTime()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

function pctColor(pct: number) {
  if (pct >= 100) return { bar: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' }
  if (pct >= 80)  return { bar: 'bg-amber-400',   text: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' }
  return             { bar: 'bg-red-400',     text: 'text-red-500',     bg: 'bg-red-50',     border: 'border-red-200' }
}

const statusStyle: Record<string, string> = {
  draft:     'bg-slate-100 text-slate-500',
  submitted: 'bg-amber-100 text-amber-700',
  approved:  'bg-emerald-100 text-emerald-700',
}
const statusLabel: Record<string, string> = {
  draft: 'Rascunho', submitted: 'Submetida', approved: 'Aprovada',
}
const objStatusStyle: Record<string, string> = {
  pending:     'bg-slate-100 text-slate-500',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-emerald-100 text-emerald-700',
  cancelled:   'bg-red-100 text-red-500',
}
const objStatusLabel: Record<string, string> = {
  pending: 'Por iniciar', in_progress: 'Em curso', completed: 'Concluído', cancelled: 'Cancelado',
}
const absenceTypeLabel: Record<string, string> = {
  vacation: 'Férias', sick_leave: 'Baixa médica', justified: 'Justificada',
  unjustified: 'Injustificada', other: 'Outro', company_day: 'Dia empresa',
}

// ── Bonus estimate calculator ──────────────────────────────────────────────

function estimateBonus(
  rule: VariableRule | null,
  indivObjs: Objective[],
  teamObjs: Objective[],
): { estimated: number; max: number; pct: number; label: string; emoji: string } | null {
  if (!rule || !rule.max_variable_amount) return null

  const max = rule.max_variable_amount
  let pct   = 0

  if (rule.model === '2') {
    // Modelo 2: individual objectives with weights
    const data = rule.rule_data as VariableModel2Data
    const objWeights = data.objectives // [{name, weight, target?, actual?}]

    // Cross-reference with live objectives data for actual values
    const measurable = indivObjs.filter(
      o => o.target_value && o.target_value > 0 && o.actual_value != null && o.status !== 'cancelled'
    )

    if (measurable.length > 0) {
      const totalW = measurable.reduce((s, o) => s + (o.weight ?? (1 / measurable.length)), 0)
      const weighted = measurable.reduce((s, o) => {
        const completion = Math.min(1.5, o.actual_value! / o.target_value!)
        const w = o.weight ?? (1 / measurable.length)
        return s + completion * w
      }, 0)
      pct = totalW > 0 ? Math.min(1, weighted / totalW) : 0
    } else if (objWeights.length > 0) {
      // Fallback to rule_data actuals if available
      const measurableRules = objWeights.filter(o => o.target != null && o.actual != null)
      if (measurableRules.length > 0) {
        const totalW = measurableRules.reduce((s, o) => s + o.weight, 0)
        const weighted = measurableRules.reduce((s, o) => {
          const completion = Math.min(1.5, o.actual! / o.target!)
          return s + completion * o.weight
        }, 0)
        pct = totalW > 0 ? Math.min(1, weighted / totalW) : 0
      }
    }
  } else if (rule.model === '3') {
    // Modelo 3: team_weight * team_pct + individual_weight * indiv_pct
    const data = rule.rule_data as { team_weight: number; individual_weight: number }
    const teamMeasurable = teamObjs.filter(o => o.target_value && o.actual_value != null)
    const indivMeasurable = indivObjs.filter(o => o.target_value && o.actual_value != null)

    const teamPct   = teamMeasurable.length > 0
      ? Math.min(1, teamMeasurable.reduce((s, o) => s + o.actual_value! / o.target_value!, 0) / teamMeasurable.length)
      : 0
    const indivPct  = indivMeasurable.length > 0
      ? Math.min(1, indivMeasurable.reduce((s, o) => s + o.actual_value! / o.target_value!, 0) / indivMeasurable.length)
      : 0

    pct = data.team_weight * teamPct + data.individual_weight * indivPct
  }

  const estimated = Math.round(max * pct)
  const pctDisplay = Math.round(pct * 100)

  let label = '', emoji = ''
  if (pct >= 1)    { label = 'No caminho certo para o prémio máximo!'; emoji = '🎯' }
  else if (pct >= 0.8) { label = 'Muito perto — um último esforço!';       emoji = '💪' }
  else if (pct >= 0.5) { label = 'Há margem para crescer este trimestre';   emoji = '📈' }
  else               { label = 'Vale a pena rever os objetivos com o teu diretor'; emoji = '🔍' }

  return { estimated, max, pct: pctDisplay, label, emoji }
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function MeusObjetivosPage() {
  const session = await requirePageAccess('/meus-objetivos')

  const now         = new Date()
  const currentYear = now.getFullYear()
  const currentQ    = Math.ceil((now.getMonth() + 1) / 3)
  const qEnd        = quarterEnd(currentQ, currentYear)
  const daysLeft    = daysUntil(qEnd, now)

  const supabase = createAdminClient()

  // ── Parallel fetch ───────────────────────────────────────────────────────
  const [
    indivQRes, annualIndivRes, teamObjRes, deptObjRes,
    reviewsRes, compRes, varRuleRes, absRes, prizeExRes,
  ] = await Promise.all([
    // Individual objectives for current quarter
    supabase.from('objectives').select('*')
      .eq('employee_id', session.id)
      .eq('year', currentYear)
      .eq('type', 'individual')
      .eq('quarter', currentQ)
      .neq('status', 'cancelled')
      .order('weight', { ascending: false }),

    // Annual individual objectives
    supabase.from('objectives').select('*')
      .eq('employee_id', session.id)
      .eq('year', currentYear)
      .eq('type', 'individual')
      .is('quarter', null)
      .neq('status', 'cancelled')
      .order('weight', { ascending: false }),

    // Team (empresa) objectives
    supabase.from('objectives').select('*')
      .eq('year', currentYear)
      .eq('type', 'team')
      .neq('status', 'cancelled'),

    // Department objectives
    session.department
      ? supabase.from('objectives').select('*')
          .eq('year', currentYear)
          .eq('type', 'department')
          .eq('department', session.department)
          .neq('status', 'cancelled')
      : Promise.resolve({ data: [] as Objective[] }),

    // My reviews (current year)
    supabase.from('quarterly_reviews').select('*')
      .eq('employee_id', session.id)
      .eq('year', currentYear)
      .order('quarter', { ascending: false }),

    // Current compensation
    supabase.from('compensation').select('*')
      .eq('employee_id', session.id)
      .is('end_date', null)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Variable rule (active)
    supabase.from('variable_rules').select('*')
      .eq('employee_id', session.id)
      .is('end_date', null)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Absences this year
    supabase.from('absences').select('*')
      .eq('employee_id', session.id)
      .gte('start_date', `${currentYear}-01-01`)
      .lte('end_date', `${currentYear}-12-31`),

    // Prize exchange (extra vacation days)
    supabase.from('vacation_prize_exchanges').select('extra_days')
      .eq('employee_id', session.id)
      .eq('year', currentYear)
      .maybeSingle(),
  ])

  const qIndivObjs    = (indivQRes.data     ?? []) as Objective[]
  const annualObjs    = (annualIndivRes.data ?? []) as Objective[]
  const teamObjs      = (teamObjRes.data    ?? []) as Objective[]
  const deptObjs      = (deptObjRes.data    ?? []) as Objective[]
  const reviews       = (reviewsRes.data    ?? []) as QuarterlyReview[]
  const compensation  = compRes.data   as Compensation | null
  const varRule       = varRuleRes.data as VariableRule | null
  const absences      = (absRes.data        ?? []) as Absence[]
  const extraDays     = (prizeExRes.data as { extra_days: number } | null)?.extra_days ?? 0

  // Merge individual objectives (quarter first, then annual)
  const allIndiv = [...qIndivObjs, ...annualObjs]
  const totalWeight = allIndiv.reduce((s, o) => s + (o.weight != null ? Math.round(o.weight * 100) : 0), 0)

  // Reviews
  const currentReview = reviews.find(r => r.quarter === currentQ)
  const lastApproved  = reviews.find(r => r.status === 'approved')

  // Bonus estimate
  const bonusEstimate = estimateBonus(varRule, allIndiv, teamObjs)

  // Vacations
  const vacationUsed    = absences.filter(a => a.type === 'vacation' && a.status === 'approved').reduce((s, a) => s + a.working_days, 0)
  const vacationPending = absences.filter(a => a.type === 'vacation' && a.status === 'pending').reduce((s, a) => s + a.working_days, 0)
  const totalAllowed    = VACATION_DAYS_PER_YEAR + extraDays
  const vacationLeft    = Math.max(0, totalAllowed - vacationUsed)
  const vacationPct     = Math.min(100, Math.round((vacationUsed / totalAllowed) * 100))

  // Other pending absences (non-vacation)
  const otherPending    = absences.filter(a => a.type !== 'vacation' && a.status === 'pending')

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">

      {/* ── 1. Cabeçalho ────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl px-7 py-6 text-white">
        <p className="text-indigo-200 text-sm font-medium">Olá,</p>
        <h1 className="text-3xl font-bold mt-0.5">
          {session.first_name} {session.last_name}
        </h1>
        <div className="flex items-center gap-4 mt-4 flex-wrap">
          <div className="flex items-center gap-2 bg-indigo-700/50 rounded-lg px-3 py-1.5">
            <span className="text-indigo-200 text-xs">Trimestre atual</span>
            <span className="font-bold text-sm">Q{currentQ} {currentYear}</span>
          </div>
          <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${
            daysLeft <= 14 ? 'bg-red-500/40' : daysLeft <= 30 ? 'bg-amber-500/30' : 'bg-indigo-700/50'
          }`}>
            <span className="text-indigo-200 text-xs">Fim do trimestre</span>
            <span className="font-bold text-sm">
              {daysLeft === 0 ? 'hoje' : daysLeft === 1 ? 'amanhã' : `${daysLeft} dias`}
            </span>
          </div>
          {session.department && (
            <div className="flex items-center gap-2 bg-indigo-700/50 rounded-lg px-3 py-1.5">
              <span className="text-indigo-200 text-xs">Departamento</span>
              <span className="font-bold text-sm">{session.department}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── 2. Os meus objetivos individuais ───────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Os meus objetivos — Q{currentQ} {currentYear}
          </h2>
          {totalWeight > 0 && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              totalWeight === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {totalWeight}% de peso definido
            </span>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {allIndiv.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-slate-500 font-medium">Sem objetivos definidos para Q{currentQ} {currentYear}</p>
              <p className="text-slate-400 text-sm mt-1">Fala com o teu diretor para definir os teus objetivos.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {/* Quarterly objectives */}
              {qIndivObjs.length > 0 && (
                <>
                  {qIndivObjs.map(obj => <ObjRow key={obj.id} obj={obj} />)}
                </>
              )}

              {/* Annual objectives */}
              {annualObjs.length > 0 && (
                <>
                  {annualObjs.length > 0 && qIndivObjs.length > 0 && (
                    <div className="px-6 py-2 bg-slate-50">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Objetivos anuais</span>
                    </div>
                  )}
                  {annualObjs.map(obj => <ObjRow key={obj.id} obj={obj} isAnnual />)}
                </>
              )}
            </div>
          )}

          {/* Weight warning */}
          {allIndiv.length > 0 && totalWeight > 0 && totalWeight !== 100 && (
            <div className="px-5 py-2.5 bg-amber-50 border-t border-amber-100">
              <p className="text-xs text-amber-700">
                ⚠️ Os pesos somam {totalWeight}% (deviam ser 100%). Fala com o teu diretor.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── 3. Contexto: equipa + departamento ──────────────────────── */}
      {(teamObjs.length > 0 || deptObjs.length > 0) && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
            Contexto geral
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Team */}
            {teamObjs.length > 0 && (
              <ContextCard
                emoji="🏢"
                title="Empresa"
                subtitle="Objetivos de equipa"
                objectives={teamObjs}
              />
            )}
            {/* Dept */}
            {deptObjs.length > 0 && (
              <ContextCard
                emoji="🏗️"
                title={session.department ?? 'Departamento'}
                subtitle="Objetivos de departamento"
                objectives={deptObjs}
              />
            )}
          </div>
        </section>
      )}

      {/* ── 4. A minha avaliação ────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
          A minha avaliação
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Current quarter review */}
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <p className="text-xs text-slate-400 font-medium mb-2">Q{currentQ} {currentYear} — atual</p>
            {currentReview ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusStyle[currentReview.status]}`}>
                    {statusLabel[currentReview.status]}
                  </span>
                  {currentReview.score != null && (
                    <span className={`text-2xl font-bold tabular-nums ${
                      currentReview.score >= 8 ? 'text-emerald-600'
                      : currentReview.score >= 6 ? 'text-amber-600'
                      : 'text-red-500'
                    }`}>
                      {currentReview.score.toFixed(1)}
                    </span>
                  )}
                </div>
                <Link href={`/avaliacoes/${currentReview.id}`}
                  className="text-xs text-indigo-600 hover:underline block">
                  Ver avaliação completa →
                </Link>
              </div>
            ) : (
              <div>
                <p className="text-slate-400 text-sm">Ainda não iniciada</p>
                <Link href="/avaliacoes" className="text-xs text-indigo-500 hover:underline mt-1 block">
                  Ver avaliações →
                </Link>
              </div>
            )}
          </div>

          {/* Last approved review */}
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <p className="text-xs text-slate-400 font-medium mb-2">Última avaliação aprovada</p>
            {lastApproved && lastApproved.id !== currentReview?.id ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-600">
                    Q{lastApproved.quarter} {lastApproved.year}
                  </span>
                  {lastApproved.score != null && (
                    <span className={`text-2xl font-bold tabular-nums ${
                      lastApproved.score >= 8 ? 'text-emerald-600'
                      : lastApproved.score >= 6 ? 'text-amber-600'
                      : 'text-red-500'
                    }`}>
                      {lastApproved.score.toFixed(1)}
                    </span>
                  )}
                </div>
                {lastApproved.strengths && (
                  <p className="text-xs text-slate-500 line-clamp-2">{lastApproved.strengths}</p>
                )}
                <Link href={`/avaliacoes/${lastApproved.id}`}
                  className="text-xs text-indigo-600 hover:underline block">
                  Ver detalhes →
                </Link>
              </div>
            ) : currentReview?.status === 'approved' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-600">Q{currentReview.quarter} {currentReview.year}</span>
                  {currentReview.score != null && (
                    <span className={`text-2xl font-bold tabular-nums ${
                      currentReview.score >= 8 ? 'text-emerald-600'
                      : currentReview.score >= 6 ? 'text-amber-600' : 'text-red-500'
                    }`}>
                      {currentReview.score.toFixed(1)}
                    </span>
                  )}
                </div>
                <Link href={`/avaliacoes/${currentReview.id}`}
                  className="text-xs text-indigo-600 hover:underline block">
                  Ver avaliação →
                </Link>
              </div>
            ) : (
              <p className="text-slate-400 text-sm">Nenhuma avaliação aprovada</p>
            )}
          </div>
        </div>
      </section>

      {/* ── 5. O meu prémio ─────────────────────────────────────────── */}
      {bonusEstimate && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
            O meu prémio variável
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 px-6 py-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-3xl font-bold text-slate-900 tabular-nums">
                  {bonusEstimate.estimated.toLocaleString('pt-PT')} €
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  estimativa atual · máx. {bonusEstimate.max.toLocaleString('pt-PT')} €
                </p>
              </div>
              <div className={`rounded-xl px-3 py-2 text-center ${
                bonusEstimate.pct >= 100 ? 'bg-emerald-50 border border-emerald-200'
                : bonusEstimate.pct >= 80  ? 'bg-amber-50 border border-amber-200'
                : 'bg-slate-50 border border-slate-200'
              }`}>
                <p className={`text-2xl font-bold tabular-nums ${
                  bonusEstimate.pct >= 100 ? 'text-emerald-600'
                  : bonusEstimate.pct >= 80  ? 'text-amber-600'
                  : 'text-slate-500'
                }`}>
                  {bonusEstimate.pct}%
                </p>
                <p className="text-[10px] text-slate-400">cumprimento</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    bonusEstimate.pct >= 100 ? 'bg-emerald-500'
                    : bonusEstimate.pct >= 80  ? 'bg-amber-400'
                    : 'bg-indigo-400'
                  }`}
                  style={{ width: `${Math.min(100, bonusEstimate.pct)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-slate-400">
                <span>0 €</span>
                <span>{bonusEstimate.max.toLocaleString('pt-PT')} €</span>
              </div>
            </div>

            {/* Motivational message */}
            <div className={`rounded-lg px-4 py-3 text-sm font-medium ${
              bonusEstimate.pct >= 100 ? 'bg-emerald-50 text-emerald-800'
              : bonusEstimate.pct >= 80  ? 'bg-amber-50 text-amber-800'
              : bonusEstimate.pct >= 50  ? 'bg-blue-50 text-blue-800'
              : 'bg-slate-50 text-slate-600'
            }`}>
              {bonusEstimate.emoji} {bonusEstimate.label}
            </div>

            {varRule && (
              <p className="text-xs text-slate-400 mt-3">
                Modelo {varRule.model} · base: {compensation?.base_salary ? `${compensation.base_salary.toLocaleString('pt-PT')} €/mês` : '—'}
                {allIndiv.filter(o => o.target_value && o.actual_value != null).length === 0 && (
                  <span className="ml-1 text-amber-500">⚠ sem dados de progresso — estimativa provisional</span>
                )}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── 6. Férias & ausências ───────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
            As minhas férias &amp; ausências
          </h2>
          <Link href="/ferias" className="text-xs text-indigo-600 hover:underline">
            Gerir →
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 px-6 py-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">{vacationLeft}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                dias disponíveis · {vacationUsed} usados de {totalAllowed}
                {extraDays > 0 && ` (+${extraDays} extra)`}
              </p>
            </div>
            {vacationPending > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                <p className="text-lg font-bold text-amber-700">{vacationPending}</p>
                <p className="text-xs text-amber-600">dias pendentes</p>
              </div>
            )}
          </div>

          {/* Vacation bar */}
          <div className="space-y-1 mb-4">
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  vacationPct >= 90 ? 'bg-red-400' : vacationPct >= 70 ? 'bg-amber-400' : 'bg-indigo-500'
                }`}
                style={{ width: `${vacationPct}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">{vacationPct}% das férias anuais usadas</p>
          </div>

          {/* Pending absences */}
          {(otherPending.length > 0 || vacationPending > 0) && (
            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold text-slate-500 mb-2">Pendentes de aprovação</p>
              <div className="space-y-1.5">
                {absences.filter(a => a.status === 'pending').slice(0, 4).map(a => (
                  <div key={a.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{absenceTypeLabel[a.type] ?? a.type}</span>
                    <span className="text-slate-400">
                      {new Date(a.start_date).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
                      {a.start_date !== a.end_date && ` – ${new Date(a.end_date).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}`}
                      · {a.working_days}d
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {vacationLeft <= 5 && vacationLeft >= 0 && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-700">
                ⚠️ Tens apenas {vacationLeft} dia{vacationLeft !== 1 ? 's' : ''} de férias disponíveis este ano.
              </p>
            </div>
          )}
        </div>
      </section>

    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function ObjRow({ obj, isAnnual = false }: { obj: Objective; isAnnual?: boolean }) {
  const pct = obj.target_value && obj.actual_value != null
    ? Math.min(150, Math.round((obj.actual_value / obj.target_value) * 100))
    : null
  const colors = pct != null ? pctColor(pct) : null
  const weightPct = obj.weight != null ? Math.round(obj.weight * 100) : null

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-900">{obj.title}</p>
            {isAnnual && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">Anual</span>
            )}
          </div>
          {obj.description && (
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{obj.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {weightPct != null && (
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
              {weightPct}%
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${objStatusStyle[obj.status]}`}>
            {objStatusLabel[obj.status]}
          </span>
        </div>
      </div>

      {obj.target_value != null ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">
              {obj.actual_value != null
                ? `${obj.actual_value.toLocaleString('pt-PT')} / ${obj.target_value.toLocaleString('pt-PT')}${obj.unit ? ` ${obj.unit}` : ''}`
                : `Meta: ${obj.target_value.toLocaleString('pt-PT')}${obj.unit ? ` ${obj.unit}` : ''}`}
            </span>
            {pct != null && colors && (
              <span className={`font-bold tabular-nums ${colors.text}`}>
                {pct}%{pct >= 100 && ' ✓'}
              </span>
            )}
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${colors?.bar ?? 'bg-slate-300'}`}
              style={{ width: `${Math.min(100, pct ?? 0)}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-300 italic">Objetivo qualitativo — sem métrica numérica</p>
      )}
    </div>
  )
}

function ContextCard({
  emoji, title, subtitle, objectives,
}: {
  emoji: string
  title: string
  subtitle: string
  objectives: Objective[]
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
        <span className="text-base">{emoji}</span>
        <div>
          <p className="text-xs font-semibold text-slate-700">{title}</p>
          <p className="text-[10px] text-slate-400">{subtitle}</p>
        </div>
      </div>
      <div className="divide-y divide-slate-50">
        {objectives.map(obj => {
          const pct = obj.target_value && obj.actual_value != null
            ? Math.min(150, Math.round((obj.actual_value / obj.target_value) * 100))
            : null
          const colors = pct != null ? pctColor(pct) : null
          return (
            <div key={obj.id} className="px-4 py-3">
              <p className="text-xs font-medium text-slate-700 mb-1.5">{obj.title}</p>
              {obj.target_value != null ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {obj.actual_value != null
                        ? `${obj.actual_value.toLocaleString('pt-PT')}${obj.unit ? ` ${obj.unit}` : ''}`
                        : '—'}
                      {' '}/{' '}{obj.target_value.toLocaleString('pt-PT')}{obj.unit ? ` ${obj.unit}` : ''}
                    </span>
                    {pct != null && colors && (
                      <span className={`font-bold ${colors.text}`}>{pct}%</span>
                    )}
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${colors?.bar ?? 'bg-slate-300'}`}
                      style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  obj.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {objStatusLabel[obj.status]}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
