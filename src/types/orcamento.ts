/**
 * Orçamento da empresa — tipos e contas.
 *
 * Totais, EBITDA, análise por centro de custo e comparação com o real
 * calculam-se aqui e nunca se guardam. Só há `import type`: o ficheiro corre
 * também fora do Next, para testar as contas com `node --experimental-strip-types`.
 * Por isso as listas de centros de custo chegam sempre como argumento.
 */

import type {
  PayrollAbsenceRow, PayrollCompRow, PayrollContractRow, PayrollEmpRow,
  PayrollMonthResult, PayrollTaxRow,
} from '@/lib/payroll'

// ── Tipos ─────────────────────────────────────────────────────────────────

export type BudgetStatus = 'rascunho' | 'aprovado' | 'substituido'

export type RubricKey =
  | 'faturacao' | 'plunet' | 'outros_proveitos'
  | 'massa_salarial' | 'fse' | 'marketing' | 'custos_diretos'
  | 'investimentos'

/** Receitas e custos formam o EBITDA; os investimentos ficam por baixo dele */
export type RubricKind = 'receita' | 'custo' | 'investimento'

/** Rubricas com valor por mês no formulário de criação — a massa salarial calcula-se */
export type SeedRubric = Exclude<RubricKey, 'massa_salarial'>

export const MONTH_KEYS = [
  'm01', 'm02', 'm03', 'm04', 'm05', 'm06',
  'm07', 'm08', 'm09', 'm10', 'm11', 'm12',
] as const

export type MonthKey = (typeof MONTH_KEYS)[number]

export interface BudgetVersion {
  id: string
  year: number
  /** 0 = orçamento inicial; 1, 2, … = revisões */
  revision: number
  status: BudgetStatus
  based_on: string | null
  /** Meses já fechados quando a revisão foi criada — nesses conta o real */
  actual_through_month: number
  notes: string | null
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

/** Linha tal como vem da base de dados */
export type BudgetLineRow = {
  id: string
  version_id: string
  rubric: RubricKey
  description: string
  cost_center: string | null
  sort_order: number
} & Record<MonthKey, number>

/** Linha tal como a grelha a usa: os 12 meses num array (índice 0 = janeiro) */
export interface BudgetLine {
  id: string
  rubric: RubricKey
  description: string
  /** Centro de custo; null = estrutura */
  cost_center: string | null
  months: number[]
}

/** O que interessa de financial_records para comparar com o orçamento */
export interface FinancialMonth {
  month: number
  revenue: number
  plunet_revenue: number
  other_revenue: number
  total_payroll: number
  fse: number
  fse_suppliers: number
  direct_costs: number
  investments: number
}

/** Receita de um centro de custo num mês (cost_center_records) */
export interface CenterRevenue {
  month: number
  cost_center: string
  revenue: number
}

export type ByRubric = Record<RubricKey, number[]>

// ── Rubricas e rótulos ────────────────────────────────────────────────────

export interface Rubric {
  key: RubricKey
  label: string
  kind: RubricKind
  /**
   * Nas revisões, os meses fechados passam a mostrar o real e ficam bloqueados.
   * Todas as rubricas o fazem: os investimentos passaram a ter real próprio.
   */
  locksWithReal: boolean
}

export const RUBRICS: readonly Rubric[] = [
  { key: 'faturacao',        label: 'Faturação (TOC)',  kind: 'receita',      locksWithReal: true },
  { key: 'plunet',           label: 'Plunet',           kind: 'receita',      locksWithReal: true },
  { key: 'outros_proveitos', label: 'Outros proveitos', kind: 'receita',      locksWithReal: true },
  { key: 'massa_salarial',   label: 'Massa salarial',   kind: 'custo',        locksWithReal: true },
  { key: 'fse',              label: 'FSE',              kind: 'custo',        locksWithReal: true },
  // O real do marketing está dentro do FSE: nos meses fechados conta 0 aqui
  { key: 'marketing',        label: 'Marketing',        kind: 'custo',        locksWithReal: true },
  { key: 'custos_diretos',   label: 'Custos diretos',   kind: 'custo',        locksWithReal: true },
  { key: 'investimentos',    label: 'Investimentos',    kind: 'investimento', locksWithReal: true },
]

export const RUBRIC_KEYS: readonly RubricKey[] = RUBRICS.map(r => r.key)

const RUBRIC_BY_KEY = Object.fromEntries(RUBRICS.map(r => [r.key, r])) as Record<RubricKey, Rubric>

export const rubricOf = (key: RubricKey): Rubric => RUBRIC_BY_KEY[key]

export const SEED_RUBRICS: readonly SeedRubric[] =
  RUBRIC_KEYS.filter((k): k is SeedRubric => k !== 'massa_salarial')

export const STATUS_LABEL: Record<BudgetStatus, string> = {
  rascunho:    'Rascunho',
  aprovado:    'Em vigor',
  substituido: 'Substituída',
}

export const STATUS_STYLE: Record<BudgetStatus, string> = {
  rascunho:    'bg-amber-50 text-amber-700 border-amber-200',
  aprovado:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  substituido: 'bg-slate-100 text-slate-500 border-slate-200',
}

export function versionLabel(v: Pick<BudgetVersion, 'revision'>): string {
  return v.revision === 0 ? 'Orçamento inicial' : `Revisão ${v.revision}`
}

/** O que se aceita ao gravar — as ações também respondem a pedidos diretos */
export const LIMITS = {
  maxLines:       300,
  maxPayload:     200_000,
  maxAmount:      10_000_000,
  /** Inclui o resumo de pressupostos que a criação acrescenta às notas */
  maxNotes:       4_000,
  maxUserNotes:   3_000,
  maxDescription: 200,
  maxSalaryPct:   50,
} as const

// ── Utilitários ───────────────────────────────────────────────────────────

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

const cents = (v: unknown): number => Math.round(num(v) * 100)

export const round2 = (v: number): number => Math.round(v * 100) / 100

export const zeros = (): number[] => Array.from({ length: 12 }, () => 0)

export const sumMonths = (values: number[]): number =>
  values.reduce((s, v) => s + cents(v), 0) / 100

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

/** Ano e mês de hoje em Lisboa — o servidor corre em UTC */
export function lisbonToday(now: Date = new Date()): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  return { year: get('year'), month: get('month') }
}

