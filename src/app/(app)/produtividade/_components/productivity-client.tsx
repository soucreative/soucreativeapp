'use client'

import { useState, useMemo, useEffect } from 'react'
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DEPARTMENTS } from '@/lib/departments'
import { workingDaysBetween } from '@/lib/holidays'
import { MONTH_NAMES_SHORT, MONTH_NAMES_LONG } from '@/lib/constants'
import { formatEUR } from '@/lib/format'
import type { WonDeptHours } from '../page'

// ── Constantes ──────────────────────────────────────────────────────────────

// Defaults de utilização por tipo de posição (configuráveis na UI, guardados em localStorage)
const UTILIZATION_DEFAULTS: Record<string, number> = {
  employee:            0.80,
  director:            0.60,
  management:          0.50,
  professional_intern: 0.60,
  curricular_intern:   0.40,
}

const UTILIZATION_POSITION_LABEL: Record<string, string> = {
  employee:            'Colaborador',
  director:            'Diretor',
  management:          'Management',
  professional_intern: 'Estágio Profissional',
  curricular_intern:   'Estágio Curricular',
}

const POSITION_LABEL: Record<string, string> = {
  employee:            'Colaborador',
  director:            'Diretor',
  professional_intern: 'Estágio Profissional',
  curricular_intern:   'Estágio Curricular',
}

// Multiplicador simplificado — usado apenas no simulador de contratação
const EMPLOYER_MULTIPLIER = (14 / 12) * 1.2375 // ≈ 1.44

function employeeMonthlyHours(
  regime: string,
  daysPerWeek: number | null,
  startDate: string | null,
  endDate: string | null,
  monthStart: string,
  monthEnd: string,
): number {
  const from = startDate && startDate > monthStart ? startDate : monthStart
  const to   = endDate   && endDate   < monthEnd   ? endDate   : monthEnd
  if (from > to) return 0
  const days = workingDaysBetween(from, to)
  const fraction = regime === 'part_time' ? (daysPerWeek ?? 5) / 5 : 1
  return Math.round(days * 8 * fraction)
}

export type MonthlyYearData = {
  month: number
  hasFinRecord: boolean
  revenueByDept: Record<string, number>
  committedHours: number
}

export type RawEmployee = {
  id: string
  first_name: string
  last_name: string
  department: string | null
  position_type: string | null
  work_regime: string
  days_per_week: number | null
  start_date: string | null
  end_date: string | null
  base_salary: number | null
  payrollCost: number | null
  /** Horas de ausência aprovadas no mês seleccionado (férias, baixas, dias oferecidos…) */
  absenceHours: number
  /** Percentagem de tempo produtivo individual (0–1). Null = usa o default da função. */
  utilization_pct: number | null
  /** Horas reais registadas no registo de horas para o mês. Null = sem ID registo de horas ou sem dados. */
  clickupHours: number | null
  /** Subconjunto de clickupHours marcado como faturável no registo de horas. */
  clickupBillableH: number | null
  /**
   * % produtiva medida no último mês fechado (faturáveis ÷ brutas).
   * Null quando não há registo suficiente para ser representativa.
   */
  measuredUtil: number | null
  /**
   * Medição apenas informativa, para quem tem a capacidade alocada à mão
   * (estrutura no dept "Outros"). Serve para comparar com o valor manual —
   * não entra em nenhum cálculo.
   */
  measuredUtilRef: number | null
}

type EmployeeRow = RawEmployee & {
  bruto: number
  /** Horas brutas disponíveis após dedução de ausências */
  brutoNet: number
  effectiveH: number
  /** Capacidade proporcional aos dias úteis decorridos (= effectiveH em meses fechados) */
  effectiveToDate: number
  /** Origem da % produtiva usada no cálculo da capacidade */
  utilSource: 'medido' | 'perfil' | 'default'
  monthlyCost: number | null
  costPerHour: number | null
}

type DeptStats = {
  dept: string
  rows: EmployeeRow[]
  totalBruto: number
  totalEffective: number
  totalEffectiveToDate: number
  totalClickup: number
  totalBillable: number
  totalCost: number
  costPerHour: number
  revPotential: (rate: number) => number
  breakEven: (rate: number) => number
  grossMargin: (rate: number) => number
}

function buildRows(
  employees: RawEmployee[],
  monthStart: string,
  monthEnd: string,
  elapsedFraction: number,
): EmployeeRow[] {
  return employees.map(e => {
    const pt = e.position_type ?? 'employee'
    // Outsourcing: aparece nas linhas do dept para horas registo de horas, mas sem capacidade nem custo
    if (pt === 'outsourcing') {
      return { ...e, bruto: 0, brutoNet: 0, effectiveH: 0, effectiveToDate: 0, utilSource: 'default' as const, monthlyCost: null, costPerHour: null }
    }
    // Prioridade: medido no registo de horas → definido no perfil → default da função
    const utilSource: 'medido' | 'perfil' | 'default' =
      e.measuredUtil != null ? 'medido'
      : e.utilization_pct != null ? 'perfil'
      : 'default'
    const util = e.measuredUtil ?? e.utilization_pct ?? UTILIZATION_DEFAULTS[pt] ?? 0.8
    const bruto      = employeeMonthlyHours(e.work_regime, e.days_per_week, e.start_date ?? null, e.end_date ?? null, monthStart, monthEnd)
    const brutoNet   = Math.max(0, bruto - Math.round(e.absenceHours ?? 0))
    const effectiveH = Math.round(brutoNet * util)
    // Capacidade proporcional aos dias úteis já decorridos — para comparar com
    // horas trabalhadas a meio do mês sem penalizar os dias que faltam.
    const effectiveToDate = Math.round(effectiveH * elapsedFraction)
    const monthlyCost = e.payrollCost ?? (e.base_salary != null ? e.base_salary * EMPLOYER_MULTIPLIER : null)
    const costPerHour = (monthlyCost != null && effectiveH > 0) ? monthlyCost / effectiveH : null
    return { ...e, bruto, brutoNet, effectiveH, effectiveToDate, utilSource, monthlyCost, costPerHour }
  })
}

