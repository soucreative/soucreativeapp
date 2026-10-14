import { getCurrentEmployee } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TocImportForm from './_components/toc-import-form'

export default async function ImportPage() {
  const session = await getCurrentEmployee()
  if (!session || !['master', 'admin', 'management'].includes(session.app_role)) {
    redirect('/colaboradores')
  }

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Importar remunerações — TOC Online</h1>
        <p className="text-slate-500 text-sm mt-1">
          Carrega o ficheiro Excel exportado do TOC Online (Salários → Processamento → Exportar).
          Só contratos activos são actualizados.
        </p>
      </div>
      <TocImportForm />
    </div>
  )
}