/** O nome canónico de um centro de custo, ignorando maiúsculas; null se não existir */
export function canonicalCenter(value: string | null | undefined, allowed: readonly string[]): string | null {
  if (!value) return null
  const v = value.trim().toLowerCase()
  return allowed.find(a => a.toLowerCase() === v) ?? null
}

export function emptyByRubric(): ByRubric {
  return Object.fromEntries(RUBRIC_KEYS.map(k => [k, zeros()])) as ByRubric
}

export function lineFromRow(row: BudgetLineRow): BudgetLine {
  return {
    id:          row.id,
    rubric:      row.rubric,
    description: row.description,
    cost_center: row.cost_center ?? null,
    months:      MONTH_KEYS.map(k => num(row[k])),
  }
}

export function monthsToColumns(months: number[]): Record<MonthKey, number> {
  const out = {} as Record<MonthKey, number>
  MONTH_KEYS.forEach((k, i) => { out[k] = round2(num(months[i])) })
  return out
}

// ── Real ──────────────────────────────────────────────────────────────────

/**
 * Valor real de uma rubrica num mês. O FSE junta o do TOC com o de fornecedores.
 * O marketing continua sem real próprio, porque está dentro do FSE; os
 * investimentos passaram a ter coluna, alimentada pelas contas da classe 4.
 */
export function realValue(r: FinancialMonth, rubric: RubricKey): number {
  switch (rubric) {
    case 'faturacao':        return num(r.revenue)
    case 'plunet':           return num(r.plunet_revenue)
    case 'outros_proveitos': return num(r.other_revenue)
    case 'massa_salarial':   return num(r.total_payroll)
    case 'fse':              return num(r.fse) + num(r.fse_suppliers)
    case 'marketing':        return 0
    case 'custos_diretos':   return num(r.direct_costs)
    case 'investimentos':    return num(r.investments)
  }
}

/**
 * Último mês fechado de um ano: registos seguidos desde janeiro e anteriores ao
 * mês atual. O mês em curso nunca conta — a sincronização do TOC cria-o a meio.
 */
