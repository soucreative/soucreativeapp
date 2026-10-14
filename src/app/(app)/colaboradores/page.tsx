import { createAdminClient } from '@/lib/supabase/admin'
import { requirePageAccess } from '@/lib/auth'
import Link from 'next/link'
import { Plus, Search, Upload } from 'lucide-react'
import EmployeesTable from './_components/employees-table'

export default async function ColaboradoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const supabase = createAdminClient()

  const session = await requirePageAccess('/colaboradores')
  const isAdmin = ['master', 'admin', 'management'].includes(session.app_role)

  let query = supabase.from('employees').select('*').order('first_name')
  if (q) {
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,role.ilike.%${q}%`
    )
  }

  const { data: employees = [] } = await query

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Colaboradores</h1>
          <p className="text-slate-500 text-sm mt-1">{employees?.length ?? 0} colaboradores</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              href="/colaboradores/import"
              className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:border-indigo-300 hover:text-indigo-600 transition-colors"
            >
              <Upload size={15} />
              Importar TOC
            </Link>
          )}
          <Link
            href="/colaboradores/novo"
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus size={16} />
            Novo Colaborador
          </Link>
        </div>
      </div>

      <form className="mb-6">
        <div className="relative w-full max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Pesquisar por nome, função ou email..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </form>

      <EmployeesTable employees={employees ?? []} readOnly={!isAdmin} />
    </div>
  )
}
