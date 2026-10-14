'use client'

import { Trash2 } from 'lucide-react'
import { useTransition } from 'react'
import { deleteObjective } from '../actions'

export function DeleteObjectiveButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm('Eliminar este objetivo? Esta acção não pode ser desfeita.')) return
    startTransition(async () => { await deleteObjective(id) })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title="Eliminar"
      className="p-1 text-slate-300 hover:text-red-500 disabled:opacity-40 transition-colors"
    >
      <Trash2 size={14} />
    </button>
  )
}