export function closedThrough(
  year: number,
  records: { month: number }[],
  today: { year: number; month: number },
): number {
  const limit = year < today.year ? 12 : year === today.year ? today.month - 1 : 0
  const present = new Set(records.map(r => r.month))
  let n = 0
  while (n < limit && present.has(n + 1)) n++
  return n
}

/** Real por rubrica e mês (0 nos meses sem registo) */
export function realByRubric(records: FinancialMonth[]): ByRubric {
  const out = emptyByRubric()
  for (const r of records) {
    if (r.month < 1 || r.month > 12) continue
    for (const key of RUBRIC_KEYS) out[key][r.month - 1] = round2(realValue(r, key))
  }
  return out
}

/** Média mensal real de cada rubrica nos meses 1..through */
export function baseAverages(records: FinancialMonth[], through: number): Record<RubricKey, number> {
  const used = records.filter(r => r.month >= 1 && r.month <= through)
  return Object.fromEntries(RUBRIC_KEYS.map(key => [
    key,
    used.length > 0 ? round2(used.reduce((s, r) => s + realValue(r, key), 0) / used.length) : 0,
  ])) as Record<RubricKey, number>
}

/** Soma real de cada rubrica nos meses 1..through */
export function realAccumulated(records: FinancialMonth[], through: number): Record<RubricKey, number> {
  const used = records.filter(r => r.month >= 1 && r.month <= through)
  return Object.fromEntries(RUBRIC_KEYS.map(key => [
    key,
    used.reduce((s, r) => s + cents(realValue(r, key)), 0) / 100,
  ])) as Record<RubricKey, number>
}

// ── Totais ────────────────────────────────────────────────────────────────

/**
 * Total por rubrica e mês de uma versão: o real até `cutoff` nas rubricas que
 * ficam bloqueadas, as linhas no resto. Nas revisões essas linhas estão a zero
 * nos meses fechados; ignora-se o que lá estiver, porque manda o real.
 */
export function versionMonthly(
  lines: Pick<BudgetLine, 'rubric' | 'months'>[],
  real: ByRubric,
  cutoff: number,
): ByRubric {
  const out = emptyByRubric()
  for (const r of RUBRICS) {
    const own = lines.filter(l => l.rubric === r.key)
    for (let i = 0; i < 12; i++) {
      out[r.key][i] = i < cutoff && r.locksWithReal
        ? real[r.key][i]
        : own.reduce((s, l) => s + cents(l.months[i]), 0) / 100
    }
  }
  return out
}

export interface Summary {
  receitas: number[]
  custos: number[]
  ebitda: number[]
  investimentos: number[]
  aposInvestimentos: number[]
  totalReceitas: number
  totalCustos: number
  totalEbitda: number
  totalInvestimentos: number
  totalAposInvestimentos: number
  /** EBITDA ÷ receitas, como no Dashboard; null sem receitas */
  margem: number | null
}

export function summarize(byRubric: ByRubric): Summary {
  const receitas      = zeros()
  const custos        = zeros()
  const investimentos = zeros()
  for (const r of RUBRICS) {
    const target = r.kind === 'receita' ? receitas : r.kind === 'custo' ? custos : investimentos
    byRubric[r.key].forEach((v, i) => { target[i] = (cents(target[i]) + cents(v)) / 100 })
  }
  const ebitda            = receitas.map((v, i) => (cents(v) - cents(custos[i])) / 100)
  const aposInvestimentos = ebitda.map((v, i) => (cents(v) - cents(investimentos[i])) / 100)
  const totalReceitas     = sumMonths(receitas)
  const totalEbitda       = sumMonths(ebitda)
  return {
    receitas, custos, ebitda, investimentos, aposInvestimentos,
    totalReceitas,
    totalCustos:            sumMonths(custos),
    totalEbitda,
    totalInvestimentos:     sumMonths(investimentos),
    totalAposInvestimentos: sumMonths(aposInvestimentos),
    margem: totalReceitas > 0 ? totalEbitda / totalReceitas : null,
  }
}

// ── Centros de custo ──────────────────────────────────────────────────────

export interface CenterFigures {
  receitas: number
  massaSalarial: number
  /** FSE, marketing e custos diretos */
  outrosCustos: number
  resultadoDireto: number
}

