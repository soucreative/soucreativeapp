/**
 * Repartição dos custos do TOC pelos centros de custo.
 *
 * Módulo puro (só `import type`), para poder ser testado fora do Next.
 * Os departamentos entram por parâmetro em vez de serem importados, porque o
 * alias `@/` não resolve fora do bundler — mesma convenção de types/orcamento.
 */

import type { TocExpenseLine, TocExpenseMapRow } from './toc'

export type UnmappedAccount = {
  account_code: string
  description:  string
  amount:       number
}

export type ExpenseSplit = {
  /** centro operacional → 12 meses de FSE */
  byCenter:   Record<string, number[]>
  /** FSE sem centro: estrutura, a repartir na apresentação */
  structure:  number[]
  investment: number[]
  financial:  number[]
  /** empréstimos, leasing, acréscimos — não são custo */
  ignored:    number[]
  /** contas que a tabela não conhece; contam como estrutura e ficam à vista */
  unmapped:   UnmappedAccount[]
}

const months = () => Array<number>(12).fill(0)

export function splitExpenses(
  lines: TocExpenseLine[],
  map:   TocExpenseMapRow[],
  centers: readonly string[],
): ExpenseSplit {
  const byCode = new Map(map.map(r => [r.account_code, r]))

  const split: ExpenseSplit = {
    byCenter:   Object.fromEntries(centers.map(c => [c, months()])),
    structure:  months(),
    investment: months(),
    financial:  months(),
    ignored:    months(),
    unmapped:   [],
  }
  const unmapped = new Map<string, UnmappedAccount>()

  for (const line of lines) {
    const i = line.month - 1
    if (i < 0 || i > 11) continue

    const row = byCode.get(line.account_code)

    // Conta desconhecida: é custo até prova em contrário, mas fica assinalada
    if (!row) {
      split.structure[i] += line.amount
      const prev = unmapped.get(line.account_code)
      if (prev) prev.amount += line.amount
      else unmapped.set(line.account_code, {
        account_code: line.account_code,
        description:  line.description,
        amount:       line.amount,
      })
      continue
    }

    switch (row.kind) {
      case 'investimento': split.investment[i] += line.amount; break
      case 'financeiro':   split.financial[i]  += line.amount; break
      case 'ignorar':      split.ignored[i]    += line.amount; break
      default: {
        const center = row.cost_center
        if (center && split.byCenter[center]) split.byCenter[center][i] += line.amount
        else split.structure[i] += line.amount
      }
    }
  }

  split.unmapped = Array.from(unmapped.values()).sort((a, b) => b.amount - a.amount)
  return split
}

/** Arredonda a 2 casas, como o resto do Financeiro grava */
export const round2 = (v: number) => Math.round(v * 100) / 100

export const sumMonths = (v: number[]) => round2(v.reduce((s, n) => s + n, 0))
