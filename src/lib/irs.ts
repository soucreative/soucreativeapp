// ============================================================
// Tabelas de Retenção na Fonte — Continente 2026
// Fonte: AT — Despacho publicado para vigorar entre 1 jan e 31 dez 2026
// ============================================================

export type MaritalStatus = 'single' | 'married_two_earners' | 'married_single_earner'

interface Tier {
  limit: number   // limite superior do escalão (Infinity = último)
  rate: number    // taxa marginal
  d?: number      // parcela a abater (fixa)
  fa?: number     // fator A da parcela variável: deduction = rate * fa * (fb - salary)
  fb?: number     // fator B da parcela variável
  pd: number      // parcela adicional por dependente
}

// ---- Tabela I — Não casado sem dep. / Casado 2 titulares ----
const T1: Tier[] = [
  { limit: 920,      rate: 0,      d: 0,        pd: 0 },
  { limit: 1042,     rate: 0.125,  fa: 2.6,   fb: 1273.85, pd: 21.43 },
  { limit: 1108,     rate: 0.157,  fa: 1.35,  fb: 1554.83, pd: 21.43 },
  { limit: 1154,     rate: 0.157,  d: 94.71,    pd: 21.43 },
  { limit: 1212,     rate: 0.212,  d: 158.18,   pd: 21.43 },
  { limit: 1819,     rate: 0.241,  d: 193.33,   pd: 21.43 },
  { limit: 2119,     rate: 0.311,  d: 320.66,   pd: 21.43 },
  { limit: 2499,     rate: 0.349,  d: 401.19,   pd: 21.43 },
  { limit: 3305,     rate: 0.3836, d: 487.66,   pd: 21.43 },
  { limit: 5547,     rate: 0.3969, d: 531.62,   pd: 21.43 },
  { limit: 20221,    rate: 0.4495, d: 823.40,   pd: 21.43 },
  { limit: Infinity, rate: 0.4717, d: 1272.31,  pd: 21.43 },
]

// ---- Tabela II — Não casado com 1 ou mais dependentes ----
const T2: Tier[] = T1.map(t => ({ ...t, pd: t.limit === 920 ? 0 : 34.29 }))
// Same rates/deductions as T1, higher per-dependent deduction

// ---- Tabela III — Casado, único titular ----
const T3: Tier[] = [
  { limit: 991,      rate: 0,      d: 0,        pd: 0 },
  { limit: 1042,     rate: 0.125,  fa: 2.6,   fb: 1372.15, pd: 42.86 },
  { limit: 1108,     rate: 0.125,  fa: 1.35,  fb: 1677.85, pd: 42.86 },
  { limit: 1119,     rate: 0.125,  d: 96.17,    pd: 42.86 },
  { limit: 1432,     rate: 0.1272, d: 98.64,    pd: 42.86 },
  { limit: 1962,     rate: 0.157,  d: 141.32,   pd: 42.86 },
  { limit: 2240,     rate: 0.1938, d: 213.53,   pd: 42.86 },
  { limit: 2773,     rate: 0.2277, d: 289.47,   pd: 42.86 },
  { limit: 3389,     rate: 0.257,  d: 370.72,   pd: 42.86 },
  { limit: 5965,     rate: 0.2881, d: 476.12,   pd: 42.86 },
  { limit: 20265,    rate: 0.3843, d: 1049.96,  pd: 42.86 },
  { limit: Infinity, rate: 0.4717, d: 2821.13,  pd: 42.86 },
]

// ---- Tabela IV — Deficiente, não casado/casado 2 titulares, sem dep. ----
const T4: Tier[] = [
  { limit: 1694,     rate: 0,      d: 0,        pd: 0 },
  { limit: 2063,     rate: 0.212,  d: 359.13,   pd: 0 },
  { limit: 2492,     rate: 0.311,  d: 563.37,   pd: 0 },
  { limit: 4487,     rate: 0.349,  d: 658.07,   pd: 0 },
  { limit: 4753,     rate: 0.3836, d: 813.33,   pd: 0 },
  { limit: 6687,     rate: 0.3969, d: 876.55,   pd: 0 },
  { limit: 20468,    rate: 0.4495, d: 1228.29,  pd: 0 },
  { limit: Infinity, rate: 0.4717, d: 1682.68,  pd: 0 },
]

