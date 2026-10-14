'use client'

import { useTransition, useState } from 'react'
import { updateAbsenceStatus } from '../actions'
import type { Absence } from '@/types/database'
import type { Violation } from '@/lib/vacation-rules'
import { Check, X, Clock, AlertTriangle } from 'lucide-react'

const TYPE_LABEL: Record<string, string> = {
  vacation:    'Férias',
  sick_leave:  'Baixa Médica',
  justified:   'Falta Justificada',
  unjustified: 'Falta Injustificada',
  other:       'Outro',
  company_day: 'Dia Oferecido',
}

type EmpRow = { id: string; first_name: string; last_name: string; department?: string | null }

export default function ApprovalPanel({
  pending,
  employees,
  violations = {},
}: {
  pending: Absence[]
  employees: EmpRow[]
  violations?: Record<string, Violation[]>
}) {
  const [, startTransition] = useTransition()
  const [processing, setProcessing] = useState<string | null>(null)
  const [done, setDone]             = useState<Set<string>>(new Set())
  // Track which items need force-confirm shown
  const [forceConfirm, setForceConfirm] = useState<Set<string>>(new Set())

  const visible = pending.filter(a => !done.has(a.id))

  if (visible.length === 0) return null

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })

  async function handle(id: string, employeeId: string, status: 'approved' | 'rejected', force = false) {
    if (status === 'rejected' && !confirm('Confirmas a rejeição deste pedido?')) return
    setProcessing(id)
    const fd = new FormData()
    fd.set('id', id)
    fd.set('employee_id', employeeId)
    fd.set('status', status)
    if (force) fd.set('force', '1')

    startTransition(async () => {
      const result = await updateAbsenceStatus(null, fd)
      setProcessing(null)

      if (result && 'requiresForce' in result && result.requiresForce) {
        // Show force-confirm state for this item
        setForceConfirm(prev => new Set([...prev, id]))
        return
      }

      if (!result || 'error' in result) {
        alert(result?.error ?? 'Erro desconhecido')
        return
      }

      setDone(prev => new Set([...prev, id]))
      setForceConfirm(prev => { const n = new Set(prev); n.delete(id); return n })
    })
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-amber-200 flex items-center gap-2">
        <Clock size={15} className="text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">
          {visible.length} pedido{visible.length !== 1 ? 's' : ''} pendente{visible.length !== 1 ? 's' : ''} de aprovação
        </h3>
        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse ml-auto" />
      </div>

      <div className="divide-y divide-amber-100">
        {visible.map(abs => {
          const emp        = employees.find(e => e.id === abs.employee_id)
          const busy       = processing === abs.id
          const absViolations = violations[abs.id] ?? []
          const hasViolations = absViolations.length > 0
          const needsForce    = forceConfirm.has(abs.id)

          return (
            <div
              key={abs.id}
              className={`px-5 py-4 bg-white transition-opacity ${busy ? 'opacity-40' : ''} ${
                hasViolations ? 'border-l-4 border-l-red-400' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900 text-sm">
                      {emp ? `${emp.first_name} ${emp.last_name}` : '—'}
                    </span>
                    {emp?.department && (
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        {emp.department}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    <span className="font-medium text-slate-700">{TYPE_LABEL[abs.type] ?? abs.type}</span>
                    {' · '}
                    {fmtDate(abs.start_date)}
                    {abs.start_date !== abs.end_date ? ` → ${fmtDate(abs.end_date)}` : ''}
                    {' · '}
                    <span className="font-medium">{abs.working_days} dia{abs.working_days !== 1 ? 's' : ''} úteis</span>
                  </p>
                  {abs.notes && (
                    <p className="text-xs text-slate-400 mt-0.5 italic">"{abs.notes}"</p>
                  )}

                  {/* Violations */}
                  {hasViolations && (
                    <div className="mt-2 space-y-1">
                      {absViolations.map((v, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 px-2.5 py-1.5 rounded-lg">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                          <span>{v.message}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Force-confirm message */}
                  {needsForce && (
                    <div className="mt-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                      <p className="text-xs font-semibold text-orange-800 mb-1">
                        ⚠️ Esta aprovação viola as regras de férias.
                      </p>
                      <p className="text-xs text-orange-700">
                        Só o management pode forçar a aprovação. Tens a certeza?
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {needsForce ? (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => handle(abs.id, abs.employee_id, 'approved', true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 text-white text-xs font-semibold rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
                      >
                        <Check size={13} />
                        Forçar aprovação
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => setForceConfirm(prev => { const n = new Set(prev); n.delete(abs.id); return n })}
                        className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : hasViolations ? (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => handle(abs.id, abs.employee_id, 'approved')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
                        title="Viola regras de férias — requer confirmação"
                      >
                        <AlertTriangle size={13} />
                        Aprovar com exceção
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handle(abs.id, abs.employee_id, 'rejected')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        <X size={13} />
                        Rejeitar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => handle(abs.id, abs.employee_id, 'approved')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        <Check size={13} />
                        Aprovar
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handle(abs.id, abs.employee_id, 'rejected')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        <X size={13} />
                        Rejeitar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
