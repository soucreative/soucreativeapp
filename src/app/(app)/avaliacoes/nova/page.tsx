import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/auth'
import { canManageReviews } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import ReviewForm from '../_components/review-form'
import type { Employee } from '@/types/database'

export default async function NovaAvaliacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>
}) {
  const session = await getCurrentEmployee()
  if (!session || !canManageReviews(session.app_role)) redirect('/avaliacoes')

  const { year, quarter } = await searchParams
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('employees')
    .select('id, first_name, last_name, department, position_type')
    .eq('status', 'active')
    .order('first_name')

  const employees = (data ?? []) as Pick<Employee, 'id' | 'first_name' | 'last_name' | 'department' | 'position_type'>[]

  return (
    <div className="p-8 max-w-3xl">
      <Link
        href="/avaliacoes"
        className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 text-sm mb-6 w-fit transition-colors"
      >
        <ArrowLeft size={15} />
        Avaliações
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-8">Nova avaliação</h1>
      <ReviewForm
        employees={employees}
        defaultYear={year ? Number(year) : undefined}
        defaultQuarter={quarter ? Number(quarter) : undefined}
      />
    </div>
  )
}
