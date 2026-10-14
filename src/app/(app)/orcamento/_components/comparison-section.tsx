import { MONTH_NAMES_LONG, MONTH_NAMES_SHORT } from '@/lib/constants'
import { formatEUR } from '@/lib/format'
import type { ComparisonRow } from '@/types/orcamento'

const pct = (v: number | null) =>
  v == null ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')}%`

const signed = (v: number) => `${v > 0 ? '+' : ''}${formatEUR(v)}`

/** Numa receita ou num resultado ficar acima do orçado é bom; num custo ou investimento é mau */
function tone(row: ComparisonRow, v: number): string {
  if (Math.round(v) === 0) return 'text-slate-400'
  const good = row.kind === 'custo' || row.kind === 'investimento' ? v < 0 : v > 0
  return good ? 'text-emerald-600' : 'text-red-600'
}

export default function ComparisonSection({
  rows,
  closedNow,
  year,
  inForceLabel,
}: {
  rows: ComparisonRow[]
  closedNow: number
  year: number
  inForceLabel: string
}) {
  const through      = MONTH_NAMES_LONG[closedNow - 1].toLowerCase()
  const throughShort = MONTH_NAMES_SHORT[closedNow - 1].toLowerCase()

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
          Real vs orçamento — {year}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Acumulado de janeiro a {through} contra o orçamento inicial. A estimativa de fecho junta o real
          desses meses com a versão em vigor ({inForceLabel}) nos meses que faltam. FSE e marketing comparam-se
          juntos, porque no real o marketing está dentro do FSE; os investimentos não têm real registado.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[960px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
              <th className="text-left px-5 py-2.5 font-semibold">Rubrica</th>
              <th className="text-right px-3 py-2.5 font-semibold">Orçado jan–{throughShort}</th>
              <th className="text-right px-3 py-2.5 font-semibold">Real jan–{throughShort}</th>
              <th className="text-right px-3 py-2.5 font-semibold">Desvio</th>
              <th className="text-right px-3 py-2.5 font-semibold">%</th>
              <th className="text-right px-3 py-2.5 font-semibold border-l border-slate-200">Orçado ano</th>
              <th className="text-right px-3 py-2.5 font-semibold">Estimativa de fecho</th>
              <th className="text-right px-5 py-2.5 font-semibold">Desvio anual</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.key}
                className={row.total ? 'bg-slate-50 font-semibold border-t border-slate-200' : 'border-t border-slate-100'}
              >
                <td className={`px-5 py-2 ${row.total ? 'text-slate-900' : 'text-slate-600'}`}>{row.label}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatEUR(row.orcamentoAcum)}</td>
                {row.hasReal ? (
                  <>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900">{formatEUR(row.realAcum)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${tone(row, row.desvio)}`}>{signed(row.desvio)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${tone(row, row.desvio)}`}>{pct(row.desvioPct)}</td>
                  </>
                ) : (
                  <td colSpan={3} className="px-3 py-2 text-right text-xs text-slate-400">sem real registado</td>
                )}
                <td className="px-3 py-2 text-right tabular-nums text-slate-600 border-l border-slate-200">
                  {formatEUR(row.orcamentoAnual)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-900">{formatEUR(row.estimativaFecho)}</td>
                <td className={`px-5 py-2 text-right tabular-nums ${tone(row, row.desvioAnual)}`}>
                  {signed(row.desvioAnual)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
