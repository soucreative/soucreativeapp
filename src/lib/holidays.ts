/**
 * Portuguese public holidays.
 * Returns a Set of YYYY-MM-DD strings for a given year.
 */

const FIXED: { month: number; day: number }[] = [
  { month: 1,  day: 1  },  // Ano Novo
  { month: 4,  day: 25 },  // Dia da Liberdade
  { month: 5,  day: 1  },  // Dia do Trabalhador
  { month: 6,  day: 10 },  // Dia de Portugal
  { month: 8,  day: 15 },  // Assunção de Nossa Senhora
  { month: 10, day: 5  },  // Implantação da República
  { month: 11, day: 1  },  // Todos os Santos
  { month: 12, day: 1  },  // Restauração da Independência
  { month: 12, day: 8  },  // Imaculada Conceição
  { month: 12, day: 25 },  // Natal
]

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Easter Sunday — Meeus/Jones/Butcher algorithm */
function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day   = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function getPortugueseHolidays(year: number): Set<string> {
  const h = new Set<string>()

  for (const { month, day } of FIXED) {
    h.add(toISO(new Date(year, month - 1, day)))
  }

  const easter = easterSunday(year)
  h.add(toISO(addDays(easter, -2)))  // Sexta-feira Santa
  h.add(toISO(addDays(easter, 60)))  // Corpo de Deus

  return h
}

/** Working days between two YYYY-MM-DD dates (inclusive), excluding weekends,
 *  Portuguese public holidays, and any additional blocked dates. */
export function workingDaysBetween(
  start: string,
  end: string,
  extraExcluded: Set<string> = new Set(),
): number {
  const year = Number(start.slice(0, 4))
  const holidays = getPortugueseHolidays(year)

  const s = new Date(start + 'T00:00:00')
  const e = new Date(end   + 'T00:00:00')
  if (s > e) return 0

  let days = 0
  const cur = new Date(s)
  while (cur <= e) {
    const dow = cur.getDay()
    const iso = toISO(cur)
    if (dow !== 0 && dow !== 6 && !holidays.has(iso) && !extraExcluded.has(iso)) {
      days++
    }
    cur.setDate(cur.getDate() + 1)
  }
  return days
}
