import { redirect } from 'next/navigation'
import { getSessionWithRole } from '@/lib/auth'
import EmployeeForm from '../_components/employee-form'

export default async function NovoColaboradorPage() {
  if (!(await getSessionWithRole(['management']))) redirect('/colaboradores')

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Novo Colaborador</h1>
        <p className="text-slate-500 text-sm mt-1">Adiciona um novo membro à equipa</p>
      </div>
      <EmployeeForm />
    </div>
  )
}
