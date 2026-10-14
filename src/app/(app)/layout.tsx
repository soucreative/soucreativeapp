import Sidebar from '@/components/sidebar'
import InternGuard from '@/components/intern-guard'
import { getCurrentEmployee } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const emp = await getCurrentEmployee()

  // Middleware already ensures the user is authenticated.
  // If emp is null here it means the auth user has no linked employee record.
  if (!emp) redirect('/login')

  const role = emp.app_role

  const name = `${emp.first_name} ${emp.last_name.charAt(0)}.`

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar role={role} name={name} />
      <InternGuard isIntern={role === 'intern'} />
      <main className="flex-1 ml-60 min-h-screen overflow-auto">
        {children}
      </main>
    </div>
  )
}
