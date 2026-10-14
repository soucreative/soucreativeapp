'use client'

import { useActionState, useState } from 'react'
import type {
  Employee, EmployeeTaxInfo, Compensation, VariableRule,
  Objective, PerformanceRecord,
} from '@/types/database'
import { FISCAL_2026 } from '@/lib/irs'
import { savePrizePayment, upsertVariableRule } from '../actions'

const fmt     = (v: number) => v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const fmtExact = (v: number) => v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
const pctFmt  = (v: number) => `${v.toFixed(1)}%`

// ── IRS rate estimate by salary bracket (PT tabelas AT 2026) ──────────────
function estimatedIrsRate(salary: number): number {
  if (salary <  1042) return 0.00
  if (salary <  1212) return 0.15
  if (salary <  1819) return 0.23
  if (salary <  2499) return 0.32
  if (salary <  3305) return 0.37
  if (salary <  5547) return 0.40
  if (salary < 20221) return 0.44
  return 0.47
}

// ── Payment options ───────────────────────────────────────────────────────
const PAYMENT_OPTIONS = [
  {
    value:    'prize_exempt' as const,
    label:    'Isenção Prémios de Desempenho',
    emoji:    '⭐',
    badge:    'OE 2026',
    summary:  'Isento de IRS e SS até 6% da retribuição base anual. Aplica-se a prémios de produtividade pagos voluntariamente.',
    pros:     [
      'Isento de IRS e de Segurança Social (colaborador + empresa)',
      'Aplicado diretamente sobre o prémio de performance',
      'Máximo benefício fiscal disponível para prémios',
    ],
    cons:     [
      'A empresa deve ter aplicado aumento salarial ≥ 4,6%',
      `Limite: ${FISCAL_2026.prizeExemptRate * 100}% da retribuição base anual`,
      'Excedente sujeito a IRS e SS normais',
    ],
    netRate:  1.0,
    legalNote: `Art. 2.º-A CIRS (OE2026). Prémios de produtividade ou participação nos lucros pagos voluntariamente. Condição: aumento salarial elegível ≥ ${FISCAL_2026.prizeMinSalaryIncrease}% implementado pela entidade empregadora. Limite: ${FISCAL_2026.prizeExemptRate * 100}% × retribuição base anual.`,
  },
  {
    value:    'km_map' as const,
    label:    'Mapa de Quilómetros',
    emoji:    '🚗',
    badge:    null,
    summary:  `Compensação por deslocações em viatura própria. Isento até ${fmtExact(FISCAL_2026.kmRate)}/km.`,
    pros:     [
      `Isento de IRS e SS até €${FISCAL_2026.kmRate}/km`,
      'Colaborador recebe o valor bruto',
      'Fácil de documentar',
    ],
    cons:     [
      'Requer mapa de deslocações detalhado e assinado',
      `Limite legal: €${FISCAL_2026.kmRate}/km (viatura própria)`,
    ],
    netRate:  1.0,
    legalNote: `Isento até €${FISCAL_2026.kmRate}/km — viatura própria (art.º 2.º CIRS). Quilómetros acima do limite são tributados. Ajudas de custo domésticas: até €${FISCAL_2026.dailyAllowanceDomestic}/dia.`,
  },
  {
    value:    'tax_exempt' as const,
    label:    'Rúbricas Isentas (Plataforma de Benefícios)',
    emoji:    '✨',
    badge:    null,
    summary:  'Via plataforma de benefícios flexíveis com categorias isentas: saúde, formação, mobilidade, refeições.',
    pros:     [
      'Sem IRS nem SS dentro dos limites por categoria',
      'Colaborador escolhe onde usar os benefícios',
      'Plafonds anuais generosos',
    ],
    cons:     [
      'Requer subscrição de plataforma de benefícios',
      'Sujeito a limites anuais por rubrica',
    ],
    netRate:  1.0,
    legalNote: `Sub. refeição isento: ≤€${FISCAL_2026.mealCardLimit}/dia (cartão) | €${FISCAL_2026.mealCashLimit}/dia (dinheiro). Saúde: até €500/ano. Formação profissional: sem limite. Mobilidade casa-trabalho: isento.`,
  },
  {
    value:    'payroll' as const,
    label:    'Folha de Ordenado',
    emoji:    '📄',
    badge:    null,
    summary:  'Pago no recibo de vencimento. Tributado a taxa marginal de IRS + 11% SS.',
    pros:     [
      'Simples e transparente',
      'Registado no recibo de vencimento',
      'Sem documentação adicional',
    ],
    cons:     [
      'Sujeito a IRS (tabela AT)',
      'Contribuição SS de 11% do colaborador',
      'Custo patronal adicional de 23,75% SS',
    ],
    netRate:  0.61,
    legalNote: 'Retenção IRS variável conforme tabelas AT 2026 + SS 11%. Custo patronal adicional de 23,75% SS sobre o valor bruto.',
  },
] as const

