'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionWithRole } from '@/lib/auth'
import { NAV_ACCESS } from '@/lib/permissions'
import { DEPARTMENTS, OPERATIONAL_DEPTS } from '@/lib/departments'
import { estimatePayrollForMonth, TSU_RATE } from '@/lib/payroll'
import type { PayrollCompRow, PayrollContractRow, PayrollTaxRow } from '@/lib/payroll'
import { formatEUR } from '@/lib/format'
import { MONTH_NAMES_LONG } from '@/lib/constants'
import {
  LIMITS, MONTH_KEYS, RUBRICS, SEED_RUBRICS,
  baseAverages, buildPayrollLines, buildSeedLines, canonicalCenter, closedThrough, isUuid,
  lisbonToday, monthsToColumns, parseAmount, parseLinesPayload, realByRubric, revenueShares,
  rubricOf, sumMonths,
} from '@/types/orcamento'
import type {
  BudgetLineRow, BudgetVersion, CenterRevenue, FinancialMonth, PayrollSeedEmployee, SeedRubric,
} from '@/types/orcamento'

export type BudgetActionState = { error: string } | { success: true } | null

const FINANCIAL_COLUMNS = 'month, revenue, plunet_revenue, other_revenue, total_payroll, fse, fse_suppliers, direct_costs, investments'

/** O centro para onde vai a Plunet — é tradução */
const PLUNET_CENTER = 'Produção'

/** Quem abre o Orçamento é quem pode escrever nele */
async function budgetSession() {
  return getSessionWithRole(NAV_ACCESS['/orcamento'] ?? [])
}

/** Erro legível — e, se falta correr um SQL, diz qual */
function dbError(what: string, error: { code?: string; message: string }): { error: string } {
  if (error.code === 'PGRST205' || error.code === '42P01') {
    return { error: 'As tabelas do orçamento ainda não existem: falta correr supabase/orcamento.sql no Supabase.' }
  }
  if (error.code === 'PGRST204' || error.code === '42703' || error.message.includes('cost_center')) {
    return { error: 'Falta correr supabase/orcamento-centros.sql no Supabase.' }
  }
  return { error: `${what}: ${error.message}` }
}

function todayLabel(): string {
  return new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'short' }).format(new Date())
}

const monthName = (m: number) => MONTH_NAMES_LONG[m - 1].toLowerCase()

// ── Criar orçamento ────────────────────────────────────────────────────────

