import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/auth'
import { canAccess } from '@/lib/permissions'
import { DEPARTMENTS } from '@/lib/departments'
import type { TocItemMapRow } from '@/lib/toc'
import ItemCodesClient from './_components/item-codes-client'

export const dynamic = 'force-dynamic'

export default async function ItemCodesPage() {
  const emp = await getCurrentEmployee()
  if (!canAccess(emp?.app_role ?? 'employee', '/financeiro')) redirect('/')

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('toc_item_map')
    .select('id, item_code, department, label')
    .order('item_code')

  const rows: TocItemMapRow[] = (data ?? []) as TocItemMapRow[]
  const tableExists = !error

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Link
          href="/financeiro"
          className="text-slate-400 hover:text-slate-600 transition-colors text-sm"
        >
          ← Financeiro
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mt-2">Códigos de artigo TOC</h1>
      <p className="text-slate-500 text-sm mt-1 mb-8">
        Mapeia cada código de artigo do TOC Online a um departamento.
        As horas faturadas são agrupadas por departamento neste mapeamento.
      </p>

      {!tableExists && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
          <p className="text-sm font-semibold text-amber-800 mb-2">Tabela ainda não criada no Supabase</p>
          <p className="text-sm text-amber-700 mb-3">
            Corre o seguinte SQL no Supabase → SQL Editor para activar a gestão dinâmica de códigos:
          </p>
          <pre className="bg-amber-100 rounded-lg p-4 text-xs font-mono text-amber-900 overflow-auto whitespace-pre">
{`CREATE TABLE IF NOT EXISTS toc_item_map (
  id          serial PRIMARY KEY,
  item_code   text NOT NULL UNIQUE,
  department  text,
  label       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
`}
          </pre>
        </div>
      )}

      <ItemCodesClient rows={rows} departments={[...DEPARTMENTS]} tableExists={tableExists} />
    </div>
  )
}