type PayMethod = typeof PAYMENT_OPTIONS[number]['value']

// ── Prize calculation ─────────────────────────────────────────────────────
function calcPrize(
  achievementPct: number,
  maxVariable: number,
  variableRule: VariableRule | null,
  marginOk: boolean,
): number {
  if (!maxVariable || achievementPct <= 0 || !marginOk) return 0

  if (variableRule?.model === '1') {
    const data = variableRule.rule_data as {
      tiers?: Array<{ min: number; max: number | null; pct: number }>
    }
    if (data.tiers?.length) {
      const tier = data.tiers.find(
        t => achievementPct >= t.min && (t.max === null || achievementPct < t.max),
      )
      return tier ? maxVariable * tier.pct : 0
    }
  }
  return maxVariable * Math.min(achievementPct / 100, 1.5)
}

// ── Simulation tiers ──────────────────────────────────────────────────────
const SIM_TIERS = [
  { label: 'Sem prémio (abaixo da base)', pct: 0,   colorClass: 'text-slate-400' },
  { label: '75% da zona de prémio',       pct: 75,  colorClass: 'text-red-500' },
  { label: '90% da meta',                 pct: 90,  colorClass: 'text-amber-500' },
  { label: '100% — meta atingida',        pct: 100, colorClass: 'text-emerald-600', highlight: true },
  { label: '120% — supera a meta',        pct: 120, colorClass: 'text-emerald-700' },
  { label: '150% — performance excecional', pct: 150, colorClass: 'text-indigo-600' },
]

