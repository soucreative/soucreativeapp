import { NextResponse, type NextRequest } from 'next/server'
import { buildAuthUrl, TOC_REDIRECT_URI } from '@/lib/toc'
import { getCurrentEmployee } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  // Only admins/management can connect TOC Online
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const emp = await getCurrentEmployee()
  if (!emp || !['master', 'admin', 'management'].includes(emp.app_role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const authUrl = buildAuthUrl(TOC_REDIRECT_URI)

  return NextResponse.redirect(authUrl)
}
