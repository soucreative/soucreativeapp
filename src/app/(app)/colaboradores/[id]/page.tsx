import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/auth'
import { canAccess } from '@/lib/permissions'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import ProfileTab from './_components/profile-tab'
import FiscalTab from './_components/fiscal-tab'
import SalarySimulator from './_components/salary-simulator'
import CompensationTab from './_components/compensation-tab'
import PrizeTab from './_components/prize-tab'
import AbsencesTab from './_components/absences-tab'
import DeleteEmployeeButton from './_components/delete-employee-button'
import type { Employee, EmployeeTaxInfo, Compensation, Contract, VariableRule, Objective, PerformanceRecord, Absence, AnnualBonus, VacationPrizeExchange } from '@/types/database'

const POSITION_LABEL: Record<string, string> = {
  management:          'Management',
  director:            'Diretor',
  employee:            'Colaborador',
  professional_intern: 'Estágio Profissional',
  curricular_intern:   'Estágio Curricular',
}

const statusStyle: Record<string, string> = {
  active:   'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-600',
  on_leave: 'bg-amber-100 text-amber-700',
}
const statusLabel: Record<string, string> = {
  active: 'Ativo', inactive: 'Inativo', on_leave: 'Licença',
}

const tabs = [
  { key: 'perfil',       label: 'Perfil' },
  { key: 'remuneracao',  label: 'Remuneração' },
  { key: 'fiscal',       label: 'Dados Fiscais' },
  { key: 'ferias',       label: 'Férias & Faltas' },
  { key: 'simulacao',    label: 'Simulação Salarial' },
  { key: 'premio',       label: '🏆 Prémio' },
]