// ─────────────────────────────────────────────────────────────────────────
export default function PrizeTab({
  employee,
  tax,
  compensation,
  variableRule,
  objectives,
  performanceRecords,
  companyObjective,
  marginTarget,
  yearlyRevenue,
  ytdEbitda,
  isAdmin,
}: {
  employee: Employee
  tax: EmployeeTaxInfo | null
  compensation: Compensation | null
  variableRule: VariableRule | null
  objectives: Objective[]
  performanceRecords: PerformanceRecord[]
  companyObjective: Objective | null
  marginTarget: Objective | null
  yearlyRevenue: number
  ytdEbitda: number
  isAdmin: boolean
}) {
  const [payState, payAction, payPending]   = useActionState(savePrizePayment, null)
  const [ruleState, ruleAction, rulePending] = useActionState(upsertVariableRule, null)
  const [method, setMethod] = useState<PayMethod>(
    (tax?.prize_payment_method as PayMethod | undefined) ?? 'prize_exempt',
  )
  const [kmAmount, setKmAmount] = useState<string>(
    tax?.km_monthly_amount?.toString() ?? '',
  )
  const [configOpen, setConfigOpen] = useState(!variableRule)
  const [ruleModel, setRuleModel] = useState<string>(
    variableRule?.model ?? compensation?.variable_model ?? '2',
  )
  // Default tiers for Model 1
  const defaultTiers = (variableRule?.model === '1' && (variableRule.rule_data as { tiers?: unknown[] }).tiers?.length)
    ? (variableRule.rule_data as { tiers: Array<{ min: number; max: number | null; pct: number }> }).tiers
    : [
        { min: 0,   max: 79,   pct: 0   },
        { min: 80,  max: 99,   pct: 0.5 },
        { min: 100, max: 119,  pct: 1.0 },
        { min: 120, max: null, pct: 1.2 },
      ]

  const isManagement = ['management', 'director'].includes(employee.position_type ?? '')
  const maxVariable  = variableRule?.max_variable_amount ?? null
  const baseSalary   = compensation?.base_salary ?? 0
  const annualBase   = baseSalary * 12
  const currentYear  = new Date().getFullYear()

  // ── Prize exemption cap (6% of annual base) ──────────────────────────
  const prizeExemptCap = annualBase * FISCAL_2026.prizeExemptRate

  // ── Management: margin condition ──────────────────────────────────────
  const actualMarginPct = yearlyRevenue > 0 ? (ytdEbitda / yearlyRevenue) * 100 : null
  const marginTargetPct = marginTarget?.target_value ?? null
  const marginOk        = !isManagement || !marginTargetPct
    || (actualMarginPct != null && actualMarginPct >= marginTargetPct)

  // ── Current achievement % ─────────────────────────────────────────────
  const achievementPct: number | null = (() => {
    if (isManagement && companyObjective?.target_value) {
      const target = companyObjective.target_value
      const base   = companyObjective.minimum_base ?? 0
      const zone   = target - base
      if (zone <= 0) return Math.min((yearlyRevenue / target) * 100, 150)
      return Math.min(Math.max(0, ((yearlyRevenue - base) / zone) * 100), 150)
    }
    const withData = objectives.filter(o => o.target_value && o.actual_value != null)
    if (!withData.length) return null
    const avg = withData.reduce((s, o) => s + o.actual_value! / o.target_value!, 0) / withData.length
    return Math.min(avg * 100, 150)
  })()

  // ── Gross prize (current performance) ────────────────────────────────
  const currentGross = calcPrize(achievementPct ?? 0, maxVariable ?? 0, variableRule, marginOk)
  const ytdVariable  = performanceRecords.reduce((s, r) => s + (r.variable_earned ?? 0), 0)

  // ── Net prize calculation by method ──────────────────────────────────
  function netPrize(gross: number, m: PayMethod): number {
    if (gross <= 0) return 0
    if (m === 'prize_exempt') {
      const exempt  = Math.min(gross, prizeExemptCap)
      const taxable = Math.max(0, gross - prizeExemptCap)
      const irs     = estimatedIrsRate(baseSalary)
      return exempt + taxable * (1 - irs - 0.11)
    }
    if (m === 'payroll') {
      const irs = estimatedIrsRate(baseSalary)
      return gross * (1 - irs - 0.11)
    }
    return gross // km_map and tax_exempt — full value within limits
  }

  const selectedOpt   = PAYMENT_OPTIONS.find(o => o.value === method)!
  const currentNet    = netPrize(currentGross, method)
  const irsRate       = estimatedIrsRate(baseSalary)

  return (
    <div className="space-y-6 max-w-3xl">

      {/* ── 0. Configuração da componente variável ─────────────────── */}
      {isAdmin ? (
        /* ── Admin: editable config ──────────────────────────────── */
        <div className={`rounded-xl border-2 ${
          !variableRule ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
        }`}>
          <div
            className="px-6 py-4 flex items-center justify-between cursor-pointer select-none"
            onClick={() => setConfigOpen(v => !v)}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{variableRule ? '⚙️' : '⚠️'}</span>
              <div>
                <p className={`text-sm font-semibold ${!variableRule ? 'text-amber-800' : 'text-slate-900'}`}>
                  {variableRule
                    ? `Componente variável — Modelo ${variableRule.model} · ${variableRule.max_variable_amount != null ? fmt(variableRule.max_variable_amount) + ' máx.' : 'sem montante definido'}`
                    : 'Componente variável não configurada'}
                </p>
                <p className={`text-xs mt-0.5 ${!variableRule ? 'text-amber-600' : 'text-slate-400'}`}>
                  {variableRule
                    ? `Ativo desde ${new Date(variableRule.effective_date).toLocaleDateString('pt-PT')} · clica para editar`
                    : 'Define o modelo e o montante máximo anual para ativar o simulador'}
                </p>
              </div>
            </div>
            <span className="text-slate-400 text-sm ml-4">{configOpen ? '▲' : '▼'}</span>
          </div>

          {configOpen && (
            <div className="border-t border-slate-200">
              {/* Model explanation cards */}
              <div className="px-6 pt-5 pb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  Como funcionam os 3 modelos de prémio
                </p>
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {/* Modelo 1 */}
                  <div className={`rounded-xl border-2 p-4 cursor-pointer transition-all ${
                    ruleModel === '1' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`} onClick={() => setRuleModel('1')}>
                    <p className="text-xs font-bold text-slate-800 mb-1">Modelo 1 · Escalões</p>
                    <p className="text-xs text-slate-600 leading-snug mb-2">
                      Prémio calculado por <strong>patamares fixos</strong> de desempenho. Simples e previsível.
                    </p>
                    <div className="text-xs text-slate-500 space-y-0.5 border-t border-slate-200 pt-2">
                      <p>0–79% target → <span className="font-semibold text-red-500">0%</span> do variável</p>
                      <p>80–99% target → <span className="font-semibold text-amber-500">50%</span> do variável</p>
                      <p>100–119% target → <span className="font-semibold text-emerald-600">100%</span></p>
                      <p>≥120% target → <span className="font-semibold text-indigo-600">120%</span> (bónus)</p>
                    </div>
                    <p className="text-xs text-slate-400 italic mt-2">Ideal para funções comerciais com target único claro.</p>
                  </div>

                  {/* Modelo 2 */}
                  <div className={`rounded-xl border-2 p-4 cursor-pointer transition-all ${
                    ruleModel === '2' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`} onClick={() => setRuleModel('2')}>
                    <p className="text-xs font-bold text-slate-800 mb-1">Modelo 2 · MBO ponderado</p>
                    <p className="text-xs text-slate-600 leading-snug mb-2">
                      Vários objetivos com <strong>pesos diferentes</strong>. O prémio é a média ponderada dos cumprimentos.
                    </p>
                    <div className="text-xs text-slate-500 space-y-0.5 border-t border-slate-200 pt-2">
                      <p>Ex: Vendas <span className="font-semibold">50%</span> + NPS <span className="font-semibold">30%</span> + Pontualidade <span className="font-semibold">20%</span></p>
                      <p className="mt-1">Se cumprir 90% das vendas, 100% do NPS e 80% pontualidade:</p>
                      <p className="font-semibold text-indigo-600">= 0.9×50% + 1.0×30% + 0.8×20% = 91% do variável</p>
                    </div>
                    <p className="text-xs text-slate-400 italic mt-2">Os objetivos definem-se em <strong>Objetivos → Individual</strong>.</p>
                  </div>

                  {/* Modelo 3 */}
                  <div className={`rounded-xl border-2 p-4 cursor-pointer transition-all ${
                    ruleModel === '3' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`} onClick={() => setRuleModel('3')}>
                    <p className="text-xs font-bold text-slate-800 mb-1">Modelo 3 · Split equipa / individual</p>
                    <p className="text-xs text-slate-600 leading-snug mb-2">
                      Parte do prémio depende da <strong>empresa atingir a meta</strong>, parte do desempenho individual.
                    </p>
                    <div className="text-xs text-slate-500 space-y-0.5 border-t border-slate-200 pt-2">
                      <p><span className="font-semibold text-violet-600">70%</span> equipa — meta de faturação (Financeiro)</p>
                      <p><span className="font-semibold text-amber-600">30%</span> individual — objetivos pessoais</p>
                      <p className="mt-1">Se empresa a 90% e colaborador a 100%:</p>
                      <p className="font-semibold text-indigo-600">= 0.9×70% + 1.0×30% = 93% do variável</p>
                    </div>
                    <p className="text-xs text-slate-400 italic mt-2">Alinha o colaborador com os resultados da empresa.</p>
                  </div>
                </div>
              </div>

              <form action={ruleAction} className="px-6 pb-5 space-y-5">
                <input type="hidden" name="employee_id" value={employee.id} />

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Modelo selecionado <span className="text-red-400">*</span>
                    </label>
                    <select
                      name="model"
                      value={ruleModel}
                      onChange={e => setRuleModel(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      <option value="1">Modelo 1 — Escalões</option>
                      <option value="2">Modelo 2 — MBO ponderado</option>
                      <option value="3">Modelo 3 — Split equipa / individual</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Montante máximo anual (€) <span className="text-red-400">*</span>
                    </label>
                    <input
                      name="max_variable_amount"
                      type="number" min="0" step="100" required
                      defaultValue={variableRule?.max_variable_amount ?? ''}
                      placeholder="ex: 5000"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Data de entrada em vigor <span className="text-red-400">*</span>
                    </label>
                    <input
                      name="effective_date"
                      type="date" required
                      defaultValue={variableRule?.effective_date ?? new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Model 1 tiers */}
                {ruleModel === '1' && (
                  <div>
                    <p className="text-xs font-medium text-slate-600 mb-2">
                      Escalões — define os patamares de desempenho e o % do variável a pagar em cada um
                    </p>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            <th className="px-4 py-2 text-left">Desempenho ≥</th>
                            <th className="px-4 py-2 text-left">e &lt;</th>
                            <th className="px-4 py-2 text-left">Paga % do variável máx.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {defaultTiers.map((tier, i) => (
                            <tr key={i} className="bg-white">
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-1">
                                  <input name={`tier_${i}_min`} type="number" min="0" max="200" step="5"
                                    defaultValue={tier.min}
                                    className="w-20 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                                  <span className="text-slate-400 text-xs">%</span>
                                </div>
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-1">
                                  <input name={`tier_${i}_max`} type="number" min="0" max="300" step="5"
                                    defaultValue={tier.max ?? ''}
                                    placeholder="sem limite"
                                    className="w-24 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                                  <span className="text-slate-400 text-xs">%</span>
                                </div>
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-1">
                                  <input name={`tier_${i}_pct`} type="number" min="0" max="200" step="5"
                                    defaultValue={Math.round(tier.pct * 100)}
                                    className="w-20 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                                  <span className="text-slate-400 text-xs">%</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Model 3 weights */}
                {ruleModel === '3' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">
                        Peso equipa (%) <span className="text-slate-400 font-normal">— ligado à meta de faturação</span>
                      </label>
                      <input name="team_weight" type="number" min="0" max="100" step="10"
                        defaultValue={variableRule?.model === '3' ? Math.round((variableRule.rule_data as { team_weight: number }).team_weight * 100) : 70}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">
                        Peso individual (%) <span className="text-slate-400 font-normal">— ligado aos objetivos pessoais</span>
                      </label>
                      <input name="individual_weight" type="number" min="0" max="100" step="10"
                        defaultValue={variableRule?.model === '3' ? Math.round((variableRule.rule_data as { individual_weight: number }).individual_weight * 100) : 30}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>
                )}

                {ruleState?.error && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{ruleState.error}</p>
                )}
                {ruleState?.success && (
                  <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-lg">
                    ✓ Configuração guardada. O simulador está agora ativo.
                  </p>
                )}

                <button type="submit" disabled={rulePending}
                  className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {rulePending ? 'A guardar...' : 'Guardar configuração'}
                </button>
              </form>
            </div>
          )}
        </div>
      ) : (
        /* ── Non-admin: read-only summary ────────────────────────── */
        <div className="bg-white rounded-xl border border-slate-200 px-6 py-4 flex items-center gap-4">
          <span className="text-xl">🏆</span>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {variableRule
                ? (() => {
                    const labels: Record<string, string> = {
                      '1': 'Modelo 1 — Escalões',
                      '2': 'Modelo 2 — MBO ponderado',
                      '3': 'Modelo 3 — Split equipa / individual',
                    }
                    return `${labels[variableRule.model] ?? `Modelo ${variableRule.model}`}${variableRule.max_variable_amount != null ? ' · ' + fmt(variableRule.max_variable_amount) + ' máx.' : ''}`
                  })()
                : 'Componente variável por configurar'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {variableRule
                ? `Ativo desde ${new Date(variableRule.effective_date).toLocaleDateString('pt-PT')}`
                : 'Contacta a administração para ativar o simulador de prémio'}
            </p>
          </div>
        </div>
      )}

      {/* ── Annual fiscal update banner ───────────────────────────── */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <span className="text-amber-500 text-lg leading-none mt-0.5">📅</span>
        <div className="flex-1">
          <p className="text-xs font-semibold text-amber-800 mb-1">
            Limites fiscais {FISCAL_2026.year} — validar anualmente
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-0.5 text-xs text-amber-700">
            <span>Prémios isentos: até {FISCAL_2026.prizeExemptRate * 100}% base anual</span>
            <span>Km: €{FISCAL_2026.kmRate}/km</span>
            <span>Refeição cartão: €{FISCAL_2026.mealCardLimit}/dia</span>
            <span>Refeição dinheiro: €{FISCAL_2026.mealCashLimit}/dia</span>
            <span>Aj. custo nacional: €{FISCAL_2026.dailyAllowanceDomestic}/dia</span>
            <span>IRS Jovem: até ~€{(FISCAL_2026.irsJovemExemptLimit / 1000).toFixed(0)}k</span>
          </div>
          <p className="text-xs text-amber-600 mt-1.5">
            Fonte: OE2026 · Portarias AT · Ordem Contabilistas Certificados. Confirma os valores publicados cada ano antes de processar prémios.
          </p>
        </div>
      </div>

      {/* ── 1. Prémio bruto atual (TOP) ────────────────────────────── */}
      <div className={`rounded-xl border-2 p-6 ${
        currentGross > 0
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-slate-50 border-slate-200'
      }`}>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Prémio bruto calculado — {currentYear}
        </p>
        <div className="flex items-end gap-6 flex-wrap">
          <div>
            <p className={`text-4xl font-bold tabular-nums ${
              currentGross > 0 ? 'text-emerald-700' : 'text-slate-300'
            }`}>
              {currentGross > 0 ? fmt(currentGross) : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {achievementPct != null
                ? `${pctFmt(achievementPct)} da zona de prémio`
                : 'Sem dados de desempenho'
              }
              {maxVariable && currentGross === 0 && achievementPct != null && achievementPct > 0 && !marginOk
                ? ' · condição de margem pendente'
                : ''
              }
            </p>
          </div>
          {currentGross > 0 && (
            <>
              <div className="h-12 w-px bg-slate-200 hidden sm:block" />
              <div>
                <p className="text-xs text-slate-400 mb-0.5">
                  Líquido estimado <span className="font-medium text-slate-600">({selectedOpt.label})</span>
                </p>
                <p className="text-2xl font-bold text-indigo-700 tabular-nums">
                  {fmt(currentNet)}
                </p>
                {method === 'prize_exempt' && currentGross > 0 && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {currentGross <= prizeExemptCap
                      ? `✓ Totalmente isento (dentro dos ${FISCAL_2026.prizeExemptRate * 100}% da base anual)`
                      : `Isento: ${fmt(prizeExemptCap)} · Tributado: ${fmt(currentGross - prizeExemptCap)}`
                    }
                  </p>
                )}
              </div>
              {method === 'prize_exempt' && baseSalary > 0 && (
                <div className="rounded-lg bg-white border border-emerald-100 px-4 py-2 text-xs text-slate-600">
                  <p className="font-semibold text-slate-700 mb-0.5">Cap. isenção (6% base anual)</p>
                  <p className="tabular-nums text-emerald-700 font-bold">{fmt(prizeExemptCap)}</p>
                  <p className="text-slate-400">{fmt(baseSalary)}/mês × 12 × 6%</p>
                </div>
              )}
            </>
          )}
        </div>
        {ytdVariable > 0 && (
          <div className="mt-4 pt-4 border-t border-emerald-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
              Variável acumulado YTD processado
            </p>
            <p className="text-lg font-bold text-emerald-700 tabular-nums">{fmt(ytdVariable)}</p>
          </div>
        )}
      </div>

      {/* ── 2. Método de pagamento / benefícios fiscais ───────────── */}
      <form action={payAction}>
        <input type="hidden" name="employee_id" value={employee.id} />
        <input type="hidden" name="prize_payment_method" value={method} />
        <input type="hidden" name="km_monthly_amount" value={kmAmount} />

        {/* Só a gestão muda o método — os diretores veem-no sem poder alterar */}
        <fieldset disabled={!isAdmin} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5 min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                Como é pago o prémio
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Seleciona o benefício fiscal mais vantajoso para a situação do colaborador.
              </p>
            </div>
            {isAdmin && (
              <button
                type="submit"
                disabled={payPending}
                className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {payPending ? 'A guardar...' : 'Guardar preferência'}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {PAYMENT_OPTIONS.map(opt => {
              // show the exempt cap for prize_exempt
              const capInfo = opt.value === 'prize_exempt' && baseSalary > 0
                ? `Cap. disponível: ${fmt(prizeExemptCap)}`
                : null

              // show estimated net for current gross
              const estimatedNet = maxVariable && currentGross > 0
                ? netPrize(currentGross, opt.value)
                : null

              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMethod(opt.value)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    method === opt.value
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none mt-0.5">{opt.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-semibold ${method === opt.value ? 'text-indigo-700' : 'text-slate-900'}`}>
                          {opt.label}
                        </p>
                        {opt.badge && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
                            {opt.badge}
                          </span>
                        )}
                        {method === opt.value && (
                          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                            Selecionado
                          </span>
                        )}
                        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${
                          opt.netRate >= 1
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {opt.netRate >= 1 ? '100% líquido*' : `~${Math.round(opt.netRate * 100)}% líquido`}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 mt-1">{opt.summary}</p>

                      {/* Cap info + estimated net for this option */}
                      {(capInfo || estimatedNet != null) && (
                        <div className="flex items-center gap-4 mt-2 text-xs">
                          {capInfo && <span className="text-indigo-600 font-medium">{capInfo}</span>}
                          {estimatedNet != null && estimatedNet > 0 && (
                            <span className={`font-semibold ${
                              opt.value !== 'payroll' ? 'text-emerald-600' : 'text-amber-600'
                            }`}>
                              Líquido estimado: {fmt(estimatedNet)}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div>
                          <p className="text-xs font-medium text-emerald-600 mb-1">✓ Vantagens</p>
                          {opt.pros.map(p => (
                            <p key={p} className="text-xs text-slate-600 leading-snug">· {p}</p>
                          ))}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-amber-600 mb-1">⚠ A considerar</p>
                          {opt.cons.map(c => (
                            <p key={c} className="text-xs text-slate-600 leading-snug">· {c}</p>
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 italic mt-2 border-t border-slate-100 pt-2">
                        {opt.legalNote}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Extra field for km_map */}
          {method === 'km_map' && (
            <div className="bg-slate-50 rounded-xl p-4 max-w-xs">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Valor mensal do mapa de kms (€)
                <span className="ml-1.5 text-xs font-normal text-slate-400">opcional — para referência</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={kmAmount}
                onChange={e => setKmAmount(e.target.value)}
                placeholder="ex: 200"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {kmAmount && Number(kmAmount) > 0 && (
                <p className="text-xs text-slate-400 mt-1">
                  Equivale a ~{Math.round(Number(kmAmount) / FISCAL_2026.kmRate).toLocaleString('pt-PT')} km/mês a €{FISCAL_2026.kmRate}/km
                </p>
              )}
            </div>
          )}

          {payState?.error   && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{payState.error}</p>}
          {payState?.success && <p className="text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">Preferência guardada com sucesso.</p>}
        </fieldset>
      </form>

      {/* ── 3. Situação atual ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
          Situação atual — {currentYear}
        </h3>

        {isManagement ? (
          <div className="space-y-3">
            <p className="text-xs text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg font-medium">
              Posição Management/Direção — prémio ligado aos resultados globais da empresa
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-xl border p-4 ${
                companyObjective
                  ? achievementPct != null && achievementPct > 0
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-amber-50 border-amber-200'
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Condição 1 · Faturação
                </p>
                {companyObjective?.target_value ? (
                  <>
                    <p className="text-sm text-slate-700">
                      Meta: <strong>{fmt(companyObjective.target_value)}</strong>
                    </p>
                    {companyObjective.minimum_base != null && (
                      <p className="text-xs text-slate-500">
                        Base mínima: {fmt(companyObjective.minimum_base)}
                      </p>
                    )}
                    <p className={`text-sm font-bold mt-2 ${
                      achievementPct != null && achievementPct >= 100
                        ? 'text-emerald-600' : 'text-amber-600'
                    }`}>
                      {achievementPct != null
                        ? `${pctFmt(achievementPct)} zona de prémio`
                        : 'Sem dados de faturação'}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-slate-400">Objetivo não definido em Financeiro.</p>
                )}
              </div>

              <div className={`rounded-xl border p-4 ${
                marginTargetPct
                  ? marginOk ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Condição 2 · Margem EBITDA
                </p>
                {marginTargetPct ? (
                  <>
                    <p className="text-sm text-slate-700">
                      Meta: <strong>{marginTargetPct}%</strong>
                    </p>
                    <p className={`text-sm font-bold mt-2 ${marginOk ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {actualMarginPct != null
                        ? `Atual: ${pctFmt(actualMarginPct)}`
                        : 'Sem dados financeiros'}
                    </p>
                    {!marginOk && (
                      <p className="text-xs text-amber-600 mt-1">
                        ⚠ Falta {pctFmt(marginTargetPct - (actualMarginPct ?? 0))} p.p.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-400">Margem objetivo não definida em Financeiro.</p>
                )}
              </div>
            </div>

            {(companyObjective || marginTargetPct) && (
              <div className={`rounded-xl p-3 text-center text-sm font-semibold ${
                achievementPct != null && achievementPct > 0 && marginOk
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {achievementPct != null && achievementPct > 0 && marginOk
                  ? '✓ Ambas as condições cumpridas — elegível para prémio'
                  : '⚠ Condições de prémio ainda não atingidas'}
              </div>
            )}
          </div>
        ) : (
          <div>
            {objectives.length > 0 ? (
              <div className="space-y-2">
                {objectives.map(obj => {
                  const achieved = obj.actual_value != null && obj.target_value
                    ? (obj.actual_value / obj.target_value) * 100 : null
                  return (
                    <div key={obj.id}
                      className="flex items-center justify-between py-2.5 px-3 rounded-xl border border-slate-100 hover:border-slate-200">
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="text-sm font-medium text-slate-900 truncate">{obj.title}</p>
                        {obj.target_value != null && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            Meta: {obj.unit === '€' ? fmt(obj.target_value) : `${obj.target_value}${obj.unit ?? ''}`}
                            {obj.actual_value != null && (
                              <span className="ml-2">
                                · Realizado: {obj.unit === '€'
                                  ? fmt(obj.actual_value)
                                  : `${obj.actual_value}${obj.unit ?? ''}`}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <span className={`text-base font-bold tabular-nums shrink-0 ${
                        achieved == null ? 'text-slate-300'
                          : achieved >= 100 ? 'text-emerald-600'
                          : achieved >= 80  ? 'text-amber-500'
                          : 'text-red-500'
                      }`}>
                        {achieved != null ? `${achieved.toFixed(0)}%` : '—'}
                      </span>
                    </div>
                  )
                })}
                {achievementPct != null && (
                  <div className="pt-2 flex items-center justify-between px-3">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Média ponderada
                    </span>
                    <span className={`text-lg font-bold tabular-nums ${
                      achievementPct >= 100 ? 'text-emerald-600'
                        : achievementPct >= 80  ? 'text-amber-500'
                        : 'text-red-500'
                    }`}>
                      {pctFmt(achievementPct)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-6">
                Sem objetivos individuais definidos para {currentYear}.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── 4. Simulador de prémio ────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
            Simulador de prémio
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Prémio bruto e líquido por patamar de desempenho · método:{' '}
            <strong className="text-slate-600">{selectedOpt.label}</strong>
          </p>
        </div>

        {!maxVariable ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center space-y-2">
            <p className="text-2xl">📊</p>
            <p className="text-sm font-semibold text-amber-800">
              Simulador inativo
            </p>
            <p className="text-xs text-amber-700">
              Preenche o <strong>Montante máximo anual</strong> na secção{' '}
              <button
                type="button"
                onClick={() => { setConfigOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                className="underline font-semibold hover:text-amber-900"
              >
                Componente variável
              </button>{' '}
              no topo desta página para ativar o simulador.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Salário base</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{fmt(baseSalary)}</p>
                <p className="text-xs text-slate-400">/ mês</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Máx. variável anual</p>
                <p className="text-xl font-bold text-indigo-700 tabular-nums">{fmt(maxVariable)}</p>
                <p className="text-xs text-slate-400">
                  {baseSalary > 0 ? `${pctFmt((maxVariable / annualBase) * 100)} do salário anual` : ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">
                  {method === 'prize_exempt' ? 'Cap. isenção fiscal' : 'Desempenho atual'}
                </p>
                {method === 'prize_exempt' ? (
                  <>
                    <p className="text-xl font-bold text-emerald-600 tabular-nums">{fmt(prizeExemptCap)}</p>
                    <p className="text-xs text-slate-400">6% × base anual</p>
                  </>
                ) : (
                  <>
                    <p className={`text-xl font-bold tabular-nums ${
                      achievementPct == null ? 'text-slate-300'
                        : achievementPct >= 100 ? 'text-emerald-600'
                        : achievementPct >= 80  ? 'text-amber-500'
                        : 'text-red-500'
                    }`}>
                      {achievementPct != null ? pctFmt(achievementPct) : '—'}
                    </p>
                    <p className="text-xs text-slate-400">zona de prémio</p>
                  </>
                )}
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Patamar</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">% atingida</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Prémio bruto</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Prémio líquido*</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Salário + prémio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {SIM_TIERS.map(tier => {
                    const gross = calcPrize(tier.pct, maxVariable, variableRule, marginOk)
                    const net   = netPrize(gross, method)
                    const isCurrentLevel = achievementPct != null
                      && Math.abs(achievementPct - tier.pct) < 12
                      && tier.pct > 0
                    // For prize_exempt: show if this tier exceeds the cap
                    const exceedsCap = method === 'prize_exempt' && gross > prizeExemptCap && prizeExemptCap > 0
                    return (
                      <tr
                        key={tier.pct}
                        className={`${
                          isCurrentLevel
                            ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200'
                            : tier.highlight
                              ? 'bg-emerald-50/50'
                              : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className={`px-4 py-3 font-medium ${isCurrentLevel ? 'text-indigo-700' : tier.colorClass}`}>
                          {tier.label}
                          {isCurrentLevel && (
                            <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">
                              situação atual
                            </span>
                          )}
                          {exceedsCap && (
                            <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                              excede cap
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold tabular-nums ${isCurrentLevel ? 'text-indigo-700' : tier.colorClass}`}>
                          {tier.pct}%
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">
                          {gross > 0 ? fmt(gross) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${net > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                          {net > 0 ? fmt(net) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 tabular-nums font-medium">
                          {fmt(baseSalary + gross / 12)}
                          <span className="text-slate-400 font-normal text-xs ml-1">/mês</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-1.5 text-xs text-slate-400">
              <p>
                * Prémio líquido estimado com método{' '}
                <strong className="text-slate-600">{selectedOpt.label}</strong>.
                {method === 'payroll' && baseSalary > 0 && (
                  <span>
                    {' '}Taxa IRS estimada para {fmt(baseSalary)}/mês:{' '}
                    <strong className="text-slate-600">~{Math.round(irsRate * 100)}%</strong> + SS 11%.
                  </span>
                )}
                {method === 'prize_exempt' && baseSalary > 0 && (
                  <span>
                    {' '}Isento até {fmt(prizeExemptCap)} ({FISCAL_2026.prizeExemptRate * 100}% da base anual).
                    {' '}Excedente tributado a ~{Math.round(irsRate * 100)}% IRS + 11% SS.
                  </span>
                )}
                {(method === 'km_map' || method === 'tax_exempt') && (
                  <span> Isento nos limites legais — valor completo para o colaborador.</span>
                )}
              </p>
              <p>
                &quot;Salário + prémio&quot; assume o prémio distribuído em 12 mensalidades iguais, para referência.
                Valores meramente indicativos — consulte o seu contabilista.
              </p>
              {isManagement && !marginOk && (
                <p className="text-amber-600 font-medium">
                  ⚠ Condição de margem EBITDA não cumprida ({pctFmt(actualMarginPct ?? 0)} vs {pctFmt(marginTargetPct ?? 0)} objetivo).
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
