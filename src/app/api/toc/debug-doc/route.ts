import { NextResponse, type NextRequest } from 'next/server'
import { getValidAccessToken } from '@/lib/toc'
import { getCurrentEmployee } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const TOC_API_URL = process.env.TOC_API_URL ?? 'https://api9.toconline.pt'

// GET /api/toc/debug-doc?endpoint=items
// Probes a TOC API endpoint and returns a small sample
export async function GET(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const emp = await getCurrentEmployee()
  if (!emp || !['master', 'admin', 'management'].includes(emp.app_role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const endpoint = new URL(request.url).searchParams.get('endpoint') ?? 'items'

  let token: string
  try {
    token = await getValidAccessToken()
  } catch (err) {
    return NextResponse.json({ error: `TOC não ligado ou token inválido: ${String(err)}` }, { status: 502 })
  }

  let res: Response
  try {
    res = await fetch(`${TOC_API_URL}/api/v1/${endpoint}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
  } catch (err) {
    return NextResponse.json({ error: `Erro de rede ao chamar TOC: ${String(err)}` }, { status: 502 })
  }

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `TOC ${res.status} em /${endpoint}: ${text}` }, { status: 502 })
  }

  const data = await res.json() as unknown[]
  return NextResponse.json({
    endpoint,
    count: Array.isArray(data) ? data.length : null,
    sample: Array.isArray(data) ? data.slice(0, 3) : data,
    keys_in_first_doc: Array.isArray(data) && data.length > 0 ? Object.keys(data[0] as object) : [],
  })
}
