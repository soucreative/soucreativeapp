import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import type { AnnualBonus, PerformanceRecord, Employee } from '@/types/database'
import { getCurrentEmployee } from '@/lib/auth'
import { canAccess } from '@/lib/permissions'
import { TSU_RATE } from '@/lib/payroll'
import SalaryProposals from './_components/salary-proposals'

const fmt  = (v: number) =>
  v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const fmt2 = (v: number) =>
  v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const positionLabel: Record<string, string> = {
  director:            'Diretor',
  employee:            'Colaborador',
  professional_intern: 'Estágio Prof.',
  curricular_intern:   'Estágio Curr.',
}
const positionStyle: Record<string, string> = {
  director:            'bg-violet-100 text-violet-700',
  employee:            'bg-slate-100 text-slate-600',
  professional_intern: 'bg-amber-100 text-amber-700',
  curricular_intern:   'bg-blue-100 text-blue-600',
}
const paymentStatusLabel: Record<string, string> = {
  pending: 'Pendente',
  paid:    'Pago',
  overdue: 'Em atraso',
}
const paymentStatusStyle: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  paid:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
  overdue: 'bg-red-50 text-red-700 border border-red-200',
}

type EmpRow = Pick<Employee, 'id' | 'first_name' | 'last_name' | 'department' | 'position_type'>