function groupByDept(rows: EmployeeRow[]): DeptStats[] {
  const map = new Map<string, EmployeeRow[]>()
  for (const r of rows) {
    const d = r.department ?? 'Sem departamento'
    if (!map.has(d)) map.set(d, [])
    map.get(d)!.push(r)
  }
  return [...map.entries()].map(([dept, drows]) => {
    const totalBruto     = drows.reduce((s, r) => s + r.bruto, 0)
    const totalEffective = drows.reduce((s, r) => s + r.effectiveH, 0)
    const totalEffectiveToDate = drows.reduce((s, r) => s + r.effectiveToDate, 0)
    const totalClickup   = Math.round(drows.reduce((s, r) => s + (r.clickupHours ?? 0), 0) * 10) / 10
    const totalBillable  = Math.round(drows.reduce((s, r) => s + (r.clickupBillableH ?? 0), 0) * 10) / 10
    const totalCost      = drows.reduce((s, r) => s + (r.monthlyCost ?? 0), 0)
    const costPerHour    = totalEffective > 0 ? totalCost / totalEffective : 0
    return {
      dept, rows: drows, totalBruto, totalEffective, totalEffectiveToDate, totalClickup, totalBillable, totalCost, costPerHour,
      revPotential: (rate: number) => totalEffective * rate,
      breakEven:    (rate: number) => rate > 0 ? (totalCost / (totalEffective * rate)) * 100 : 0,
      grossMargin:  (rate: number) => rate > 0 ? ((totalEffective * rate - totalCost) / (totalEffective * rate)) * 100 : 0,
    }
  }).sort((a, b) => b.totalEffective - a.totalEffective)
}

/**
 * Sinal de contratação:
 * - Se há dados registo de horas: baseia-se na utilização real (horas trabalhadas / capacidade)
 * - Se não há dados registo de horas: baseia-se na estrutura de custos (break-even/margem)
 */
function hiringSignal(
  breakEvenPct: number,
  marginPct: number,
  realUtilPct: number | null, // null = sem dados registo de horas
  hasRate: boolean,
): 'green' | 'yellow' | 'red' | 'unknown' {
  if (realUtilPct !== null) {
    if (realUtilPct >= 75) return 'green'   // equipa ocupada, pode precisar de reforço
    if (realUtilPct >= 50) return 'yellow'  // utilização média, monitorizar
    return 'red'                             // capacidade disponível, não contratar
  }
  // Fallback sem dados registo de horas: estrutura de custos. Sem tarifa, break-even e
  // margem valem 0 por omissão — tratá-los como medidos dava sempre vermelho.
  if (!hasRate) return 'unknown'
  if (breakEvenPct < 50 && marginPct > 50) return 'green'
  if (breakEvenPct > 75 || marginPct < 25) return 'red'
  return 'yellow'
}

