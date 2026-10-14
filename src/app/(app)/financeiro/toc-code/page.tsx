'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function TocCodePage() {
  const router = useRouter()
  const [code, setCode]     = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  // Accept full URL or just the code
  function parseCode(raw: string): string {
    try {
      const url = new URL(raw)
      return url.searchParams.get('code') ?? raw.trim()
    } catch {
      return raw.trim()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseCode(code)
    if (!parsed) return
    setStatus('loading')
    setErrMsg('')
    try {
      const res = await fetch('/api/toc/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: parsed }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Erro desconhecido')
      setStatus('ok')
      setTimeout(() => router.push('/financeiro?toc_connected=1'), 1500)
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Erro desconhecido')
      setStatus('error')
    }
  }

  return (
    <div className="p-8 max-w-lg">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Ligar TOC Online</h1>
      <p className="text-slate-500 text-sm mb-6">
        Depois de autorizares no TOC Online, o browser redireccionou para uma página em branco
        com um URL do tipo <code className="bg-slate-100 px-1 rounded">postman://app/oauth2/callback?code=…</code>.
        Copia esse URL (ou só o código) e cola aqui.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            URL ou código de autorização
          </label>
          <textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            rows={3}
            placeholder="postman://app/oauth2/callback?code=dfb02f95..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {status === 'error' && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {errMsg}
          </p>
        )}
        {status === 'ok' && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            ✓ TOC Online ligado com sucesso! A redirecionar…
          </p>
        )}

        <button
          type="submit"
          disabled={!code.trim() || status === 'loading' || status === 'ok'}
          className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          {status === 'loading' ? 'A verificar…' : 'Confirmar ligação'}
        </button>
      </form>

      <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 space-y-1">
        <p className="font-semibold text-slate-600">Como fazer:</p>
        <p>1. Clica em <strong>Ligar TOC Online</strong> na página Financeiro</p>
        <p>2. Autoriza no TOC Online</p>
        <p>3. O browser abre uma página em branco — copia o URL completo da barra do browser</p>
        <p>4. Cola aqui e clica <strong>Confirmar ligação</strong></p>
      </div>
    </div>
  )
}