export default async function RemuneracaoPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const emp = await getCurrentEmployee()
  if (!emp || !canAccess(emp.app_role, '/remuneracao')) redirect('/')

  const { year } = await searchParams
  const now         = new Date()
  const currentYear = now.getFullYear()
  const filterYear  = Number(year ?? currentYear)
  const currentMonth = now.getMonth() + 1
  const currentQ    = Math.ceil(currentMonth / 3)
  const qMonths     = [1, 2, 3].map(i => (currentQ - 1) * 3 + i)

  const supabase = createAdminClient()

  const [empsRes, compsRes, taxRes, perfRes, bonusRes, proposalsRes] = await Promise.all([
    supabase.from('employees').select('id, first_name, last_name, department, position_type, status').eq('status', 'active'),
    supabase.from('compensation').select('employee_id, base_salary, effective_date, end_date').is('end_date', null),
    supabase.from('employee_tax_info').select('employee_id, subsidy_payment_mode'),
    supabase.from('performance_records').select('*').eq('year', filterYear),
    supabase.from('annual_bonus').select('*').eq('year', filterYear),
    // Propostas por decidir — a tabela pode ainda não existir
    supabase.from('salary_proposals')
      .select('id, employee_id, current_salary, proposed_salary, effective_date, notes')
      .eq('status', 'proposta')
      .order('proposed_salary', { ascending: false }),
  ])

  const propostas = (proposalsRes.data ?? []) as {
    id: string; employee_id: string
    current_salary: number; proposed_salary: number
    effective_date: string; notes: string | null
  }[]

  // Custo para a empresa de subir a base: 14 meses e TSU, como no estimador
  const custoAnualDe = (delta: number) => delta * 14 * TSU_RATE

  const employees  = (empsRes.data  ?? []) as EmpRow[]
  const comps      = (compsRes.data ?? []) as { employee_id: string; base_salary: number; effective_date: string; end_date: string | null }[]
  const taxInfos   = (taxRes.data   ?? []) as { employee_id: string; subsidy_payment_mode: string }[]
  const perfRecs   = (perfRes.data  ?? []) as PerformanceRecord[]
  const bonuses    = (bonusRes.data ?? []) as AnnualBonus[]

  const empMap     = Object.fromEntries(employees.map(e => [e.id, e]))
  const compMap    = Object.fromEntries(comps.map(c => [c.employee_id, c]))
  const taxMap     = Object.fromEntries(taxInfos.map(t => [t.employee_id, t.subsidy_payment_mode]))

  // ── Salary KPIs ────────────────────────────────────────────────
  const headcount  = employees.length
  const totalBase  = comps.reduce((s, c) => s + c.base_salary, 0)
  const totalMonthly = comps.reduce((s, c) => {
    const mode = taxMap[c.employee_id] ?? 'full'
    return s + (mode === 'twelfths' ? (c.base_salary * 14) / 12 : c.base_salary)
  }, 0)
  // Em duodécimos os subsídios já estão no mensal; sem subsídios não há 14º nem 15º
  const totalAnnual = comps.reduce((s, c) => {
    const mode = taxMap[c.employee_id] ?? 'full'
    return s + (mode === 'full' ? c.base_salary * 14 : c.base_salary * 12)
  }, 0)

  // ── Bonus KPIs ──────────────────────────────────────────────────
  const varMonthly   = perfRecs.filter(r => r.month === currentMonth).reduce((s, r) => s + (r.variable_earned ?? 0), 0)
  const varQuarterly = perfRecs.filter(r => qMonths.includes(r.month)).reduce((s, r) => s + (r.variable_earned ?? 0), 0)
  const varYTD       = perfRecs.reduce((s, r) => s + (r.variable_earned ?? 0), 0)

  const annualBonusTotal  = bonuses.reduce((s, b) => s + b.total_amount, 0)
  const annualBonusPaid   = bonuses.reduce((s, b) =>
    s + (b.first_payment_status  === 'paid' ? b.first_payment_amount  : 0)
      + (b.second_payment_status === 'paid' ? b.second_payment_amount : 0), 0)
  const annualBonusPending = annualBonusTotal * 2 - annualBonusPaid  // both halves

  const premiosTotais = varYTD + annualBonusPaid

  // ── Per-employee variable breakdown ────────────────────────────
  // perfByEmp[employeeId][month] = variable_earned
  const perfByEmp: Record<string, Record<number, number>> = {}
  for (const r of perfRecs) {
    if (!perfByEmp[r.employee_id]) perfByEmp[r.employee_id] = {}
    perfByEmp[r.employee_id][r.month] = r.variable_earned ?? 0
  }

  // bonusByEmp[employeeId] = AnnualBonus
  const bonusByEmp = Object.fromEntries(bonuses.map(b => [b.employee_id, b]))

  // Employees with any bonus data
  const relevantEmpIds = new Set([
    ...Object.keys(perfByEmp),
    ...Object.keys(bonusByEmp),
  ])
  const bonusEmployees = [...relevantEmpIds]
    .map(id => empMap[id])
    .filter(Boolean)
    .sort((a, b) => {
      const aD = a.position_type === 'director' ? 0 : 1
      const bD = b.position_type === 'director' ? 0 : 1
      return aD !== bD ? aD - bD : `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
    })

  // Salary rows grouped by dept
  const sorted = [...employees].sort((a, b) => {
    const aD = a.position_type === 'director' ? 0 : 1
    const bD = b.position_type === 'director' ? 0 : 1
    if (aD !== bD) return aD - bD
    return (compMap[b.id]?.base_salary ?? 0) - (compMap[a.id]?.base_salary ?? 0)
  })
  const byDept: Record<string, EmpRow[]> = {}
  for (const emp of sorted) {
    const dept = emp.department ?? 'Sem departamento'
    if (!byDept[dept]) byDept[dept] = []
    byDept[dept].push(emp)
  }

  return (
    <div className="p-8 space-y-10">

      {/* ── Header + year selector ────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Remuneração</h1>
          <p className="text-slate-500 text-sm mt-1">
            Salários e prémios — {headcount} colaborador{headcount !== 1 ? 'es' : ''} ativo{headcount !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[currentYear - 1, currentYear, currentYear + 1].map(y => (
            <Link
              key={y}
              href={`/remuneracao?year=${y}`}
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

      {/* ── Propostas por decidir ─────────────────────────────────── */}
      <SalaryProposals
        rows={propostas.map(p => {
          const emp = employees.find(e => e.id === p.employee_id)
          return {
            id:              p.id,
            nome:            emp ? `${emp.first_name.trim()} ${emp.last_name}`.trim() : 'Colaborador',
            departamento:    emp?.department ?? null,
            current_salary:  p.current_salary,
            proposed_salary: p.proposed_salary,
            effective_date:  p.effective_date,
            custoAnual:      custoAnualDe(p.proposed_salary - p.current_salary),
          }
        })}
      />

      {/* ── Massa salarial KPIs ────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Massa salarial</h2>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard label="Colaboradores ativos" value={String(headcount)} />
          <KpiCard label="Salário base / mês" sub="Sem subsídios" value={fmt(totalBase)} />
          <KpiCard label="Massa salarial / mês" sub="Com duodécimos" value={fmt(totalMonthly)} />
          <KpiCard label="Custo salarial anual" sub="14 ou 12 meses" value={fmt(totalAnnual)} />
        </div>
      </section>

      {/* ── Prémios acumulados ─────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Prémios acumulados — {filterYear}
        </h2>

        {/* Variable pay KPI row */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            label={`${MONTHS[currentMonth - 1]} ${filterYear}`}
            sub="Prémio variável mensal"
            value={fmt(varMonthly)}
            accent
          />
          <KpiCard
            label={`Q${currentQ} ${filterYear}`}
            sub="Prémio variável trimestral"
            value={fmt(varQuarterly)}
            accent
          />
          <KpiCard
            label={`Acumulado ${filterYear}`}
            sub="Prémio variável YTD"
            value={fmt(varYTD)}
            accent
          />
          <KpiCard
            label={`Prémios anuais ${filterYear}`}
            sub={`${fmt(annualBonusPaid)} pago · ${fmt(annualBonusTotal - annualBonusPaid / 2)} pendente`}
            value={fmt(annualBonusTotal)}
            accent
          />
        </div>

        {/* Total summary strip */}
        {(varYTD > 0 || annualBonusTotal > 0) && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-6 py-4 flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-indigo-800 font-medium">
              Total de prémios pagos em {filterYear}
            </p>
            <p className="text-2xl font-bold text-indigo-700 tabular-nums">{fmt(premiosTotais)}</p>
          </div>
        )}

        {/* Per-employee variable breakdown */}
        {bonusEmployees.length > 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <div className="px-6 py-3 border-b border-slate-100 bg-slate-50">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Detalhe por colaborador
              </h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider sticky left-0 bg-white">Colaborador</th>
                  {MONTHS.map(m => (
                    <th key={m} className="text-right px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{m}</th>
                  ))}
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Var. Total</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Prémio anual</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {bonusEmployees.map(emp => {
                  const monthData = perfByEmp[emp.id] ?? {}
                  const varTotal  = Object.values(monthData).reduce((s, v) => s + v, 0)
                  const bonus     = bonusByEmp[emp.id]
                  const bonusTotal = bonus?.total_amount ?? 0
                  const empTotal  = varTotal + bonusTotal

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 sticky left-0 bg-white hover:bg-slate-50">
                        <p className="font-medium text-slate-900 whitespace-nowrap">
                          {emp.first_name} {emp.last_name}
                        </p>
                        <p className="text-xs text-slate-400">{emp.department ?? '—'}</p>
                      </td>
                      {MONTHS.map((_, i) => {
                        const month = i + 1
                        const val   = monthData[month]
                        return (
                          <td key={month} className="px-3 py-3 text-right tabular-nums text-xs">
                            {val != null && val > 0
                              ? <span className="text-emerald-700 font-medium">{fmt(val)}</span>
                              : <span className="text-slate-200">—</span>}
                          </td>
                        )
                      })}
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums">
                        {varTotal > 0 ? fmt(varTotal) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {bonus ? (
                          <span className="text-violet-700 font-medium">{fmt(bonusTotal)}</span>
                        ) : <span className="text-slate-200">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                        {empTotal > 0 ? fmt(empTotal) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  )
                })}

                {/* Totals row */}
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                  <td className="px-4 py-3 text-slate-700 sticky left-0 bg-slate-50">Total</td>
                  {MONTHS.map((_, i) => {
                    const month = i + 1
                    const total = perfRecs.filter(r => r.month === month).reduce((s, r) => s + (r.variable_earned ?? 0), 0)
                    return (
                      <td key={month} className="px-3 py-3 text-right tabular-nums text-xs">
                        {total > 0
                          ? <span className="text-emerald-700">{fmt(total)}</span>
                          : <span className="text-slate-200">—</span>}
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-right text-slate-900 tabular-nums">{fmt(varYTD)}</td>
                  <td className="px-4 py-3 text-right text-violet-700 tabular-nums">{fmt(annualBonusTotal)}</td>
                  <td className="px-4 py-3 text-right text-slate-900 tabular-nums">{fmt(varYTD + annualBonusTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
            Sem registos de prémios em {filterYear}.
            <p className="text-xs mt-1 text-slate-300">Os prémios variáveis são registados mensalmente no perfil de cada colaborador.</p>
          </div>
        )}

        {/* Annual bonus detail */}
        {bonuses.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-3 border-b border-slate-100 bg-slate-50">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Prémios anuais {filterYear} — detalhe de pagamentos
              </h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-6 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Colaborador</th>
                  <th className="text-right px-6 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Total prémio</th>
                  <th className="text-right px-6 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">1.ª prestação</th>
                  <th className="text-left px-6 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado 1.ª</th>
                  <th className="text-right px-6 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">2.ª prestação</th>
                  <th className="text-left px-6 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado 2.ª</th>
                  <th className="text-left px-6 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Prazo 2.ª</th>
                  <th className="px-6 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bonuses.map(b => {
                  const emp = empMap[b.employee_id]
                  return (
                    <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-900">
                        {emp ? `${emp.first_name} ${emp.last_name}` : '—'}
                        {emp?.department && <span className="text-xs text-slate-400 ml-1.5">· {emp.department}</span>}
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-slate-800 tabular-nums">
                        {fmt2(b.total_amount)}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-slate-700">
                        {fmt2(b.first_payment_amount)}
                        {b.first_payment_date && (
                          <span className="block text-xs text-slate-400">
                            {new Date(b.first_payment_date).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${paymentStatusStyle[b.first_payment_status]}`}>
                          {paymentStatusLabel[b.first_payment_status]}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-slate-700">
                        {fmt2(b.second_payment_amount)}
                        {b.second_payment_date && (
                          <span className="block text-xs text-slate-400">
                            {new Date(b.second_payment_date).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${paymentStatusStyle[b.second_payment_status]}`}>
                          {paymentStatusLabel[b.second_payment_status]}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-500">
                        {new Date(b.second_payment_deadline).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link href={`/colaboradores/${b.employee_id}`} className="text-xs text-indigo-600 hover:underline">
                          Ver →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Salários por departamento ─────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Salários por departamento</h2>
        {Object.entries(byDept).map(([dept, rows]) => {
          const deptMonthly = rows.reduce((s, e) => {
            const c = compMap[e.id]
            if (!c) return s
            const mode = taxMap[e.id] ?? 'full'
            return s + (mode === 'twelfths' ? (c.base_salary * 14) / 12 : c.base_salary)
          }, 0)
          const deptPct = totalMonthly > 0 ? (deptMonthly / totalMonthly) * 100 : 0

          return (
            <div key={dept} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-slate-700">{dept}</h3>
                  <span className="text-xs text-slate-400">{rows.length} pessoa{rows.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-slate-900 tabular-nums">{fmt(deptMonthly)}/mês</span>
                  <span className="text-xs text-slate-400 ml-2">{deptPct.toFixed(1)}% do total</span>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-6 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Colaborador</th>
                    <th className="text-left px-6 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Posição</th>
                    <th className="text-right px-6 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Salário base</th>
                    <th className="text-left px-6 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Subsídios</th>
                    <th className="text-right px-6 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Custo mensal</th>
                    <th className="text-right px-6 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Custo anual</th>
                    <th className="text-left px-6 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Desde</th>
                    <th className="px-6 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map(emp => {
                    const c    = compMap[emp.id]
                    const mode = taxMap[emp.id] ?? 'full'
                    const base = c?.base_salary ?? 0
                    const monthly = mode === 'twelfths' ? (base * 14) / 12 : base
                    const annual  = mode === 'full' ? base * 14 : base * 12
                    const posType = emp.position_type ?? 'employee'

                    return (
                      <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 font-medium text-slate-900">
                          {emp.first_name} {emp.last_name}
                        </td>
                        <td className="px-6 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${positionStyle[posType] ?? positionStyle.employee}`}>
                            {positionLabel[posType] ?? posType}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right font-medium text-slate-700 tabular-nums">
                          {c ? fmt2(base) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-6 py-3">
                          {mode === 'twelfths' ? (
                            <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">Duodécimos</span>
                          ) : mode === 'none' ? (
                            <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Sem subsídios</span>
                          ) : (
                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Totalidade</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-right text-slate-700 tabular-nums">
                          {c ? fmt2(monthly) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-6 py-3 text-right text-slate-600 tabular-nums">
                          {c ? fmt(annual) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-6 py-3 text-slate-400 text-xs">
                          {c ? new Date(c.effective_date).toLocaleDateString('pt-PT', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          }) : '—'}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <Link href={`/colaboradores/${emp.id}?tab=remuneracao`} className="text-xs text-indigo-600 hover:underline">
                            Ver →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })}

        {employees.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
            Nenhum colaborador ativo com salário registado.{' '}
            <Link href="/colaboradores" className="text-indigo-600 hover:underline">Ir para colaboradores →</Link>
          </div>
        )}
      </section>
    </div>
  )
}

function KpiCard({
  label, sub, value, accent = false,
}: {
  label: string; sub?: string; value: string; accent?: boolean
}) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? 'bg-indigo-50 border-indigo-100' : 'bg-white border-slate-200'}`}>
      <p className={`text-xs font-semibold uppercase tracking-wider ${accent ? 'text-indigo-500' : 'text-slate-500'}`}>
        {label}
      </p>
      {sub && <p className="text-xs text-slate-400 mt-0.5 mb-3">{sub}</p>}
      <p className={`text-2xl font-bold tabular-nums mt-3 ${accent ? 'text-indigo-700' : 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  )
}