export interface CenterRow extends CenterFigures {
  center: string
  /** Parte da estrutura que cabe ao centro (positivo = custo) */
  estrutura: number
  resultado: number
  margem: number | null
}

export interface CenterAnalysis {
  rows: CenterRow[]
  /** Linhas sem centro ou de centros que não são operacionais */
  estrutura: CenterFigures
  total: CenterFigures & { margem: number | null }
}

/**
 * Receitas e custos por centro operacional, sobre as linhas de uma versão.
 * A estrutura — linhas sem centro ou de Management, Financeiro, Comercial e
 * Outros — reparte-se em partes iguais pelos centros operacionais, a mesma
 * regra do Financeiro. Os investimentos ficam de fora, tal como do EBITDA.
 * A soma dos resultados dos centros é o EBITDA das linhas, ao cêntimo.
 */
export function centerAnalysis(
  lines: Pick<BudgetLine, 'rubric' | 'cost_center' | 'months'>[],
  operational: readonly string[],
): CenterAnalysis {
  type Bucket = { receitas: number; massaSalarial: number; outrosCustos: number }   // em cêntimos
  const blank = (): Bucket => ({ receitas: 0, massaSalarial: 0, outrosCustos: 0 })
  const centers   = new Map(operational.map(c => [c, blank()]))
  const estrutura = blank()

  for (const l of lines) {
    const kind = RUBRIC_BY_KEY[l.rubric].kind
    if (kind === 'investimento') continue
    const total  = l.months.reduce((s, v) => s + cents(v), 0)
    const bucket = (l.cost_center ? centers.get(l.cost_center) : undefined) ?? estrutura
    if (kind === 'receita') bucket.receitas += total
    else if (l.rubric === 'massa_salarial') bucket.massaSalarial += total
    else bucket.outrosCustos += total
  }

  const direto  = (b: Bucket) => b.receitas - b.massaSalarial - b.outrosCustos
  const figures = (b: Bucket): CenterFigures => ({
    receitas:        b.receitas / 100,
    massaSalarial:   b.massaSalarial / 100,
    outrosCustos:    b.outrosCustos / 100,
    resultadoDireto: direto(b) / 100,
  })

  // O líquido da estrutura reparte-se em partes iguais, exato ao cêntimo:
  // o resto do arredondamento vai para o último centro
  const liquido = -direto(estrutura)
  const n       = operational.length
  const base    = n > 0 ? Math.trunc(liquido / n) : 0
  const rows = operational.map((center, idx) => {
    const b          = centers.get(center)!
    const share      = idx === n - 1 ? liquido - base * (n - 1) : base
    const resultado  = direto(b) - share
    return {
      center,
      ...figures(b),
      estrutura: share / 100,
      resultado: resultado / 100,
      margem:    b.receitas > 0 ? resultado / b.receitas : null,
    }
  })

  const all = blank()
  for (const b of [...centers.values(), estrutura]) {
    all.receitas      += b.receitas
    all.massaSalarial += b.massaSalarial
    all.outrosCustos  += b.outrosCustos
  }
  return {
    rows,
    estrutura: figures(estrutura),
    total: { ...figures(all), margem: all.receitas > 0 ? direto(all) / all.receitas : null },
  }
}

/**
 * Frações da receita por centro operacional nos meses dados, a partir de
 * cost_center_records. A Plunet sai do seu centro antes de calcular, porque tem
 * rubrica própria. Null quando não há receita nesses meses.
 */
export function revenueShares(
  rows: CenterRevenue[],
  plunetByMonth: number[],
  operational: readonly string[],
  plunetCenter: string,
  months: number[],
): Record<string, number> | null {
  const totals = new Map(operational.map(c => [c, 0]))
  for (const r of rows) {
    if (!months.includes(r.month) || !totals.has(r.cost_center)) continue
    totals.set(r.cost_center, totals.get(r.cost_center)! + num(r.revenue))
  }
  if (totals.has(plunetCenter)) {
    const plunet = months.reduce((s, m) => s + num(plunetByMonth[m - 1]), 0)
    totals.set(plunetCenter, totals.get(plunetCenter)! - plunet)
  }
  let sum = 0
  for (const [c, v] of totals) {
    const clean = Math.max(0, v)
    totals.set(c, clean)
    sum += clean
  }
  if (sum <= 0) return null
  return Object.fromEntries([...totals].map(([c, v]) => [c, v / sum]))
}

