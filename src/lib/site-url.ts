import { headers } from 'next/headers'

/**
 * Endereço público da app, tirado do pedido em curso: o mesmo código serve
 * localhost e a Vercel sem depender de NEXT_PUBLIC_APP_URL estar certo. Serve
 * para os links que saem da app — regresso do Google e do TOC, convites e
 * reposição de password por email.
 */
export async function siteUrl(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (host) {
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3200'
}
