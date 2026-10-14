import { NextResponse, type NextRequest } from 'next/server'
import { exchangeCodeForToken, saveToken, TOC_REDIRECT_URI } from '@/lib/toc'
import { getCurrentEmployee } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

// POST /api/toc/exchange  { code: string }
// Exchanges an authorization code using the Postman redirect_uri that is
// registered in TOC Online (cannot be changed there).
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const emp = await getCurrentEmployee()
  if (!emp || !['master', 'admin', 'management'].includes(emp.app_role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await request.json() as { code?: string }
  const code = body.code?.trim()
  if (!code) return NextResponse.json({ error: 'Código em falta' }, { status: 400 })

  try {
    const tokens  = await exchangeCodeForToken(code, TOC_REDIRECT_URI)
    await saveToken(tokens)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