export default async function ColaboradorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab = 'perfil' } = await searchParams
  const supabase  = createAdminClient()
  // Gestão e diretores abrem qualquer ficha; as outras pessoas só a sua. Antes
  // qualquer sessão abria a ficha de qualquer pessoa pelo endereço. Estagiários
  // ficam de fora: o acesso deles é só Perfil e Avaliações.
  const session = await getCurrentEmployee()
  if (!session) redirect('/')
  const canOpenAll = canAccess(session.app_role, '/colaboradores')
  const isOwn      = session.id === id && session.app_role !== 'intern'
  if (!canOpenAll && !isOwn) redirect('/')
  const isAdmin    = ['master', 'admin', 'management'].includes(session.app_role)

  const currentYear = new Date().getFullYear()

  const [
    empResult, taxResult, compResult, historyResult, contractsResult,
    varRuleResult, objectivesResult, perfResult, companyObjResult, marginResult, financialResult,
    absencesResult, annualBonusResult, prizeExchangeResult,
  ] = await Promise.all([
    supabase.from('employees').select('*').eq('id', id).single(),
    supabase.from('employee_tax_info').select('*').eq('employee_id', id).maybeSingle(),
    supabase.from('compensation').select('*').eq('employee_id', id)
      .is('end_date', null).order('effective_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('compensation').select('*').eq('employee_id', id)
      .order('effective_date', { ascending: false }),
    supabase.from('contracts').select('*').eq('employee_id', id)
      .order('start_date', { ascending: false }),
    // Prize tab data
    supabase.from('variable_rules').select('*').eq('employee_id', id)
      .is('end_date', null).order('effective_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('objectives').select('*')
      .eq('employee_id', id).eq('year', currentYear).eq('type', 'individual'),
    supabase.from('performance_records').select('*')
      .eq('employee_id', id).eq('year', currentYear).order('month'),
    supabase.from('objectives').select('*')
      .eq('year', currentYear).eq('type', 'team').eq('unit', '€').is('department', null).maybeSingle(),
    supabase.from('objectives').select('*')
      .eq('year', currentYear).eq('type', 'team').eq('unit', '%').is('department', null).maybeSingle(),
    supabase.from('financial_records').select('revenue, ebitda').eq('year', currentYear),
    supabase.from('absences').select('*').eq('employee_id', id).order('start_date', { ascending: false }),
    // Vacation extras for absences tab
    supabase.from('annual_bonus').select('*').eq('employee_id', id).eq('year', currentYear).maybeSingle(),
    supabase.from('vacation_prize_exchanges').select('*').eq('employee_id', id).eq('year', currentYear).maybeSingle(),
  ])

  if (!empResult.data) notFound()

  const employee            = empResult.data as Employee
  const isDirector          = session.app_role === 'director'
  const canViewSalary       = isAdmin || (isDirector && session.department === employee.department) || isOwn
  // Na própria ficha, quem não é da gestão não vê notas internas nem o histórico
  // de remunerações, que guarda registos antigos que nunca se aplicaram
  const ownView             = isOwn && !isAdmin
  const tax                 = taxResult.data as EmployeeTaxInfo | null
  const compensation        = compResult.data as Compensation | null
  const compensationHistory = (historyResult.data ?? []) as Compensation[]
  const contracts           = (contractsResult.data ?? []) as Contract[]
  const variableRule        = (varRuleResult.data ?? null) as VariableRule | null
  const objectives          = (objectivesResult.data ?? []) as Objective[]
  const performanceRecords  = (perfResult.data ?? []) as PerformanceRecord[]
  const companyObjective    = (companyObjResult.data ?? null) as Objective | null
  const marginTarget        = (marginResult.data ?? null) as Objective | null
  const financialRecords    = (financialResult.data ?? []) as { revenue: number; ebitda: number }[]
  const yearlyRevenue       = financialRecords.reduce((s, r) => s + r.revenue, 0)
  const ytdEbitda           = financialRecords.reduce((s, r) => s + r.ebitda, 0)
  const absences            = (absencesResult.data ?? []) as Absence[]
  const annualBonus         = (annualBonusResult.data ?? null) as AnnualBonus | null
  const prizeExchange       = (prizeExchangeResult.data ?? null) as VacationPrizeExchange | null

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <Link href={canOpenAll ? '/colaboradores' : '/perfil'} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 text-sm mb-4 w-fit">
          <ArrowLeft size={15} />
          {canOpenAll ? 'Colaboradores' : 'Perfil'}
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {employee.first_name} {employee.last_name}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-slate-500 text-sm">{POSITION_LABEL[employee.position_type ?? ''] ?? employee.position_type}</span>
              {employee.department && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-500 text-sm">{employee.department}</span>
                </>
              )}
              <span className="text-slate-300">·</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle[employee.status]}`}>
                {statusLabel[employee.status]}
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500 text-sm">
                {employee.work_regime === 'part_time'
                  ? `Part-time${employee.days_per_week ? ` (${employee.days_per_week}d/sem)` : ''}`
                  : 'Full-time'}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            {compensation && canViewSalary && (
              <div className="text-right">
                <p className="text-xs text-slate-400 mb-0.5">Salário base</p>
                <p className="text-xl font-bold text-slate-900">
                  {compensation.base_salary.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}
                </p>
              </div>
            )}
            {['master', 'admin'].includes(session.app_role) && (
              <DeleteEmployeeButton
                employeeId={employee.id}
                fullName={`${employee.first_name} ${employee.last_name}`}
              />
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-8">
        {tabs
          .filter(t => canViewSalary || !['remuneracao', 'fiscal', 'simulacao', 'premio'].includes(t.key))
          .map(t => (
            <Link key={t.key} href={`/colaboradores/${id}?tab=${t.key}`}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              {t.label}
            </Link>
          ))}
      </div>

      {/* Tab content */}
      {tab === 'perfil'      && <ProfileTab employee={employee} tax={tax} isAdmin={isAdmin} contracts={contracts} hideNotes={ownView} />}
      {tab === 'remuneracao' && canViewSalary && <CompensationTab employeeId={id} current={compensation} history={ownView ? [] : compensationHistory} readOnly={!isAdmin} />}
      {tab === 'fiscal'      && canViewSalary && <FiscalTab tax={tax} employeeId={id} readOnly={!isAdmin} />}
      {tab === 'ferias'      && (
        <AbsencesTab
          employeeId={id}
          canManage={isAdmin || isDirector}
          absences={absences}
          compensation={compensation}
          annualBonus={annualBonus}
          prizeExchange={prizeExchange}
        />
      )}
      {tab === 'simulacao'   && canViewSalary && <SalarySimulator compensation={compensation} tax={tax} />}
      {tab === 'premio'      && canViewSalary && (
        <PrizeTab
          employee={employee}
          tax={tax}
          compensation={compensation}
          variableRule={variableRule}
          objectives={objectives}
          performanceRecords={performanceRecords}
          companyObjective={companyObjective}
          marginTarget={marginTarget}
          yearlyRevenue={yearlyRevenue}
          ytdEbitda={ytdEbitda}
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}
