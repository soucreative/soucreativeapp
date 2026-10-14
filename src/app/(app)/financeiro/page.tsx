import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Objective, FinancialRecord, CostCenterRecord } from '@/types/database'
import { DEPARTMENTS } from '@/lib/departments'
import { getCurrentEmployee } from '@/lib/auth'
import { canAccess } from '@/lib/permissions'
import { getStoredToken, buildAuthUrl } from '@/lib/toc'
import { estimatePayrollByYear } from '@/lib/payroll'
import type { PayrollEmpRow, PayrollCompRow, PayrollTaxRow, PayrollAbsenceRow, PayrollContractRow } from '@/lib/payroll'
import RevenueTargetsForm from './_components/revenue-targets-form'
import MonthlySection from './_components/monthly-section'
import CostCentersSection from './_components/cost-centers-section'
import TocSyncSection from './_components/toc-sync-section'
import CostPerHourSection from './_components/cost-per-hour-section'
import { fetchMonthlyHourTotals } from '@/lib/horas'
import { workingDaysBetween } from '@/lib/holidays'

export const dynamic = 'force-dynamic'

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; toc_connected?: string; toc_error?: string }>
}) {
  const emp = await getCurrentEmployee()
  if (!emp || !canAccess(emp.app_role, '/financeiro')) redirect('/')

  const { year, toc_connected, toc_error } = await searchParams
  const currentYear = new Date().getFullYear()
  const filterYear = Number(year ?? currentYear)

  const supabase = createAdminClient()
  const [targetsResult, marginResult, rateResult, recordsResult, activeEmpResult, compensationsResult, taxInfoResult, ccResult, absencesResult, clickupEmpResult, internshipsResult, revenueSharesResult] = await Promise.all([
    supabase.from('objectives').select('*')
      .eq('year', filterYear).eq('unit', '€').in('type', ['team', 'department']),
    supabase.from('objectives').select('*')
      .eq('year', filterYear).eq('type', 'team').eq('unit', '%').is('department', null).maybeSingle(),
    supabase.from('objectives').select('*')
      .eq('year', filterYear).eq('type', 'team').eq('unit', '€/h').is('department', null).maybeSingle(),
    supabase.from('financial_records').select('*')
      .eq('year', filterYear).order('month'),
    supabase.from('employees').select('id, department').eq('status', 'active'),
    supabase.from('compensation').select('employee_id, base_salary, effective_date, end_date'),
    supabase.from('employee_tax_info').select('employee_id, subsidy_payment_mode, meal_allowance_daily, working_days_per_month'),
    supabase.from('cost_center_records').select('*').eq('year', filterYear).order('month'),
    supabase.from('absences')
      .select('employee_id, type, working_days, status, start_date, end_date')
      .gte('start_date', `${filterYear}-01-01`)
      .lte('end_date',   `${filterYear}-12-31`)
      .eq('status', 'approved'),
    supabase.from('employees')
      .select('id, work_regime, days_per_week, start_date, end_date')
      .not('position_type', 'eq', 'outsourcing'),
    supabase.from('contracts')
      .select('employee_id, contract_type, start_date, end_date')
      .eq('contract_type', 'internship'),
    // Percentagens da repartição da receita genérica; a tabela pode ainda não existir
    supabase.from('revenue_distribution').select('department, share'),
  ])

  const revenueShares = Object.fromEntries(
    ((revenueSharesResult.data ?? []) as { department: string; share: number }[])
      .map(r => [r.department, Number(r.share) || 0]),
  ) as Record<string, number>

  const targets        = (targetsResult.data ?? []) as Objective[]
  const marginTarget   = (marginResult.data ?? null) as Objective | null
  const hourlyRate     = (rateResult.data   ?? null) as Objective | null
  const companyTarget  = targets.find(t => t.type === 'team') ?? null
  // Department targets from Objectives (for cost centers comparison)
  const deptTargets    = Object.fromEntries(
    targets.filter(t => t.type === 'department').map(t => [t.department, t])
  ) as Record<string, Objective | undefined>
  const records      = (recordsResult.data ?? []) as FinancialRecord[]
  const ccRecords    = (ccResult.data ?? []) as CostCenterRecord[]

  // ── Payroll estimate (global + per department, month-aware) ────
  const activeEmps  = (activeEmpResult.data  ?? []) as PayrollEmpRow[]
  const allComps    = (compensationsResult.data ?? []) as PayrollCompRow[]
  const allAbsences = (absencesResult.data  ?? []) as PayrollAbsenceRow[]
  const allTaxInfo  = (taxInfoResult.data   ?? []) as PayrollTaxRow[]
  const internships = (internshipsResult.data ?? []) as PayrollContractRow[]

  const deptLookup = new Map(DEPARTMENTS.map(d => [d.toLowerCase(), d]))

  const payrollByYear = estimatePayrollByYear(activeEmps, allComps, allTaxInfo, allAbsences, filterYear, deptLookup, internships)

  const payrollEstimateByMonth: Record<number, number>                  = {}
  const payrollByDeptByMonth:   Record<number, Record<string, number>>  = {}
  for (let m = 1; m <= 12; m++) {
    payrollEstimateByMonth[m] = payrollByYear[m].total
    payrollByDeptByMonth[m]   = payrollByYear[m].byDept
  }

  // Annual totals for CostCentersSection (sum of all months)
  const payrollByDept: Record<string, number> = {}
  for (let m = 1; m <= 12; m++) {
    for (const [dept, val] of Object.entries(payrollByDeptByMonth[m])) {
      payrollByDept[dept] = (payrollByDept[dept] ?? 0) + val
    }
  }

  // ── Custo/hora: horas registadas na app e horas disponíveis da equipa ───────────
  type ClickUpEmp = {
    id: string
    work_regime: string | null
    days_per_week: number | null
    start_date: string | null
    end_date: string | null
  }
  const clickupEmps = (clickupEmpResult.data ?? []) as ClickUpEmp[]

  let horasRegistadas: Record<number, number> = {}
  let horasFaturaveis: Record<number, number> = {}
  try {
    const totais = await fetchMonthlyHourTotals(filterYear)
    horasRegistadas = totais.registadas
    horasFaturaveis = totais.faturaveis
  } catch {
    // Sem registo de horas → a secção mostra as horas a zero
  }

  // Horas brutas de quem tem rastreio activo, para aferir a cobertura do registo
  const horasDisponiveis: Record<number, number> = {}
  for (let m = 1; m <= 12; m++) {
    const mStart = `${filterYear}-${String(m).padStart(2, '0')}-01`
    const mEnd   = `${filterYear}-${String(m).padStart(2, '0')}-${String(new Date(filterYear, m, 0).getDate()).padStart(2, '0')}`
    let horas = 0
    for (const e of clickupEmps) {
      const de  = e.start_date && e.start_date > mStart ? e.start_date : mStart
      const ate = e.end_date   && e.end_date   < mEnd   ? e.end_date   : mEnd
      if (de > ate) continue
      const fraccao = e.work_regime === 'part_time' ? (e.days_per_week ?? 5) / 5 : 1
      horas += workingDaysBetween(de, ate) * 8 * fraccao
    }
    horasDisponiveis[m] = Math.round(horas)
  }

  // TOC Online connection status
  const isAdmin    = !!emp && ['master', 'admin', 'management'].includes(emp.app_role)
  const tocToken   = isAdmin ? await getStoredToken() : null
  const tocConnected = !!tocToken
  const siteUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3200'
  const tocAuthUrl   = buildAuthUrl(`${siteUrl}/api/toc/callback`)


  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Financeiro</h1>
        <p className="text-slate-500 text-sm mt-1">Objetivos de faturação e registos mensais — {filterYear}</p>
      </div>

      {/* TOC Online connection feedback */}
      {toc_connected && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 text-sm text-emerald-700">
          ✓ TOC Online ligado com sucesso! Já podes sincronizar dados de faturação.
        </div>
      )}
      {toc_error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-sm text-red-600">
          Erro ao ligar TOC Online: {toc_error}
        </div>
      )}

      {/* TOC Online sync */}
      {isAdmin && (
        <TocSyncSection year={filterYear} isConnected={tocConnected} isAdmin={isAdmin} authUrl={tocAuthUrl} />
      )}

      {/* Link para gestão de códigos de artigo */}
      {isAdmin && (
        <div className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <Link
            href="/financeiro/item-codes"
            className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
          >
            ⚙️ Gerir códigos de artigo TOC
          </Link>
          <span className="text-slate-300">·</span>
          <span>Mapear item_code → departamento para horas faturadas</span>
        </div>
      )}

      <RevenueTargetsForm
        year={filterYear}
        companyTarget={companyTarget}
        marginTarget={marginTarget}
        hourlyRate={hourlyRate}
      />

      <MonthlySection
        year={filterYear}
        records={records}
        ccRecords={ccRecords}
        payrollEstimateByMonth={payrollEstimateByMonth}
        payrollByDeptByMonth={payrollByDeptByMonth}
      />

      <div className="mt-10 pt-8 border-t border-slate-200">
        <CostPerHourSection
          year={filterYear}
          records={records}
          horasRegistadas={horasRegistadas}
          horasFaturaveis={horasFaturaveis}
          horasDisponiveis={horasDisponiveis}
        />
      </div>

      <div className="mt-10 pt-8 border-t border-slate-200">
        <CostCentersSection
          year={filterYear}
          ccRecords={ccRecords}
          payrollByDept={payrollByDept}
          deptTargets={deptTargets}
          revenueShares={revenueShares}
        />
      </div>
    </div>
  )
}
