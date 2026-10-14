import { createAdminClient } from '@/lib/supabase/admin'
import { requirePageAccess } from '@/lib/auth'
import { canManageReviews } from '@/lib/permissions'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import ReviewForm from '../_components/review-form'
import type { QuarterlyReview, Objective, Employee } from '@/types/database'

export default async function EditAvaliacaoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session   = await requirePageAccess('/avaliacoes')
  const canManage = canManageReviews(session.app_role)

  const { id } = await params
  const supabase = createAdminClient()

  const [reviewRes, empsRes] = await Promise.all([
    supabase.from('quarterly_reviews').select('*').eq('id', id).single(),
    supabase.from('employees').select('id, first_name, last_name, department, position_type')
      .eq('status', 'active').order('first_name'),
  ])

  if (!reviewRes.data) notFound()

  const review    = reviewRes.data as QuarterlyReview

  // A mesma regra da lista: fora da gestão e dos diretores, só a própria
  // avaliação e só depois de submetida
  if (!canManage && (review.employee_id !== session.id || review.status === 'draft')) {
    redirect('/avaliacoes')
  }
  const employees = (empsRes.data ?? []) as Pick<Employee, 'id' | 'first_name' | 'last_name' | 'department' | 'position_type'>[]

  // Fetch employee objectives for this year/quarter as context
  const objQuery = supabase
    .from('objectives')
    .select('*')
    .eq('employee_id', review.employee_id)
    .eq('year', review.year)
    .eq('type', 'individual')

  const { data: objData } = review.quarter
    ? await objQuery.eq('quarter', review.quarter)
    : await objQuery.is('quarter', null)

  // Also include annual objectives if this is a quarterly review
  const { data: annualObjData } = await supabase
    .from('objectives')
    .select('*')
    .eq('employee_id', review.employee_id)
    .eq('year', review.year)
    .eq('type', 'individual')
    .is('quarter', null)

  const allObjs = [
    ...(objData ?? []),
    ...(annualObjData ?? []).filter(o => !(objData ?? []).find((x: { id: string }) => x.id === o.id)),
  ] as Objective[]

  const emp = employees.find(e => e.id === review.employee_id)
  const reviewer = employees.find(e => e.id === review.reviewer_id)

  return (
    <div className="p-8 max-w-3xl">
      <Link
        href="/avaliacoes"
        className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 text-sm mb-6 w-fit transition-colors"
      >
        <ArrowLeft size={15} />
        Avaliações
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">
          {emp ? `${emp.first_name} ${emp.last_name}` : 'Avaliação'}
          <span className="text-slate-400 font-normal ml-2 text-lg">
            Q{review.quarter} {review.year}
          </span>
        </h1>
        {reviewer && (
          <p className="text-slate-500 text-sm mt-1">
            Avaliador: {reviewer.first_name} {reviewer.last_name}
          </p>
        )}
      </div>

      {canManage ? (
        <ReviewForm
          review={review}
          employees={employees}
          objectives={allObjs}
        />
      ) : (
        <ReviewSummary review={review} />
      )}
    </div>
  )
}

const REVIEW_STATUS_LABEL: Record<string, string> = {
  submitted: 'Submetida',
  approved:  'Aprovada',
}

/** A avaliação vista pela própria pessoa — só leitura */
function ReviewSummary({ review }: { review: QuarterlyReview }) {
  const blocks = [
    { title: 'Pontos fortes',     text: review.strengths },
    { title: 'Áreas a melhorar',  text: review.areas_for_improvement },
    { title: 'Notas',             text: review.qualitative_notes },
  ]

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nota</p>
          <p className="text-3xl font-bold text-slate-900 mt-2 tabular-nums">
            {review.score != null ? review.score.toFixed(1) : '—'}
            <span className="text-base font-normal text-slate-400"> / 10</span>
          </p>
        </div>
        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
          {REVIEW_STATUS_LABEL[review.status] ?? review.status}
        </span>
      </div>

      {blocks.filter(b => b.text).map(b => (
        <div key={b.title} className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-3">{b.title}</h3>
          <p className="text-sm text-slate-700 whitespace-pre-line">{b.text}</p>
        </div>
      ))}
    </div>
  )
}
