import { formatEUR } from '@/lib/format'
import type { CenterAnalysis, CenterFigures } from '@/types/orcamento'

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const tone = (v: number) => (Math.round(v) < 0 ? 'text-red-600' : 'text-slate-900')

function Figures({ f }: { f: CenterFigures }) {
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatEUR(f.receitas)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatEUR(f.massaSalarial)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatEUR(f.outrosCustos)}</td>
      <td className={`px-3 py-2 text-right tabular-nums ${tone(f.resultadoDireto)}`}>{formatEUR(f.resultadoDireto)}</td>
    </>
  )
}

/**
 * Receitas e custos por centro de custo, com a estrutura repartida em partes
 * iguais pelos centros operacionais — a mesma regra do Financeiro.
 */
export default function CenterAnalysisTable({
  analysis,
  closedMonths,
}: {
  analysis: CenterAnalysis
  /** Meses fechados numa revisão: esses ficam de fora, porque o real não está repartido */
  closedMonths: number
}) {
  const { rows, estrutura, total } = analysis

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Por centro de custo</h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          A estrutura — Management, Financeiro, Comercial, Outros e linhas sem centro — reparte-se em partes iguais
          pelos {rows.length} centros operacionais, como no Financeiro. Investimentos ficam de fora, tal como do EBITDA.
          {closedMonths > 0 && ' Nesta revisão só entram os meses por fechar: o real não está repartido por centro.'}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
              <th className="text-left px-5 py-2.5 font-semibold">Centro</th>
              <th className="text-right px-3 py-2.5 font-semibold">Receitas</th>
              <th className="text-right px-3 py-2.5 font-semibold">Massa salarial</th>
              <th className="text-right px-3 py-2.5 font-semibold">FSE, marketing e diretos</th>
              <th className="text-right px-3 py-2.5 font-semibold">Resultado direto</th>
              <th className="text-right px-3 py-2.5 font-semibold border-l border-slate-200">Estrutura</th>
              <th className="text-right px-3 py-2.5 font-semibold">Resultado</th>
              <th className="text-right px-5 py-2.5 font-semibold">Margem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.center} className="border-t border-slate-100">
                <td className="px-5 py-2 font-medium text-slate-800">{r.center}</td>
                <Figures f={r} />
                <td className="px-3 py-2 text-right tabular-nums text-slate-500 border-l border-slate-200">
                  {r.estrutura === 0 ? '—' : `−${formatEUR(r.estrutura)}`}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${tone(r.resultado)}`}>{formatEUR(r.resultado)}</td>
                <td className={`px-5 py-2 text-right tabular-nums ${r.margem != null && r.margem < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                  {pct(r.margem)}
                </td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50/60 text-slate-500">
              <td className="px-5 py-2 italic">Estrutura (a repartir)</td>
              <Figures f={estrutura} />
              <td className="px-3 py-2 text-right tabular-nums border-l border-slate-200">
                {estrutura.resultadoDireto === 0 ? '—' : `+${formatEUR(-estrutura.resultadoDireto)}`}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">—</td>
              <td className="px-5 py-2" />
            </tr>
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
              <td className="px-5 py-2.5 text-slate-900">Total (EBITDA)</td>
              <Figures f={total} />
              <td className="px-3 py-2.5 border-l border-slate-200" />
              <td className={`px-3 py-2.5 text-right tabular-nums ${tone(total.resultadoDireto)}`}>{formatEUR(total.resultadoDireto)}</td>
              <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">{pct(total.margem)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
