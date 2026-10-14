import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import type {
  Objective, FinancialRecord, Employee, CostCenterRecord,
  VariableRule, AnnualBonus, VariableModel,
  VariableModel1Data, VariableModel2Data, VariableModel3Data,
} from '@/types/database'
import { DEPARTMENTS, OPERATIONAL_DEPTS } from '@/lib/departments'
import { requirePageAccess } from '@/lib/auth'

const fmt  = (v: number) => v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const pct  = (v: number) => `${Math.round(v * 100)}%`
const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function progressColor(ratio: number) {
  if (ratio >= 1)   return 'bg-emerald-500'
  if (ratio >= 0.8) return 'bg-amber-400'
  return 'bg-red-400'
}
function textColor(ratio: number) {
  if (ratio >= 1)   return 'text-emerald-600'
  if (ratio >= 0.8) return 'text-amber-600'
  return 'text-red-500'
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const { year } = await searchParams
  const now          = new Date()
  const currentYear  = now.getFullYear()
  const filterYear   = Number(year ?? currentYear)
  const currentMonth = now.getMonth() + 1
  const currentQ     = Math.ceil(currentMonth / 3)
  const qMonths      = [1, 2, 3].map(i => (currentQ - 1) * 3 + i)

  const emp      = await requirePageAccess('/')
  const userRole = emp?.app_role
  const userDept = emp?.department ?? null

  const supabase = createAdminClient()

  const [recordsRes, targetsRes, directorsRes, deptObjsRes, marginRes, allCcRes, allTeamObjsRes] = await Promise.all([
    supabase.from('financial_records').select('*').eq('year', filterYear).order('month'),
    supabase.from('objectives').select('*').eq('year', filterYear).eq('unit', '€').in('type', ['team', 'department']),
    supabase.from('employees').select('id, first_name, last_name, department, position_type')
      .eq('status', 'active').eq('position_type', 'director'),
    supabase.from('objectives').select('*').eq('year', filterYear).eq('type', 'department'),
    supabase.from('objectives').select('*')
      .eq('year', filterYear).eq('type', 'team').eq('unit', '%').is('department', null).maybeSingle(),
    supabase.from('cost_center_records').select('cost_center, revenue').eq('year', filterYear),
    supabase.from('objectives').select('*')
      .eq('year', filterYear).eq('type', 'team'),
  ])

  const records      = (recordsRes.data ?? [])       as FinancialRecord[]
  const targets      = (targetsRes.data ?? [])       as Objective[]
  const directors    = (directorsRes.data ?? [])     as Pick<Employee, 'id' | 'first_name' | 'last_name' | 'department' | 'position_type'>[]
  const deptObjs     = (deptObjsRes.data ?? [])      as Objective[]
  const marginTarget = (marginRes.data ?? null)      as Objective | null
  const allCcRecords = (allCcRes.data ?? [])         as Pick<CostCenterRecord, 'cost_center' | 'revenue'>[]
  const allTeamObjs  = (allTeamObjsRes.data ?? [])   as Objective[]

  // ── Department financials for directors ───────────────────────
  let deptCcRecords: CostCenterRecord[] = []
  if (userRole === 'director' && userDept) {
    const { data } = await supabase
      .from('cost_center_records')
      .select('*')
      .eq('year', filterYear)
      .eq('cost_center', userDept)
      .order('month')
    deptCcRecords = (data ?? []) as CostCenterRecord[]
  }

  // ── Employee prize data (employee / director roles) ──────────
  const showPrizeSection = emp != null && ['employee', 'director'].includes(emp.app_role)
  let empCompensation: { variable_model: string | null } | null = null
  let empVariableRule: VariableRule | null = null
  let empIndivObjs: Objective[] = []
  let empBonusHistory: Pick<AnnualBonus, 'id' | 'year' | 'total_amount' | 'first_payment_status' | 'second_payment_status'>[] = []

  if (showPrizeSection && emp) {
    const [compRes, ruleRes, objRes, bonusRes] = await Promise.all([
      supabase.from('compensation')
        .select('variable_model')
        .eq('employee_id', emp.id)
        .is('end_date', null)
        .order('effective_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('variable_rules')
        .select('*')
        .eq('employee_id', emp.id)
        .is('end_date', null)
        .order('effective_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('objectives')
        .select('*')
        .eq('employee_id', emp.id)
        .eq('year', filterYear)
        .neq('status', 'cancelled'),
      supabase.from('annual_bonus')
        .select('id, year, total_amount, first_payment_status, second_payment_status')
        .eq('employee_id', emp.id)
        .order('year', { ascending: false })
        .limit(5),
    ])
    empCompensation = compRes.data as { variable_model: string | null } | null
    empVariableRule = ruleRes.data as VariableRule | null
    empIndivObjs    = (objRes.data  ?? []) as Objective[]
    empBonusHistory = (bonusRes.data ?? []) as typeof empBonusHistory
  }

  // ── Revenue calculations (includes other_revenue) ────────────
  const totalRev        = (r: FinancialRecord) => r.revenue + (r.other_revenue ?? 0) + (r.plunet_revenue ?? 0)
  const monthlyRevenue  = (() => { const r = records.find(rec => rec.month === currentMonth); return r ? totalRev(r) : 0 })()
  const quarterRevenue  = records.filter(r => qMonths.includes(r.month)).reduce((s, r) => s + totalRev(r), 0)
  const ytdRevenue      = records.reduce((s, r) => s + totalRev(r), 0)
  const ytdEbitda       = records.reduce((s, r) => s + r.ebitda, 0)
  const monthsWithData  = records.length

  // ── Cost calculations (for KPI reference) ────────────────────
  const totalCosts = (r: FinancialRecord) => r.fse + r.fse_suppliers + r.direct_costs + r.total_payroll
  const monthRec        = records.find(r => r.month === currentMonth)
  const monthlyCosts    = monthRec && totalCosts(monthRec) > 0 ? totalCosts(monthRec) : null
  const quarterCosts    = (() => { const t = records.filter(r => qMonths.includes(r.month)).reduce((s, r) => s + totalCosts(r), 0); return t > 0 ? t : null })()
  const ytdCosts        = ytdRevenue - ytdEbitda > 0 ? ytdRevenue - ytdEbitda : null

  const companyObj      = targets.find(t => t.type === 'team') ?? null
  const annualTarget    = companyObj?.target_value ?? null
  const minimumBase     = companyObj?.minimum_base ?? null

  // Zona de prémio = target - base (só acima da base conta para o prémio)
  const prizeZone       = annualTarget != null && minimumBase != null ? annualTarget - minimumBase : null
  const aboveBase       = minimumBase  != null ? Math.max(0, ytdRevenue - minimumBase) : null

  // Rácio de prémio (0–100% da zona de prémio)
  const prizeRatio      = prizeZone != null && prizeZone > 0 && aboveBase != null ? aboveBase / prizeZone : null
  // Rácio de cobertura simples (para referência: YTD / target anual)
  const coverageRatio   = annualTarget ? ytdRevenue / annualTarget : null

  const monthlyTarget   = annualTarget ? annualTarget / 12 : null
  const quarterlyTarget = annualTarget ? annualTarget / 4  : null

  const ytdRatio  = prizeRatio  ?? coverageRatio  // usar prizeRatio se disponível
  const mRatio    = monthlyTarget   ? monthlyRevenue / monthlyTarget  : null
  const qRatio    = quarterlyTarget ? quarterRevenue / quarterlyTarget : null

  // ── EBITDA margin (for management prize) ────────────────────
  const actualMarginPct      = ytdRevenue > 0 ? (ytdEbitda / ytdRevenue) * 100 : null
  const marginTargetPct      = marginTarget?.target_value ?? null
  const marginAchievementRatio = (actualMarginPct != null && marginTargetPct != null && marginTargetPct > 0)
    ? actualMarginPct / marginTargetPct
    : null
  // Management prize eligibility: revenue above base AND margin met
  const revenueConditionMet  = minimumBase != null ? ytdRevenue >= minimumBase : (coverageRatio != null && coverageRatio >= 1)
  const marginConditionMet   = actualMarginPct != null && marginTargetPct != null && actualMarginPct >= marginTargetPct

  // ── Department billing targets & actuals from ccRecords ──────
  const deptTargetMap = Object.fromEntries(
    targets.filter(t => t.type === 'department').map(t => [t.department!, t])
  )
  const deptYtdRevenue = (dept: string) =>
    allCcRecords.filter(r => r.cost_center === dept).reduce((s, r) => s + r.revenue, 0)

  // ── Department aggregates (director view) ────────────────────
  const ytdDeptRev    = deptCcRecords.reduce((s, r) => s + r.revenue, 0)
  const ytdDeptFse    = deptCcRecords.reduce((s, r) => s + r.fse, 0)
  const ytdDeptDc     = deptCcRecords.reduce((s, r) => s + r.direct_costs, 0)
  const ytdDeptPay    = deptCcRecords.reduce((s, r) => s + r.payroll, 0)
  const ytdDeptEbitda = ytdDeptRev - ytdDeptFse - ytdDeptDc - ytdDeptPay
  const ytdDeptMargin = ytdDeptRev > 0 ? ytdDeptEbitda / ytdDeptRev : null
  const deptObj       = userDept ? (deptTargetMap[userDept] ?? null) : null
  const deptTarget    = deptObj?.target_value ?? null
  const deptBase      = deptObj?.minimum_base ?? null
  const deptActual    = deptObj?.actual_value ?? null
  const deptRatio     = deptTarget && deptActual != null ? deptActual / deptTarget : null

  // ── Director stats ────────────────────────────────────────────
  type DirStat = {
    id: string; name: string; dept: string
    total: number; inProgress: number; completed: number; avgPct: number | null
  }
  const dirStats: DirStat[] = directors.map(d => {
    const objs = deptObjs.filter(o => o.department === d.department)
    const withPct = objs.filter(o => o.target_value && o.actual_value != null)
    const avgPct = withPct.length > 0
      ? withPct.reduce((s, o) => s + o.actual_value! / o.target_value!, 0) / withPct.length
      : null
    return {
      id: d.id,
      name: `${d.first_name} ${d.last_name}`,
      dept: d.department ?? '—',
      total: objs.length,
      inProgress: objs.filter(o => o.status === 'in_progress').length,
      completed:  objs.filter(o => o.status === 'completed').length,
      avgPct,
    }
  })

  // ── Prize calculations ────────────────────────────────────────
  const empModel    = (empCompensation?.variable_model ?? null) as VariableModel | null
  const maxVariable = empVariableRule?.max_variable_amount ?? null

  const indivObjsWithData = empIndivObjs.filter(
    o => o.target_value && o.target_value > 0 && o.actual_value != null
  )
  const avgIndivAchievement = indivObjsWithData.length > 0
    ? indivObjsWithData.reduce((s, o) => s + o.actual_value! / o.target_value!, 0) / indivObjsWithData.length
    : null

  let estimatedPrize:      number | null = null
  let currentPrizePctOfMax: number | null = null
  type NextTierInfo = { missingRev: number; gain: number; nextPct: number; currentPct: number }
  let nextTierInfo: NextTierInfo | null = null
  let model3Split: { teamAmount: number; indivAmount: number; teamWeight: number; indivWeight: number } | null = null

  if (empVariableRule && maxVariable && empModel) {
    if (empModel === '1' && annualTarget) {
      const rd         = empVariableRule.rule_data as VariableModel1Data
      const achievePct = (ytdRevenue / annualTarget) * 100
      const sorted     = [...rd.tiers].sort((a, b) => a.min - b.min)
      const activeTier = [...sorted].reverse().find(t => achievePct >= t.min)
      const nextTierRow = sorted.find(t => t.min > achievePct)
      currentPrizePctOfMax = activeTier?.pct ?? 0
      estimatedPrize       = maxVariable * (currentPrizePctOfMax / 100)
      if (nextTierRow) {
        nextTierInfo = {
          missingRev: Math.max(0, (nextTierRow.min / 100) * annualTarget - ytdRevenue),
          gain:        maxVariable * ((nextTierRow.pct - (activeTier?.pct ?? 0)) / 100),
          nextPct:     nextTierRow.pct,
          currentPct:  activeTier?.pct ?? 0,
        }
      }
    } else if (empModel === '2' && avgIndivAchievement != null) {
      currentPrizePctOfMax = Math.min(150, avgIndivAchievement * 100)
      estimatedPrize       = maxVariable * Math.min(1.5, avgIndivAchievement)
    } else if (empModel === '3') {
      const rd       = empVariableRule.rule_data as VariableModel3Data
      const teamAch  = Math.min(1, coverageRatio ?? 0)
      const indivAch = Math.min(1, avgIndivAchievement ?? 0)
      const teamAmt  = maxVariable * rd.team_weight  * teamAch
      const indivAmt = maxVariable * rd.individual_weight * indivAch
      estimatedPrize       = teamAmt + indivAmt
      currentPrizePctOfMax = (estimatedPrize / maxVariable) * 100
      model3Split = {
        teamAmount: teamAmt, indivAmount: indivAmt,
        teamWeight: rd.team_weight, indivWeight: rd.individual_weight,
      }
    }
  }

  // ── Pace projection ───────────────────────────────────────────
  const monthlyAvg      = monthsWithData > 0 ? ytdRevenue / monthsWithData : 0
  const projectedAnnual = monthlyAvg * 12
  const projectedRatio  = annualTarget ? projectedAnnual / annualTarget : null

  // ── Quarter & year countdown ──────────────────────────────────
  const msDay         = 1000 * 60 * 60 * 24
  const qEndDate      = new Date(now.getFullYear(), currentQ * 3, 0) // último dia do trimestre
  const daysToQEnd    = Math.max(0, Math.ceil((qEndDate.getTime() - now.getTime()) / msDay))
  const daysToYearEnd = Math.max(0, Math.ceil((new Date(now.getFullYear(), 11, 31).getTime() - now.getTime()) / msDay))

  return (
    <div className="p-8 space-y-8">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {now.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}Q{currentQ} {currentYear}
          </p>
        </div>
        {/* Year selector */}
        <div className="flex items-center gap-2">
          {[currentYear - 1, currentYear, currentYear + 1].map(y => (
            <Link
              key={y}
              href={`/?year=${y}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                y === filterYear
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Objetivo Anual — hero ─────────────────────────────────── */}
      <section>
        {annualTarget ? (
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl p-6 text-white">
            <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
              <div>
                <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wider mb-1">
                  Objetivo anual de faturação — {filterYear}
                </p>
                <p className="text-5xl font-bold tabular-nums">{fmt(annualTarget)}</p>
                {minimumBase != null && (
                  <p className="text-indigo-300 text-xs mt-1.5">
                    Base mínima: <strong className="text-white">{fmt(minimumBase)}</strong>
                    {prizeZone != null && (
                      <span className="ml-2">· Zona de prémio: <strong className="text-amber-300">{fmt(prizeZone)}</strong></span>
                    )}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-indigo-200 text-xs mb-1">Realizado YTD</p>
                <p className="text-3xl font-bold tabular-nums">{fmt(ytdRevenue)}</p>
                {minimumBase != null ? (
                  <div className="mt-1 text-right">
                    {ytdRevenue >= minimumBase ? (
                      <p className="text-xs text-emerald-300 font-semibold">
                        ✓ Base mínima atingida
                      </p>
                    ) : (
                      <p className="text-xs text-amber-300 font-semibold">
                        Falta {fmt(minimumBase - ytdRevenue)} para a base mínima
                      </p>
                    )}
                    {aboveBase != null && aboveBase > 0 && prizeZone != null && (
                      <p className="text-xs text-white/70 mt-0.5">
                        {fmt(aboveBase)} na zona de prémio ({pct(prizeRatio ?? 0)})
                      </p>
                    )}
                  </div>
                ) : (
                  <p className={`text-sm font-semibold mt-1 ${
                    coverageRatio == null ? 'text-indigo-300'
                    : coverageRatio >= 1 ? 'text-emerald-300'
                    : coverageRatio >= 0.8 ? 'text-amber-300'
                    : 'text-red-300'
                  }`}>
                    {coverageRatio != null ? `${pct(coverageRatio)} da meta anual` : 'Sem registos'}
                  </p>
                )}
              </div>
            </div>

            {/* Progress bar com marcador da base mínima */}
            <div className="relative w-full mb-1">
              {/* Fundo total */}
              <div className="w-full bg-white/20 rounded-full h-3 overflow-hidden">
                {/* Zona abaixo da base — cinza claro */}
                {minimumBase != null && (
                  <div
                    className="absolute top-0 left-0 h-3 bg-white/10 rounded-l-full"
                    style={{ width: `${Math.min(100, (minimumBase / annualTarget) * 100)}%` }}
                  />
                )}
                {/* Progresso realizado */}
                <div
                  className={`h-3 rounded-full transition-all ${
                    prizeRatio != null
                      ? prizeRatio >= 1 ? 'bg-emerald-400' : prizeRatio >= 0.5 ? 'bg-amber-300' : 'bg-white/60'
                      : 'bg-white'
                  }`}
                  style={{ width: `${Math.min(100, (ytdRevenue / annualTarget) * 100)}%` }}
                />
              </div>
              {/* Marcador da base mínima */}
              {minimumBase != null && (
                <div
                  className="absolute top-0 h-3 w-0.5 bg-amber-300"
                  style={{ left: `${Math.min(99, (minimumBase / annualTarget) * 100)}%` }}
                />
              )}
            </div>
            <div className="flex justify-between text-xs text-indigo-300 mb-5">
              <span>0</span>
              {minimumBase != null && (
                <span className="text-amber-300 font-medium" style={{ marginLeft: `${(minimumBase / annualTarget) * 100 - 10}%` }}>
                  {fmt(minimumBase)} base
                </span>
              )}
              <span>{fmt(annualTarget)}</span>
            </div>

            {/* Sub-targets row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/10 rounded-xl p-4">
                <p className="text-indigo-200 text-xs font-medium mb-2">
                  Meta mensal · {MONTH_NAMES[currentMonth - 1]}
                </p>
                <p className="text-xl font-bold tabular-nums">{monthlyTarget ? fmt(monthlyTarget) : '—'}</p>
                {mRatio != null && (
                  <p className={`text-xs font-semibold mt-1.5 ${mRatio >= 1 ? 'text-emerald-300' : mRatio >= 0.8 ? 'text-amber-300' : 'text-red-300'}`}>
                    {fmt(monthlyRevenue)} · {pct(mRatio)}
                  </p>
                )}
              </div>
              <div className="bg-white/10 rounded-xl p-4">
                <p className="text-indigo-200 text-xs font-medium mb-2">
                  Meta trimestral · Q{currentQ}
                </p>
                <p className="text-xl font-bold tabular-nums">{quarterlyTarget ? fmt(quarterlyTarget) : '—'}</p>
                {qRatio != null && (
                  <p className={`text-xs font-semibold mt-1.5 ${qRatio >= 1 ? 'text-emerald-300' : qRatio >= 0.8 ? 'text-amber-300' : 'text-red-300'}`}>
                    {fmt(quarterRevenue)} · {pct(qRatio)}
                  </p>
                )}
              </div>
              <div className="bg-white/10 rounded-xl p-4">
                <p className="text-indigo-200 text-xs font-medium mb-2">EBITDA acumulado</p>
                <p className="text-xl font-bold tabular-nums">{fmt(ytdEbitda)}</p>
                {ytdRevenue > 0 && (
                  <p className="text-xs font-semibold mt-1.5 text-indigo-200">
                    Margem: {pct(ytdEbitda / ytdRevenue)}
                  </p>
                )}
              </div>
            </div>

            {monthsWithData > 0 && (
              <p className="text-indigo-300/70 text-xs mt-4">
                {monthsWithData} {monthsWithData === 1 ? 'mês registado' : 'meses registados'} em {filterYear}
              </p>
            )}
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-semibold text-amber-900">Objetivo anual não definido para {filterYear}</p>
              <p className="text-sm text-amber-700 mt-0.5">
                Define o objetivo de faturação para acompanhar o progresso da empresa.
              </p>
            </div>
            <Link href="/financeiro"
              className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors whitespace-nowrap">
              Definir objetivo →
            </Link>
          </div>
        )}
      </section>

      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label={`${MONTH_NAMES[currentMonth - 1]} ${filterYear}`}
          sub="Faturação do mês"
          value={fmt(monthlyRevenue)}
          target={monthlyTarget ? fmt(monthlyTarget) : null}
          ratio={mRatio}
          costs={monthlyCosts ? -monthlyCosts : null}
        />
        <KpiCard
          label={`Q${currentQ} ${filterYear}`}
          sub="Faturação trimestral"
          value={fmt(quarterRevenue)}
          target={quarterlyTarget ? fmt(quarterlyTarget) : null}
          ratio={qRatio}
          costs={quarterCosts ? -quarterCosts : null}
        />
        <KpiCard
          label={`Acumulado ${filterYear}`}
          sub={`${monthsWithData} ${monthsWithData === 1 ? 'mês registado' : 'meses registados'}`}
          value={fmt(ytdRevenue)}
          target={annualTarget ? fmt(annualTarget) : null}
          ratio={coverageRatio}
          costs={ytdCosts ? -ytdCosts : null}
        />
        <KpiCard
          label="EBITDA acumulado"
          sub="Resultado operacional YTD"
          value={fmt(ytdEbitda)}
          ratio={ytdRevenue > 0 ? ytdEbitda / ytdRevenue : null}
          ratioLabel="margem"
        />
      </section>

      {/* ── Tendência mensal ──────────────────────────────────────── */}
      {records.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tendência mensal — {filterYear}</h2>
              {monthlyTarget && (
                <p className="text-xs text-slate-400 mt-0.5">
                  <span className="inline-block w-3 border-t border-dashed border-indigo-400 mr-1 align-middle" />
                  Meta mensal: {fmt(monthlyTarget)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" /> ≥ meta</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" /> ≥ 80%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400 inline-block" /> &lt; 80%</span>
            </div>
          </div>
          <MonthlyChart
            records={records}
            annualTarget={annualTarget}
            currentMonth={currentMonth}
            filterYear={filterYear}
          />
        </section>
      )}

      {/* ── Prémio estimado (employee / director) ────────────────── */}
      {showPrizeSection && empModel && (
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            O teu prémio — {filterYear}
          </h2>

          {/* ── Hero card ─────────────────────────────────────────── */}
          <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-6 text-white">
            <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
              <div>
                <p className="text-amber-100 text-xs font-semibold uppercase tracking-wider mb-1">
                  Prémio estimado
                </p>
                <p className="text-5xl font-bold tabular-nums">
                  {estimatedPrize != null ? fmt(estimatedPrize) : '—'}
                </p>
                <p className="text-amber-200 text-xs mt-1.5">
                  {maxVariable != null
                    ? <>Potencial máximo: <strong className="text-white">{fmt(maxVariable)}</strong> · Modelo {empModel}</>
                    : `Modelo ${empModel} · Valor máximo não definido`}
                </p>
              </div>
              {currentPrizePctOfMax != null && (
                <div className="text-right">
                  <p className="text-amber-200 text-xs mb-1">% do máximo</p>
                  <p className="text-3xl font-bold tabular-nums">{Math.round(currentPrizePctOfMax)}%</p>
                  {estimatedPrize != null && maxVariable != null && maxVariable > estimatedPrize && (
                    <p className="text-amber-200 text-xs mt-1">
                      faltam {fmt(maxVariable - estimatedPrize)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {currentPrizePctOfMax != null && (
              <div className="w-full bg-white/20 rounded-full h-3 overflow-hidden mb-4">
                <div
                  className={`h-3 rounded-full transition-all ${
                    currentPrizePctOfMax >= 100 ? 'bg-emerald-400'
                    : currentPrizePctOfMax >= 60  ? 'bg-white/80'
                    : 'bg-white/50'
                  }`}
                  style={{ width: `${Math.min(100, currentPrizePctOfMax)}%` }}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-amber-200">
              {empModel === '1' && annualTarget && (
                <>
                  <span>Faturação atual: <strong className="text-white">{fmt(ytdRevenue)}</strong></span>
                  <span>Meta anual: <strong className="text-white">{fmt(annualTarget)}</strong></span>
                  {coverageRatio != null && (
                    <span>Realizado: <strong className="text-white">{pct(coverageRatio)}</strong></span>
                  )}
                </>
              )}
              {empModel === '3' && model3Split && (
                <>
                  <span>Equipa ({(model3Split.teamWeight * 100).toFixed(0)}%): <strong className="text-white">{fmt(model3Split.teamAmount)}</strong></span>
                  <span>Individual ({(model3Split.indivWeight * 100).toFixed(0)}%): <strong className="text-white">{fmt(model3Split.indivAmount)}</strong></span>
                </>
              )}
              {daysToYearEnd > 0 && (
                <span className="text-amber-300/70">faltam {daysToYearEnd} dias para fechar o ano</span>
              )}
            </div>
          </div>

          {/* ── 3 info cards ──────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

            {/* Card 1 — próximo nível / objetivos */}
            {empModel === '1' && nextTierInfo ? (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Próximo nível</p>
                <p className="text-2xl font-bold text-indigo-600 tabular-nums">+{fmt(nextTierInfo.gain)}</p>
                <p className="text-sm text-slate-700 mt-0.5 font-medium">de prémio adicional</p>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Faturar mais <strong className="text-slate-800">{fmt(nextTierInfo.missingRev)}</strong> para{' '}
                  passar de {nextTierInfo.currentPct}% → {nextTierInfo.nextPct}% do prémio máximo
                </p>
              </div>
            ) : empModel === '1' && currentPrizePctOfMax != null && currentPrizePctOfMax >= 100 ? (
              <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-3">Prémio máximo</p>
                <p className="text-2xl font-bold text-emerald-700">✓ Atingido!</p>
                <p className="text-xs text-emerald-600 mt-2">Estás no nível máximo de prémio.</p>
              </div>
            ) : (empModel === '2' || empModel === '3') ? (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Objetivos individuais</p>
                {avgIndivAchievement != null ? (
                  <>
                    <p className="text-2xl font-bold tabular-nums text-indigo-600">
                      {pct(Math.min(1, avgIndivAchievement))}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      média de {indivObjsWithData.length} objetivo{indivObjsWithData.length !== 1 ? 's' : ''} com dados
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-400">Sem objetivos com dados ainda.</p>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Próximo nível</p>
                <p className="text-sm text-slate-400">Objetivo anual não definido.</p>
              </div>
            )}

            {/* Card 2 — projeção de ritmo */}
            <div className={`rounded-xl border p-5 ${
              projectedRatio == null  ? 'bg-white border-slate-200'
              : projectedRatio >= 1   ? 'bg-emerald-50 border-emerald-200'
              : projectedRatio >= 0.8 ? 'bg-amber-50 border-amber-200'
              : 'bg-red-50 border-red-200'
            }`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
                projectedRatio == null  ? 'text-slate-500'
                : projectedRatio >= 1   ? 'text-emerald-600'
                : projectedRatio >= 0.8 ? 'text-amber-600'
                : 'text-red-600'
              }`}>Projeção de ritmo</p>
              {projectedRatio != null && monthsWithData > 0 ? (
                <>
                  <p className={`text-2xl font-bold tabular-nums ${
                    projectedRatio >= 1 ? 'text-emerald-700' : projectedRatio >= 0.8 ? 'text-amber-700' : 'text-red-700'
                  }`}>{pct(projectedRatio)} da meta</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Proj. anual: <strong className="text-slate-700">{fmt(projectedAnnual)}</strong>
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">Média mensal: {fmt(monthlyAvg)}</p>
                </>
              ) : (
                <p className="text-sm text-slate-400">Sem dados suficientes.</p>
              )}
            </div>

            {/* Card 3 — countdown do trimestre */}
            <div className={`rounded-xl border p-5 ${
              daysToQEnd <= 10 ? 'bg-red-50 border-red-200'
              : daysToQEnd <= 21 ? 'bg-amber-50 border-amber-200'
              : 'bg-white border-slate-200'
            }`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
                daysToQEnd <= 10 ? 'text-red-600' : daysToQEnd <= 21 ? 'text-amber-600' : 'text-slate-500'
              }`}>Q{currentQ} termina em</p>
              <p className={`text-2xl font-bold tabular-nums ${
                daysToQEnd <= 10 ? 'text-red-700' : daysToQEnd <= 21 ? 'text-amber-700' : 'text-slate-800'
              }`}>{daysToQEnd === 0 ? 'Hoje!' : `${daysToQEnd} dias`}</p>
              <p className="text-xs text-slate-500 mt-1">
                {qEndDate.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              {qRatio != null && (
                <p className={`text-xs font-semibold mt-2 ${
                  qRatio >= 1 ? 'text-emerald-600' : qRatio >= 0.8 ? 'text-amber-600' : 'text-red-600'
                }`}>Q{currentQ}: {pct(qRatio)} da meta trimestral</p>
              )}
            </div>
          </div>

          {/* ── Objetivos individuais ──────────────────────────────── */}
          {empIndivObjs.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Os meus objetivos — {filterYear}
                </h3>
                <Link href="/objetivos" className="text-xs text-indigo-600 hover:underline">
                  Gerir objetivos →
                </Link>
              </div>
              <div className="space-y-4">
                {empIndivObjs.map(obj => {
                  const objRatio = obj.target_value && obj.actual_value != null
                    ? obj.actual_value / obj.target_value : null
                  return (
                    <div key={obj.id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-sm font-medium text-slate-800 truncate flex-1 mr-3">{obj.title}</p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {objRatio != null && (
                            <span className={`text-xs font-bold tabular-nums ${textColor(Math.min(1, objRatio))}`}>
                              {pct(Math.min(1, objRatio))}
                            </span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            obj.status === 'completed'  ? 'bg-emerald-100 text-emerald-700'
                            : obj.status === 'in_progress' ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-500'
                          }`}>
                            {obj.status === 'completed' ? 'Concluído'
                              : obj.status === 'in_progress' ? 'Em curso'
                              : 'Pendente'}
                          </span>
                        </div>
                      </div>
                      {obj.target_value != null && (
                        <>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full transition-all ${progressColor(objRatio ?? 0)}`}
                              style={{ width: `${Math.min(100, (objRatio ?? 0) * 100)}%` }}
                            />
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {obj.actual_value ?? 0} / {obj.target_value} {obj.unit ?? ''}
                          </p>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Histórico de prémios ──────────────────────────────── */}
          {empBonusHistory.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
                Histórico de prémios
              </h3>
              <div className="divide-y divide-slate-50">
                {empBonusHistory.map(b => {
                  const paid    = b.first_payment_status === 'paid' && b.second_payment_status === 'paid'
                  const partial = b.first_payment_status === 'paid' || b.second_payment_status === 'paid'
                  return (
                    <div key={b.id} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-700 w-12 tabular-nums">{b.year}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          paid    ? 'bg-emerald-100 text-emerald-700'
                          : partial ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-500'
                        }`}>
                          {paid ? 'Pago' : partial ? 'Parcial' : 'Pendente'}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-slate-800 tabular-nums">
                        {fmt(b.total_amount)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Vista do departamento (Diretores) ────────────────────── */}
      {userRole === 'director' && userDept && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              O teu departamento — {userDept} · {filterYear}
            </h2>
          </div>

          {deptCcRecords.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <p className="text-slate-400 text-sm">Sem dados financeiros lançados para {userDept} em {filterYear}.</p>
              <p className="text-xs text-slate-300 mt-1">Os dados são introduzidos em Financeiro → Registos mensais.</p>
            </div>
          ) : (
            <>
              {/* YTD KPI cards */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard
                  label="Faturação YTD"
                  sub={`${deptCcRecords.length} ${deptCcRecords.length === 1 ? 'mês registado' : 'meses registados'}`}
                  value={fmt(ytdDeptRev)}
                  target={deptTarget ? fmt(deptTarget) : null}
                  ratio={deptRatio}
                />
                <KpiCard
                  label="FSE"
                  sub="Fornecimentos e serviços externos"
                  value={fmt(ytdDeptFse)}
                />
                <KpiCard
                  label="Custos diretos + Massa sal."
                  sub="Custos operacionais YTD"
                  value={fmt(ytdDeptDc + ytdDeptPay)}
                />
                <KpiCard
                  label="EBITDA departamental"
                  sub="Resultado operacional YTD"
                  value={fmt(ytdDeptEbitda)}
                  ratio={ytdDeptMargin}
                  ratioLabel="margem"
                />
              </div>

              {/* Dept target progress bar */}
              {deptTarget && deptActual != null && (
                <div className={`rounded-xl border p-4 ${
                  deptBase != null && deptActual >= deptBase ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-700">
                      Objetivo de faturação — {userDept}
                    </p>
                    <p className="text-xs font-semibold text-slate-700 tabular-nums">
                      {fmt(deptActual)} / {fmt(deptTarget)}
                      {deptRatio != null && (
                        <span className={`ml-2 ${textColor(deptRatio)}`}>{pct(deptRatio)}</span>
                      )}
                    </p>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${progressColor(deptRatio ?? 0)}`}
                      style={{ width: `${Math.min(100, (deptActual / deptTarget) * 100)}%` }}
                    />
                  </div>
                  {deptBase != null && (
                    <p className="text-xs text-slate-500 mt-1.5">
                      Base mínima: <strong>{fmt(deptBase)}</strong>
                      {deptActual >= deptBase
                        ? <span className="ml-2 text-emerald-600 font-semibold">✓ atingida</span>
                        : <span className="ml-2 text-amber-600 font-semibold">falta {fmt(deptBase - deptActual)}</span>
                      }
                    </p>
                  )}
                </div>
              )}

              {/* Monthly breakdown table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left  px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Mês</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Faturação</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">FSE</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Custos dir.</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Massa sal.</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">EBITDA dept.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deptCcRecords.map(r => {
                      const rowEbitda = r.revenue - r.fse - r.direct_costs - r.payroll
                      return (
                        <tr key={r.month} className="hover:bg-slate-50">
                          <td className="px-5 py-3 font-medium text-slate-700">{MONTH_NAMES[r.month - 1]}</td>
                          <td className="px-5 py-3 text-right font-medium text-slate-900">{fmt(r.revenue)}</td>
                          <td className="px-5 py-3 text-right text-slate-500">{r.fse > 0 ? fmt(r.fse) : '—'}</td>
                          <td className="px-5 py-3 text-right text-slate-500">{r.direct_costs > 0 ? fmt(r.direct_costs) : '—'}</td>
                          <td className="px-5 py-3 text-right text-slate-500">{r.payroll > 0 ? fmt(r.payroll) : '—'}</td>
                          <td className={`px-5 py-3 text-right font-semibold ${rowEbitda >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {fmt(rowEbitda)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td className="px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">YTD</td>
                      <td className="px-5 py-3 text-right text-sm font-bold text-slate-900">{fmt(ytdDeptRev)}</td>
                      <td className="px-5 py-3 text-right text-sm font-semibold text-slate-600">{ytdDeptFse > 0 ? fmt(ytdDeptFse) : '—'}</td>
                      <td className="px-5 py-3 text-right text-sm font-semibold text-slate-600">{ytdDeptDc > 0 ? fmt(ytdDeptDc) : '—'}</td>
                      <td className="px-5 py-3 text-right text-sm font-semibold text-slate-600">{ytdDeptPay > 0 ? fmt(ytdDeptPay) : '—'}</td>
                      <td className={`px-5 py-3 text-right text-sm font-bold ${ytdDeptEbitda >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {fmt(ytdDeptEbitda)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Objetivos por departamento ───────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Objetivos — {filterYear}
          </h2>
          <Link href="/objetivos" className="text-xs text-indigo-600 hover:underline">
            Gerir objetivos →
          </Link>
        </div>

        {/* ── Objetivos de equipa — aparecem primeiro ── */}
        {allTeamObjs.length > 0 && (
          <>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Objetivos de equipa
            </p>
            <div className="grid grid-cols-2 gap-3">
              {allTeamObjs.map(obj => {
                const isEbitdaPct  = obj.unit === '%' &&
                  (obj.title.toLowerCase().includes('ebitda') || obj.title.toLowerCase().includes('margem'))
                const isRevenuePct = obj.unit === '€' && obj.department == null
                const actual = isEbitdaPct
                  ? (ytdRevenue > 0 ? (ytdEbitda / ytdRevenue) * 100 : null)
                  : isRevenuePct
                    ? ytdRevenue
                    : obj.actual_value
                const target = obj.target_value
                const ratio  = target && actual != null ? actual / target : null
                const barPct = ratio != null ? Math.min(ratio * 100, 100) : 0
                const perfBar  = ratio == null ? 'bg-slate-200' : ratio >= 1 ? 'bg-emerald-400' : ratio >= 0.8 ? 'bg-amber-400' : 'bg-red-400'
                const perfText = ratio == null ? 'text-slate-400' : ratio >= 1 ? 'text-emerald-600' : ratio >= 0.8 ? 'text-amber-600' : 'text-red-500'
                return (
                  <div key={obj.id} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {obj.title}
                        </p>
                      </div>
                      {ratio != null && (
                        <span className={`text-lg font-bold tabular-nums ${perfText}`}>{pct(ratio)}</span>
                      )}
                    </div>
                    {actual != null ? (
                      <p className="text-2xl font-bold text-slate-900 tabular-nums leading-none">
                        {obj.unit === '%' ? `${actual.toFixed(1)}%` : fmt(actual)}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-300 italic">sem dados reais</p>
                    )}
                    <div className="space-y-1">
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${perfBar}`} style={{ width: `${barPct}%` }} />
                      </div>
                      <p className="text-xs text-slate-400">
                        {target != null
                          ? `Meta: ${obj.unit === '%' ? `${target}%` : fmt(target)}`
                          : 'Sem meta definida'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── Faturação por departamento operacional ── */}
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Faturação por departamento
        </p>
        <div className="grid grid-cols-2 gap-3">
          {OPERATIONAL_DEPTS.map((dept, i) => {
            const obj      = deptTargetMap[dept]
            const actual   = deptYtdRevenue(dept)
            const target   = obj?.target_value ?? null
            const base     = obj?.minimum_base ?? null
            const ratio    = target ? actual / target : null
            const barPct   = ratio != null ? Math.min(ratio * 100, 100) : 0

            const deptAccent = [
              { border: 'border-indigo-200',  bar: 'bg-indigo-400',  label: 'bg-indigo-50 text-indigo-700'  },
              { border: 'border-purple-200',  bar: 'bg-purple-400',  label: 'bg-purple-50 text-purple-700'  },
              { border: 'border-pink-200',    bar: 'bg-pink-400',    label: 'bg-pink-50 text-pink-700'      },
              { border: 'border-orange-200',  bar: 'bg-orange-400',  label: 'bg-orange-50 text-orange-700'  },
            ][i]

            const perfBar  = ratio == null ? 'bg-slate-200'
              : ratio >= 1   ? 'bg-emerald-400'
              : ratio >= 0.8 ? 'bg-amber-400'
              : 'bg-red-400'

            const perfText = ratio == null ? 'text-slate-400'
              : ratio >= 1   ? 'text-emerald-600'
              : ratio >= 0.8 ? 'text-amber-600'
              : 'text-red-500'

            return (
              <div key={dept} className={`bg-white rounded-xl border ${deptAccent.border} p-5 space-y-3`}>
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${deptAccent.label}`}>
                      {dept}
                    </span>
                  </div>
                  {ratio != null && (
                    <span className={`text-lg font-bold tabular-nums ${perfText}`}>
                      {pct(ratio)}
                    </span>
                  )}
                </div>

                {/* Big number */}
                <p className="text-2xl font-bold text-slate-900 tabular-nums leading-none">
                  {fmt(actual)}
                </p>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${perfBar}`} style={{ width: `${barPct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      {target ? `Meta: ${fmt(target)}` : 'Sem meta definida'}
                    </span>
                    {base != null && (
                      <span className={`font-medium ${actual >= base ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {actual >= base ? '✓ acima da base' : `base ${fmt(base)}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

      </section>


    </div>
  )
}

function MonthlyChart({
  records, annualTarget, currentMonth, filterYear,
}: {
  records: FinancialRecord[]
  annualTarget: number | null
  currentMonth: number
  filterYear: number
}) {
  const monthlyTarget = annualTarget ? annualTarget / 12 : null
  const totalRev = (r: FinancialRecord) => r.revenue + (r.other_revenue ?? 0) + (r.plunet_revenue ?? 0)
  const values = records.map(r => totalRev(r))
  const maxVal = Math.max(monthlyTarget ?? 0, ...values, 1) * 1.2

  const W = 700, H = 110, BOTTOM = 22
  const barW = 36
  const slotW = W / 12

  const isCurrentYear = filterYear === new Date().getFullYear()

  return (
    <svg viewBox={`0 0 ${W} ${H + BOTTOM}`} className="w-full" aria-label="Tendência mensal">
      {/* Target dashed line */}
      {monthlyTarget != null && (
        <line
          x1={0} y1={H - (monthlyTarget / maxVal) * H}
          x2={W} y2={H - (monthlyTarget / maxVal) * H}
          stroke="#6366f1" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.5"
        />
      )}
      {/* Baseline */}
      <line x1={0} y1={H} x2={W} y2={H} stroke="#e2e8f0" strokeWidth="1" />

      {Array.from({ length: 12 }, (_, i) => {
        const month = i + 1
        const rec = records.find(r => r.month === month)
        const revenue = rec ? totalRev(rec) : 0
        const ratio = monthlyTarget ? revenue / monthlyTarget : null
        const isFuture = isCurrentYear && month > currentMonth
        const hasData = revenue > 0

        const x = i * slotW + (slotW - barW) / 2
        const barH = hasData ? Math.max(4, (revenue / maxVal) * H) : 0

        const fill = isFuture || !hasData ? '#e2e8f0'
          : ratio == null ? '#818cf8'
          : ratio >= 1 ? '#10b981'
          : ratio >= 0.8 ? '#f59e0b'
          : '#ef4444'

        const isCurrentMonth = isCurrentYear && month === currentMonth

        return (
          <g key={month}>
            {/* Bar */}
            <rect x={x} y={H - barH} width={barW} height={barH} fill={fill} rx="4" />
            {/* Current month ring */}
            {isCurrentMonth && (
              <rect x={x - 1} y={H - barH - 1} width={barW + 2} height={barH + 2}
                fill="none" stroke="#6366f1" strokeWidth="1.5" rx="5" opacity="0.6" />
            )}
            {/* Value label */}
            {hasData && (
              <text
                x={x + barW / 2} y={H - barH - 5}
                textAnchor="middle" fontSize="8.5"
                fill={isFuture ? '#cbd5e1' : '#64748b'}
              >
                {(revenue / 1000).toFixed(revenue >= 10000 ? 0 : 1)}k
              </text>
            )}
            {/* Month label */}
            <text
              x={x + barW / 2} y={H + 15}
              textAnchor="middle" fontSize="9.5"
              fill={isCurrentMonth ? '#4f46e5' : '#94a3b8'}
              fontWeight={isCurrentMonth ? 'bold' : 'normal'}
            >
              {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][i]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function KpiCard({
  label, sub, value, target, ratio, ratioLabel = 'meta', costs,
}: {
  label: string; sub: string; value: string
  target?: string | null; ratio?: number | null; ratioLabel?: string
  costs?: number | null
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-xs text-slate-400 mt-0.5 mb-3">{sub}</p>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {costs != null && (
        <p className="text-xs text-red-400 tabular-nums mt-0.5 leading-tight">
          {costs.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, signDisplay: 'always' })} custos
        </p>
      )}
      {ratio != null && !target && (
        <p className="text-xs font-semibold mt-1.5 text-amber-400">
          {ratioLabel}: {pct(ratio)}
        </p>
      )}
      {target && (
        <p className="text-xs text-slate-400 mt-1.5">
          Meta: {target}
          {ratio != null && (
            <span className={`ml-2 font-semibold ${textColor(ratio)}`}>
              {pct(ratio)} {ratioLabel}
            </span>
          )}
        </p>
      )}
    </div>
  )
}
