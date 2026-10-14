import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionWithRole } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import ObjectiveForm from '../_components/objective-form'
import type { Employee } from '@/types/database'

export default async function NovoObjetivoPage() {
  if (!(await getSessionWithRole(['management', 'director']))) redirect('/objetivos')

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('employees')
    .select('id, first_name, last_name, department, app_role, position_type')
    .eq('status', 'active')
    .order('first_name')

  const employees = (data ?? []) as Pick<Employee, 'id' | 'first_name' | 'last_name' | 'department' | 'app_role' | 'position_type'>[]

  return (
    <div className="p-8">
      <Link href="/objetivos" className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 text-sm mb-6 w-fit">
        <ArrowLeft size={15} />
        Objetivos
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-8">Novo objetivo</h1>
      <ObjectiveForm employees={employees} />
    </div>
  )
}