export async function createBudget(_prev: BudgetActionState, formData: FormData): Promise<BudgetActionState> {
  const session = await budgetSession()
  if (!session) return { error: 'Sem permissão.' }

  const today = lisbonToday()
  const year  = Number(formData.get('year'))
  if (!Number.isInteger(year) || year < today.year - 1 || year > today.year + 1) {
    return { error: 'Só se cria orçamento para o ano anterior, o atual ou o próximo.' }
  }

  // Valor por mês de cada rubrica; a massa salarial calcula-se aqui, pessoa a pessoa
  const monthly = {} as Record<SeedRubric, number>
  for (const key of SEED_RUBRICS) {
    const v = parseAmount(String(formData.get(`base_${key}`) ?? ''))
    if (v === null || Math.abs(v) > LIMITS.maxAmount) return { error: `Valor inválido em ${rubricOf(key).label}.` }
    monthly[key] = v
  }
  const pct = parseAmount(String(formData.get('salary_update_pct') ?? ''))
  if (pct === null || Math.abs(pct) > LIMITS.maxSalaryPct) {
    return { error: `A atualização salarial tem de estar entre −${LIMITS.maxSalaryPct}% e ${LIMITS.maxSalaryPct}%.` }
  }
  const userNotes = String(formData.get('notes') ?? '').trim()
  if (userNotes.length > LIMITS.maxUserNotes) {
    return { error: `As notas aceitam até ${LIMITS.maxUserNotes} caracteres.` }
  }

  const supabase = createAdminClient()
  const existing = await supabase.from('budget_versions').select('id').eq('year', year).limit(1)
  if (existing.error) return dbError('Erro ao ler as versões', existing.error)
  if ((existing.data ?? []).length > 0) {
    return { error: `${year} já tem orçamento. Para o corrigir, cria uma revisão.` }
  }

  const [ownRes, prevRes] = await Promise.all([
    supabase.from('financial_records').select(FINANCIAL_COLUMNS).eq('year', year),
    supabase.from('financial_records').select(FINANCIAL_COLUMNS).eq('year', year - 1),
  ])
  if (ownRes.error)  return dbError('Erro ao ler os registos mensais', ownRes.error)
  if (prevRes.error) return dbError('Erro ao ler os registos mensais', prevRes.error)

  // Com meses fechados no próprio ano, o orçamento parte do real desse ano;
  // senão, da média do ano anterior
  const ownRecords  = (ownRes.data ?? []) as FinancialMonth[]
  const realThrough = closedThrough(year, ownRecords, today)
  const baseYear    = realThrough > 0 ? year : year - 1
  const baseRecords = realThrough > 0 ? ownRecords : (prevRes.data ?? []) as FinancialMonth[]
  const baseMonths  = realThrough > 0 ? realThrough : closedThrough(year - 1, baseRecords, today)
  const averages    = baseAverages(baseRecords, baseMonths)

  // Anos já começados contam com quem saiu (os filtros de datas limitam-nos
  // aos meses em que cá estiveram); anos futuros só com quem está ativo
  const employeesQuery = supabase.from('employees').select('id, department, first_name, last_name, start_date, end_date')
  const [ccRes, empRes, compRes, taxRes, ctrRes] = await Promise.all([
    supabase.from('cost_center_records').select('month, cost_center, revenue').eq('year', baseYear),
    year <= today.year ? employeesQuery : employeesQuery.eq('status', 'active'),
    supabase.from('compensation').select('employee_id, base_salary, effective_date, end_date'),
    supabase.from('employee_tax_info').select('employee_id, subsidy_payment_mode, meal_allowance_daily, working_days_per_month'),
    supabase.from('contracts').select('employee_id, contract_type, start_date, end_date').eq('contract_type', 'internship'),
  ])
  const failed = [ccRes, empRes, compRes, taxRes, ctrRes].find(r => r.error)
  if (failed?.error) return { error: `Erro ao ler os dados de base: ${failed.error.message}` }

  const payrollLines = buildPayrollLines({
    year,
    employees:     (empRes.data  ?? []) as PayrollSeedEmployee[],
    compensations: (compRes.data ?? []) as PayrollCompRow[],
    taxInfo:       (taxRes.data  ?? []) as PayrollTaxRow[],
    contracts:     (ctrRes.data  ?? []) as PayrollContractRow[],
    salaryUpdate:  pct / 100,
    tsuRate:       TSU_RATE,
  }, estimatePayrollForMonth)

  const centerRevenue = (ccRes.data ?? []) as CenterRevenue[]
  const basePlunet    = realByRubric(baseRecords).plunet
  const shareMonths   = Array.from({ length: baseMonths }, (_, i) => i + 1)
  const seed = buildSeedLines({
    realThrough,
    real:          realByRubric(ownRecords),
    monthly,
    centerRevenue,
    centerPlunet:  basePlunet,
    shareMonths,
    operational:   OPERATIONAL_DEPTS,
    plunetCenter:  PLUNET_CENTER,
    payroll:       payrollLines.map(p => ({
      description: p.description,
      cost_center: canonicalCenter(p.department, DEPARTMENTS),
      months:      p.months,
    })),
  })

  // Os pressupostos ficam nas notas, para se saber mais tarde de onde vêm os números
  const shares   = revenueShares(centerRevenue, basePlunet, OPERATIONAL_DEPTS, PLUNET_CENTER, shareMonths)
  const payrollProjected = payrollLines.reduce((s, l) => s + sumMonths(l.months.slice(realThrough)), 0)
  const openMonths = 12 - realThrough
  const baseLabel = realThrough > 0
    ? `janeiro a ${monthName(realThrough)} com o real de ${year}; ${openMonths > 0 ? `${monthName(realThrough + 1)} a dezembro com os valores abaixo` : 'ano completo'}`
    : baseMonths > 0
      ? `média real de janeiro a ${monthName(baseMonths)} de ${year - 1} (${baseMonths} ${baseMonths === 1 ? 'mês' : 'meses'})`
      : `sem meses fechados em ${year - 1} — valores introduzidos à mão`
  const assumptions = [
    `Criado a ${todayLabel()} por ${session.first_name} ${session.last_name}.`,
    `Base: ${baseLabel}.`,
    ...RUBRICS.filter(r => r.key !== 'massa_salarial').map(r =>
      `${r.label}: ${formatEUR(monthly[r.key as SeedRubric])}/mês` +
      (averages[r.key] !== 0 ? ` (média real ${formatEUR(averages[r.key])}/mês).` : '.')),
    `Massa salarial: salários em vigor${pct !== 0 ? ` com atualização de ${pct}%` : ''}, com TSU, subsídios e ` +
      `subsídio de alimentação` +
      (openMonths > 0 ? ` — ${formatEUR(payrollProjected / openMonths)}/mês nos meses por fechar` : '') +
      (realThrough > 0 ? '; nos meses reais, "Ajuste ao real" acerta o total com o registado.' : '.'),
    shares
      ? `Faturação e outros proveitos repartidos pelos centros como a receita de ${baseYear}: ` +
        Object.entries(shares).map(([c, v]) => `${c} ${(v * 100).toFixed(1).replace('.', ',')}%`).join(', ') + '.'
      : `Sem receita por centro em ${baseYear}: faturação e outros proveitos ficam por repartir.`,
    'FSE, marketing, custos diretos e investimentos começam sem centro (estrutura).',
  ].join('\n')
  const notes = userNotes ? `${userNotes}\n\n${assumptions}` : assumptions

  const inserted = await supabase.from('budget_versions').insert({
    year, revision: 0, status: 'rascunho', based_on: null, actual_through_month: 0,
    notes, created_by: session.id,
  }).select('id').single()
  if (inserted.error) {
    if (inserted.error.code === '23505') return { error: `${year} já tem orçamento — atualiza a página.` }
    return dbError('Erro ao criar a versão', inserted.error)
  }
  const versionId = inserted.data.id as string

  if (seed.length > 0) {
    const linesRes = await supabase.from('budget_lines').insert(seed.map((l, i) => ({
      version_id:  versionId,
      rubric:      l.rubric,
      description: l.description,
      cost_center: l.cost_center,
      ...monthsToColumns(l.months),
      sort_order:  i,
    })))
    if (linesRes.error) {
      // Sem linhas a versão não serve — apaga-se para se poder tentar de novo
      await supabase.from('budget_versions').delete().eq('id', versionId)
      return dbError('Erro ao criar as linhas', linesRes.error)
    }
  }

  revalidatePath('/orcamento')
  redirect(`/orcamento?ano=${year}&versao=${versionId}`)
}

