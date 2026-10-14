import { createAdminClient } from '@/lib/supabase/admin'
import { requirePageAccess } from '@/lib/auth'
import { estimatePayrollForMonth, TSU_RATE } from '@/lib/payroll'
import type { PayrollCompRow, PayrollContractRow, PayrollTaxRow } from '@/lib/payroll'
import {
  baseAverages, buildComparison, buildPayrollLines, closedThrough, isUuid, lineFromRow,
  lisbonToday, realAccumulated, realByRubric, sumMonths, versionLabel, versionMonthly,
} from '@/types/orcamento'
import type {
  BudgetLine, BudgetLineRow, BudgetVersion, FinancialMonth, PayrollSeedEmployee,
} from '@/types/orcamento'
import VersionBar from './_components/version-bar'
import CreateBudgetForm from './_components/create-budget-form'
import BudgetEditor from './_components/budget-editor'
import ComparisonSection from './_components/comparison-section'

export const dynamic = 'force-dynamic'

const FINANCIAL_COLUMNS = 'month, revenue, plunet_revenue, other_revenue, total_payroll, fse, fse_suppliers, direct_costs, investments'

export default async function OrcamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; versao?: string }>
}) {
  await requirePageAccess('/orcamento')

  const { ano, versao } = await searchParams
  const today = lisbonToday()
  const asked = Number(ano)
  const year  = Number.isInteger(asked) && asked >= 2020 && asked <= today.year + 2 ? asked : today.year + 1

  const supabase = createAdminClient()
  const [versionsRes, yearsRes, realRes, centersProbe] = await Promise.all([
    supabase.from('budget_versions').select('*').eq('year', year).order('revision'),
    supabase.from('budget_versions').select('year'),
    supabase.from('financial_records').select(FINANCIAL_COLUMNS).eq('year', year),
    // A coluna dos centros de custo vem de um segundo SQL
    supabase.from('budget_lines').select('cost_center').limit(1),
  ])

  const header = (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Orçamento</h1>
      <p className="text-slate-500 text-sm mt-1">
        Orçamento anual da empresa por rubrica e centro de custo, com revisões ao longo do ano e comparação com o real
      </p>
    </div>
  )

  // Só se avisa quando falta mesmo a tabela ou a coluna: um erro passageiro não
  // pode esconder a página com uma mensagem que manda correr um SQL já corrido
  const missesColumn = (
    res: { error: { code?: string; message?: string } | null },
    column: string,
  ) => ['42703', 'PGRST204'].includes(res.error?.code ?? '') ||
       (res.error?.message ?? '').includes(column)

  const tablesMissing  = ['PGRST205', '42P01'].includes(versionsRes.error?.code ?? '')
  const centersMissing = !versionsRes.error && missesColumn(centersProbe, 'cost_center')
  // O real dos investimentos vem de outro SQL. Sem a coluna, este select falha
  // inteiro e o orçamento ficaria a comparar-se com um real vazio, em silêncio
  const investMissing  = !versionsRes.error && missesColumn(realRes, 'investments')
  const columnMissing  = centersMissing || investMissing
  const sqlMissing     = tablesMissing || columnMissing
  const sqlFile = tablesMissing  ? 'supabase/orcamento.sql'
                : centersMissing ? 'supabase/orcamento-centros.sql'
                :                  'supabase/financeiro-juros-investimentos.sql'
  if (versionsRes.error || columnMissing) {
    return (
      <div className="p-8 space-y-6">
        {header}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 max-w-2xl">
          <p className="font-semibold text-amber-900">
            {sqlMissing ? 'Falta atualizar a base de dados do orçamento' : 'Não foi possível ler o orçamento'}
          </p>
          <p className="text-sm text-amber-800 mt-1">
            {sqlMissing
              ? <>Corre o ficheiro <code className="px-1 bg-amber-100 rounded">{sqlFile}</code> no SQL Editor do Supabase e recarrega esta página.</>
              : versionsRes.error?.message}
          </p>
        </div>
      </div>
    )
  }

  const versions    = (versionsRes.data ?? []) as BudgetVersion[]
  const realRecords = (realRes.data ?? []) as FinancialMonth[]
  const years = [...new Set([
    today.year - 1, today.year, today.year + 1,
    ...((yearsRes.data ?? []) as { year: number }[]).map(r => r.year),
  ])].sort((a, b) => a - b)

  // ── Ano sem orçamento: formulário de criação ──────────────────────────────
  if (versions.length === 0) {
    const canCreate = year >= today.year - 1 && year <= today.year + 1
    if (!canCreate) {
      return (
        <div className="p-8 space-y-6">
          {header}
          <VersionBar year={year} years={years} versions={[]} selectedId={null} />
          <p className="text-sm text-slate-500">
            {year} não tem orçamento. Só se cria orçamento para {today.year - 1}, {today.year} ou {today.year + 1}.
          </p>
        </div>
      )
    }

    // A mesma escolha que a criação faz: com meses fechados no próprio ano, parte
    // do real desse ano; senão, da média do ano anterior
    const realThrough = closedThrough(year, realRecords, today)
    const employeesQuery = supabase.from('employees').select('id, department, first_name, last_name, start_date, end_date')
    const [prevRes, empRes, compRes, taxRes, ctrRes] = await Promise.all([
      supabase.from('financial_records').select(FINANCIAL_COLUMNS).eq('year', year - 1),
      year <= today.year ? employeesQuery : employeesQuery.eq('status', 'active'),
      supabase.from('compensation').select('employee_id, base_salary, effective_date, end_date'),
      supabase.from('employee_tax_info').select('employee_id, subsidy_payment_mode, meal_allowance_daily, working_days_per_month'),
      supabase.from('contracts').select('employee_id, contract_type, start_date, end_date').eq('contract_type', 'internship'),
    ])
    const baseRecords = realThrough > 0 ? realRecords : (prevRes.data ?? []) as FinancialMonth[]
    const baseMonths  = realThrough > 0 ? realThrough : closedThrough(year - 1, baseRecords, today)
    const payrollLines = buildPayrollLines({
      year,
      employees:     (empRes.data  ?? []) as PayrollSeedEmployee[],
      compensations: (compRes.data ?? []) as PayrollCompRow[],
      taxInfo:       (taxRes.data  ?? []) as PayrollTaxRow[],
      contracts:     (ctrRes.data  ?? []) as PayrollContractRow[],
      salaryUpdate:  0,
      tsuRate:       TSU_RATE,
    }, estimatePayrollForMonth)
    const projected = payrollLines.reduce((s, l) => s + sumMonths(l.months.slice(realThrough)), 0)

    return (
      <div className="p-8 space-y-6">
        {header}
        <VersionBar year={year} years={years} versions={[]} selectedId={null} />
        <CreateBudgetForm
          year={year}
          realThrough={realThrough}
          baseYear={realThrough > 0 ? year : year - 1}
          baseMonths={baseMonths}
          averages={baseAverages(baseRecords, baseMonths)}
          realAccum={realAccumulated(realRecords, realThrough)}
          payroll={{
            people:    payrollLines.filter(l => l.months.slice(realThrough).some(v => v !== 0)).length,
            projected,
          }}
        />
      </div>
    )
  }

  // ── Ano com versões ───────────────────────────────────────────────────────
  const draft    = versions.find(v => v.status === 'rascunho') ?? null
  const inForce  = versions.find(v => v.status === 'aprovado') ?? null
  const initial  = versions.find(v => v.revision === 0) ?? null
  const selected = (isUuid(versao) ? versions.find(v => v.id === versao) : undefined)
    ?? draft ?? inForce ?? versions[versions.length - 1]

  const linesRes = await supabase.from('budget_lines')
    .select('*').in('version_id', versions.map(v => v.id)).order('sort_order')
  const linesByVersion = new Map<string, BudgetLine[]>()
  for (const row of (linesRes.data ?? []) as BudgetLineRow[]) {
    const list = linesByVersion.get(row.version_id) ?? []
    list.push(lineFromRow(row))
    linesByVersion.set(row.version_id, list)
  }

  const real      = realByRubric(realRecords)
  const closedNow = closedThrough(year, realRecords, today)

  // A comparação precisa de meses fechados e de um orçamento inicial aprovado
  const comparison = closedNow > 0 && initial && initial.status !== 'rascunho' && inForce
    ? buildComparison(
        versionMonthly(linesByVersion.get(initial.id) ?? [], real, 0),
        versionMonthly(linesByVersion.get(inForce.id) ?? [], real, inForce.actual_through_month),
        real,
        closedNow,
      )
    : null

  const savedLabel = new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Europe/Lisbon', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(selected.updated_at))

  return (
    <div className="p-8 space-y-6">
      {header}
      <VersionBar year={year} years={years} versions={versions} selectedId={selected.id} />

      {linesRes.error ? (
        <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-lg">
          Não foi possível ler as linhas do orçamento: {linesRes.error.message}
        </p>
      ) : (
        <BudgetEditor
          // Depois de gravar, o updated_at muda e o editor recomeça com os dados gravados
          key={`${selected.id}:${selected.updated_at}`}
          version={{
            id:                   selected.id,
            year:                 selected.year,
            status:               selected.status,
            actual_through_month: selected.actual_through_month,
            notes:                selected.notes,
            updated_at:           selected.updated_at,
          }}
          label={versionLabel(selected)}
          savedLabel={savedLabel}
          initialLines={linesByVersion.get(selected.id) ?? []}
          real={real}
          canCreateRevision={selected.status === 'aprovado' && !draft}
        />
      )}

      {comparison && inForce ? (
        <ComparisonSection rows={comparison} closedNow={closedNow} year={year} inForceLabel={versionLabel(inForce)} />
      ) : closedNow > 0 ? (
        <p className="text-xs text-slate-400">
          A comparação com o real aparece depois de aprovares o orçamento inicial.
        </p>
      ) : null}
    </div>
  )
}