/** Reparte cêntimos pelas frações, exato: o que sobra do arredondamento vai para a maior */
function allocateCents(total: number, shares: Record<string, number>, centers: readonly string[]): Map<string, number> {
  const out = new Map<string, number>()
  let given   = 0
  let biggest = centers[0]
  for (const c of centers) {
    const part = Math.round(total * (shares[c] ?? 0))
    out.set(c, part)
    given += part
    if ((shares[c] ?? 0) > (shares[biggest] ?? 0)) biggest = c
  }
  out.set(biggest, (out.get(biggest) ?? 0) + total - given)
  return out
}

// ── Orçamento novo ────────────────────────────────────────────────────────

export interface SeedLine {
  rubric: RubricKey
  description: string
  cost_center: string | null
  months: number[]
}

/**
 * Linhas com que um orçamento novo começa.
 *
 * - Com `realThrough` > 0 (orçamento de um ano com meses fechados), os meses
 *   1..realThrough levam o real de cada rubrica e os restantes o valor por mês
 *   do formulário. Sem meses fechados, todos levam o valor do formulário.
 * - Faturação e outros proveitos repartem-se pelos centros operacionais na
 *   proporção da receita por centro: a do próprio mês quando é real, a do
 *   período base nos meses projetados. A Plunet vai toda para o seu centro.
 * - FSE, marketing, custos diretos e investimentos começam sem centro — o FSE
 *   real nunca foi repartido, por isso reparte-se à mão.
 * - Massa salarial: uma linha por pessoa no centro do seu departamento; nos
 *   meses reais junta-se "Ajuste ao real", para o total bater com o registado.
 * - Marketing e investimentos valem 0 nos meses reais: o marketing real está
 *   dentro do FSE e os investimentos não se registam.
 */
export function buildSeedLines(input: {
  realThrough: number
  real: ByRubric
  monthly: Record<SeedRubric, number>
  centerRevenue: CenterRevenue[]
  /** Plunet por mês do ano de centerRevenue, para a descontar ao seu centro */
  centerPlunet: number[]
  /** Meses de centerRevenue que dão as frações dos meses projetados */
  shareMonths: number[]
  operational: readonly string[]
  plunetCenter: string
  payroll: { description: string; cost_center: string | null; months: number[] }[]
}): SeedLine[] {
  const { realThrough, real, monthly, operational, plunetCenter } = input

  const valueAt = (key: SeedRubric, i: number): number => {
    if (i >= realThrough) return monthly[key]
    // O marketing real está dentro do FSE, por isso não tem valor próprio
    return key === 'marketing' ? 0 : real[key][i]
  }
  const monthsOf = (key: SeedRubric) => Array.from({ length: 12 }, (_, i) => round2(valueAt(key, i)))

  const baseShares = revenueShares(input.centerRevenue, input.centerPlunet, operational, plunetCenter, input.shareMonths)
  const sharesAt = (i: number) => i < realThrough
    ? revenueShares(input.centerRevenue, input.centerPlunet, operational, plunetCenter, [i + 1]) ?? baseShares
    : baseShares

  const lines: SeedLine[] = []

  for (const key of ['faturacao', 'outros_proveitos'] as const) {
    const perCenter  = new Map(operational.map(c => [c, zeros()]))
    const unassigned = zeros()
    monthsOf(key).forEach((v, i) => {
      const total = cents(v)
      if (total === 0) return
      const shares = sharesAt(i)
      if (!shares || operational.length === 0) { unassigned[i] = v; return }
      for (const [c, part] of allocateCents(total, shares, operational)) perCenter.get(c)![i] = part / 100
    })
    for (const c of operational) {
      const months = perCenter.get(c)!
      if (months.some(v => v !== 0)) lines.push({ rubric: key, description: c, cost_center: c, months })
    }
    if (unassigned.some(v => v !== 0)) {
      lines.push({ rubric: key, description: 'Por repartir pelos centros', cost_center: null, months: unassigned })
    }
  }

  const plunet = monthsOf('plunet')
  if (plunet.some(v => v !== 0)) {
    lines.push({ rubric: 'plunet', description: plunetCenter, cost_center: plunetCenter, months: plunet })
  }

  for (const p of input.payroll) {
    lines.push({ rubric: 'massa_salarial', description: p.description, cost_center: p.cost_center, months: p.months })
  }
  if (realThrough > 0) {
    const adjust = zeros()
    for (let i = 0; i < realThrough; i++) {
      const estimated = input.payroll.reduce((s, p) => s + cents(p.months[i]), 0)
      adjust[i] = (cents(real.massa_salarial[i]) - estimated) / 100
    }
    if (adjust.some(v => v !== 0)) {
      lines.push({ rubric: 'massa_salarial', description: 'Ajuste ao real', cost_center: null, months: adjust })
    }
  }

  for (const key of ['fse', 'marketing', 'custos_diretos', 'investimentos'] as const) {
    const months = monthsOf(key)
    if (months.some(v => v !== 0)) {
      lines.push({
        rubric: key,
        description: key === 'fse' ? 'Por repartir pelos centros' : 'Base mensal',
        cost_center: null,
        months,
      })
    }
  }

  return lines
}

