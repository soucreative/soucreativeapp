'use client'

import { useActionState, useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, X, AlertTriangle } from 'lucide-react'
import { deleteEmployee } from '../actions'

export default function DeleteEmployeeButton({
  employeeId,
  fullName,
}: {
  employeeId: string
  fullName: string
}) {
  const [open, setOpen]       = useState(false)
  const [typed, setTyped]     = useState('')
  const [state, action, pending] = useActionState(deleteEmployee, null)
  const inputRef              = useRef<HTMLInputElement>(null)
  const router                = useRouter()

  const matches = typed.trim() === fullName.trim()

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else setTyped('')
  }, [open])

  useEffect(() => {
    if (state?.success) router.push('/colaboradores')
  }, [state?.success, router])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors"
      >
        <Trash2 size={13} />
        Eliminar colaborador
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">

            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-red-600">
                <AlertTriangle size={20} />
                <h2 className="font-bold text-slate-900">Eliminar colaborador</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 space-y-1">
              <p className="font-semibold">Esta acção é irreversível.</p>
              <p>Todos os dados associados (contratos, remunerações, objetivos, férias) serão eliminados permanentemente.</p>
            </div>

            <div>
              <p className="text-sm text-slate-600 mb-2">
                Para confirmar, escreve o nome completo do colaborador:
              </p>
              <p className="text-sm font-semibold text-slate-900 bg-slate-100 px-3 py-1.5 rounded-lg mb-3 select-all">
                {fullName}
              </p>
              <input
                ref={inputRef}
                type="text"
                value={typed}
                onChange={e => setTyped(e.target.value)}
                placeholder="Escreve o nome aqui…"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>

            {state?.error && (
              <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>
            )}

            <form action={action} className="flex items-center gap-3 pt-1">
              <input type="hidden" name="employee_id" value={employeeId} />
              <input type="hidden" name="full_name"   value={fullName} />
              <input type="hidden" name="confirmation" value={typed} />
              <button
                type="submit"
                disabled={!matches || pending}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {pending ? 'A eliminar…' : 'Eliminar definitivamente'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
