import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionWithRole } from '@/lib/auth'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import ObjectiveForm from '../_components/objective-form'
import type { Objective, Employee } from '@/types/database'

export default async function EditObjetivoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!(await getSessionWithRole(['management', 'director']))) redirect('/objetivos')

  const { id } = await params
  const supabase = createAdminClient()

  const [objResult, empResult] = await Promise.all([
    supabase.from('objectives').select('*').eq('id', id).single(),
    supabase.from('employees').select('id, first_name, last_name, department, app_role, position_type').eq('status', 'active').order('first_name'),
  ])

  if (!objResult.data) notFound()

  const objective = objResult.data as Objective
  const employees = (empResult.data ?? []) as Pick<Employee, 'id' | 'first_name' | 'last_name' | 'department' | 'app_role' | 'position_type'>[]

  return (
    <div className="p-8">
      <Link href="/objetivos" className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 text-sm mb-6 w-fit">
        <ArrowLeft size={15} />
        Objetivos
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-8">{objective.title}</h1>
      <ObjectiveForm objective={objective} employees={employees} />
    </div>
  )
}