// ── Gravar um rascunho ─────────────────────────────────────────────────────

export async function saveBudget(_prev: BudgetActionState, formData: FormData): Promise<BudgetActionState> {
  const session = await budgetSession()
  if (!session) return { error: 'Sem permissão.' }

  const versionId = formData.get('version_id')
  if (!isUuid(versionId)) return { error: 'Versão inválida.' }

  const supabase = createAdminClient()
  const vRes = await supabase.from('budget_versions')
    .select('id, status, actual_through_month, updated_at').eq('id', versionId).maybeSingle()
  if (vRes.error) return dbError('Erro ao ler a versão', vRes.error)
  const version = vRes.data as Pick<BudgetVersion, 'id' | 'status' | 'actual_through_month' | 'updated_at'> | null
  if (!version) return { error: 'Versão não encontrada.' }
  if (version.status !== 'rascunho') {
    return { error: 'Só um rascunho pode ser alterado. Para corrigir uma versão aprovada, cria uma revisão.' }
  }
  // Duas abas abertas na mesma versão apagariam as linhas uma da outra
  if (String(formData.get('updated_at') ?? '') !== version.updated_at) {
    return { error: 'Esta versão foi gravada noutro separador entretanto. Recarrega a página antes de gravar.' }
  }

  const notes = String(formData.get('notes') ?? '').trim()
  if (notes.length > LIMITS.maxNotes) return { error: `As notas aceitam até ${LIMITS.maxNotes} caracteres.` }

  const parsed = parseLinesPayload(formData.get('lines'), version.actual_through_month, DEPARTMENTS)
  if ('error' in parsed) return { error: parsed.error }

  const existingRes = await supabase.from('budget_lines').select('id').eq('version_id', version.id)
  if (existingRes.error) return dbError('Erro ao ler as linhas', existingRes.error)
  const existing = new Set((existingRes.data ?? []).map(r => r.id as string))

  // Um id novo não pode existir noutra versão: gravar aqui mudava-lhe a versão
  const newIds = parsed.lines.map(l => l.id).filter(id => !existing.has(id))
  if (newIds.length > 0) {
    const clash = await supabase.from('budget_lines').select('id').in('id', newIds).limit(1)
    if (clash.error) return dbError('Erro ao validar as linhas', clash.error)
    if ((clash.data ?? []).length > 0) return { error: 'Linha inválida. Recarrega a página.' }
  }

  if (parsed.lines.length > 0) {
    const up = await supabase.from('budget_lines').upsert(
      parsed.lines.map((l, i) => ({
        id: l.id, version_id: version.id, rubric: l.rubric, description: l.description,
        cost_center: l.cost_center, ...monthsToColumns(l.months), sort_order: i,
      })),
      { onConflict: 'id' },
    )
    if (up.error) return dbError('Erro ao gravar as linhas', up.error)
  }

  const keep    = new Set(parsed.lines.map(l => l.id))
  const removed = [...existing].filter(id => !keep.has(id))
  if (removed.length > 0) {
    const del = await supabase.from('budget_lines').delete().eq('version_id', version.id).in('id', removed)
    if (del.error) return dbError('Erro ao remover linhas', del.error)
  }

  // Gravar as notas também muda o updated_at da versão, que deteta gravações concorrentes
  const touch = await supabase.from('budget_versions')
    .update({ notes: notes || null }).eq('id', version.id).eq('status', 'rascunho').select('id')
  if (touch.error) return dbError('Erro ao gravar as notas', touch.error)

  revalidatePath('/orcamento')
  return { success: true }
}

