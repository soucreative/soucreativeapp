import type { EmployeeTaxInfo, Compensation } from '@/types/database'
import { simulateSalary } from '@/lib/irs'

const fmt = (v: number) => v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
const pct = (v: number) => (v * 100).toFixed(1) + '%'

export default function SalarySimulator({
  compensation,
  tax,
}: {
  compensation: Compensation | null
  tax: EmployeeTaxInfo | null
}) {
  if (!compensation) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
        Sem remuneração registada. Adiciona primeiro a remuneração base.
      </div>
    )
  }

  if (!tax) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-700">
        Preenche os <strong>Dados Fiscais</strong> para calcular o vencimento líquido.
      </div>
    )
  }

  const breakdown = simulateSalary({
    grossSalary:       compensation.base_salary,
    marital:           tax.marital_status as 'single' | 'married_two_earners' | 'married_single_earner',
    dependents:        tax.dependents_count,
    disabled:          tax.is_disabled,
    ssRate:            tax.social_security_rate,
    mealDailyAmount:   tax.meal_allowance_daily ?? 0,
    mealType:          tax.meal_allowance_type as 'card' | 'cash',
    workingDays:       tax.working_days_per_month,
    subsidyMode:       tax.subsidy_payment_mode,
  })

  const rows: { label: string; value: string; sub?: string; negative?: boolean }[] = [
    {
      label: 'Salário base',
      value: fmt(breakdown.grossSalary),
    },
    ...(breakdown.subsidyMode === 'twelfths' ? [{
      label: 'Sub. férias + Natal (duodécimos)',
      value: `+ ${fmt(breakdown.monthlySubsidy)}`,
      sub: `1/6 do salário base por mês`,
    }] : []),
    {
      label: `Retenção IRS — ${breakdown.irsTableLabel}`,
      value: `− ${fmt(breakdown.irsAmount)}`,
      sub: `Taxa efetiva: ${pct(breakdown.irsEffectiveRate)}`,
      negative: true,
    },
    {
      label: `Segurança Social (${pct(breakdown.ssRate)})`,
      value: `− ${fmt(breakdown.ssAmount)}`,
      negative: true,
    },
    {
      label: `Sub. alimentação (${tax.working_days_per_month} dias × ${fmt(tax.meal_allowance_daily ?? 0)})`,
      value: `+ ${fmt(breakdown.mealAllowanceGross)}`,
      sub: breakdown.mealAllowanceTaxable > 0
        ? `Isento: ${fmt(breakdown.mealAllowanceExempt)} · Tributável: ${fmt(breakdown.mealAllowanceTaxable)}`
        : `Totalmente isento`,
    },
  ]

  const employerCost = breakdown.subsidyMode === 'twelfths'
    ? breakdown.effectiveGross * 1.2375
    : breakdown.grossSalary * 1.2375

  return (
    <div className="max-w-2xl space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
            Simulação mensal — {new Date().getFullYear()}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {breakdown.irsTableLabel} · {tax.dependents_count} dep. · {tax.is_disabled ? 'Deficiente' : 'Sem deficiência'}
            {' · '}Subsídios {breakdown.subsidyMode === 'twelfths' ? 'em duodécimos' : breakdown.subsidyMode === 'none' ? 'não aplicáveis' : 'na totalidade'}
          </p>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.label} className="px-6">
                <td className="px-6 py-3 text-slate-600">
                  <span>{row.label}</span>
                  {row.sub && <div className="text-xs text-slate-400 mt-0.5">{row.sub}</div>}
                </td>
                <td className={`px-6 py-3 text-right font-medium tabular-nums ${row.negative ? 'text-red-600' : 'text-slate-900'}`}>
                  {row.value}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 border-t-2 border-slate-200">
              <td className="px-6 py-4 font-semibold text-slate-900">Vencimento líquido mensal</td>
              <td className="px-6 py-4 text-right font-bold text-emerald-700 text-base tabular-nums">
                {fmt(breakdown.netSalary)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {breakdown.subsidyMode === 'full' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800">
          <p className="font-medium mb-1">Subsídios pagos na totalidade</p>
          <p>Sub. de férias: <strong>{fmt(breakdown.grossSalary)}</strong> (junho) · Sub. de Natal: <strong>{fmt(breakdown.grossSalary)}</strong> (novembro)</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Total descontos/mês" value={fmt(breakdown.totalDeductions)} color="text-red-600" />
        <KpiCard label="Líquido anual estimado" value={fmt(breakdown.annualNet)} color="text-emerald-700" />
        <KpiCard label="Custo total empresa*" value={fmt(employerCost)} color="text-slate-700"
          hint="*SS entidade: 23,75% (mensal)" />
      </div>
    </div>
  )
}

function KpiCard({ label, value, color, hint }: { label: string; value: string; color: string; hint?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}
