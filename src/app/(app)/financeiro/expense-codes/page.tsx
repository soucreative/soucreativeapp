import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePageAccess } from '@/lib/auth'
import { DEPARTMENTS } from '@/lib/departments'
import type { TocExpenseMapRow } from '@/lib/toc'
import ExpenseCodesClient from './_components/expense-codes-client'

export const dynamic = 'force-dynamic'

export default async function ExpenseCodesPage() {
  await requirePageAccess('/financeiro')

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('toc_expense_map')
    .select('id, account_code, cost_center, label, kind')
    .order('account_code')

  const tableExists = !error
  const rows = (data ?? []) as TocExpenseMapRow[]

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/financeiro" className="text-slate-400 hover:text-slate-600 transition-colors text-sm">
        ← Financeiro
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mt-2">Contas de despesa TOC</h1>
      <p className="text-slate-500 text-sm mt-1 mb-8">
        Cada linha de um documento de compra do TOC traz a conta SNC. Aqui dizes a que centro de custo
        pertence cada conta — e se é sequer um custo operacional. É isto que reparte o FSE pelos centros.
      </p>

      {!tableExists ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <p className="font-semibold text-amber-900">Falta criar a tabela</p>
          <p className="text-sm text-amber-800 mt-1">
            Corre o ficheiro <code className="px-1 bg-amber-100 rounded">supabase/toc-expense-map.sql</code> no
            SQL Editor do Supabase e recarrega esta página. Já vai semeado com as 87 contas encontradas
            no histórico de compras.
          </p>
        </div>
      ) : (
        <ExpenseCodesClient rows={rows} departments={DEPARTMENTS} />
      )}
    </div>
  )
}