// ── Aprovar ────────────────────────────────────────────────────────────────

export async function approveBudget(_prev: BudgetActionState, formData: FormData): Promise<BudgetActionState> {
  const session = await budgetSession()
  if (!session) return { error: 'Sem permissão.' }

  const versionId = formData.get('version_id')
  if (!isUuid(versionId)) return { error: 'Versão inválida.' }
  const expected = String(formData.get('updated_at') ?? '')

  const supabase = createAdminClient()
  const vRes = await supabase.from('budget_versions')
    .select('id, year, status, updated_at').eq('id', versionId).maybeSingle()
  if (vRes.error) return dbError('Erro ao ler a versão', vRes.error)
  const version = vRes.data as Pick<BudgetVersion, 'id' | 'year' | 'status' | 'updated_at'> | null
  if (!version) return { error: 'Versão não encontrada.' }
  if (version.status !== 'rascunho') return { error: 'Esta versão já não é um rascunho.' }
  if (version.updated_at !== expected) {
    return { error: 'Esta versão foi gravada noutro separador. Recarrega a página e confirma antes de aprovar.' }
  }

  // Sem transações, a ordem importa: só pode haver uma versão aprovada por ano.
  // 1. A versão em vigor passa a substituída.
  const prev = await supabase.from('budget_versions')
    .update({ status: 'substituido' }).eq('year', version.year).eq('status', 'aprovado').select('id')
  if (prev.error) return dbError('Erro ao substituir a versão em vigor', prev.error)
  const previousIds = (prev.data ?? []).map(r => r.id as string)

  // 2. O rascunho passa a aprovado, se ninguém lhe tiver mexido entretanto.
  const approved = await supabase.from('budget_versions')
    .update({ status: 'aprovado', approved_at: new Date().toISOString(), approved_by: session.id })
    .eq('id', version.id).eq('status', 'rascunho').eq('updated_at', expected)
    .select('id')
  if (approved.error || (approved.data ?? []).length !== 1) {
    // Desfaz o passo 1. Se até isto falhar, voltar a aprovar resolve: o passo 1
    // já não encontra nada e o passo 2 conclui.
    if (previousIds.length > 0) {
      await supabase.from('budget_versions')
        .update({ status: 'aprovado' }).in('id', previousIds).eq('status', 'substituido')
    }
    return approved.error
      ? dbError('Erro ao aprovar', approved.error)
      : { error: 'A versão mudou entretanto. Recarrega a página e tenta de novo.' }
  }

  revalidatePath('/orcamento')
  redirect(`/orcamento?ano=${version.year}&versao=${version.id}`)
}

// ── Criar revisão ──────────────────────────────────────────────────────────

