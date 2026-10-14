import { createAdminClient } from '@/lib/supabase/admin'
import { requirePageAccess } from '@/lib/auth'
import { fetchHours, fetchHoursRange, type HoursResult } from '@/lib/horas'
import { workingDaysBetween } from '@/lib/holidays'
import { estimatePayrollForMonth } from '@/lib/payroll'
import { OVERHEAD_DEPTS } from '@/lib/departments'
import type { PayrollEmpRow, PayrollCompRow, PayrollTaxRow, PayrollAbsenceRow, PayrollContractRow } from '@/lib/payroll'
import ProductivityClient from './_components/productivity-client'
import type { RawEmployee, MonthlyYearData } from './_components/productivity-client'

export const dynamic = 'force-dynamic'


export type WonDeptHours = {
  department: string
  hours_this_month: number
  hours_backlog: number
  proposals: {
    id: string
    title: string
    client: string | null
    hours: number
    monthly_hours: number
    delivery_start: string | null
    delivery_end: string | null
  }[]
}

export default async function ProdutividadePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  // Mostra o custo de cada pessoa — sem isto bastava escrever o endereço
  await requirePageAccess('/produtividade')

  const { year: yearParam, month: monthParam } = await searchParams
  const today      = new Date()
  const year       = yearParam  ? Number(yearParam)  : today.getFullYear()
  const month      = monthParam ? Number(monthParam) : today.getMonth() + 1
  const monthStart = new Date(year, month - 1, 1).toISOString().split('T')[0]
  const monthEnd   = new Date(year, month, 0).toISOString().split('T')[0]

  const supabase = createAdminClient()

  // Horas registadas na app no mês (sem registo → 0)
  const semHoras: HoursResult = { total: 0, byEmployee: {}, billableTotal: 0, billableByEmployee: {} }
  let horasMes = semHoras
  try {
    horasMes = await fetchHours(year, month)
  } catch {
    // tabela ainda vazia ou indisponível
  }

  // ── % produtiva medida — último mês fechado ──────────────────────────────
  // Medir no próprio mês seria circular (capacidade = brutas × %; se % vier das
  // faturáveis desse mês, a capacidade passa a ser as faturáveis e a ocupação dá
  // sempre 100%). Usa-se por isso o mês anterior, já fechado.
  const trailStart = new Date(Date.UTC(year, month - 2, 1))
  const trailEnd   = new Date(Date.UTC(year, month - 1, 0, 23, 59, 59, 999))
  const trailStartStr = trailStart.toISOString().slice(0, 10)
  const trailEndStr   = trailEnd.toISOString().slice(0, 10)

  let horasTrail = semHoras
  try {
    horasTrail = await fetchHoursRange(trailStart.getTime(), trailEnd.getTime())
  } catch {
    // sem dados → cai no valor manual / default
  }

  const [
    { data: empData }, { data: allEmpData }, { data: outsourcingData }, { data: outrosData },
    { data: compData }, { data: taxData }, { data: absenceData },
    { data: wonData },
    { data: finData }, { data: allFinData }, { data: ccData }, { data: rateData },
    { data: internshipData },
  ] = await Promise.all([
    // Colaboradores operacionais no mês — excluir departamentos de overhead e outsourcing
    // Agrupamento por departamento, não por posição
    supabase
      .from('employees')
      .select('id, first_name, last_name, department, position_type, work_regime, days_per_week, start_date, end_date, utilization_pct')
      .lte('start_date', monthEnd)
      .or(`end_date.is.null,end_date.gte.${monthStart}`)
      .not('department', 'in', `(${OVERHEAD_DEPTS.join(',')})`)
      .not('position_type', 'eq', 'outsourcing')
      .order('department').order('first_name'),
    // Todos os colaboradores no mês — para cálculo de payroll (exclui outsourcing — custo é externo)
    supabase
      .from('employees')
      .select('id, department')
      .lte('start_date', monthEnd)
      .or(`end_date.is.null,end_date.gte.${monthStart}`)
      .not('position_type', 'eq', 'outsourcing'),
    // Outsourcing no mês — só para mapeamento registo de horas (não entra em capacidade nem payroll)
    supabase
      .from('employees')
      .select('id, first_name, last_name, department, start_date, end_date')
      .lte('start_date', monthEnd)
      .or(`end_date.is.null,end_date.gte.${monthStart}`)
      .eq('position_type', 'outsourcing'),
    // Overhead com % produtiva — contribuem para dept "Outros" na produtividade
    supabase
      .from('employees')
      .select('id, first_name, last_name, department, position_type, work_regime, days_per_week, start_date, end_date, utilization_pct, outros_pct')
      .lte('start_date', monthEnd)
      .or(`end_date.is.null,end_date.gte.${monthStart}`)
      .filter('department', 'in', `(${OVERHEAD_DEPTS.join(',')})`)
      .gt('outros_pct', 0),
    // Histórico de compensações (todas as datas, não apenas actuais)
    supabase
      .from('compensation')
      .select('employee_id, base_salary, effective_date, end_date'),
    // Informação fiscal por colaborador
    supabase
      .from('employee_tax_info')
      .select('employee_id, subsidy_payment_mode, meal_allowance_daily, working_days_per_month'),
    // Ausências aprovadas no ano seleccionado
    supabase
      .from('absences')
      .select('employee_id, type, working_days, start_date, end_date')
      .gte('start_date', `${year}-01-01`)
      .lte('end_date',   `${year}-12-31`)
      .eq('status', 'approved'),
    // Sem módulo comercial: não há horas comprometidas por propostas ganhas
    Promise.resolve({ data: [] as { id: string; title: string; delivery_start: string | null; delivery_end: string | null; client: { name: string } | null; lines: { department: string; hours: number }[] }[] }),
    // Selected month — for FSE / recorded payroll
    supabase
      .from('financial_records')
      .select('fse, fse_suppliers, direct_costs, total_payroll, revenue, other_revenue, plunet_revenue')
      .eq('year', year)
      .eq('month', month)
      .maybeSingle(),
    // All months of the year — to know which are closed
    supabase
      .from('financial_records')
      .select('month')
      .eq('year', year),
    // Cost-centre revenue per department per month
    supabase
      .from('cost_center_records')
      .select('month, cost_center, revenue')
      .eq('year', year),
    // Tarifa praticada — definida no Financeiro, igual para toda a gente
    supabase
      .from('objectives')
      .select('target_value')
      .eq('year', year).eq('type', 'team').eq('unit', '€/h').is('department', null)
      .maybeSingle(),
    // Estágios — sem subsídios de férias e Natal enquanto duram
    supabase
      .from('contracts')
      .select('employee_id, contract_type, start_date, end_date')
      .eq('contract_type', 'internship'),
  ])

  // ── Horas registadas por colaborador ──
  const clickupHoursByEmployee: Record<string, number> = {}  // employee UUID → hours
  const clickupBillableByEmployee: Record<string, number> = {}  // employee UUID → horas faturáveis
  for (const emp of (empData ?? []) as { id: string }[]) {
    const h = horasMes.byEmployee[emp.id] ?? 0
    if (h === 0) continue
    clickupHoursByEmployee[emp.id]    = h
    clickupBillableByEmployee[emp.id] = horasMes.billableByEmployee[emp.id] ?? 0
  }
  // Incluir management e outros com horas no registo de horas (não operacionais)
  for (const emp of (allEmpData ?? []) as { id: string; department: string | null }[]) {
    if (clickupHoursByEmployee[emp.id] !== undefined) continue
    const h = horasMes.byEmployee[emp.id] ?? 0
    if (h === 0) continue
    clickupHoursByEmployee[emp.id]    = h
    clickupBillableByEmployee[emp.id] = horasMes.billableByEmployee[emp.id] ?? 0
  }
  // Outsourcing — aparece nas linhas do departamento, sem capacidade nem custo
  for (const emp of (outsourcingData ?? []) as { id: string }[]) {
    if (clickupHoursByEmployee[emp.id] !== undefined) continue
    const h = horasMes.byEmployee[emp.id] ?? 0
    if (h === 0) continue
    clickupHoursByEmployee[emp.id]    = h
    clickupBillableByEmployee[emp.id] = horasMes.billableByEmployee[emp.id] ?? 0
  }

  /**
   * % produtiva medida = horas faturáveis ÷ horas brutas, na janela fechada.
   * Só se considera fiável se a pessoa registou pelo menos metade das horas
   * brutas do período — abaixo disso a medição não representa o trabalho real.
   */
  const MIN_COVERAGE = 0.5
  function measuredUtilFor(
    employeeId: string,
    regime: string,
    daysPerWeek: number | null,
    empStart: string | null,
    empEnd: string | null,
  ): number | null {
    const logged   = horasTrail.byEmployee[employeeId] ?? 0
    const billable = horasTrail.billableByEmployee[employeeId] ?? 0
    if (logged <= 0) return null

    const from = empStart && empStart > trailStartStr ? empStart : trailStartStr
    const to   = empEnd   && empEnd   < trailEndStr   ? empEnd   : trailEndStr
    if (from > to) return null
    const fraction = regime === 'part_time' ? (daysPerWeek ?? 5) / 5 : 1
    const bruto    = workingDaysBetween(from, to) * 8 * fraction
    if (bruto <= 0) return null
    if (logged / bruto < MIN_COVERAGE) return null

    return Math.min(1, billable / bruto)
  }

  // ── Payroll usando o mesmo cálculo detalhado do Financeiro ──────────────
  const allEmployees = (allEmpData  ?? []) as PayrollEmpRow[]
  const allComps     = (compData    ?? []) as PayrollCompRow[]
  const allTaxInfo   = (taxData     ?? []) as PayrollTaxRow[]
  const allAbsences  = (absenceData ?? []) as PayrollAbsenceRow[]
  const internships  = (internshipData ?? []) as PayrollContractRow[]

  const payrollResult = estimatePayrollForMonth(
    allEmployees, allComps, allTaxInfo, allAbsences, year, month, undefined, internships
  )
  // Total já inclui todos os colaboradores (operacionais + management)
  const estimatedPayrollTotal = payrollResult.total
  const mgmtPayrollEstimate   = 0  // incluído no estimatedPayrollTotal

  // Salário activo no mês seleccionado por colaborador (para tabela de detalhe)
  // Indexar compensações por employee_id para evitar O(n²)
  const compsByEmp = new Map<string, typeof allComps>()
  for (const c of allComps) {
    if (!compsByEmp.has(c.employee_id)) compsByEmp.set(c.employee_id, [])
    compsByEmp.get(c.employee_id)!.push(c)
  }
  const salaryMap = new Map<string, number>()
  for (const emp of allEmployees) {
    const empComps = compsByEmp.get(emp.id) ?? []
    const active =
      empComps
        .filter(c => c.effective_date <= monthEnd && (c.end_date === null || c.end_date >= monthStart))
        .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0]
      ?? empComps.sort((a, b) => a.effective_date.localeCompare(b.effective_date))[0]
    if (active) salaryMap.set(emp.id, active.base_salary)
  }

  // ── Ausências aprovadas no mês seleccionado por colaborador ────────────────
  // Usadas para deduzir da capacidade (férias, baixas, dias oferecidos, etc.)
  const absenceHoursMap = new Map<string, number>()
  for (const abs of allAbsences as { employee_id: string; working_days: number; start_date: string; end_date: string | null }[]) {
    const aStart = abs.start_date
    const aEnd   = abs.end_date ?? abs.start_date
    // Ignorar ausências sem sobreposição com o mês seleccionado
    if (aEnd < monthStart || aStart > monthEnd) continue
    // Calcular sobreposição em dias de calendário
    const overlapStart = aStart > monthStart ? aStart : monthStart
    const overlapEnd   = aEnd   < monthEnd   ? aEnd   : monthEnd
    const totalDays    = Math.max(1, (new Date(aEnd).getTime()        - new Date(aStart).getTime())    / 86_400_000 + 1)
    const overlapDays  = Math.max(0, (new Date(overlapEnd).getTime()  - new Date(overlapStart).getTime()) / 86_400_000 + 1)
    const absentHours  = (overlapDays / totalDays) * abs.working_days * 8
    absenceHoursMap.set(abs.employee_id, (absenceHoursMap.get(abs.employee_id) ?? 0) + absentHours)
  }

  type OutrosRow = {
    id: string; first_name: string; last_name: string; department: string | null
    position_type: string | null; work_regime: string; days_per_week: number | null
    start_date: string | null; end_date: string | null
    utilization_pct: number | null; outros_pct: number
  }

  const employees: RawEmployee[] = [
    ...(empData ?? []).map(e => ({
      ...e,
      base_salary:  salaryMap.get(e.id) ?? null,
      payrollCost:  payrollResult.byEmployee[e.id] ?? null,
      absenceHours: absenceHoursMap.get(e.id) ?? 0,
      clickupHours: clickupHoursByEmployee[e.id] ?? null,
      clickupBillableH: clickupBillableByEmployee[e.id] ?? null,
      measuredUtil: measuredUtilFor(e.id, e.work_regime ?? 'full_time', e.days_per_week, e.start_date, e.end_date),
      measuredUtilRef: null,   // operacionais já usam a medição directamente
    })),
    // Outsourcing com horas no registo de horas — aparecem nas linhas do dept mas sem capacidade nem custo
    ...(outsourcingData ?? [])
      .filter((e: { id: string }) =>
        (clickupHoursByEmployee[e.id] ?? 0) > 0
      )
      .map((e: { id: string; first_name: string; last_name: string; department: string | null; start_date: string | null; end_date: string | null }) => ({
        id:             e.id,
        first_name:     e.first_name,
        last_name:      e.last_name,
        department:     e.department,
        position_type:  'outsourcing' as const,
        work_regime:    'full_time' as const,
        days_per_week:  null,
        start_date:     e.start_date,
        end_date:       e.end_date,
        clickup_user_id: null,
        utilization_pct: null,
        base_salary:    null,
        payrollCost:    null,
        absenceHours:   0,
        clickupHours:   clickupHoursByEmployee[e.id] ?? null,
        clickupBillableH: clickupBillableByEmployee[e.id] ?? null,
        measuredUtil:   null,   // outsourcing não tem capacidade própria
        measuredUtilRef: null,
      })),
    // Overhead com % produtiva — horas proporcionais entram no dept "Outros"
    ...(outrosData ?? [] as OutrosRow[]).map((e: OutrosRow) => {
      const pct        = (e.outros_pct ?? 0) / 100
      const rawClickup = clickupHoursByEmployee[e.id]
      const rawBillable = clickupBillableByEmployee[e.id]
      return {
        id:              e.id,
        first_name:      e.first_name,
        last_name:       e.last_name,
        department:      'Outros' as string,
        position_type:   e.position_type,
        work_regime:     e.work_regime,
        days_per_week:   e.days_per_week,
        start_date:      e.start_date,
        end_date:        e.end_date,
        clickup_user_id: null,
        utilization_pct: pct,
        base_salary:     salaryMap.get(e.id) ?? null,
        payrollCost:     payrollResult.byEmployee[e.id] != null
          ? payrollResult.byEmployee[e.id] * pct : null,
        absenceHours:    absenceHoursMap.get(e.id) ?? 0,
        clickupHours:    rawClickup != null ? Math.round(rawClickup * pct) : null,
        clickupBillableH: rawBillable != null ? Math.round(rawBillable * pct) : null,
        // A alocação ao dept "Outros" é uma decisão de gestão, não uma medição:
        // o registo de horas diz quanto a pessoa produziu, não a que centro de custo
        // essa produção pertence. Por isso mantém-se o outros_pct e a medição
        // entra apenas como referência ao lado.
        measuredUtil:    null,
        measuredUtilRef: measuredUtilFor(e.id, e.work_regime ?? 'full_time', e.days_per_week, e.start_date, e.end_date),
      }
    }),
  ]

  const deptMap = new Map<string, WonDeptHours>()

  // Helper: fraction of a proposal's total duration that falls within [rangeStart, rangeEnd]
  function monthFraction(
    deliveryStart: string | null,
    deliveryEnd:   string | null,
    rangeStart:    string,
    rangeEnd:      string,
  ): { fraction: number; active: boolean; noDates: boolean } {
    if (!deliveryStart) return { fraction: 1, active: false, noDates: true }

    const pStart = deliveryStart
    const pEnd   = deliveryEnd ?? rangeEnd   // open-ended → treat as ending this month

    // No overlap
    if (pStart > rangeEnd || pEnd < rangeStart) return { fraction: 0, active: false, noDates: false }

    // Total project duration in days
    const totalDays = Math.max(1,
      (new Date(pEnd).getTime() - new Date(pStart).getTime()) / 86_400_000 + 1
    )
    // Overlap with this month in days
    const overlapStart = pStart > rangeStart ? pStart : rangeStart
    const overlapEnd   = pEnd   < rangeEnd   ? pEnd   : rangeEnd
    const overlapDays  = Math.max(0,
      (new Date(overlapEnd).getTime() - new Date(overlapStart).getTime()) / 86_400_000 + 1
    )

    return { fraction: overlapDays / totalDays, active: overlapDays > 0, noDates: false }
  }

  for (const proposal of wonData ?? []) {
    const lines      = (proposal.lines ?? []) as { department: string; hours: number }[]
    const clientName = (proposal.client as unknown as { name: string } | null)?.name ?? null

    const { fraction, active, noDates } = monthFraction(
      proposal.delivery_start, proposal.delivery_end, monthStart, monthEnd
    )

    for (const line of lines) {
      const dept = line.department
      if (!deptMap.has(dept)) {
        deptMap.set(dept, { department: dept, hours_this_month: 0, hours_backlog: 0, proposals: [] })
      }
      const d        = deptMap.get(dept)!
      const monthlyH = Math.round(line.hours * fraction)

      if (noDates) {
        // Sem datas: trabalho comprometido não calendarizado — conta como carga
        d.hours_this_month += line.hours
        d.hours_backlog    += line.hours
      } else if (active) {
        d.hours_this_month += monthlyH
      }

      d.proposals.push({
        id: proposal.id, title: proposal.title, client: clientName,
        hours: line.hours, monthly_hours: monthlyH,
        delivery_start: proposal.delivery_start, delivery_end: proposal.delivery_end,
      })
    }
  }

  const wonByDept  = [...deptMap.values()].sort((a, b) => b.hours_this_month - a.hours_this_month)

  // FSE e payroll: directamente do registo financeiro do mês (sem fallbacks)
  const fseCost         = (finData?.fse ?? 0) + (finData?.fse_suppliers ?? 0) + (finData?.direct_costs ?? 0)
  // Salários a 0 no registo = ainda não lançados (o mês é criado pela sincronização
  // do TOC antes de haver salários). Usa-se a estimativa, como no formulário do
  // Financeiro — contar 0 fazia o custo/hora do mês afundar.
  const recordedPayroll = finData?.total_payroll ? finData.total_payroll : null
  const hasFinRecord    = finData != null
  const monthRevenue    = (finData?.revenue ?? 0) + (finData?.other_revenue ?? 0) + (finData?.plunet_revenue ?? 0)

  // ── Visão anual ─────────────────────────────────────────────────────────
  // Months that have a closed financial record
  const closedMonths = new Set((allFinData ?? []).map((r: { month: number }) => r.month))

  // Revenue per month per cost-centre (from cost_center_records)
  const ccByMonth: Record<number, Record<string, number>> = {}
  for (const row of (ccData ?? []) as { month: number; cost_center: string; revenue: number }[]) {
    if (!ccByMonth[row.month]) ccByMonth[row.month] = {}
    ccByMonth[row.month][row.cost_center] = (ccByMonth[row.month][row.cost_center] ?? 0) + row.revenue
  }

  // Committed hours per month from won proposals
  const committedByMonth: Record<number, number> = {}
  for (let m = 1; m <= 12; m++) {
    const mStart = new Date(year, m - 1, 1).toISOString().split('T')[0]
    const mEnd   = new Date(year, m, 0).toISOString().split('T')[0]
    let total = 0
    for (const proposal of wonData ?? []) {
      const lines = (proposal.lines ?? []) as { department: string; hours: number }[]
      const { fraction, active, noDates } = monthFraction(
        proposal.delivery_start, proposal.delivery_end, mStart, mEnd
      )
      for (const line of lines) {
        if (noDates) {
          total += line.hours
        } else if (active) {
          total += Math.round(line.hours * fraction)
        }
      }
    }
    committedByMonth[m] = total
  }

  const yearlyData: MonthlyYearData[] = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    return {
      month: m,
      hasFinRecord: closedMonths.has(m),
      revenueByDept: ccByMonth[m] ?? {},
      committedHours: committedByMonth[m] ?? 0,
    }
  })

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Produtividade</h1>
          <p className="text-slate-500 text-sm mt-1">
            Capacidade da equipa, custo/hora e utilização real por departamento
          </p>
        </div>
      </div>

      <ProductivityClient
        employees={employees}
        wonByDept={wonByDept}
        monthRevenue={monthRevenue}
        fseCost={fseCost}
        hasFinRecord={hasFinRecord}
        recordedPayroll={recordedPayroll}
        estimatedPayrollTotal={estimatedPayrollTotal}
        mgmtPayrollEstimate={mgmtPayrollEstimate}
        yearlyData={yearlyData}
        year={year}
        month={month}
        tarifaPraticada={(rateData as { target_value: number | null } | null)?.target_value ?? null}
        horasFaturaveisMes={Object.values(clickupBillableByEmployee).reduce((s, h) => s + h, 0)}
      />
    </div>
  )
}
