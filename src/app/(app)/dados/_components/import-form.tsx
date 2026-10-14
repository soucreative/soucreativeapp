'use client'

import { useActionState, useRef } from 'react'
import { Upload, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { importColaboradores, type ImportResult } from '../actions'

const INITIAL: ImportResult = { inserted: 0, skipped: 0, errors: [] }

export default function ImportForm() {
  const [result, action, pending] = useActionState(importColaboradores, INITIAL)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasResult = result.inserted > 0 || result.skipped > 0 || (result.errors?.length ?? 0) > 0

  return (
    <form action={action} className="space-y-4">
      {/* Drop zone */}
      <label
        htmlFor="file-upload"
        className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          pending
            ? 'border-slate-200 bg-slate-50 opacity-60 pointer-events-none'
            : 'border-slate-300 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300'
        }`}
      >
        <Upload size={22} className="text-slate-400 mb-2" />
        <p className="text-sm text-slate-600 font-medium">
          Clica para selecionar ou arrasta o ficheiro
        </p>
        <p className="text-xs text-slate-400 mt-0.5">.xlsx, .xls ou .csv</p>
        <input
          ref={inputRef}
          id="file-upload"
          name="file"
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
        />
      </label>

      {/* Result feedback */}
      {hasResult && (
        <div className="space-y-2">
          {result.inserted > 0 && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle2 size={15} className="flex-shrink-0" />
              <span>{result.inserted} colaborador{result.inserted !== 1 ? 'es' : ''} importado{result.inserted !== 1 ? 's' : ''} com sucesso.</span>
            </div>
          )}
          {result.skipped > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertCircle size={15} className="flex-shrink-0" />
              <span>{result.skipped} linha{result.skipped !== 1 ? 's' : ''} ignorada{result.skipped !== 1 ? 's' : ''} (email já existe).</span>
            </div>
          )}
          {(result.errors?.length ?? 0) > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-red-700 mb-1">
                <X size={14} />
                {result.errors!.length} erro{result.errors!.length !== 1 ? 's' : ''}
              </div>
              <ul className="text-xs text-red-600 space-y-0.5">
                {result.errors!.slice(0, 8).map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
                {result.errors!.length > 8 && (
                  <li className="text-red-400">…e mais {result.errors!.length - 8}</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Upload size={15} />
        {pending ? 'A importar…' : 'Importar colaboradores'}
      </button>

      <p className="text-xs text-slate-400 text-center">
        Colunas esperadas: <span className="font-mono">Nome, Apelido, Email, Função, Data Entrada</span> (obrigatórias)
        · usa o template do export para garantir o formato correto.
      </p>
    </form>
  )
}
