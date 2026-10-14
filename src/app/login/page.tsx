'use client'

import Image from 'next/image'
import { useActionState, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { login, loginWithGoogle, requestPasswordReset } from './actions'

type Mode = 'login' | 'reset' | 'reset-sent'

const URL_ERRORS: Record<string, string> = {
  conta_nao_autorizada: 'Esta conta Google não está associada a nenhum colaborador. Contacta o administrador.',
  link_invalido:        'O link expirou ou é inválido. Tenta novamente.',
  google_indisponivel:  'Não foi possível iniciar sessão com o Google. Tenta com email e password.',
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const [mode, setMode] = useState<Mode>('login')
  const urlError = URL_ERRORS[useSearchParams().get('error') ?? '']

  const [loginState,  loginAction,  loginPending]  = useActionState(login, null)
  const [resetState,  resetAction,  resetPending]  = useActionState(requestPasswordReset, null)

  // After email sent
  if (mode === 'reset-sent' || resetState?.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">✉️</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Email enviado</h2>
            <p className="text-sm text-slate-500 mb-6">
              Se esse email existir na plataforma, receberás um link para redefinir a tua password.
              Verifica também a pasta de spam.
            </p>
            <button
              onClick={() => setMode('login')}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              ← Voltar ao login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <div className="mb-8">
            <Image src="/brand/logo-verde.png" alt="SOU creative" width={86} height={63} priority />
            <p className="text-slate-500 text-sm mt-1">
              {mode === 'login' ? 'Produção, pessoas e gestão' : 'Recuperar password'}
            </p>
          </div>

          {mode === 'login' ? (
            <>
            {urlError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">
                {urlError}
              </p>
            )}

            <form action={loginWithGoogle}>
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2.5 border border-slate-300 bg-white text-slate-700 py-2 px-4 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z"/>
                </svg>
                Entrar com Google
              </button>
            </form>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400">ou</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <form action={loginAction} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="nome@soucreative.pt"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setMode('reset')}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Esqueceste a password?
                  </button>
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {loginState?.error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  {loginState.error}
                </p>
              )}

              <button
                type="submit"
                disabled={loginPending}
                className="w-full mt-2 bg-indigo-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loginPending ? 'A entrar...' : 'Entrar'}
              </button>
            </form>
            </>
          ) : (
            <form action={resetAction} className="space-y-4">
              <p className="text-sm text-slate-500">
                Introduz o teu email e enviaremos um link para definires uma nova password.
              </p>

              <div>
                <label htmlFor="reset-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email
                </label>
                <input
                  id="reset-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="nome@soucreative.pt"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {resetState?.error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  {resetState.error}
                </p>
              )}

              <button
                type="submit"
                disabled={resetPending}
                className="w-full mt-2 bg-indigo-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {resetPending ? 'A enviar...' : 'Enviar link de recuperação'}
              </button>

              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full text-sm text-slate-500 hover:text-slate-700 py-1"
              >
                ← Voltar ao login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
