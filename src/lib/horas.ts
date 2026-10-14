/**
 * Horas registadas na própria app (tabela time_entries).
 *
 * A SOU não usa ClickUp: cada pessoa regista as horas aqui, de preferência
 * ligadas ao orçamento de produção em que trabalhou. As funções devolvem a
 * mesma forma que o cliente ClickUp da app de origem devolvia, mas agrupadas
 * pelo id do colaborador (uuid) em vez de um id externo.
 */
import { createAdminClient } from '@/lib/supabase/admin'

export type HoursResult = {
  total: number
  byEmployee: Record<string, number>
  billableTotal: number
  billableByEmployee: Record<string, number>
}

type Entrada = { employee_id: string; date: string; hours: number; billable: boolean }

const round1 = (v: number) => Math.round(v * 10) / 10

function iso(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

async function lerEntradas(desde: string, ate: string): Promise<Entrada[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('time_entries')
    .select('employee_id, date, hours, billable')
    .gte('date', desde)
    .lte('date', ate)
  if (error) throw new Error(`Horas: ${error.message}`)
  return (data ?? []) as Entrada[]
}

export async function fetchHoursRange(startMs: number, endMs: number): Promise<HoursResult> {
  const entradas = await lerEntradas(iso(startMs), iso(endMs))
  const byEmployee: Record<string, number> = {}
  const billableByEmployee: Record<string, number> = {}
  let total = 0
  let billableTotal = 0
  for (const e of entradas) {
    const h = Number(e.hours) || 0
    total += h
    byEmployee[e.employee_id] = (byEmployee[e.employee_id] ?? 0) + h
    if (e.billable) {
      billableTotal += h
      billableByEmployee[e.employee_id] = (billableByEmployee[e.employee_id] ?? 0) + h
    }
  }
  for (const k of Object.keys(byEmployee)) byEmployee[k] = round1(byEmployee[k])
  for (const k of Object.keys(billableByEmployee)) billableByEmployee[k] = round1(billableByEmployee[k])
  return { total: round1(total), byEmployee, billableTotal: round1(billableTotal), billableByEmployee }
}

export async function fetchHours(year: number, month: number): Promise<HoursResult> {
  return fetchHoursRange(Date.UTC(year, month - 1, 1), Date.UTC(year, month, 0))
}

/** Totais mensais do ano, para o custo/hora do Financeiro. */
export async function fetchMonthlyHourTotals(
  year: number,
): Promise<{ registadas: Record<number, number>; faturaveis: Record<number, number> }> {
  const entradas = await lerEntradas(`${year}-01-01`, `${year}-12-31`)
  const registadas: Record<number, number> = {}
  const faturaveis: Record<number, number> = {}
  for (let m = 1; m <= 12; m++) {
    registadas[m] = 0
    faturaveis[m] = 0
  }
  for (const e of entradas) {
    const m = Number(e.date.slice(5, 7))
    registadas[m] += Number(e.hours) || 0
    if (e.billable) faturaveis[m] += Number(e.hours) || 0
  }
  for (let m = 1; m <= 12; m++) {
    registadas[m] = round1(registadas[m])
    faturaveis[m] = round1(faturaveis[m])
  }
  return { registadas, faturaveis }
}

/** mês (1–12) → employee_id → horas faturáveis. Reparte a receita genérica pelos centros. */
export async function fetchBillableHoursByMonth(year: number): Promise<Record<number, Record<string, number>>> {
  const entradas = await lerEntradas(`${year}-01-01`, `${year}-12-31`)
  const out: Record<number, Record<string, number>> = {}
  for (let m = 1; m <= 12; m++) out[m] = {}
  for (const e of entradas) {
    if (!e.billable) continue
    const m = Number(e.date.slice(5, 7))
    out[m][e.employee_id] = (out[m][e.employee_id] ?? 0) + (Number(e.hours) || 0)
  }
  return out
}