// ---- Tabela V — Deficiente, não casado, com dep. ----
const T5: Tier[] = [
  { limit: 1938,     rate: 0,      d: 0,        pd: 0 },
  { limit: 2063,     rate: 0.2132, d: 413.19,   pd: 42.86 },
  { limit: 2854,     rate: 0.311,  d: 614.96,   pd: 42.86 },
  { limit: 4504,     rate: 0.349,  d: 723.42,   pd: 42.86 },
  { limit: 6826,     rate: 0.3836, d: 879.26,   pd: 42.86 },
  { limit: 7048,     rate: 0.3969, d: 970.05,   pd: 42.86 },
  { limit: 20468,    rate: 0.4495, d: 1340.78,  pd: 42.86 },
  { limit: Infinity, rate: 0.4717, d: 1795.17,  pd: 42.86 },
]

// ---- Tabela VI — Deficiente, casado 2 titulares, com dep. ----
const T6: Tier[] = [
  { limit: 1668,     rate: 0,      d: 0,        pd: 0 },
  { limit: 2068,     rate: 0.2049, d: 341.78,   pd: 21.43 },
  { limit: 2497,     rate: 0.241,  d: 416.44,   pd: 21.43 },
  { limit: 3107,     rate: 0.311,  d: 591.23,   pd: 21.43 },
  { limit: 4504,     rate: 0.349,  d: 709.30,   pd: 21.43 },
  { limit: 6826,     rate: 0.3836, d: 865.14,   pd: 21.43 },
  { limit: 7048,     rate: 0.3969, d: 955.93,   pd: 21.43 },
  { limit: 20468,    rate: 0.4495, d: 1326.66,  pd: 21.43 },
  { limit: Infinity, rate: 0.4717, d: 1781.05,  pd: 21.43 },
]

// ---- Tabela VII — Deficiente, casado único titular ----
const T7: Tier[] = [
  { limit: 2325,     rate: 0,      d: 0,        pd: 0 },
  { limit: 3494,     rate: 0.2277, d: 529.41,   pd: 42.86 },
  { limit: 3761,     rate: 0.257,  d: 631.79,   pd: 42.86 },
  { limit: 6687,     rate: 0.2881, d: 748.76,   pd: 42.86 },
  { limit: 20468,    rate: 0.4244, d: 1660.20,  pd: 42.86 },
  { limit: Infinity, rate: 0.4717, d: 2628.34,  pd: 42.86 },
]

// ---- Selecionar a tabela correcta ----
export function getIRSTable(
  marital: MaritalStatus,
  dependents: number,
  disabled: boolean
): { tiers: Tier[]; tableNumber: number; tableLabel: string } {
  if (disabled) {
    if (marital === 'married_single_earner') return { tiers: T7, tableNumber: 7, tableLabel: 'Tabela VII' }
    if (marital === 'married_two_earners' && dependents > 0) return { tiers: T6, tableNumber: 6, tableLabel: 'Tabela VI' }
    if (marital === 'single' && dependents > 0) return { tiers: T5, tableNumber: 5, tableLabel: 'Tabela V' }
    return { tiers: T4, tableNumber: 4, tableLabel: 'Tabela IV' }
  }
  if (marital === 'married_single_earner') return { tiers: T3, tableNumber: 3, tableLabel: 'Tabela III' }
  if (marital === 'single' && dependents > 0) return { tiers: T2, tableNumber: 2, tableLabel: 'Tabela II' }
  return { tiers: T1, tableNumber: 1, tableLabel: 'Tabela I' }
}

// ---- Calcular retenção IRS mensal ----
export function calculateIRS(
  salary: number,
  marital: MaritalStatus,
  dependents: number,
  disabled: boolean
): { amount: number; rate: number; tableLabel: string; effectiveRate: number } {
  const { tiers, tableLabel } = getIRSTable(marital, dependents, disabled)
  const tier = tiers.find(t => salary <= t.limit) ?? tiers[tiers.length - 1]

  let deduction: number
  if (tier.fa !== undefined && tier.fb !== undefined) {
    deduction = tier.rate * tier.fa * (tier.fb - salary)
  } else {
    deduction = tier.d ?? 0
  }

  const amount = Math.max(0, salary * tier.rate - deduction - tier.pd * dependents)
  const effectiveRate = salary > 0 ? amount / salary : 0

  return { amount, rate: tier.rate, tableLabel, effectiveRate }
}

// ---- Calcular SS colaborador ----
export function calculateSS(salary: number, rate = 0.11): number {
  return salary * rate
}

