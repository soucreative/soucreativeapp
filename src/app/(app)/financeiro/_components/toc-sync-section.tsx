'use client'

import { useState, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { exchangeTocCode } from '../actions'
import { MONTH_NAMES_LONG } from '@/lib/constants'
import { formatEUR } from '@/lib/format'

const MONTHS = MONTH_NAMES_LONG
const fmt    = formatEUR

type Preview = {
  year: number; month: number
  revenue: number; fse: number; direct_costs: number
  financial_costs: number; investments: number; excluded: number
  unmapped: { account_code: string; description: string; amount: number }[]
  mapMissing: boolean
  sales_count: number; purchase_count: number
  details: { sales_by_type: Record<string, number>; purchases_by_type: Record<string, number> }
}

// ── Step 1: open TOC Online login ─────────────────────────────────────────

function ConnectWizard({ authUrl }: { authUrl: string }) {
  const [step,  setStep]  = useState<1 | 2>(1)
  const [state, action, pending] = useActionState(exchangeTocCode, null)

  if (state?.success) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-sm text-emerald-700">
        ✓ TOC Online ligado com sucesso! Recarrega a página para sincronizar dados.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Step indicators */}
      <div className="flex items-center gap-3 text-xs">
        <span className={`flex items-center gap-1.5 font-medium ${step === 1 ? 'text-indigo-600' : 'text-slate-400'}`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${step === 1 ? 'bg-indigo-600' : 'bg-emerald-500'}`}>
            {step === 1 ? '1' : '✓'}
          </span>
          Autorizar
        </span>
        <span className="text-slate-300">──</span>
        <span className={`flex items-center gap-1.5 font-medium ${step === 2 ? 'text-indigo-600' : 'text-slate-300'}`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${step === 2 ? 'bg-indigo-600' : 'bg-slate-200'}`}>
            2
          </span>
          Colar código
        </span>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2 text-sm text-slate-600">
            <p className="font-medium text-slate-700">Passo 1 — Autoriza o acesso ao TOC Online</p>
            <ol className="list-decimal list-inside space-y-1 text-xs ml-1">
              <li>Clica no botão abaixo — vai abrir o TOC Online num novo separador</li>
              <li>Inicia sessão com as tuas credenciais do TOC Online</li>
              <li>Clica em <strong>&ldquo;Autorizar&rdquo;</strong> quando aparecer o pedido de permissão</li>
              <li>O Postman vai abrir — <strong>isso é normal, fecha-o</strong></li>
              <li>No browser, copia o URL da barra de endereços antes de fechar (começa por <code className="bg-white border border-slate-200 rounded px-1">postman://app/oauth2/callback?code=…</code>) e volta aqui</li>
            </ol>
          </div>

          <a
            href={authUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setTimeout(() => setStep(2), 1500)}
            className="inline-flex items-center gap-2 bg-teal-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
          >
            <span>🔓</span> Abrir TOC Online para autorizar
          </a>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2 text-sm text-slate-600">
            <p className="font-medium text-slate-700">Passo 2 — Cola o URL da barra de endereços</p>
            <p className="text-xs">
              Após autorizares, o Postman abriu — isso é esperado. Fecha-o e volta ao browser.
              Copia o URL completo da barra de endereços — começa por{' '}
              <code className="bg-white border border-slate-200 rounded px-1 text-xs">postman://app/oauth2/callback?code=…</code>
            </p>
            <p className="text-xs text-slate-400">
              Copia esse URL completo e cola aqui em baixo. Só precisamos do <strong>?code=XXXX</strong> mas podes colar o URL completo.
            </p>
          </div>

          <form action={action} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                URL ou código de autorização <span className="text-red-400">*</span>
              </label>
              <CodeInput />
            </div>

            {state?.error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                {state.error}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {pending ? 'A ligar...' : 'Ligar TOC Online'}
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                ← Voltar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

// Extracts the code from a full URL or returns raw input
function CodeInput() {
  const [raw, setRaw] = useState('')

  function extractCode(input: string): string {
    try {
      const url   = new URL(input)
      const code  = url.searchParams.get('code')
      if (code) return code
    } catch { /* not a URL */ }
    return input.trim()
  }

  return (
    <>
      <textarea
        rows={3}
        value={raw}
        onChange={e => setRaw(e.target.value)}
        placeholder="https://oauth.pstmn.io/v1/callback?code=xxxxxxxx..."
        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
      />
      {/* hidden input with extracted code */}
      <input type="hidden" name="code" value={extractCode(raw)} />
    </>
  )
}

// ── Sync controls (when already connected) ───────────────────────────────

function SyncControls({ year }: { year: number }) {
  const router = useRouter()
  const now    = new Date()
  const [month,         setMonth]         = useState(now.getMonth() + 1)
  const [loading,       setLoading]       = useState(false)
  const [applying,      setApplying]      = useState(false)
  const [preview,       setPreview]       = useState<Preview | null>(null)
  const [error,         setError]         = useState<string | null>(null)
  const [success,       setSuccess]       = useState(false)
  const [fseExclusion,      setFseExclusion]      = useState(0)
  const [fseExclusionNotes, setFseExclusionNotes] = useState('')

  async function loadPreview() {
    setLoading(true); setError(null); setPreview(null); setSuccess(false); setFseExclusion(0); setFseExclusionNotes('')
    try {
      const res  = await fetch(`/api/toc/sync?year=${year}&month=${month}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao carregar dados')
      setPreview(json.preview)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally { setLoading(false) }
  }

  async function applySync() {
    if (!preview) return
    setApplying(true); setError(null)
    try {
      const res  = await fetch('/api/toc/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: preview.year, month: preview.month,
          revenue:             preview.revenue,
          fse:                 Math.max(0, preview.fse - fseExclusion),
          direct_costs:        preview.direct_costs,
          financial_costs:     preview.financial_costs,
          investments:         preview.investments,
          unmapped_accounts:   preview.mapMissing ? [] : preview.unmapped,
          fse_exclusion:       fseExclusion       || undefined,
          fse_exclusion_notes: fseExclusionNotes  || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao aplicar')
      setSuccess(true); setPreview(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally { setApplying(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Mês</label>
          <select
            value={month}
            onChange={e => { setMonth(Number(e.target.value)); setPreview(null); setSuccess(false) }}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m} {year}</option>
            ))}
          </select>
        </div>
        <div className="pt-5">
          <button onClick={loadPreview} disabled={loading}
            className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
            {loading ? 'A carregar...' : 'Pré-visualizar dados TOC'}
          </button>
        </div>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700">
          ✓ Dados de {MONTHS[month - 1]} {year} sincronizados com sucesso.
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{error}</div>
      )}

      {preview && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-teal-900">
              Dados TOC — {MONTHS[preview.month - 1]} {preview.year}
            </h3>
            <span className="text-xs text-teal-600">
              {preview.sales_count} faturas · {preview.purchase_count} compras
            </span>
          </div>

          {preview.mapMissing && (
            <p className="text-xs text-amber-800 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2">
              O mapa de contas de despesa não existe — o FSE está a somar tudo, incluindo empréstimos e
              juros. Corre <code>supabase/toc-expense-map.sql</code> para separar.
            </p>
          )}

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Faturação', value: preview.revenue, items: preview.details.sales_by_type },
              { label: 'FSE (operacional)', value: preview.fse,
                items: Object.fromEntries(Object.entries(preview.details.purchases_by_type).filter(([t]) => !['DSP'].includes(t))) },
              { label: 'Custos diretos', value: preview.direct_costs,
                items: Object.fromEntries(Object.entries(preview.details.purchases_by_type).filter(([t]) => ['DSP'].includes(t))) },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-lg border border-teal-100 p-3">
                <p className="text-xs text-slate-400 mb-1">{card.label}</p>
                <p className="text-lg font-bold text-slate-900">{fmt(card.value)}</p>
                <div className="mt-1 space-y-0.5">
                  {Object.entries(card.items).map(([type, val]) => (
                    <p key={type} className="text-xs text-slate-400">{type}: {fmt(val)}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Abaixo do EBITDA — separado pelo mapa de contas, não à mão */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Juros e encargos', value: preview.financial_costs, nota: 'abaixo do EBITDA' },
              { label: 'Investimentos',    value: preview.investments,     nota: 'abaixo do EBITDA' },
              { label: 'Empréstimos e leasing', value: preview.excluded,   nota: 'não é custo — fica de fora' },
            ].map(card => (
              <div key={card.label} className="bg-white/60 rounded-lg border border-teal-100 p-3">
                <p className="text-xs text-slate-400 mb-1">{card.label}</p>
                <p className="text-sm font-semibold text-slate-600">{fmt(card.value)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{card.nota}</p>
              </div>
            ))}
          </div>

          {preview.unmapped.length > 0 && !preview.mapMissing && (
            <div className="bg-white rounded-lg border border-amber-200 p-3">
              <p className="text-xs font-semibold text-amber-800 mb-1">
                {preview.unmapped.length} conta(s) que o mapa não conhece — entraram no FSE
              </p>
              <div className="space-y-0.5">
                {preview.unmapped.slice(0, 6).map(u => (
                  <p key={u.account_code} className="text-xs text-slate-500">
                    <span className="font-mono">{u.account_code}</span> · {fmt(u.amount)} · {u.description}
                  </p>
                ))}
              </div>
              <a href="/financeiro/expense-codes" className="text-xs text-indigo-600 hover:text-indigo-800 underline underline-offset-2 mt-1 inline-block">
                Classificar em Contas de despesa
              </a>
            </div>
          )}

          {/* FSE exclusion — for non-operational items like loan repayments */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
                Ajuste manual ao FSE
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Os empréstimos, o leasing e os juros já são separados automaticamente pelo mapa de
                contas — <strong>não precisas de os subtrair aqui</strong>, ou ficam descontados duas
                vezes. Este campo é só para o que o mapa não consiga apanhar.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fseExclusion || ''}
                  onChange={e => setFseExclusion(Number(e.target.value) || 0)}
                  placeholder="0,00"
                  className="w-full pl-7 pr-3 py-2 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                />
              </div>
              <input
                type="text"
                value={fseExclusionNotes}
                onChange={e => setFseExclusionNotes(e.target.value)}
                placeholder="ex: Amortização empréstimo banco…"
                className="w-full px-3 py-2 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              />
            </div>
            {fseExclusion > 0 && (
              <div className="text-sm">
                <span className="text-slate-500">FSE a registar: </span>
                <span className="font-bold text-slate-900">
                  {fmt(Math.max(0, preview.fse - fseExclusion))}
                </span>
                <span className="text-xs text-amber-600 ml-2">
                  ({fmt(preview.fse)} − {fmt(fseExclusion)})
                </span>
              </div>
            )}
          </div>

          <p className="text-xs text-teal-700 bg-teal-100/60 rounded-lg px-3 py-2">
            ℹ️ Estes valores vão sobrescrever a faturação, FSE e custos diretos de {MONTHS[preview.month - 1]}.
            A massa salarial e notas são preservadas.
          </p>

          <div className="flex items-center gap-3">
            <button onClick={applySync} disabled={applying}
              className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
              {applying ? 'A aplicar...' : `Aplicar em ${MONTHS[preview.month - 1]} ${preview.year}`}
            </button>
            <button onClick={() => setPreview(null)}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function TocSyncSection({
  year, isConnected, isAdmin, authUrl,
}: {
  year: number; isConnected: boolean; isAdmin: boolean; authUrl: string
}) {
  const [showReconnect, setShowReconnect] = useState(false)
  if (!isAdmin) return null

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center text-base">🔄</div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Sincronizar com TOC Online</h2>
            <p className="text-xs text-slate-400 mt-0.5">Importa faturação e despesas da contabilidade</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isConnected && !showReconnect && (
            <button onClick={() => setShowReconnect(true)}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              Re-ligar
            </button>
          )}
          {isConnected ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              Ligado
            </span>
          ) : (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
              Não ligado
            </span>
          )}
        </div>
      </div>

      <div className="px-6 py-5">
        {!isConnected || showReconnect ? (
          <ConnectWizard authUrl={authUrl} />
        ) : (
          <SyncControls year={year} />
        )}
      </div>
    </div>
  )
}
