import { MONTH_NAMES_SHORT } from '@/lib/constants'
import { formatEUR } from '@/lib/format'
import type { FinancialRecord } from '@/types/database'

const fmt  = formatEUR
const fmtH = (h: number) =>
  h.toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' h'

/**
 * Custo/hora da empresa, mês a mês.
 *
 * O denominador são as horas registadas no registo de horas, não a capacidade teórica:
 * é o que responde a "quanto me custa uma hora de trabalho". Mostra-se também
 * o custo por hora faturável, que é a tarifa abaixo da qual se perde dinheiro.
 *
 * Meses com pouco registo produzem um custo/hora artificialmente alto — os
 * custos são do mês inteiro mas as horas só as que foram lançadas. Por isso a
 * cobertura é apresentada ao lado, e valores pouco fiáveis ficam assinalados.
 */
export default function CostPerHourSection({
  year,
  records,
  horasRegistadas,
  horasFaturaveis,
  horasDisponiveis,
}: {
  year: number
  records: FinancialRecord[]
  horasRegistadas: Record<number, number>
  horasFaturaveis: Record<number, number>
  horasDisponiveis: Record<number, number>
}) {
  const linhas = records.map(r => {
    const salarios = r.total_payroll
    const fse      = r.fse + r.fse_suppliers
    const diretos  = r.direct_costs
    const total    = salarios + fse + diretos
    const reg      = horasRegistadas[r.month] ?? 0
    const fat      = horasFaturaveis[r.month] ?? 0
    const disp     = horasDisponiveis[r.month] ?? 0
    const cobertura = disp > 0 ? reg / disp : null
    return {
      month: r.month, salarios, fse, diretos, total, reg, fat, cobertura,
      custoReg: reg > 0 ? total / reg : null,
      custoFat: fat > 0 ? total / fat : null,
    }
  })

  if (!linhas.length) return null

  const tSal = linhas.reduce((s, l) => s + l.salarios, 0)
  const tFse = linhas.reduce((s, l) => s + l.fse, 0)
  const tDir = linhas.reduce((s, l) => s + l.diretos, 0)
  const tTot = tSal + tFse + tDir
  const tReg = linhas.reduce((s, l) => s + l.reg, 0)
  const tFat = linhas.reduce((s, l) => s + l.fat, 0)

  const haPoucaCobertura = linhas.some(l => l.cobertura != null && l.cobertura < 0.6)

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
          Custo por hora — {year}
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Salários, FSE e custos diretos a dividir pelas horas registadas no registo de horas
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[880px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left  px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Mês</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Salários</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">FSE</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Custos dir.</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">Total</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Registadas</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-emerald-600 uppercase tracking-wider">Faturáveis</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">€ / hora</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-emerald-700 uppercase tracking-wider">€ / h fatur.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map(l => {
              const fraca = l.cobertura != null && l.cobertura < 0.6
              return (
                <tr key={l.month} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-700">
                    {MONTH_NAMES_SHORT[l.month - 1]}
                    {l.cobertura != null && (
                      <span
                        className={`ml-2 text-xs font-normal ${fraca ? 'text-amber-600' : 'text-slate-300'}`}
                        title="Horas registadas face às horas disponíveis da equipa"
                      >
                        {Math.round(l.cobertura * 100)}% reg.
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-500 tabular-nums">{fmt(l.salarios)}</td>
                  <td className="px-5 py-3 text-right text-slate-500 tabular-nums">{fmt(l.fse)}</td>
                  <td className="px-5 py-3 text-right text-slate-500 tabular-nums">{l.diretos > 0 ? fmt(l.diretos) : '—'}</td>
                  <td className="px-5 py-3 text-right font-medium text-slate-900 tabular-nums">{fmt(l.total)}</td>
                  <td className="px-5 py-3 text-right text-slate-500 tabular-nums">{l.reg > 0 ? fmtH(l.reg) : '—'}</td>
                  <td className="px-5 py-3 text-right text-emerald-700 tabular-nums">{l.fat > 0 ? fmtH(l.fat) : '—'}</td>
                  <td className={`px-5 py-3 text-right font-semibold tabular-nums ${fraca ? 'text-amber-600' : 'text-slate-900'}`}>
                    {l.custoReg != null ? `€${l.custoReg.toFixed(1)}` : '—'}
                  </td>
                  <td className={`px-5 py-3 text-right font-bold tabular-nums ${fraca ? 'text-amber-600' : 'text-emerald-700'}`}>
                    {l.custoFat != null ? `€${l.custoFat.toFixed(1)}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t-2 border-slate-200">
              <td className="px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Ano</td>
              <td className="px-5 py-3 text-right text-sm font-semibold text-slate-700 tabular-nums">{fmt(tSal)}</td>
              <td className="px-5 py-3 text-right text-sm font-semibold text-slate-700 tabular-nums">{fmt(tFse)}</td>
              <td className="px-5 py-3 text-right text-sm font-semibold text-slate-700 tabular-nums">{tDir > 0 ? fmt(tDir) : '—'}</td>
              <td className="px-5 py-3 text-right text-sm font-bold text-slate-900 tabular-nums">{fmt(tTot)}</td>
              <td className="px-5 py-3 text-right text-sm font-semibold text-slate-700 tabular-nums">{fmtH(tReg)}</td>
              <td className="px-5 py-3 text-right text-sm font-semibold text-emerald-700 tabular-nums">{fmtH(tFat)}</td>
              <td className="px-5 py-3 text-right text-sm font-bold text-slate-900 tabular-nums">
                {tReg > 0 ? `€${(tTot / tReg).toFixed(1)}` : '—'}
              </td>
              <td className="px-5 py-3 text-right text-sm font-bold text-emerald-700 tabular-nums">
                {tFat > 0 ? `€${(tTot / tFat).toFixed(1)}` : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {haPoucaCobertura && (
        <div className="px-6 py-3 border-t border-slate-100 bg-amber-50/60 flex items-start gap-2">
          <span className="text-amber-500 text-sm leading-none mt-0.5">⚠</span>
          <p className="text-xs text-amber-700">
            Os meses a amarelo têm menos de 60% das horas registadas no registo de horas. Como os custos
            são do mês inteiro e as horas só as que foram lançadas, o custo/hora aparece inflacionado —
            não é caro, é pouco registado.
          </p>
        </div>
      )}
    </div>
  )
}
