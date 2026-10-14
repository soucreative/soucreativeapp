'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

// Pages that restricted roles (intern) are allowed to access
const ALLOWED_FOR_INTERNS = ['/perfil', '/avaliacoes']

/**
 * Rendered inside AppLayout. When the current user is an intern and
 * navigates to a route they shouldn't see, silently redirects to /perfil.
 */
export default function InternGuard({ isIntern }: { isIntern: boolean }) {
  const pathname = usePathname()
  const router   = useRouter()

  useEffect(() => {
    if (!isIntern) return
    const allowed = ALLOWED_FOR_INTERNS.some(p => pathname === p || pathname.startsWith(p + '/'))
    if (!allowed) router.replace('/perfil')
  }, [isIntern, pathname, router])

  return null
}
