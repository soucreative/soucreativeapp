'use client'

import { useActionState, useState } from 'react'
import { MONTH_NAMES_SHORT } from '@/lib/constants'
import { formatEUR } from '@/lib/format'
import { LIMITS, RUBRICS, formatAmount, parseAmount } from '@/types/orcamento'
import type { RubricKey, RubricKind, SeedRubric } from '@/types/orcamento'
import { createBudget } from '../actions'

const SECTIONS: { kind: RubricKind; label: string }[] = [
  { kind: 'receita',      label: 'Receitas' },
  { kind: 'custo',        label: 'Custos' },
  { kind: 'investimento', label: 'Investimentos (abaixo do EBITDA)' },
]

const short = (m: number) => MONTH_NAMES_SHORT[m - 1].toLowerCase()

export default function CreateBudgetForm({
  year,
  realThrough,
  baseYear,
  baseMonths,
  averages,
  realAccum,
  payroll,
}: {
  year: number
  /** Meses do próprio ano que entram com o real (0 = parte do ano anterior) */
  realThrough: number
  baseYear: number
  /** Meses fechados usados na média (0 = sem base) */
  baseMonths: number
  averages: Record<RubricKey, number>
  /** Real acumulado do próprio ano nos meses 1..realThrough */
  realAccum: Record<RubricKey, number>
  /** Massa salarial pelos salários em vigor nos meses por fechar, sem atualização */
  payroll: { people: number; projected: number }
}) {
  const [state, action, pending] = useActionState(createBudget, null)

  const openMonths = 12 - realThrough
  const fromReal   = realThrough > 0

  // Campos controlados: o React 19 limpa os não controlados depois da ação,
  // mesmo quando ela devolve um erro, e perdiam-se os ajustes
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(
    RUBRICS.filter(r => r.key !== 'massa_salarial').map(r => [r.key, formatAmount(Math.round(averages[r.key]))])))
  const [pct, setPct]     = useState('0')
  const [notes, setNotes] = useState('')

  const parsed    = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, parseAmount(v)])) as Record<SeedRubric, number | null>
  const parsedPct = parseAmount(pct)
  const invalid   = Object.values(parsed).some(v => v === null || Math.abs(v) > LIMITS.maxAmount)
    || parsedPct === null || Math.abs(parsedPct) > LIMITS.maxSalaryPct

  // Anual = real já fechado + valor por mês nos meses que faltam. Marketing e
  // investimentos não têm real próprio. A atualização salarial aplica-se aqui
  // por aproximação; o valor exato calcula-se ao criar.
  const payrollProjected = payroll.projected * (1 + (parsedPct ?? 0) / 100)
  const annual = (key: RubricKey): number => {
    if (key === 'massa_salarial') return (fromReal ? realAccum.massa_salarial : 0) + payrollProjected
    const accum = fromReal && key !== 'marketing' && key !== 'investimentos' ? realAccum[key] : 0
    return accum + (parsed[key as SeedRubric] ?? 0) * openMonths
  }
  const totalOf = (kind: RubricKind) => RUBRICS.filter(r => r.kind === kind).reduce((s, r) => s + annual(r.key), 0)
  const ebitda        = totalOf('receita') - totalOf('custo')
  const investimentos = totalOf('investimento')

  const perMonthLabel = fromReal
    ? openMonths > 0 ? `${short(realThrough + 1)}–dez por mês` : 'Por mês'
    : `${year} por mês`

  return (
    <form action={action} className="bg-white rounded-xl border border-slate-200 p-6 space-y-6 max-w-5xl">
      <input type="hidden" name="year" value={year} />

      <div>
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Criar orçamento {year}</h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          {fromReal ? (
            <>
              Janeiro a {MONTH_NAMES_SHORT[realThrough - 1].toLowerCase()} entram com o real de {year}, mês a mês.
              {openMonths > 0 && <> Para {short(realThrough + 1)}–dez, cada rubrica começa com a média desses meses — ajusta o que for preciso.</>}
            </>
          ) : baseMonths > 0 ? (
            <>Cada rubrica começa com a média mensal real de {baseYear} ({baseMonths} {baseMonths === 1 ? 'mês fechado' : 'meses fechados'}). Ajusta o que for preciso.</>
          ) : (
            <>Não há meses fechados de {baseYear} para servir de base — preenche os valores por mês.</>
          )}
          {' '}Depois de criar ainda podes corrigir mês a mês, acrescentar linhas e atribuir centros de custo.
        </p>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
            <th className="text-left py-2 font-semibold">Rubrica</th>
            <th className="text-right py-2 px-3 font-semibold">
              Média real/mês{baseMonths > 0 && <span className="block normal-case font-normal">{baseYear} · jan–{short(baseMonths)}</span>}
            </th>
            {fromReal && (
              <th className="text-right py-2 px-3 font-semibold">
                Real <span className="block normal-case font-normal">jan–{short(realThrough)}</span>
              </th>
            )}
            <th className="text-right py-2 px-3 font-semibold w-44">{perMonthLabel}</th>
            <th className="text-right py-2 pl-3 font-semibold">Anual {year}</th>
          </tr>
        </thead>
        {SECTIONS.map(section => (
          <tbody key={section.kind}>
            <tr>
              <td colSpan={fromReal ? 5 : 4} className="pt-4 pb-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
                {section.label}
              </td>
            </tr>
            {RUBRICS.filter(r => r.kind === section.kind).map(r => (
              <tr key={r.key} className="border-t border-slate-100 align-top">
                <td className="py-2.5">
                  <span className="font-medium text-slate-800">{r.label}</span>
                  {r.key === 'outros_proveitos' && baseMonths > 0 && (
                    <p className="text-xs text-amber-600 mt-0.5">Inclui valores pontuais — deixa só o que se repete.</p>
                  )}
                  {r.key === 'marketing' && (
                    <p className="text-xs text-slate-400 mt-0.5">No real está dentro do FSE.</p>
                  )}
                  {r.key === 'massa_salarial' && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pessoa a pessoa pelos salários em vigor ({payroll.people} pessoas), com TSU, subsídios e
                      subsídio de alimentação.{fromReal && ' Nos meses reais conta o valor registado.'}
                    </p>
                  )}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-slate-500">
                  {r.key === 'marketing' || r.key === 'investimentos' ? '—' : formatEUR(averages[r.key])}
                </td>
                {fromReal && (
                  <td className="py-2.5 px-3 text-right tabular-nums text-slate-600">
                    {r.key === 'marketing' || r.key === 'investimentos' ? '—' : formatEUR(realAccum[r.key])}
                  </td>
                )}
                <td className="py-2.5 px-3">
                  {r.key === 'massa_salarial' ? (
                    <>
                      <div className="text-right tabular-nums font-medium text-slate-800">
                        {openMonths > 0 ? `≈ ${formatEUR(payrollProjected / openMonths)}` : '—'}
                      </div>
                      <label className="flex items-center justify-end gap-2 mt-1.5 text-xs text-slate-500">
                        Atualização
                        <input
                          name="salary_update_pct"
                          type="text"
                          inputMode="decimal"
                          value={pct}
                          onChange={e => setPct(e.target.value)}
                          className={`w-14 px-2 py-1 text-right tabular-nums border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                            parsedPct === null || Math.abs(parsedPct) > LIMITS.maxSalaryPct ? 'border-red-400 bg-red-50' : 'border-slate-300'
                          }`}
                        />
                        %
                      </label>
                    </>
                  ) : (
                    <input
                      name={`base_${r.key}`}
                      type="text"
                      inputMode="decimal"
                      value={values[r.key] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [r.key]: e.target.value }))}
                      placeholder="0"
                      disabled={openMonths === 0}
                      className={`w-full px-3 py-2 text-sm text-right tabular-nums border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 ${
                        parsed[r.key as SeedRubric] === null ? 'border-red-400 bg-red-50' : 'border-slate-300'
                      }`}
                    />
                  )}
                </td>
                <td className="py-2.5 pl-3 text-right tabular-nums font-medium text-slate-900">{formatEUR(annual(r.key))}</td>
              </tr>
            ))}
          </tbody>
        ))}
        <tfoot>
          <tr className="border-t-2 border-slate-200">
            <td className="pt-3 font-semibold text-slate-900" colSpan={fromReal ? 4 : 3}>EBITDA</td>
            <td className={`pt-3 text-right tabular-nums font-bold ${ebitda >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {formatEUR(ebitda)}
            </td>
          </tr>
          <tr>
            <td className="pt-1 text-slate-600" colSpan={fromReal ? 4 : 3}>Investimentos</td>
            <td className="pt-1 text-right tabular-nums text-slate-600">{formatEUR(investimentos)}</td>
          </tr>
          <tr>
            <td className="pt-1 pb-1 font-semibold text-slate-900" colSpan={fromReal ? 4 : 3}>Resultado depois de investimentos</td>
            <td className={`pt-1 pb-1 text-right tabular-nums font-bold ${ebitda - investimentos >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {formatEUR(ebitda - investimentos)}
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="text-xs text-slate-500">
        Faturação e outros proveitos repartem-se pelos centros operacionais como a receita de {baseYear}; a Plunet vai
        para Conteúdos e cada pessoa para o centro do seu departamento. FSE, marketing, custos diretos e investimentos
        começam na estrutura — atribui-lhes os centros depois de criar.
      </p>

      <div>
        <label htmlFor="budget-notes" className="block text-sm font-medium text-slate-700 mb-1.5">
          Notas <span className="font-normal text-slate-400">(opcional — os pressupostos ficam registados automaticamente)</span>
        </label>
        <textarea
          id="budget-notes"
          name="notes"
          rows={3}
          maxLength={LIMITS.maxUserNotes}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
        />
      </div>

      {state && 'error' in state && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending || invalid}
        className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {pending ? 'A criar…' : `Criar orçamento ${year}`}
      </button>
    </form>
  )
}