const SIGNAL_STYLES = {
  green:   { dot: 'bg-emerald-400', text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', label: 'Equipa ocupada' },
  yellow:  { dot: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     label: 'Utilização média' },
  red:     { dot: 'bg-red-400',     text: 'text-red-700',     bg: 'bg-red-50 border-red-200',         label: 'Capacidade disponível' },
  unknown: { dot: 'bg-slate-300',   text: 'text-slate-600',   bg: 'bg-slate-50 border-slate-200',     label: 'Sem dados para avaliar' },
}

export default function ProductivityClient({
  employees, wonByDept, monthRevenue,
  fseCost, hasFinRecord, recordedPayroll, estimatedPayrollTotal, mgmtPayrollEstimate,
  yearlyData, year, month, tarifaPraticada, horasFaturaveisMes,
}: {
  employees: RawEmployee[]
  wonByDept: WonDeptHours[]
  monthRevenue: number
  fseCost: number
  hasFinRecord: boolean
  recordedPayroll: number | null
  estimatedPayrollTotal: number
  mgmtPayrollEstimate: number
  yearlyData: MonthlyYearData[]
  year: number
  month: number
  /** Tarifa praticada definida no Financeiro. Null quando ainda não foi definida. */
  tarifaPraticada: number | null
  /** Horas faturáveis do mês seleccionado, do registo de horas */
  horasFaturaveisMes: number
}) {
  const router = useRouter()

  function navigate(y: number, m: number) {
    router.push(`/produtividade?year=${y}&month=${m}`)
  }

  const isCurrentMonth = (() => {
    const t = new Date()
    return year === t.getFullYear() && month === t.getMonth() + 1
  })()

  const monthLabel = `${MONTH_NAMES_LONG[month - 1]} ${year}`

  // Tarifa praticada — decisão comercial definida no Financeiro. Antes vivia no
  // localStorage de cada browser, pelo que duas pessoas viam break-evens
  // diferentes para o mesmo mês.
  const marketRate = tarifaPraticada ?? 0
  // Sem tarifa não há break-even em % nem margem potencial: as fórmulas
  // devolvem 0, que no ecrã parecia um resultado medido
  const hasRate    = marketRate > 0

  const [simOpen,       setSimOpen]       = useState(false)
  const [simDept,       setSimDept]       = useState(DEPARTMENTS[0] as string)
  const [simPos,        setSimPos]        = useState('employee')
  const [simSalary,     setSimSalary]     = useState(1500)
  const [expandedDept,  setExpandedDept]  = useState<string | null>(null)

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd   = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  // Fração de dias úteis já decorridos — 1 em meses fechados, parcial no mês corrente.
  // Sem isto, a meio do mês compara-se trabalho de poucos dias com a capacidade do mês inteiro.
  const { elapsedFraction, elapsedWorkDays, totalWorkDays } = useMemo(() => {
    const total = workingDaysBetween(monthStart, monthEnd)
    if (!isCurrentMonth) return { elapsedFraction: 1, elapsedWorkDays: total, totalWorkDays: total }
    const t = new Date()
    const todayStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    const elapsed  = workingDaysBetween(monthStart, todayStr)
    return {
      elapsedFraction: total > 0 ? elapsed / total : 1,
      elapsedWorkDays: elapsed,
      totalWorkDays:   total,
    }
  }, [monthStart, monthEnd, isCurrentMonth])

  const rows  = useMemo(() => buildRows(employees, monthStart, monthEnd, elapsedFraction), [employees, monthStart, monthEnd, elapsedFraction])
  const depts = useMemo(() => groupByDept(rows), [rows])

  const totalBruto       = rows.reduce((s, r) => s + r.bruto, 0)
  const totalBrutoNet    = rows.reduce((s, r) => s + r.brutoNet, 0)
  const totalAbsenceH    = rows.reduce((s, r) => s + Math.round(r.absenceHours ?? 0), 0)
  const totalEffective   = rows.reduce((s, r) => s + r.effectiveH, 0)
  const totalEffectiveToDate = rows.reduce((s, r) => s + r.effectiveToDate, 0)
  const payrollCost    = recordedPayroll ?? estimatedPayrollTotal
  const payrollSource  = recordedPayroll != null ? 'registado' : 'estimado'
  const totalCost      = payrollCost + fseCost
  const avgCostPerH    = totalEffective > 0 ? totalCost / totalEffective : 0
  const revPotential   = totalEffective * marketRate
  const breakEven      = revPotential > 0 ? (totalCost / revPotential) * 100 : 0
  const grossMargin    = revPotential > 0 ? ((revPotential - totalCost) / revPotential) * 100 : 0

  // As horas faturadas eram estimadas dividindo a receita pela tarifa. Agora vêm
  // do registo de horas — deixa de haver conversão e o número passa a ser medido.
  const billedHours     = Math.round(horasFaturaveisMes)
  const utilizationReal = totalEffective > 0 && billedHours > 0 ? (billedHours / totalEffective) * 100 : 0
  const billedRevenue   = monthRevenue

  // ── Os três valores/hora, que respondem a perguntas diferentes ──────────
  // praticada: o preço que pomos na proposta (decisão, vem do Financeiro)
  // breakEvenHora: o mínimo para cobrir custos (medido)
  // realizadaHora: o que cada hora rendeu de facto (medido)
  // No mês em curso as horas faturáveis só vão até hoje, e o FSE também só tem
  // o que já foi lançado; os salários, esses, são do mês inteiro. Dividi-los por
  // horas de meio mês fazia o break-even/hora parecer o dobro. Conta-se por isso
  // só a parte dos salários dos dias úteis decorridos (em meses fechados é tudo).
  const hourlyCostBase = totalCost - payrollCost * (1 - elapsedFraction)
  const breakEvenHora = horasFaturaveisMes > 0 ? hourlyCostBase / horasFaturaveisMes : null
  const realizadaHora = horasFaturaveisMes > 0 ? monthRevenue   / horasFaturaveisMes : null

  // Somar a partir das linhas e não do total bruto do registo de horas: o overhead com
  // outros_pct só entra na capacidade pela fatia definida, pelo que contar as
  // horas todas no numerador inflacionaria a ocupação.
  const totalClickupRows = Math.round(rows.reduce((s, r) => s + (r.clickupHours ?? 0), 0) * 10) / 10
  const hasClickup  = totalClickupRows > 0
  const ccRevenue   = yearlyData.find(d => d.month === month)?.revenueByDept ?? {}
  const wonHours    = wonByDept.reduce((s, d) => s + d.hours_this_month, 0)

  // Simulador
  const simBruto          = workingDaysBetween(monthStart, monthEnd) * 8
  const simUtil           = UTILIZATION_DEFAULTS[simPos] ?? 0.8
  const simEffective      = Math.round(simBruto * simUtil)
  const simCost           = simSalary * EMPLOYER_MULTIPLIER
  const simDeptData       = depts.find(d => d.dept === simDept)
  const newTotalEffective = totalEffective + simEffective
  const newTotalCost      = totalCost + simCost
  const newAvgCostPerH    = newTotalEffective > 0 ? newTotalCost / newTotalEffective : 0
  const newRevPotential   = newTotalEffective * marketRate
  const newBreakEven      = newRevPotential > 0 ? (newTotalCost / newRevPotential) * 100 : 0
  const newGrossMargin    = newRevPotential > 0 ? ((newRevPotential - newTotalCost) / newRevPotential) * 100 : 0

  return (
    <div className="space-y-6">

      {/* ── 1. SELETOR DE MÊS ─────────────────────────────────────────── */}
      {(() => {
        const today   = new Date()
        const minYear = 2024
        const maxYear = today.getFullYear() + 1
        const MONTHS  = MONTH_NAMES_SHORT
        const todayY  = today.getFullYear()
        const todayM  = today.getMonth() + 1

        return (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i).map(y => (
                  <button key={y} onClick={() => navigate(y, month)}
                    className={`px-3 py-1 text-sm font-semibold rounded-lg transition-colors ${
                      y === year ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                    }`}>{y}</button>
                ))}
              </div>
              {!isCurrentMonth && (
                <button onClick={() => navigate(todayY, todayM)}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
                  Hoje →
                </button>
              )}
            </div>
            <div className="grid grid-cols-12 gap-1">
              {MONTHS.map((name, i) => {
                const m          = i + 1
                const isSelected = m === month
                const isToday    = m === todayM && year === todayY
                const isFuture   = year > todayY || (year === todayY && m > todayM)
                const yd         = yearlyData.find(d => d.month === m)
                const committed  = yd?.committedHours ?? 0
                const hasFin     = yd?.hasFinRecord ?? false
                const pct        = totalEffective > 0 ? (committed / totalEffective) * 100 : 0
                const dotColor   = hasFin
                  ? 'bg-emerald-400'
                  : isFuture && committed > 0
                    ? pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-indigo-300'
                    : 'bg-transparent'
                return (
                  <button key={m} onClick={() => navigate(year, m)}
                    className={`relative flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                      isSelected ? 'bg-indigo-600 text-white shadow-sm'
                      : isToday  ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300'
                      : isFuture ? 'text-slate-600 hover:bg-slate-100'
                      :            'text-slate-500 hover:bg-slate-100'
                    }`}>
                    {name}
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/60' : dotColor}`} />
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-4 text-[10px] text-slate-400 pt-1 border-t border-slate-100">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Faturação fechada</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-300 inline-block" /> Com horas comprometidas</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> ≥70% ocupado</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> ≥90% ocupado</span>
            </div>
          </div>
        )
      })()}

      {/* ── 2. KPIs DO MÊS (4 eixos) ──────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        {/* Capacidade */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Capacidade</p>
          <p className="text-2xl font-bold text-slate-900 mt-1.5">{totalEffective}h</p>
          <p className="text-xs text-slate-400 mt-1">
            {rows.length} pessoas · {totalBruto}h brutas
            {totalAbsenceH > 0 && (
              <span className="text-amber-600 ml-1">· −{totalAbsenceH}h ausências</span>
            )}
          </p>
          {elapsedFraction < 1 && (
            <p className="text-xs text-indigo-500 mt-1">
              {totalEffectiveToDate}h até hoje · {elapsedWorkDays} de {totalWorkDays} dias úteis
            </p>
          )}
        </div>

        {/* Horas trabalhadas — registo de horas */}
        <div className={`rounded-xl border p-4 ${hasClickup ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-xs uppercase tracking-wider font-medium ${hasClickup ? 'text-emerald-600' : 'text-slate-400'}`}>
            Trabalhadas · registo de horas
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1.5">
            {hasClickup ? `${totalClickupRows}h` : '—'}
          </p>
          <p className={`text-xs mt-1 ${hasClickup ? 'text-emerald-700' : 'text-slate-400'}`}>
            {hasClickup
              ? `${totalEffectiveToDate > 0 ? Math.round(totalClickupRows / totalEffectiveToDate * 100) : 0}% da capacidade${elapsedFraction < 1 ? ' até hoje' : ''} · ${monthLabel}`
              : `Sem horas registadas para ${monthLabel}`}
          </p>
        </div>

        {/* Faturação do mês */}
        <div className={`rounded-xl border p-4 ${monthRevenue > 0 ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-xs uppercase tracking-wider font-medium ${monthRevenue > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
            Faturação · Mês
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1.5">
            {monthRevenue > 0 ? `€${Math.round(monthRevenue).toLocaleString('pt-PT')}` : '—'}
          </p>
          <p className={`text-xs mt-1 ${monthRevenue > 0 ? 'text-blue-700' : 'text-slate-400'}`}>
            {monthRevenue > 0
              ? `Acumulado · ${monthLabel}`
              : `Sem faturação registada para ${monthLabel}`}
          </p>
        </div>

        {/* Custo médio / hora */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Custo médio / hora</p>
          <p className="text-2xl font-bold text-slate-900 mt-1.5">€{avgCostPerH.toFixed(1)}</p>
          <p className="text-xs text-slate-400 mt-1">
            €{Math.round(totalCost).toLocaleString('pt-PT')}/mês (payroll {payrollSource} + FSE) ÷ {totalEffective}h de capacidade
          </p>
        </div>
      </div>

      {/* ── 3. DEPARTAMENTOS ──────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-slate-700 mb-3">Departamentos · {monthLabel}</h2>
        <div className="grid grid-cols-2 gap-4">
          {depts.map(d => {
            const dClickup = d.totalClickup
            const dWon     = wonByDept.find(w => w.department === d.dept)?.hours_this_month ?? 0
            const isOpen   = expandedDept === d.dept

            // Métrica principal: registo de horas se existir, senão comprometidas
            const primary  = hasClickup ? dClickup : dWon
            // Compara com a capacidade decorrida — em meses fechados é igual à total
            const pctBase  = hasClickup ? d.totalEffectiveToDate : d.totalEffective
            const pct      = pctBase > 0 ? Math.round(primary / pctBase * 100) : 0
            const pctColor = pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-slate-500'
            const barColor = pct >= 80 ? 'bg-emerald-400' : pct >= 50 ? 'bg-amber-400' : 'bg-indigo-400'

            // Horas registo de horas por pessoa neste dept — usando o UUID (não o nome)
            const people = d.rows
              .map(r => ({
                name: `${r.first_name} ${r.last_name}`.trim(),
                hours: r.clickupHours ?? 0,
                billableH: r.clickupBillableH ?? 0,
                brutoNet: Math.round(r.brutoNet * elapsedFraction),
                utilUsed: r.brutoNet > 0 ? r.effectiveH / r.brutoNet : null,
                utilSource: r.utilSource,
                measuredRef: r.measuredUtilRef,
                effectiveH: r.effectiveH,
                monthlyCost: r.monthlyCost,
                work_regime: r.work_regime,
                days_per_week: r.days_per_week,
                absenceHours: r.absenceHours ?? 0,
                utilization_pct: r.utilization_pct,
                id: r.id,
              }))
              .sort((a, b) => b.hours - a.hours)

            const realUtilPct = hasClickup && d.totalEffectiveToDate > 0
              ? Math.round(dClickup / d.totalEffectiveToDate * 100)
              : null
            const signal = hiringSignal(d.breakEven(marketRate), d.grossMargin(marketRate), realUtilPct, hasRate)
            const sig    = SIGNAL_STYLES[signal]

            return (
              <div key={d.dept} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-4 space-y-3">

                  {/* Cabeçalho */}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{d.dept}</p>
                      <p className="text-xs text-slate-400">
                        {d.rows.length} pessoa{d.rows.length !== 1 ? 's' : ''} · {d.totalEffective}h capacidade
                        {elapsedFraction < 1 && (
                          <span className="text-indigo-500"> · {d.totalEffectiveToDate}h até hoje</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-black tabular-nums ${pctColor}`}>{pct}%</p>
                      <p className="text-xs text-slate-400">
                        {hasClickup ? 'trabalhadas' : 'comprometidas'}
                      </p>
                    </div>
                  </div>

                  {/* Barra principal */}
                  <div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-slate-400 mt-1">
                      <span>
                        {hasClickup ? `${dClickup}h trabalhadas` : `${dWon}h comprometidas`}
                        {' '}/ {pctBase}h
                        {hasClickup && d.totalBillable > 0 && (
                          <span className="ml-1.5 text-emerald-600 font-medium">
                            · {d.totalBillable}h faturáveis
                          </span>
                        )}
                      </span>
                      <span className="font-medium text-slate-600" title="Salários da equipa ÷ capacidade efetiva">
                        €{d.costPerHour.toFixed(1)}/h custo
                      </span>
                    </div>
                  </div>

                  {/* Breakdown por pessoa — faturável / não faturável / por registar */}
                  {hasClickup && people.some(p => p.hours > 0) && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-3 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" />faturável
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" />não faturável
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-sm bg-slate-200 inline-block" />por registar
                        </span>
                      </div>
                      {people.map(p => {
                        const base    = p.brutoNet > 0 ? p.brutoNet : Math.max(p.hours, 1)
                        const billPct = Math.min(100, (p.billableH / base) * 100)
                        const nonPct  = Math.min(100 - billPct, ((p.hours - p.billableH) / base) * 100)
                        return (
                          <div key={p.name} className="flex items-center gap-2">
                            <span className="text-xs text-slate-600 w-24 truncate shrink-0">
                              {p.name.split(' ')[0]}
                            </span>
                            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden flex">
                              <div className="h-full bg-emerald-400" style={{ width: `${billPct}%` }} />
                              <div className="h-full bg-amber-400"   style={{ width: `${nonPct}%` }} />
                            </div>
                            <span className={`text-xs tabular-nums w-8 text-right font-medium ${p.hours > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                              {p.hours > 0 ? `${p.hours}h` : '—'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Info secundária */}
                  {hasClickup && dWon > 0 ? (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                      <span className="text-slate-400">
                        {dWon}h comprometidas em propostas ({d.totalEffective > 0 ? Math.round(dWon / d.totalEffective * 100) : 0}%)
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* Toggle detalhe */}
                <button
                  className="w-full px-4 py-2 flex items-center justify-between text-xs text-slate-400 hover:bg-slate-50 border-t border-slate-100 transition-colors"
                  onClick={() => setExpandedDept(isOpen ? null : d.dept)}
                >
                  <span className="font-medium">Ver detalhes por colaborador</span>
                  {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 bg-slate-50/50 space-y-3">
                    <table className="w-full text-xs mt-2">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-100">
                          <th className="text-left py-1.5 font-medium">Nome</th>
                          <th className="text-left py-1.5 font-medium">Regime</th>
                          <th className="text-right py-1.5 font-medium">Util.</th>
                          <th className="text-right py-1.5 font-medium">Horas ef.</th>
                          <th className="text-right py-1.5 font-medium">Registadas</th>
                          <th className="text-right py-1.5 font-medium text-emerald-600">Faturável</th>
                          <th className="text-right py-1.5 font-medium text-amber-600">N/ fatur.</th>
                          <th className="text-right py-1.5 font-medium">
                            Por registar{elapsedFraction < 1 ? ' (até hoje)' : ''}
                          </th>
                          <th className="text-right py-1.5 font-medium">Custo/mês</th>
                        </tr>
                      </thead>
                      <tbody>
                        {people.map(p => (
                          <tr key={p.id} className="border-b border-slate-100 last:border-0">
                            <td className="py-1.5 font-medium text-slate-800">
                              {p.name}
                              {(p.absenceHours ?? 0) > 0 && (
                                <span className="ml-1.5 text-[10px] text-amber-600 font-normal">
                                  −{Math.round(p.absenceHours ?? 0)}h aus.
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 text-slate-400">
                              {p.work_regime === 'part_time' ? `PT ${p.days_per_week}d` : 'FT'}
                            </td>
                            <td className="py-1.5 text-right">
                              {p.utilUsed != null ? (
                                <span
                                  className={
                                    p.utilSource === 'medido'  ? 'text-emerald-700 font-medium'
                                    : p.utilSource === 'perfil' ? 'text-indigo-600 font-medium'
                                    : 'text-slate-400'
                                  }
                                  title={
                                    p.utilSource === 'medido'  ? 'Medido no registo de horas — último mês fechado'
                                    : p.utilSource === 'perfil' ? 'Definido manualmente no perfil'
                                    : 'Default da função'
                                  }
                                >
                                  {Math.round(p.utilUsed * 100)}%
                                  <span className="ml-1 text-[10px] font-normal text-slate-400">
                                    {p.utilSource === 'medido' ? 'med.' : p.utilSource === 'perfil' ? 'man.' : 'def.'}
                                  </span>
                                  {p.measuredRef != null && (
                                    <span
                                      className="ml-1 text-[10px] font-normal text-emerald-600"
                                      title="Medido no registo de horas no último mês fechado — referência, não entra no cálculo"
                                    >
                                      ({Math.round(p.measuredRef * 100)}% real)
                                    </span>
                                  )}
                                </span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="py-1.5 text-right text-slate-600">{p.effectiveH}h</td>
                            <td className="py-1.5 text-right">
                              {p.hours > 0
                                ? <span className="text-indigo-600 font-medium">{p.hours}h</span>
                                : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="py-1.5 text-right">
                              {p.hours > 0
                                ? <span className="text-emerald-700 font-medium">
                                    {Math.round(p.billableH)}h
                                    <span className="ml-1 text-[10px] font-normal text-slate-400">
                                      {Math.round((p.billableH / p.hours) * 100)}%
                                    </span>
                                  </span>
                                : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="py-1.5 text-right">
                              {p.hours > 0 && p.hours - p.billableH > 0
                                ? <span className="text-amber-600">{Math.round(p.hours - p.billableH)}h</span>
                                : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="py-1.5 text-right">
                              {p.brutoNet > 0
                                ? <span className={p.brutoNet - p.hours > p.brutoNet * 0.5 ? 'text-red-500 font-medium' : 'text-slate-400'}>
                                    {Math.max(0, Math.round(p.brutoNet - p.hours))}h
                                  </span>
                                : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="py-1.5 text-right text-slate-600">
                              {p.monthlyCost != null ? `€${Math.round(p.monthlyCost).toLocaleString('pt-PT')}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${sig.bg} ${sig.text}`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${sig.dot}`} />
                      <span>
                        <strong>{sig.label}</strong>
                        {realUtilPct !== null && ` · ${realUtilPct}% utilização real`}
                        {hasRate
                          ? ` · Break-even ${d.breakEven(marketRate).toFixed(0)}%${realUtilPct === null ? ` · Margem potencial ${d.grossMargin(marketRate).toFixed(0)}%` : ''}`
                          : <> · Break-even: <Link href="/financeiro" className="underline hover:no-underline">define a tarifa hora no Financeiro</Link></>
                        }
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 4. ANÁLISE FINANCEIRA ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
        <h2 className="text-base font-semibold text-slate-900">Análise financeira · {monthLabel}</h2>

        {/* Custos — 2 cards + total como sub-linha */}
        <div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <p className="text-xs text-slate-400 uppercase tracking-wider">Payroll <span className="normal-case">({payrollSource})</span></p>
              <p className="text-xl font-bold text-slate-900 mt-1">€{Math.round(payrollCost).toLocaleString('pt-PT')}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <p className="text-xs text-slate-400 uppercase tracking-wider">FSE + custos directos</p>
              <p className="text-xl font-bold text-slate-900 mt-1">€{Math.round(fseCost).toLocaleString('pt-PT')}</p>
              {!hasFinRecord && <p className="text-xs text-amber-600 mt-0.5">⚠ Mês sem registo financeiro</p>}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2 text-right">
            Total de custos: <strong className="text-slate-700">€{Math.round(totalCost).toLocaleString('pt-PT')}</strong>
          </p>
        </div>

        {/* Break-even */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-slate-800">Ponto de equilíbrio</p>
                {billedHours > 0 && hasRate && (
                  <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
                    utilizationReal >= breakEven
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {utilizationReal >= breakEven ? '✓ Em equilíbrio' : '⚠ Abaixo do equilíbrio'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Com <strong className="text-slate-600">€{Math.round(totalCost).toLocaleString('pt-PT')}</strong> de custos
                {marketRate > 0 ? (
                  <> e tarifa de <strong className="text-slate-600">€{marketRate}/h</strong>,
                  é necessário faturar <strong className="text-slate-600">{Math.round(totalEffective * breakEven / 100)}h</strong> — {breakEven.toFixed(0)}% da capacidade disponível.</>
                ) : (
                  <> e sem tarifa definida, não é possível calcular a percentagem de capacidade necessária.</>
                )}
              </p>
            </div>
            {marketRate > 0 && (
              <div className="text-right shrink-0">
                <p className="text-3xl font-black text-slate-900 tabular-nums">{breakEven.toFixed(0)}%</p>
                <p className="text-xs text-slate-400">necessário</p>
              </div>
            )}
          </div>

          {/* Os três valores/hora */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-400 uppercase tracking-wider">Tarifa praticada</p>
              <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                {marketRate > 0 ? `€${marketRate}` : '—'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {marketRate > 0
                  ? 'definida no Financeiro'
                  : <Link href="/financeiro" className="text-indigo-600 hover:underline">definir no Financeiro</Link>}
              </p>
            </div>
            <div className="bg-amber-50 rounded-lg border border-amber-200 p-3">
              <p className="text-xs text-amber-700 uppercase tracking-wider">Break-even</p>
              <p className="text-xl font-bold text-amber-800 mt-1 tabular-nums">
                {breakEvenHora != null ? `€${breakEvenHora.toFixed(1)}` : '—'}
              </p>
              <p className="text-xs text-amber-600 mt-0.5">mínimo para cobrir custos</p>
              {breakEvenHora != null && (
                <p className="text-[11px] text-amber-600/80 mt-0.5 tabular-nums">
                  €{Math.round(hourlyCostBase).toLocaleString('pt-PT')} ÷ {Math.round(horasFaturaveisMes)}h faturáveis
                  {elapsedFraction < 1 && ' · salários até hoje'}
                </p>
              )}
            </div>
            <div className={`rounded-lg border p-3 ${
              realizadaHora != null && breakEvenHora != null && realizadaHora >= breakEvenHora
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <p className="text-xs text-emerald-700 uppercase tracking-wider">Realizada</p>
              <p className="text-xl font-bold text-emerald-800 mt-1 tabular-nums">
                {realizadaHora != null ? `€${realizadaHora.toFixed(1)}` : '—'}
              </p>
              {/* Receita e não custo: sobe com a faturação por definição */}
              <p className="text-xs text-emerald-600 mt-0.5">receita ÷ horas faturáveis — não é custo</p>
              {realizadaHora != null && breakEvenHora != null && (
                <p className="text-[11px] text-emerald-600/80 mt-0.5 tabular-nums">
                  {realizadaHora >= breakEvenHora ? '+' : ''}€{(realizadaHora - breakEvenHora).toFixed(1)} de margem por hora
                </p>
              )}
            </div>
          </div>

          {/* Barra break-even */}
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden relative">
            <div className="h-full bg-indigo-400 rounded-full transition-all"
              style={{ width: `${hasRate ? Math.min(breakEven, 100) : 0}%` }} />
            {utilizationReal > 0 && (
              <div className="absolute top-0 left-0 h-full bg-emerald-400/70 rounded-full transition-all"
                style={{ width: `${Math.min(utilizationReal, 100)}%` }} />
            )}
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400 inline-block shrink-0" />
              <span className="text-slate-500">
                Break-even:{' '}
                {hasRate
                  ? <strong className="text-slate-700">{breakEven.toFixed(0)}%</strong>
                  : <Link href="/financeiro" className="text-indigo-600 hover:underline">sem tarifa definida</Link>}
              </span>
            </div>
            {billedHours > 0 ? (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block shrink-0" />
                <span className="text-slate-500">Faturado: <strong className="text-slate-700">{utilizationReal.toFixed(0)}%</strong> · {billedHours}h · €{Math.round(billedRevenue).toLocaleString('pt-PT')}</span>
              </div>
            ) : (
              <span className="text-slate-400 italic">Sem horas faturadas registadas este mês</span>
            )}
          </div>
        </div>

        {/* Pressupostos de capacidade — colapsável */}
        <details className="group border border-slate-200 rounded-lg overflow-hidden">
          <summary className="px-4 py-2.5 bg-slate-50 cursor-pointer flex items-center justify-between list-none select-none">
            <div>
              <p className="text-xs font-semibold text-slate-700">Defaults de % produtivo por função</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Último recurso. A % produtiva vem primeiro do registo de horas (faturáveis ÷ brutas do
                último mês fechado, com pelo menos 50% das horas registadas); se não houver
                registo suficiente, do valor definido no perfil; só depois destes defaults.
              </p>
            </div>
            <span className="text-slate-400 text-xs transition-transform group-open:rotate-180">▼</span>
          </summary>
          <div className="grid grid-cols-5 gap-0 divide-x divide-slate-100 border-t border-slate-100">
            {Object.entries(UTILIZATION_DEFAULTS).filter(([k]) => k !== 'outsourcing').map(([key, val]) => (
              <div key={key} className="px-3 py-3 text-center">
                <p className="text-xs text-slate-500 mb-1.5">{UTILIZATION_POSITION_LABEL[key]}</p>
                <p className="text-lg font-bold text-slate-700">{Math.round(val * 100)}%</p>
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* ── 5. VISÃO ANUAL ────────────────────────────────────────────── */}
      <YearOverview
        yearlyData={yearlyData}
        capacity={totalEffective}
        marketRate={marketRate}
        selectedMonth={month}
        onSelectMonth={m => navigate(year, m)}
        year={year}
      />

      {/* ── 6. SIMULADOR DE CONTRATAÇÃO ───────────────────────────────── */}
      <div className="bg-white rounded-xl border-2 border-indigo-200 overflow-hidden">
        <button
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-indigo-50/50 transition-colors"
          onClick={() => setSimOpen(!simOpen)}
        >
          <div>
            <h2 className="font-semibold text-slate-900">🧮 Simulador de contratação</h2>
            <p className="text-xs text-slate-500 mt-0.5">Vê o impacto de contratar uma nova pessoa antes de decidir</p>
          </div>
          {simOpen ? <ChevronUp size={18} className="text-indigo-500" /> : <ChevronDown size={18} className="text-indigo-500" />}
        </button>

        {simOpen && (
          <div className="border-t border-indigo-200 p-6 space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Departamento</label>
                <select value={simDept} onChange={e => setSimDept(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Posição</label>
                <select value={simPos} onChange={e => setSimPos(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="employee">Colaborador (100%)</option>
                  <option value="director">Diretor (70%)</option>
                  <option value="professional_intern">Estágio Profissional (60%)</option>
                  <option value="curricular_intern">Estágio Curricular (40%)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Salário bruto mensal (€)</label>
                <input type="number" min={700} value={simSalary} onChange={e => setSimSalary(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Impacto global</h4>
                <SimDelta label="Horas efectivas / mês" before={totalEffective} after={newTotalEffective} unit="h" />
                <SimDelta label="Custo mensal total" before={totalCost} after={newTotalCost} unit="€" prefix format />
                <SimDelta label="Custo médio / hora" before={avgCostPerH} after={newAvgCostPerH} unit="€/h" prefix decimals={1} />
                {hasRate && (
                  <>
                    <SimDelta label="Receita potencial" before={revPotential} after={newRevPotential} unit="€" prefix format />
                    <SimDelta label="Break-even" before={breakEven} after={newBreakEven} unit="%" decimals={1} invertColor />
                    <SimDelta label="Margem bruta potencial" before={grossMargin} after={newGrossMargin} unit="%" decimals={1} />
                  </>
                )}
              </div>

              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Análise</h4>
                <div className="space-y-2 text-sm">
                  <p className="text-slate-600">
                    Esta contratação adiciona <strong>{simEffective}h/mês</strong> de capacidade efectiva
                    e custa <strong>€{Math.round(simCost).toLocaleString('pt-PT')}/mês</strong> ao empregador
                    (€{simSalary.toLocaleString('pt-PT')} brutos × 1,44).
                  </p>
                  <p className="text-slate-600">
                    Custo/hora desta pessoa: <strong>€{simEffective > 0 ? (simCost / simEffective).toFixed(1) : '—'}/h</strong>
                    {' '}vs média actual de <strong>€{avgCostPerH.toFixed(1)}/h</strong>.
                  </p>
                  {!hasRate ? (
                    <p className="text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">
                      Para ver o impacto no break-even,{' '}
                      <Link href="/financeiro" className="text-indigo-600 hover:underline">define a tarifa hora praticada no Financeiro</Link>.
                    </p>
                  ) : newBreakEven > breakEven ? (
                    <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      ⚠️ O break-even sobe de {breakEven.toFixed(0)}% para {newBreakEven.toFixed(0)}%.
                      Só vale a pena se tiveres pipeline para absorver as horas extra.
                    </p>
                  ) : (
                    <p className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      ✓ Break-even controlado ({newBreakEven.toFixed(0)}%).
                      Esta contratação é eficiente a este salário.
                    </p>
                  )}
                  {simDeptData && (
                    <p className="text-slate-500 text-xs">
                      {simDept}: {simDeptData.totalEffective}h → {simDeptData.totalEffective + simEffective}h efectivas/mês.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Visão anual ──────────────────────────────────────────────────────────────

const MONTH_LABELS = MONTH_NAMES_SHORT

function YearOverview({
  yearlyData, capacity, marketRate, selectedMonth, onSelectMonth, year,
}: {
  yearlyData: MonthlyYearData[]
  capacity: number
  marketRate: number
  selectedMonth: number
  onSelectMonth: (m: number) => void
  year: number
}) {
  const today        = new Date()
  const currentYear  = today.getFullYear()
  const currentMonth = today.getMonth() + 1

  const monthData = yearlyData.map(d => {
    const totalRevenue = Object.values(d.revenueByDept).reduce((s, v) => s + v, 0)
    const billedHours  = d.hasFinRecord && marketRate > 0 ? Math.round(totalRevenue / marketRate) : null
    const isFuture     = year > currentYear || (year === currentYear && d.month > currentMonth)
    const isCurrent    = year === currentYear && d.month === currentMonth
    return { ...d, totalRevenue, billedHours, isFuture, isCurrent }
  })

  const maxHours = Math.max(capacity, ...monthData.map(d => d.billedHours ?? d.committedHours))

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-slate-900">Visão anual {year}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Meses fechados: horas equivalentes (receita ÷ {marketRate}€/h) · Meses abertos: horas comprometidas de propostas
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-400 inline-block" /> Comprometido</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block" /> Faturado</span>
          <span className="flex items-center gap-1.5"><span className="w-8 border-t-2 border-dashed border-slate-400 inline-block" /> Capacidade</span>
        </div>
      </div>

      <div className="flex items-end gap-1.5" style={{ height: 120 }}>
        {monthData.map(d => {
          const barH       = maxHours > 0 ? (d.billedHours ?? d.committedHours) / maxHours : 0
          const capH       = maxHours > 0 ? capacity / maxHours : 0
          const isSelected = d.month === selectedMonth
          const pct        = capacity > 0 ? Math.round(((d.billedHours ?? d.committedHours) / capacity) * 100) : 0

          return (
            <button key={d.month} onClick={() => onSelectMonth(d.month)}
              title={`${MONTH_LABELS[d.month - 1]}: ${d.billedHours != null ? `${d.billedHours}h faturadas (€${Math.round(d.totalRevenue).toLocaleString('pt-PT')})` : `${d.committedHours}h comprometidas`} · ${pct}% capacidade`}
              className={`relative flex-1 flex flex-col justify-end rounded-t-sm transition-all ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-1' : 'hover:opacity-80'}`}
              style={{ height: '100%' }}
            >
              <div className="absolute left-0 right-0 border-t-2 border-dashed border-slate-300 pointer-events-none"
                style={{ bottom: `${capH * 100}%` }} />
              <div className={`w-full rounded-t-sm ${
                d.isFuture   ? 'bg-slate-200'
                : d.hasFinRecord ? pct >= 90 ? 'bg-emerald-500' : pct >= 60 ? 'bg-emerald-400' : 'bg-amber-400'
                : 'bg-indigo-400'
              }`} style={{ height: `${barH * 100}%`, minHeight: barH > 0 ? 2 : 0 }} />
            </button>
          )
        })}
      </div>

      <div className="flex gap-1.5 mt-1">
        {monthData.map(d => (
          <div key={d.month}
            className={`flex-1 text-center text-xs font-medium ${d.month === selectedMonth ? 'text-indigo-600' : d.isFuture ? 'text-slate-300' : 'text-slate-400'}`}>
            {MONTH_LABELS[d.month - 1]}
          </div>
        ))}
      </div>

      <div className="flex gap-1.5 mt-0.5">
        {monthData.map(d => {
          const val = d.billedHours ?? (d.isFuture ? null : d.committedHours)
          const pct = capacity > 0 && val != null ? Math.round((val / capacity) * 100) : null
          return (
            <div key={d.month} className="flex-1 text-center">
              {val != null ? (
                <span className={`text-[10px] tabular-nums font-semibold ${
                  d.isFuture ? 'text-slate-300'
                  : d.hasFinRecord ? pct! >= 90 ? 'text-emerald-600' : pct! >= 60 ? 'text-emerald-500' : 'text-amber-500'
                  : 'text-indigo-500'
                }`}>{val}h</span>
              ) : (
                <span className="text-[10px] text-slate-200">—</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── SimDelta ─────────────────────────────────────────────────────────────────

function SimDelta({ label, before, after, unit, prefix, format, decimals, invertColor }: {
  label: string; before: number; after: number; unit: string
  prefix?: boolean; format?: boolean; decimals?: number; invertColor?: boolean
}) {
  const delta = after - before
  const pct   = before > 0 ? (delta / before) * 100 : 0
  const isPos = delta > 0
  const good  = invertColor ? !isPos : isPos
  const fmt   = (v: number) => {
    const s = decimals != null ? v.toFixed(decimals) : Math.round(v).toLocaleString('pt-PT')
    return prefix ? `€${s}` : `${s}${unit}`
  }

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-slate-400">{fmt(before)}</span>
        <span className="text-slate-300">→</span>
        <span className="font-semibold text-slate-900">{fmt(after)}</span>
        <span className={`flex items-center gap-0.5 text-xs font-medium ${good ? 'text-emerald-600' : 'text-red-500'}`}>
          {isPos ? <TrendingUp size={12} /> : delta < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
          {Math.abs(pct).toFixed(1)}%
        </span>
      </div>
    </div>
  )
}
