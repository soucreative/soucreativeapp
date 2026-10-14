'use client'

import { useActionState } from 'react'
import { updatePassword } from '../actions'

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, null)

  return (
    <form action={action} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Alterar password</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
            Nova password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Mínimo 8 caracteres"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-slate-700 mb-1.5">
            Confirmar password
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            required
            minLength={8}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
          ✓ Password alterada com sucesso.
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {pending ? 'A guardar...' : 'Alterar password'}
        </button>
      </div>
    </form>
  )
}