// ============================================================
// Limites fiscais 2026 — exportados para uso no Prize Tab
// Validar anualmente: OE + Portaria publicada pelo Governo
// ============================================================
export const FISCAL_2026 = {
  year: 2026,
  // Subsídio de alimentação
  mealCardLimit:       10.46,   // €/dia — cartão/vale refeição (isento IRS)
  mealCashLimit:        6.15,   // €/dia — pagamento em dinheiro (isento IRS)
  // Quilometragem — viatura própria
  kmRate:               0.40,   // €/km isento (art.º 2.º CIRS)
  // Ajudas de custo — território nacional
  dailyAllowanceDomestic: 65.89, // €/dia isento (Portaria n.º 1553-D/2008 actualizada)
  // Isenção Prémios de Desempenho (Art. 2.º-A CIRS, OE2026)
  prizeExemptRate:      0.06,   // 6% da retribuição base anual isento IRS+SS
  prizeMinSalaryIncrease: 4.6,  // % aumento salarial mínimo exigido à empresa
  // IRS Jovem 2026 (1.º-5.º ano após conclusão de grau académico)
  irsJovemExemptLimit: 29500,   // € rendimentos isentos estimados (OE2026)
} as const

// ---- Calcular subsídio de alimentação líquido (isento até certos limites) ----
const MEAL_TAX_FREE_CARD = FISCAL_2026.mealCardLimit
const MEAL_TAX_FREE_CASH = FISCAL_2026.mealCashLimit

export function calculateMealAllowance(
  dailyAmount: number,
  type: 'card' | 'cash',
  workingDays: number
): { gross: number; taxable: number; exempt: number } {
  const limit = type === 'card' ? MEAL_TAX_FREE_CARD : MEAL_TAX_FREE_CASH
  const exemptPerDay = Math.min(dailyAmount, limit)
  const taxablePerDay = Math.max(0, dailyAmount - limit)
  return {
    gross: dailyAmount * workingDays,
    taxable: taxablePerDay * workingDays,
    exempt: exemptPerDay * workingDays,
  }
}

// ---- Simulação salarial completa ----
export interface SalaryBreakdown {
  grossSalary: number          // salário base mensal
  effectiveGross: number       // base mensal para IRS/SS (inclui duodécimos se aplicável)
  subsidyMode: 'full' | 'twelfths' | 'none'
  monthlySubsidy: number       // valor dos duodécimos por mês (0 nos outros modos)
  irsAmount: number
  irsEffectiveRate: number
  irsTableLabel: string
  ssAmount: number
  ssRate: number
  mealAllowanceGross: number
  mealAllowanceExempt: number
  mealAllowanceTaxable: number
  totalDeductions: number
  netSalary: number            // líquido mensal
  annualNet: number            // líquido anual estimado
}

export function simulateSalary(params: {
  grossSalary: number
  marital: MaritalStatus
  dependents: number
  disabled: boolean
  ssRate: number
  mealDailyAmount: number
  mealType: 'card' | 'cash'
  workingDays: number
  subsidyMode?: 'full' | 'twelfths' | 'none'
}): SalaryBreakdown {
  const { grossSalary, marital, dependents, disabled, ssRate, mealDailyAmount, mealType, workingDays, subsidyMode = 'full' } = params

  // Em duodécimos, os subsídios de férias + Natal são distribuídos mensalmente
  const monthlySubsidy = subsidyMode === 'twelfths' ? (grossSalary * 2) / 12 : 0
  const effectiveGross = grossSalary + monthlySubsidy

  const irs = calculateIRS(effectiveGross, marital, dependents, disabled)
  const ssAmount = calculateSS(effectiveGross, ssRate)
  const meal = calculateMealAllowance(mealDailyAmount, mealType, workingDays)

  const totalDeductions = irs.amount + ssAmount
  const netSalary = effectiveGross - totalDeductions + meal.gross

  // Anual: 12 meses líquidos + (só em 'full': 2 subsídios brutos − descontos sobre eles).
  // Em duodécimos os subsídios já estão no líquido mensal; em 'none' não existem.
  const annualNet = subsidyMode === 'full'
    ? netSalary * 12 + grossSalary * 2 * (1 - ssRate) - calculateIRS(grossSalary, marital, dependents, disabled).amount * 2
    : netSalary * 12

  return {
    grossSalary,
    effectiveGross,
    subsidyMode,
    monthlySubsidy,
    irsAmount: irs.amount,
    irsEffectiveRate: irs.effectiveRate,
    irsTableLabel: irs.tableLabel,
    ssAmount,
    ssRate,
    mealAllowanceGross: meal.gross,
    mealAllowanceExempt: meal.exempt,
    mealAllowanceTaxable: meal.taxable,
    totalDeductions,
    netSalary,
    annualNet,
  }
}