// ── Comparação com o real ─────────────────────────────────────────────────

export interface ComparisonRow {
  key: RubricKey | 'fse_marketing' | 'receitas' | 'custos' | 'ebitda' | 'apos_investimentos'
  label: string
  /** Para as cores: numa receita desviar para cima é bom, num custo é mau */
  kind: 'receita' | 'custo' | 'investimento' | 'resultado'
  total: boolean
  /** Sem real registado: só se mostra o orçado e a estimativa */
  hasReal: boolean
  orcamentoAcum: number
  realAcum: number
  desvio: number
  desvioPct: number | null
  orcamentoAnual: number
  estimativaFecho: number
  desvioAnual: number
}

/**
 * Real contra o orçamento inicial até ao último mês fechado, e a estimativa de
 * fecho do ano: real nos meses fechados hoje, versão em vigor nos restantes.
 * FSE e marketing comparam-se juntos, porque o real do marketing está no FSE.
 */
export function buildComparison(
  initial: ByRubric,
  inForce: ByRubric,
  real: ByRubric,
  closedNow: number,
): ComparisonRow[] {
  const estimate = emptyByRubric()
  for (const r of RUBRICS) {
    for (let i = 0; i < 12; i++) {
      estimate[r.key][i] = i < closedNow && r.locksWithReal ? real[r.key][i] : inForce[r.key][i]
    }
  }

  const add = (a: number[], b: number[]) => a.map((v, i) => (cents(v) + cents(b[i])) / 100)
  const row = (
    key: ComparisonRow['key'], label: string, kind: ComparisonRow['kind'], total: boolean, hasReal: boolean,
    ini: number[], rea: number[], est: number[],
  ): ComparisonRow => {
    const orcamentoAcum   = sumMonths(ini.slice(0, closedNow))
    const realAcum        = sumMonths(rea.slice(0, closedNow))
    const orcamentoAnual  = sumMonths(ini)
    const estimativaFecho = sumMonths(est)
    return {
      key, label, kind, total, hasReal, orcamentoAcum, realAcum,
      desvio:      (cents(realAcum) - cents(orcamentoAcum)) / 100,
      desvioPct:   orcamentoAcum !== 0 ? (realAcum - orcamentoAcum) / Math.abs(orcamentoAcum) : null,
      orcamentoAnual, estimativaFecho,
      desvioAnual: (cents(estimativaFecho) - cents(orcamentoAnual)) / 100,
    }
  }
  const single = (key: RubricKey) => {
    const r = RUBRIC_BY_KEY[key]
    return row(key, r.label, r.kind, false, r.locksWithReal, initial[key], real[key], estimate[key])
  }

  const si = summarize(initial)
  const sr = summarize(real)
  const se = summarize(estimate)
  return [
    single('faturacao'),
    single('plunet'),
    single('outros_proveitos'),
    single('massa_salarial'),
    row('fse_marketing', 'FSE e marketing', 'custo', false, true,
      add(initial.fse, initial.marketing), add(real.fse, real.marketing), add(estimate.fse, estimate.marketing)),
    single('custos_diretos'),
    row('receitas', 'Total receitas', 'receita',   true, true, si.receitas, sr.receitas, se.receitas),
    row('custos',   'Total custos',   'custo',     true, true, si.custos,   sr.custos,   se.custos),
    row('ebitda',   'EBITDA',         'resultado', true, true, si.ebitda,   sr.ebitda,   se.ebitda),
    single('investimentos'),
    row('apos_investimentos', 'Resultado depois de investimentos', 'resultado', true, true,
      si.aposInvestimentos, sr.aposInvestimentos, se.aposInvestimentos),
  ]
}

