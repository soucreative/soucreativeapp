// Pure vacation validation utilities — no DB access

export interface VacationPeriod {
  id: string
  employeeId: string
  department: string | null
  startDate: string    // YYYY-MM-DD
  endDate: string      // YYYY-MM-DD
  workingDays: number
}

export type ViolationSeverity = 'error' | 'warning'
export type ViolationKind = 'overlap' | 'gap_long' | 'gap_short' | 'min_consecutive'

export interface Violation {
  kind: ViolationKind
  severity: ViolationSeverity
  message: string
  conflictingEmployeeId?: string
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Calendar days strictly between end of earlier and start of later (positive = gap) */
function calendarDayGap(earlier: VacationPeriod, later: VacationPeriod): number {
  const e = new Date(earlier.endDate   + 'T00:00:00')
  const s = new Date(later.startDate   + 'T00:00:00')
  return Math.round((s.getTime() - e.getTime()) / (1000 * 60 * 60 * 24))
}

/** Working days (Mon–Fri) strictly between end of earlier and start of later */
function workingDayGap(earlier: VacationPeriod, later: VacationPeriod): number {
  const e = new Date(earlier.endDate + 'T00:00:00')
  const s = new Date(later.startDate + 'T00:00:00')
  if (s <= e) return 0
  let count = 0
  const cur = new Date(e)
  cur.setDate(cur.getDate() + 1)
  while (cur < s) {
    const d = cur.getDay()
    if (d !== 0 && d !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

/** Calendar days spanned by a period (inclusive) */
export function consecutiveCalendarDays(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end   + 'T00:00:00')
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
}

function overlaps(a: VacationPeriod, b: VacationPeriod): boolean {
  return a.startDate <= b.endDate && a.endDate >= b.startDate
}

// ── main validation ────────────────────────────────────────────────────────

/**
 * Validate a new vacation period against:
 *  - `teamPeriods`      Approved/pending vacation periods of OTHER team members (excl. the requester)
 *  - `empYearPeriods`   Existing approved/pending vacation periods of THIS employee for the same year
 *
 * Hard rules (severity='error')   → block save
 * Soft rules (severity='warning') → allow save but surface to user
 */
export function validateVacation(
  newPeriod: VacationPeriod,
  teamPeriods: VacationPeriod[],
  empYearPeriods: VacationPeriod[],
): Violation[] {
  const violations: Violation[] = []

  for (const other of teamPeriods) {
    if (other.id === newPeriod.id) continue

    // 1. No simultaneous vacation in the same team
    if (overlaps(newPeriod, other)) {
      violations.push({
        kind: 'overlap',
        severity: 'error',
        message: 'Conflito: outro colaborador da equipa já tem férias neste período.',
        conflictingEmployeeId: other.employeeId,
      })
      continue   // gap checks redundant when there is an overlap
    }

    // 2. Gap rules
    const earlier = newPeriod.startDate <= other.startDate ? newPeriod : other
    const later   = newPeriod.startDate <= other.startDate ? other : newPeriod

    const eitherLong = newPeriod.workingDays > 5 || other.workingDays > 5
    const bothShort  = newPeriod.workingDays <= 3 && other.workingDays <= 3

    if (eitherLong) {
      const gap = calendarDayGap(earlier, later)
      if (gap < 5) {
        violations.push({
          kind: 'gap_long',
          severity: 'error',
          message: `Distância insuficiente entre férias (${gap} dia(s) de calendário; mínimo 5 para férias longas).`,
          conflictingEmployeeId: other.employeeId,
        })
      }
    } else if (bothShort) {
      const gap = workingDayGap(earlier, later)
      if (gap < 3) {
        violations.push({
          kind: 'gap_short',
          severity: 'error',
          message: `Distância insuficiente entre férias curtas (${gap} dia(s) úteis; mínimo 3 dias úteis).`,
          conflictingEmployeeId: other.employeeId,
        })
      }
    } else {
      // Mixed: one short, one medium (4–5 wd) → apply calendar gap
      const gap = calendarDayGap(earlier, later)
      if (gap < 5) {
        violations.push({
          kind: 'gap_long',
          severity: 'error',
          message: `Distância insuficiente entre férias (${gap} dia(s) de calendário; mínimo 5 dias).`,
          conflictingEmployeeId: other.employeeId,
        })
      }
    }
  }

  // 3. Yearly 10-day consecutive requirement (warning only)
  const yearPeriods = [...empYearPeriods.filter(p => p.id !== newPeriod.id), newPeriod]
  const hasLong     = yearPeriods.some(p => consecutiveCalendarDays(p.startDate, p.endDate) >= 10)
  if (!hasLong) {
    violations.push({
      kind: 'min_consecutive',
      severity: 'warning',
      message:
        'Aviso: nenhum período de férias com pelo menos 10 dias consecutivos registado para este ano.',
    })
  }

  return violations
}

/**
 * Scan all absences for a given department and return any pair that violates
 * the team overlap / gap rules. Used to display a violations panel.
 */
export function detectTeamViolations(
  periods: VacationPeriod[],
): Violation[] {
  const result: Violation[] = []
  for (let i = 0; i < periods.length; i++) {
    for (let j = i + 1; j < periods.length; j++) {
      const a = periods[i]
      const b = periods[j]
      if (a.department !== b.department) continue
      if (a.employeeId === b.employeeId) continue

      if (overlaps(a, b)) {
        result.push({
          kind: 'overlap',
          severity: 'error',
          message: `Sobreposição de férias na equipa "${a.department}".`,
          conflictingEmployeeId: b.employeeId,
        })
        continue
      }

      const earlier = a.startDate <= b.startDate ? a : b
      const later   = a.startDate <= b.startDate ? b : a

      const eitherLong = a.workingDays > 5 || b.workingDays > 5
      const bothShort  = a.workingDays <= 3 && b.workingDays <= 3

      if (eitherLong) {
        const gap = calendarDayGap(earlier, later)
        if (gap < 5) {
          result.push({
            kind: 'gap_long',
            severity: 'error',
            message: `Férias demasiado próximas na equipa "${a.department}" (${gap} dia(s); mín. 5).`,
            conflictingEmployeeId: b.employeeId,
          })
        }
      } else if (bothShort) {
        const gap = workingDayGap(earlier, later)
        if (gap < 3) {
          result.push({
            kind: 'gap_short',
            severity: 'error',
            message: `Férias curtas demasiado próximas na equipa "${a.department}" (${gap}d úteis; mín. 3).`,
            conflictingEmployeeId: b.employeeId,
          })
        }
      }
    }
  }
  return result
}
