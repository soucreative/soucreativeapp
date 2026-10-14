import { NextResponse, type NextRequest } from 'next/server'
import { exchangeCodeForToken, saveToken } from '@/lib/toc'
import { getSessionWithRole } from '@/lib/auth'
import { siteUrl } from '@/lib/site-url'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  const error = searchParams.get('error')

  // Sem isto, qualquer sessão podia trocar a ligação da empresa por uma conta
  // TOC sua e passar a alimentar o Financeiro com outros números
  if (!(await getSessionWithRole(['management']))) {
    return NextResponse.redirect(`${origin}/financeiro?toc_error=sem_permissao`)
  }

  if (error) {
    return NextResponse.redirect(`${origin}/financeiro?toc_error=${encodeURIComponent(error)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/financeiro?toc_error=sem_codigo`)
  }

  try {
    const redirectUri = `${await siteUrl()}/api/toc/callback`

    const tokens = await exchangeCodeForToken(code, redirectUri)
    await saveToken(tokens)

    return NextResponse.redirect(`${origin}/financeiro?toc_connected=1`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.redirect(`${origin}/financeiro?toc_error=${encodeURIComponent(msg)}`)
  }
}