// ── Edição ────────────────────────────────────────────────────────────────

/**
 * Reparte um total anual pelos meses abertos (índices ≥ cutoff) em partes
 * iguais, exato ao cêntimo: o que sobra do arredondamento vai para dezembro.
 */
export function distributeEven(total: number, cutoff: number): number[] {
  const months = zeros()
  const open   = 12 - cutoff
  if (open <= 0) return months
  const totalCents = Math.round(total * 100)
  const base       = Math.trunc(totalCents / open)
  for (let i = cutoff; i < 12; i++) months[i] = base / 100
  months[11] = (base + (totalCents - base * open)) / 100
  return months
}

/**
 * Lê um montante escrito à portuguesa — "1 234,56", "1.234,56", "12,5", "1234.5".
 * Vazio vale 0. Devolve null quando não é um número.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[\s  €]/g, '')
  if (s === '' || s === '-') return 0
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if ((s.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(s)) {
    // Só com pontos: "1.234" e "1.234.567" são milhares; "12.5" é decimal
    s = s.replace(/\./g, '')
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const v = Number(s)
  return Number.isFinite(v) ? round2(v) : null
}

/** Montante para mostrar num campo: vazio quando é 0, até 2 casas decimais */
export function formatAmount(v: number): string {
  return v === 0 ? '' : v.toLocaleString('pt-PT', { maximumFractionDigits: 2 })
}

/**
 * Valida as linhas enviadas ao gravar. Nos meses até `cutoff` (fechados numa
 * revisão), as rubricas bloqueadas ficam a 0, venha o que vier.
 */
export function parseLinesPayload(
  raw: unknown,
  cutoff: number,
  allowedCenters: readonly string[],
): { lines: BudgetLine[] } | { error: string } {
  if (typeof raw !== 'string' || raw.length > LIMITS.maxPayload) return { error: 'Dados demasiado grandes.' }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { error: 'Dados inválidos.' }
  }
  if (!Array.isArray(data)) return { error: 'Dados inválidos.' }
  if (data.length > LIMITS.maxLines) return { error: `O orçamento aceita até ${LIMITS.maxLines} linhas.` }

  const seen  = new Set<string>()
  const lines: BudgetLine[] = []
  for (const item of data) {
    if (typeof item !== 'object' || item === null) return { error: 'Dados inválidos.' }
    const { id, rubric, description, cost_center, months } = item as Record<string, unknown>
    if (!isUuid(id) || seen.has(id.toLowerCase())) return { error: 'Linha com identificador inválido.' }
    seen.add(id.toLowerCase())
    if (typeof rubric !== 'string' || !RUBRIC_KEYS.includes(rubric as RubricKey)) {
      return { error: 'Rubrica inválida.' }
    }
    const desc = typeof description === 'string' ? description.trim() : ''
    if (desc.length === 0 || desc.length > LIMITS.maxDescription) {
      return { error: `Cada linha precisa de uma descrição (até ${LIMITS.maxDescription} caracteres).` }
    }
    const center = cost_center === null || cost_center === undefined || cost_center === ''
      ? null
      : typeof cost_center === 'string' && allowedCenters.includes(cost_center) ? cost_center : undefined
    if (center === undefined) return { error: `Centro de custo inválido em "${desc}".` }
    if (!Array.isArray(months) || months.length !== 12) return { error: `A linha "${desc}" não tem os 12 meses.` }
    const locks  = RUBRIC_BY_KEY[rubric as RubricKey].locksWithReal
    const values: number[] = []
    for (let i = 0; i < 12; i++) {
      const v = months[i]
      if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > LIMITS.maxAmount) {
        return { error: `Valor inválido em "${desc}".` }
      }
      values.push(i < cutoff && locks ? 0 : round2(v))
    }
    lines.push({ id: id.toLowerCase(), rubric: rubric as RubricKey, description: desc, cost_center: center, months: values })
  }
  return { lines }
}

