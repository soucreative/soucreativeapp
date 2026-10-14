/**
 * Shared payroll estimation logic — used by both /financeiro and /produtividade.
 *
 * Calculates the employer's monthly cost per employee, accounting for:
 *  - Active compensation at the time (effective_date / end_date)
 *  - TSU patronal (23.75%)
 *  - Holiday/Christmas subsidy mode (twelfths, full in June/November, or none),
 *    never during an internship
 *  - Meal allowance (paid only on days present)
 *  - Sick leave savings (SS pays from day 4)
 *  - Unjustified absence deductions
 */

export const TSU_RATE = 1.2375 // TSU patronal 23,75%

export type PayrollEmpRow = {
  id: string
  department: string | null
}

export type PayrollCompRow = {
  employee_id: string
  base_salary: number
  effective_date: string
  end_date: string | null
}

export type PayrollTaxRow = {
  employee_id: string
  subsidy_payment_mode: string
  meal_allowance_daily: number | null
  working_days_per_month: number | null
}

export type PayrollAbsenceRow = {
  employee_id: string
  type: string
  working_days: number
  start_date: string
  end_date: string
}

export type PayrollContractRow = {
  employee_id: string
  contract_type: string
  start_date: string
  end_date: string | null
}

export type PayrollMonthResult = {
  /** Total employer cost for the month (all employees) */
  total: number
  /** Employer cost per canonical department */
  byDept: Record<string, number>
  /** Employer cost per employee id */
  byEmployee: Record<string, number>
}

/** Count working absence days of a given type (or all types) within [mStart, mEnd] */
function absenceDaysInMonth(
  empId: string,
  allAbsences: PayrollAbsenceRow[],
  mStart: string,
  mEnd: string,
  type?: string,
): number {
  return allAbsences
    .filter(a =>
      a.employee_id === empId &&
      (!type || a.type === type) &&
      a.start_date <= mEnd &&
      a.end_date   >= mStart
    )
    .reduce((sum, a) => {
      const s = a.start_date < mStart ? mStart : a.start_date
      const e = a.end_date   > mEnd   ? mEnd   : a.end_date
      const totalDays = Math.max(1,
        Math.round((new Date(a.end_date).getTime() - new Date(a.start_date).getTime()) / 86_400_000) + 1
      )
      const monthDays = Math.max(1,
        Math.round((new Date(e).getTime() - new Date(s).getTime()) / 86_400_000) + 1
      )
      return sum + Math.round(a.working_days * (monthDays / totalDays))
    }, 0)
}

/**
 * Estimate the employer payroll cost for a single month.
 *
 * @param employees   Active employees (id + department)
 * @param compensations All compensation rows (may span multiple periods)
 * @param taxInfo     Tax / benefit settings per employee
 * @param absences    Approved absences for the year (filtered externally or passed in full)
 * @param year        Year of the month to calculate
 * @param month       1-based month number
 * @param deptLookup  Map from lower-cased department name → canonical name (optional)
 * @param contracts   Contracts, used to find internship periods (optional)
 */
export function estimatePayrollForMonth(
  employees: PayrollEmpRow[],
  compensations: PayrollCompRow[],
  taxInfo: PayrollTaxRow[],
  absences: PayrollAbsenceRow[],
  year: number,
  month: number,
  deptLookup?: Map<string, string>,
  contracts: PayrollContractRow[] = [],
): PayrollMonthResult {
  const mStart = `${year}-${String(month).padStart(2, '0')}-01`
  const mEnd   = new Date(year, month, 0).toISOString().split('T')[0]

  const taxMap = Object.fromEntries(taxInfo.map(t => [t.employee_id, t]))
  const byDept: Record<string, number> = {}
  const byEmployee: Record<string, number> = {}
  let total = 0

  for (const emp of employees) {
    const empComps = compensations.filter(c => c.employee_id === emp.id)

    // Pick the compensation active during this month (most recent effective_date wins)
    const active =
      empComps
        .filter(c => c.effective_date <= mEnd && (c.end_date === null || c.end_date >= mStart))
        .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0]
      // Fallback: no record active this month → use oldest known salary
      ?? empComps.sort((a, b) => a.effective_date.localeCompare(b.effective_date))[0]

    if (!active) continue

    const tax              = taxMap[emp.id] as PayrollTaxRow | undefined
    const mode             = tax?.subsidy_payment_mode   ?? 'full'
    const mealDaily        = tax?.meal_allowance_daily   ?? 10.46
    const workDaysPerMonth = tax?.working_days_per_month ?? 22

    // Interns get no holiday/Christmas subsidies, whatever the tax mode says —
    // that mode describes the regime after the internship. The last day of the
    // month decides, so the month an internship ends counts as regular, in line
    // with the post-internship compensation record winning that month above.
    const inInternship = contracts.some(c =>
      c.employee_id === emp.id &&
      c.contract_type === 'internship' &&
      c.start_date <= mEnd &&
      (c.end_date === null || c.end_date >= mEnd)
    )

    // Base salary with TSU, plus the holiday/Christmas subsidies the tax mode
    // calls for: spread over every month in twelfths, paid whole in June and
    // November, never in 'none' (an internship grant) nor during an internship.
    const subsidyFactor = inInternship ? 0
      : mode === 'twelfths' ? 2 / 12
      : mode === 'full' && (month === 6 || month === 11) ? 1
      : 0
    const baseSalaryGross = active.base_salary * (1 + subsidyFactor) * TSU_RATE

    // Absence adjustments
    const sickDays   = absenceDaysInMonth(emp.id, absences, mStart, mEnd, 'sick_leave')
    const unjustDays = absenceDaysInMonth(emp.id, absences, mStart, mEnd, 'unjustified')
    const allAbsDays = absenceDaysInMonth(emp.id, absences, mStart, mEnd)

    // Meal allowance: only on days present
    const mealAllowance   = Math.max(0, workDaysPerMonth - allAbsDays) * mealDaily
    // Sick leave: SS pays from day 4 onwards
    const sickSavings     = Math.max(0, sickDays - 3) / workDaysPerMonth * active.base_salary * TSU_RATE
    // Unjustified: full salary + TSU deducted
    const unjustDeduction = unjustDays / workDaysPerMonth * active.base_salary * TSU_RATE

    const monthly = Math.max(0, baseSalaryGross + mealAllowance - sickSavings - unjustDeduction)
    total += monthly
    byEmployee[emp.id] = Math.round(monthly)

    const rawDept    = emp.department ?? ''
    const canonDept  = deptLookup
      ? (deptLookup.get(rawDept.toLowerCase()) ?? null)
      : rawDept || null
    if (canonDept) {
      byDept[canonDept] = (byDept[canonDept] ?? 0) + monthly
    }
  }

  // Round dept values
  for (const k of Object.keys(byDept)) byDept[k] = Math.round(byDept[k])

  return { total: Math.round(total), byDept, byEmployee }
}

/**
 * Estimate payroll for every month of a year.
 * Returns a map: month (1–12) → PayrollMonthResult
 */
export function estimatePayrollByYear(
  employees: PayrollEmpRow[],
  compensations: PayrollCompRow[],
  taxInfo: PayrollTaxRow[],
  absences: PayrollAbsenceRow[],
  year: number,
  deptLookup?: Map<string, string>,
  contracts: PayrollContractRow[] = [],
): Record<number, PayrollMonthResult> {
  const result: Record<number, PayrollMonthResult> = {}
  for (let m = 1; m <= 12; m++) {
    result[m] = estimatePayrollForMonth(employees, compensations, taxInfo, absences, year, m, deptLookup, contracts)
  }
  return result
}
