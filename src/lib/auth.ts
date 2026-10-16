import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccess, isFullAccess } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export interface SessionEmployee {
  id: string
  app_role: UserRole
  department: string | null
  first_name: string
  last_name: string
  email: string
}

/**
 * Returns the employee record linked to the current auth session.
 * Cached per render pass — safe to call from layout + individual pages.
 * Returns null if no session or no linked employee record.
 */
export const getCurrentEmployee = cache(async (): Promise<SessionEmployee | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('employees')
    .select('id, app_role, department, first_name, last_name, email')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  return (data as SessionEmployee | null) ?? null
})

export async function getCurrentRole(): Promise<UserRole | null> {
  const emp = await getCurrentEmployee()
  return emp?.app_role ?? null
}

/**
 * The current session if its role is one of `roles` (master and admin always
 * pass); null otherwise — including when there is no session or no active
 * employee record.
 *
 * Server Functions and API routes answer direct requests that never go through
 * the UI, so hiding a button protects nothing: each one must call this itself.
 */
export async function getSessionWithRole(roles: readonly UserRole[]): Promise<SessionEmployee | null> {
  const session = await getCurrentEmployee()
  if (!session) return null
  return isFullAccess(session.app_role) || roles.includes(session.app_role) ? session : null
}

/**
 * For pages: the session when its role may open `path` (see NAV_ACCESS);
 * otherwise redirects. The menu hides the link, but anyone can type the address.
 * Check in the page itself, not in a layout — layouts are skipped on some
 * navigations, so a check there does not guard every request.
 */
export async function requirePageAccess(path: string): Promise<SessionEmployee> {
  const session = await getCurrentEmployee()
  if (!session) redirect('/login')
  if (!canAccess(session.app_role, path)) {
    redirect(path !== '/producao' && canAccess(session.app_role, '/producao') ? '/producao' : '/perfil')
  }
  return session
}