// ── Massa salarial ────────────────────────────────────────────────────────

export type PayrollSeedEmployee = PayrollEmpRow & {
  first_name: string
  last_name: string
  start_date: string
  end_date: string | null
}

export type MonthEstimator = (
  employees: PayrollEmpRow[],
  compensations: PayrollCompRow[],
  taxInfo: PayrollTaxRow[],
  absences: PayrollAbsenceRow[],
  year: number,
  month: number,
  deptLookup: Map<string, string> | undefined,
  contracts: PayrollContractRow[],
) => PayrollMonthResult

/**
 * Massa salarial de um ano, uma linha por pessoa, a partir dos salários em vigor.
 *
 * - Num mês só entra quem está empregado nesse mês e tem remuneração acima de
 *   0 a cobri-lo. Sem isto, o cálculo de salários usa o salário mais antigo em
 *   meses sem registo (uma contratação futura contava desde janeiro) e soma
 *   subsídio de alimentação a quem tem salário 0 (a consultora externa).
 * - A atualização salarial só se aplica a remunerações que começam antes do
 *   ano: um aumento já marcado para dentro do ano não leva outro por cima.
 * - Modo "na totalidade" ou sem dados fiscais: o cálculo de salários não soma
 *   subsídios nesse modo, por isso junta-se base × TSU em junho e novembro,
 *   como diz a ficha do colaborador — exceto em meses de estágio.
 */
export function buildPayrollLines(
  input: {
    year: number
    employees: PayrollSeedEmployee[]
    compensations: PayrollCompRow[]
    taxInfo: PayrollTaxRow[]
    contracts: PayrollContractRow[]
    /** fração: 0.03 = 3% */
    salaryUpdate: number
    tsuRate: number
  },
  estimate: MonthEstimator,
): { description: string; department: string | null; months: number[] }[] {
  const { year, employees, taxInfo, contracts, salaryUpdate, tsuRate } = input
  const yearStart     = `${year}-01-01`
  const compensations = input.compensations.map(c => c.effective_date < yearStart
    ? { ...c, base_salary: round2(c.base_salary * (1 + salaryUpdate)) }
    : c)
  const taxByEmp = new Map(taxInfo.map(t => [t.employee_id, t]))
  const byEmp    = new Map(employees.map(e => [e.id, zeros()]))

  for (let m = 1; m <= 12; m++) {
    const mm     = String(m).padStart(2, '0')
    const mStart = `${year}-${mm}-01`
    const mEnd   = `${year}-${mm}-${String(new Date(Date.UTC(year, m, 0)).getUTCDate()).padStart(2, '0')}`

    // A mesma escolha do cálculo de salários: a mais recente das que cobrem o mês
    const activeComp = (empId: string) => compensations
      .filter(c => c.employee_id === empId && c.effective_date <= mEnd && (c.end_date === null || c.end_date >= mStart))
      .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0]

    const eligible = employees.filter(e =>
      e.start_date <= mEnd &&
      (e.end_date === null || e.end_date >= mStart) &&
      (activeComp(e.id)?.base_salary ?? 0) > 0)
    if (eligible.length === 0) continue

    const result = estimate(eligible, compensations, taxInfo, [], year, m, undefined, contracts)
    for (const e of eligible) {
      let cost = result.byEmployee[e.id] ?? 0
      const mode = taxByEmp.get(e.id)?.subsidy_payment_mode ?? 'full'
      const inInternship = contracts.some(c =>
        c.employee_id === e.id && c.contract_type === 'internship' &&
        c.start_date <= mEnd && (c.end_date === null || c.end_date >= mEnd))
      if (mode === 'full' && (m === 6 || m === 11) && !inInternship) {
        cost += (activeComp(e.id)?.base_salary ?? 0) * tsuRate
      }
      byEmp.get(e.id)![m - 1] = round2(cost)
    }
  }

  return employees
    .map(e => ({
      description: `${e.first_name.trim()} ${e.last_name.trim()}`,
      department:  e.department,
      months:      byEmp.get(e.id)!,
    }))
    .filter(l => l.months.some(v => v !== 0))
    .sort((a, b) => a.description.localeCompare(b.description, 'pt'))
}
