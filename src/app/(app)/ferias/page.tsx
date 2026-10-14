import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/auth'
import Link from 'next/link'
import { Settings } from 'lucide-react'
import type { Absence, Employee, VacationSettings } from '@/types/database'
import { detectTeamViolations, type VacationPeriod } from '@/lib/vacation-rules'
import SettingsForm from './_components/settings-form'

const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const VACATION_BASE = 22
const COMPANY_DAYS  = 2   // gift day + bridge day
const VACATION_DAYS = VACATION_BASE + COMPANY_DAYS   // 24

const TYPE_COLOR: Record<string, string> = {
  vacation:    'bg-indigo-500',
  sick_leave:  'bg-red-400',
  justified:   'bg-amber-400',
  unjustified: 'bg-rose-500',
  other:       'bg-slate-400',
  company_day: 'bg-emerald-500',
}
const TYPE_LABEL: Record<string, string> = {
  vacation:    'Férias',
  sick_leave:  'Baixa',
  justified:   'Just.',
  unjustified: 'Injust.',
  other:       'Outro',
  company_day: 'Emp.',
}

type EmpRow = Pick<Employee, 'id' | 'first_name' | 'last_name' | 'department' | 'position_type'>

/** Returns all calendar days between start and end (inclusive) as YYYY-MM-DD strings */
function dayRange(start: string, end: string): string[] {
  const days: string[] = []
  const cur = new Date(start + 'T00:00:00')
  const fin = new Date(end   + 'T00:00:00')
  while (cur <= fin) {
    days.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

/** Days in a given month that are marked absent for a given type */
function daysInMonth(absences: Absence[], year: number, month: number, type?: string): number {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  let count = 0
  for (const a of absences) {
    if (type && a.type !== type) continue
    if (a.status === 'rejected') continue
    for (const d of dayRange(a.start_date, a.end_date)) {
      if (d.startsWith(prefix)) {
        const dow = new Date(d + 'T00:00:00').getDay()
        if (dow !== 0 && dow !== 6) count++
      }
    }
  }
  return count
}


export default async function FeriasPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; dept?: string; settings?: string }>
}) {
  const { year, dept, settings: showSettings } = await searchParams
  const now         = new Date()
  const currentYear = now.getFullYear()
  const filterYear  = Number(year ?? currentYear)

  const session  = await getCurrentEmployee()
  const isAdmin  = session && ['master', 'admin', 'management'].includes(session.app_role)

  const supabase = createAdminClient()

  const [empsRes, absRes, settingsRes, exchangesRes] = await Promise.all([
    supabase.from('employees')
      .select('id, first_name, last_name, department, position_type')
      .eq('status', 'active')
      .order('first_name'),
    supabase.from('absences')
      .select('*')
      .gte('start_date', `${filterYear}-01-01`)
      .lte('end_date',   `${filterYear}-12-31`)
      .order('start_date'),
    supabase.from('vacation_settings')
      .select('*')
      .eq('year', filterYear)
      .maybeSingle(),
    supabase.from('vacation_prize_exchanges')
      .select('employee_id, extra_days')
      .eq('year', filterYear),
  ])

  const allEmps     = (empsRes.data    ?? []) as EmpRow[]
  const allAbs      = (absRes.data     ?? []) as Absence[]
  const yearSettings = settingsRes.data as VacationSettings | null
  const exchanges   = (exchangesRes.data ?? []) as { employee_id: string; extra_days: number }[]

  // Prize exchange map: employeeId → extra_days
  const exchangeMap: Record<string, number> = {}
  for (const ex of exchanges) exchangeMap[ex.employee_id] = ex.extra_days

  const departments = Array.from(new Set(allEmps.map(e => e.department ?? '—'))).sort()
  const emps = dept ? allEmps.filter(e => (e.department ?? '—') === dept) : allEmps

  // Per-employee absence map
  const empAbsMap = Object.fromEntries(
    allEmps.map(e => [e.id, allAbs.filter(a => a.employee_id === e.id)])
  )

  // Company-wide stats
  const totalVacationDays    = allAbs.filter(a => a.type === 'vacation'    && a.status === 'approved').reduce((s, a) => s + a.working_days, 0)
  const totalSickDays        = allAbs.filter(a => a.type === 'sick_leave'  && a.status === 'approved').reduce((s, a) => s + a.working_days, 0)
  const totalUnjustifiedDays = allAbs.filter(a => a.type === 'unjustified' && a.status === 'approved').reduce((s, a) => s + a.working_days, 0)
  const pendingCount         = allAbs.filter(a => a.status === 'pending').length

  // Team violations (server-side scan)
  const vacPeriods: VacationPeriod[] = allAbs
    .filter(a => a.type === 'vacation' && a.status !== 'rejected')
    .map(a => {
      const emp = allEmps.find(e => e.id === a.employee_id)
      return {
        id: a.id,
        employeeId: a.employee_id,
        department: emp?.department ?? null,
        startDate:  a.start_date,
        endDate:    a.end_date,
        workingDays: a.working_days,
      }
    })
    .filter(p => p.department !== null)

  const teamViolations = detectTeamViolations(vacPeriods)

  // Per-employee conflict set: mark both employees involved in each violation pair
  const empsWithConflict = new Set<string>()
  for (let i = 0; i < vacPeriods.length; i++) {
    for (let j = i + 1; j < vacPeriods.length; j++) {
      const a = vacPeriods[i], b = vacPeriods[j]
      if (a.department !== b.department || a.employeeId === b.employeeId) continue
      const hasOverlap = a.startDate <= b.endDate && a.endDate >= b.startDate
      if (hasOverlap) {
        empsWithConflict.add(a.employeeId)
        empsWithConflict.add(b.employeeId)
      }
    }
  }

  // 10-day consecutive check per employee
  const empsMissingLongPeriod = new Set<string>()
  for (const emp of allEmps) {
    const empVacPeriods = vacPeriods.filter(p => p.employeeId === emp.id)
    if (empVacPeriods.length === 0) continue
    const hasLong = empVacPeriods.some(p => {
      const s = new Date(p.startDate + 'T00:00:00')
      const e = new Date(p.endDate   + 'T00:00:00')
      return Math.round((e.getTime() - s.getTime()) / 86400000) + 1 >= 10
    })
    if (!hasLong) empsMissingLongPeriod.add(emp.id)
  }

  return (
    <div className="p-8 space-y-8">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Férias & Faltas</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Mapa de ausências — {filterYear}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {[currentYear - 1, currentYear, currentYear + 1].map(y => (
            <Link key={y} href={`/ferias?year=${y}${dept ? `&dept=${encodeURIComponent(dept)}` : ''}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                y === filterYear
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
              }`}>
              {y}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href={`/ferias?year=${filterYear}${dept ? `&dept=${encodeURIComponent(dept)}` : ''}&settings=1`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                showSettings
                  ? 'bg-slate-800 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
              }`}>
              <Settings size={13} />
              Configurar
            </Link>
          )}
        </div>
      </div>

      {/* ── Settings panel ────────────────────────────────────────── */}
      {isAdmin && showSettings && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Settings size={15} className="text-indigo-500" />
            Dias especiais — {filterYear}
          </h2>
          <p className="text-xs text-slate-400 mb-5">
            Registe as datas de referência sugeridas (dia oferecido e ponte). Cada colaborador regista
            individualmente o seu dia oferecido como ausência do tipo <strong>Dia Oferecido</strong>.
          </p>
          <SettingsForm year={filterYear} settings={yearSettings} />
        </div>
      )}

      {/* ── Vacation rules panel ─────────────────────────────────── */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Regras de férias — {filterYear}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">Total / ano</p>
            <p className="text-xl font-bold text-slate-900">24 <span className="text-sm font-normal text-slate-400">dias úteis</span></p>
            <p className="text-xs text-slate-400 mt-1">22 base + 2 oferecidos</p>
          </div>
          <div className="bg-emerald-50 rounded-lg border border-emerald-200 px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">Dia oferecido (natal)</p>
            <p className="text-sm font-semibold text-slate-800">24 ou 31 Dez</p>
            <p className="text-xs text-slate-400 mt-1">Cada colaborador escolhe</p>
          </div>
          <div className="bg-emerald-50 rounded-lg border border-emerald-200 px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">Ponte anual</p>
            <p className="text-sm font-semibold text-slate-800">2ª ou 6ª feira</p>
            <p className="text-xs text-slate-400 mt-1">À escolha, com conciliação de equipa</p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">Distância mínima entre colegas</p>
            <p className="text-sm font-semibold text-slate-800">5 dias <span className="text-slate-400 font-normal">(calendário, férias longas)</span></p>
            <p className="text-xs text-slate-400 mt-1">3 dias úteis <span className="text-slate-400">(férias curtas ≤3d)</span></p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">Período consecutivo obrigatório</p>
            <p className="text-sm font-semibold text-slate-800">≥ 10 dias <span className="text-slate-400 font-normal">por ano</span></p>
          </div>
        </div>
      </div>

      {/* ── Team violations panel ─────────────────────────────────── */}
      {teamViolations.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-2">
          <h3 className="text-sm font-semibold text-red-800">
            ⛔ {teamViolations.length} conflito{teamViolations.length !== 1 ? 's' : ''} detetado{teamViolations.length !== 1 ? 's' : ''} nas equipas
          </h3>
          <div className="space-y-1">
            {teamViolations.map((v, i) => (
              <p key={i} className="text-xs text-red-700">{v.message}</p>
            ))}
          </div>
        </div>
      )}

      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Colaboradores</p>
          <p className="text-3xl font-bold text-slate-900 mt-3">{allEmps.length}</p>
        </div>
        <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-5">
          <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider">Dias de férias</p>
          <p className="text-3xl font-bold text-indigo-700 mt-3">{totalVacationDays}</p>
          <p className="text-xs text-indigo-400 mt-1">Total aprovados</p>
        </div>
        <div className={`rounded-xl border p-5 ${totalSickDays > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-xs font-semibold uppercase tracking-wider ${totalSickDays > 0 ? 'text-red-500' : 'text-slate-500'}`}>
            Dias de baixa
          </p>
          <p className={`text-3xl font-bold mt-3 ${totalSickDays > 0 ? 'text-red-600' : 'text-slate-300'}`}>
            {totalSickDays}
          </p>
        </div>
        <div className={`rounded-xl border p-5 ${totalUnjustifiedDays > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-xs font-semibold uppercase tracking-wider ${totalUnjustifiedDays > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
            Faltas injust.
          </p>
          <p className={`text-3xl font-bold mt-3 ${totalUnjustifiedDays > 0 ? 'text-rose-600' : 'text-slate-300'}`}>
            {totalUnjustifiedDays}
          </p>
        </div>
        <div className={`rounded-xl border p-5 ${pendingCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-xs font-semibold uppercase tracking-wider ${pendingCount > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
            Pendentes
          </p>
          <p className={`text-3xl font-bold mt-3 ${pendingCount > 0 ? 'text-amber-700' : 'text-slate-300'}`}>
            {pendingCount}
          </p>
          {pendingCount > 0 && <p className="text-xs text-amber-500 mt-1">Aguardam aprovação</p>}
        </div>
      </div>

      {/* ── Legend ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap text-xs">
        <span className="text-slate-400 font-medium">Legenda:</span>
        {Object.entries(TYPE_LABEL).map(([type, label]) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className={`inline-block w-3 h-3 rounded-sm ${TYPE_COLOR[type]}`} />
            <span className="text-slate-600">{label}</span>
          </span>
        ))}
      </div>

      {/* ── Department filter ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400 font-medium">Departamento:</span>
        <Link href={`/ferias?year=${filterYear}`}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
            !dept ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
          }`}>
          Todos
        </Link>
        {departments.map(d => (
          <Link key={d} href={`/ferias?year=${filterYear}&dept=${encodeURIComponent(d)}`}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              dept === d ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
            }`}>
            {d}
          </Link>
        ))}
      </div>

      {/* ── Mapa anual ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Mapa anual de ausências — {filterYear}
          </h2>
          <span className="text-xs text-slate-400">
            {emps.length} colaborador{emps.length !== 1 ? 'es' : ''}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-48">
                  Colaborador
                </th>
                {MONTH_NAMES.map((m, i) => (
                  <th key={i} className="text-center px-2 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {m}
                  </th>
                ))}
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Férias
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Saldo
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {emps.length === 0 ? (
                <tr>
                  <td colSpan={16} className="px-6 py-10 text-center text-slate-400 text-sm">
                    Sem colaboradores activos.
                  </td>
                </tr>
              ) : emps.map(emp => {
                const empAbs       = empAbsMap[emp.id] ?? []
                const extraDays    = exchangeMap[emp.id] ?? 0
                const totalAllowed = VACATION_DAYS + extraDays
                const vacationUsed = empAbs
                  .filter(a => a.type === 'vacation' && a.status === 'approved')
                  .reduce((s, a) => s + a.working_days, 0)
                const remaining = totalAllowed - vacationUsed

                return (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/colaboradores/${emp.id}?tab=ferias`}
                        className="font-medium text-slate-900 hover:text-indigo-600 transition-colors">
                        {emp.first_name} {emp.last_name}
                      </Link>
                      {emp.department && (
                        <p className="text-xs text-slate-400">{emp.department}</p>
                      )}
                      {extraDays > 0 && (
                        <p className="text-xs text-amber-500">+{extraDays}d prémio</p>
                      )}
                      {empsWithConflict.has(emp.id) && (
                        <p className="text-xs text-red-500 mt-0.5">
                          ⛔ conflito de equipa
                        </p>
                      )}
                      {empsMissingLongPeriod.has(emp.id) && (
                        <p className="text-xs text-amber-500 mt-0.5" title="Nenhum período com ≥10 dias consecutivos">
                          ⚠ sem período longo
                        </p>
                      )}
                    </td>
                    {Array.from({ length: 12 }, (_cell, i) => {
                      const month = i + 1
                      const daysByType = {
                        vacation:    daysInMonth(empAbs, filterYear, month, 'vacation'),
                        sick_leave:  daysInMonth(empAbs, filterYear, month, 'sick_leave'),
                        justified:   daysInMonth(empAbs, filterYear, month, 'justified'),
                        unjustified: daysInMonth(empAbs, filterYear, month, 'unjustified'),
                        other:       daysInMonth(empAbs, filterYear, month, 'other'),
                        company_day: daysInMonth(empAbs, filterYear, month, 'company_day'),
                      }
                      const totalDays = Object.values(daysByType).reduce((s, v) => s + v, 0)

                      return (
                        <td key={month} className="px-1 py-2 text-center">
                          {totalDays > 0 ? (
                            <div className="flex flex-col items-center gap-0.5">
                              {Object.entries(daysByType)
                                .filter(([, d]) => d > 0)
                                .map(([type, d]) => (
                                  <span key={type}
                                    className={`inline-flex items-center justify-center w-7 h-5 rounded text-white text-xs font-medium ${TYPE_COLOR[type]}`}
                                    title={`${TYPE_LABEL[type]}: ${d} dias`}>
                                    {d}
                                  </span>
                                ))}
                            </div>
                          ) : (
                            <span className="text-slate-200">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-bold tabular-nums ${
                        vacationUsed >= totalAllowed ? 'text-red-500'
                        : vacationUsed >= totalAllowed * 0.8 ? 'text-amber-500'
                        : 'text-slate-700'
                      }`}>
                        {vacationUsed}
                      </span>
                      <span className="text-xs text-slate-400">/{totalAllowed}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-bold tabular-nums ${
                        remaining < 0 ? 'text-red-500'
                        : remaining <= 5 ? 'text-amber-500'
                        : 'text-emerald-600'
                      }`}>
                        {remaining}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {emps.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td className="px-4 py-3 text-xs font-semibold text-slate-600">Total empresa</td>
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = i + 1
                    const total = daysInMonth(allAbs, filterYear, month)
                    return (
                      <td key={month} className="px-1 py-3 text-center">
                        {total > 0
                          ? <span className="text-xs font-semibold text-slate-600">{total}</span>
                          : <span className="text-slate-200">—</span>}
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-right text-xs font-bold text-slate-700">{totalVacationDays}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-400">
                    {allEmps.length * VACATION_DAYS - totalVacationDays} restantes
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Pending approvals ─────────────────────────────────────── */}
      {pendingCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-amber-800">
            ⚠ {pendingCount} ausência{pendingCount !== 1 ? 's' : ''} pendente{pendingCount !== 1 ? 's' : ''} de aprovação
          </h3>
          <div className="space-y-2">
            {allAbs.filter(a => a.status === 'pending').map(a => {
              const emp = allEmps.find(e => e.id === a.employee_id)
              const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })
              return (
                <div key={a.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-amber-100">
                  <div>
                    <span className="font-medium text-slate-900 text-sm">
                      {emp ? `${emp.first_name} ${emp.last_name}` : '—'}
                    </span>
                    <span className="text-slate-500 text-xs ml-2">
                      {TYPE_LABEL[a.type]} · {fmtDate(a.start_date)}–{fmtDate(a.end_date)} ({a.working_days}d)
                    </span>
                  </div>
                  {emp && (
                    <Link href={`/colaboradores/${emp.id}?tab=ferias`}
                      className="text-xs text-indigo-600 hover:underline">
                      Gerir →
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