export async function createRevision(_prev: BudgetActionState, formData: FormData): Promise<BudgetActionState> {
  const session = await budgetSession()
  if (!session) return { error: 'Sem permissão.' }

  const year = Number(formData.get('year'))
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return { error: 'Ano inválido.' }

  const supabase = createAdminClient()
  const versionsRes = await supabase.from('budget_versions').select('id, revision, status').eq('year', year)
  if (versionsRes.error) return dbError('Erro ao ler as versões', versionsRes.error)
  const versions = (versionsRes.data ?? []) as Pick<BudgetVersion, 'id' | 'revision' | 'status'>[]
  const inForce  = versions.find(v => v.status === 'aprovado')
  if (!inForce) return { error: 'Só se cria uma revisão a partir de uma versão aprovada.' }
  if (versions.some(v => v.status === 'rascunho')) {
    return { error: 'Já existe um rascunho neste ano. Termina-o ou apaga-o primeiro.' }
  }

  const [finRes, linesRes] = await Promise.all([
    supabase.from('financial_records').select('month').eq('year', year),
    supabase.from('budget_lines').select('*').eq('version_id', inForce.id).order('sort_order'),
  ])
  if (finRes.error)   return dbError('Erro ao ler os registos mensais', finRes.error)
  if (linesRes.error) return dbError('Erro ao ler as linhas', linesRes.error)

  // Os meses fechados à data passam ao real: as linhas dessas rubricas vão a
  // zero nesses meses. Os investimentos, sem real, mantêm-se.
  const cutoff   = closedThrough(year, (finRes.data ?? []) as { month: number }[], lisbonToday())
  const revision = Math.max(...versions.map(v => v.revision)) + 1
  const origin   = inForce.revision === 0 ? 'do orçamento inicial' : `da revisão ${inForce.revision}`
  const notes    = `Revisão criada a ${todayLabel()} por ${session.first_name} ${session.last_name}, a partir ${origin}. ` +
    (cutoff > 0
      ? `Real até ${monthName(cutoff)} (${cutoff} ${cutoff === 1 ? 'mês' : 'meses'}).`
      : 'Ainda sem meses fechados.')

  const inserted = await supabase.from('budget_versions').insert({
    year, revision, status: 'rascunho', based_on: inForce.id, actual_through_month: cutoff,
    notes, created_by: session.id,
  }).select('id').single()
  if (inserted.error) {
    if (inserted.error.code === '23505') return { error: 'Já existe um rascunho ou esta revisão — atualiza a página.' }
    return dbError('Erro ao criar a revisão', inserted.error)
  }
  const newId = inserted.data.id as string

  const rows = ((linesRes.data ?? []) as BudgetLineRow[]).map(l => {
    const locks = rubricOf(l.rubric).locksWithReal
    return {
      version_id: newId, rubric: l.rubric, description: l.description,
      cost_center: l.cost_center ?? null, sort_order: l.sort_order,
      ...monthsToColumns(MONTH_KEYS.map((k, i) => (i < cutoff && locks ? 0 : Number(l[k])))),
    }
  })
  if (rows.length > 0) {
    const copy = await supabase.from('budget_lines').insert(rows)
    if (copy.error) {
      await supabase.from('budget_versions').delete().eq('id', newId)
      return dbError('Erro ao copiar as linhas', copy.error)
    }
  }

  revalidatePath('/orcamento')
  redirect(`/orcamento?ano=${year}&versao=${newId}`)
}

// ── Apagar rascunho ────────────────────────────────────────────────────────

export async function deleteDraft(_prev: BudgetActionState, formData: FormData): Promise<BudgetActionState> {
  const session = await budgetSession()
  if (!session) return { error: 'Sem permissão.' }

  const versionId = formData.get('version_id')
  if (!isUuid(versionId)) return { error: 'Versão inválida.' }

  const supabase = createAdminClient()
  const vRes = await supabase.from('budget_versions').select('id, year, status').eq('id', versionId).maybeSingle()
  if (vRes.error) return dbError('Erro ao ler a versão', vRes.error)
  const version = vRes.data as Pick<BudgetVersion, 'id' | 'year' | 'status'> | null
  if (!version) return { error: 'Versão não encontrada.' }
  if (version.status !== 'rascunho') return { error: 'Só se apagam rascunhos; as versões aprovadas ficam no histórico.' }

  const del = await supabase.from('budget_versions')
    .delete().eq('id', version.id).eq('status', 'rascunho').select('id')
  if (del.error) return dbError('Erro ao apagar o rascunho', del.error)
  if ((del.data ?? []).length !== 1) return { error: 'O rascunho mudou entretanto. Recarrega a página.' }

  revalidatePath('/orcamento')
  redirect(`/orcamento?ano=${version.year}`)
}
