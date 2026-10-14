import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Handles Supabase auth redirects: invites, password resets, email confirmations, OAuth (Google)
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) return NextResponse.redirect(`${origin}/login?error=link_invalido`)

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=link_invalido`)
  }

  // Só colaboradores registados podem entrar. Quem chega por OAuth (Google) sem
  // registo é recusado; quem já existe mas ainda não tem auth_user_id fica ligado.
  const user  = data.user
  const admin = createAdminClient()

  const { data: emp } = await admin
    .from('employees')
    .select('id, auth_user_id, status')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!emp) {
    const email = user.email?.toLowerCase()
    const { data: byEmail } = email
      ? await admin
          .from('employees')
          .select('id, auth_user_id, status')
          .ilike('email', email)
          .maybeSingle()
      : { data: null }

    if (!byEmail || byEmail.status !== 'active') {
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login?error=conta_nao_autorizada`)
    }

    // Colaborador existe mas ainda sem conta ligada — associar agora
    if (!byEmail.auth_user_id) {
      await admin.from('employees').update({ auth_user_id: user.id }).eq('id', byEmail.id)
    } else if (byEmail.auth_user_id !== user.id) {
      // Já está ligado a outra conta de autenticação — não sobrepor
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login?error=conta_nao_autorizada`)
    }
  } else if (emp.status !== 'active') {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=conta_nao_autorizada`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
