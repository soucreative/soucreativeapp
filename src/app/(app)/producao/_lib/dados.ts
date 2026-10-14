import { createAdminClient } from '@/lib/supabase/admin'
import { ARTIGOS_INICIAIS, PARAMETROS_INICIAIS } from '@/lib/producao/defaults'
import type { Artigo, Cliente, Orcamento, Parametros } from '@/lib/producao/types'

export interface DadosProducao {
  parametros: Parametros
  artigos: Artigo[]
  clientes: Cliente[]
  orcamentos: Orcamento[]
}

type LinhaArtigo = {
  id: string; nome: string; categoria: string; fornecedor: string
  custo: number; minimo: number; portes: number; nota: string | null
}
type LinhaCliente = {
  id: string; nome: string; tipo: Cliente['tipo']; nif: string | null; email: string | null
  telefone: string | null; notas: string | null; created_at: string
}

export function artigoDeLinha(r: LinhaArtigo): Artigo {
  return {
    id: r.id, nome: r.nome, categoria: r.categoria, fornecedor: r.fornecedor,
    custo: Number(r.custo), minimo: Number(r.minimo), portes: Number(r.portes), nota: r.nota ?? undefined,
  }
}

export function clienteDeLinha(r: LinhaCliente): Cliente {
  return {
    id: r.id, nome: r.nome, tipo: r.tipo, nif: r.nif ?? undefined, email: r.email ?? undefined,
    telefone: r.telefone ?? undefined, notas: r.notas ?? undefined, criadoEm: r.created_at,
  }
}

/** Parâmetros gravados, completados com os de partida para campos que ainda não existiam. */
export async function carregarParametros(): Promise<Parametros> {
  const { data } = await createAdminClient().from('prod_parametros').select('dados').eq('id', 1).maybeSingle()
  const guardado = (data?.dados ?? {}) as Partial<Parametros>
  return { ...structuredClone(PARAMETROS_INICIAIS), ...guardado }
}

export async function carregarDadosProducao(): Promise<DadosProducao> {
  const admin = createAdminClient()
  const [parametros, artigosRes, clientesRes, orcRes] = await Promise.all([
    carregarParametros(),
    admin.from('prod_artigos').select('*').order('categoria').order('nome'),
    admin.from('prod_clientes').select('*').order('nome'),
    admin.from('prod_orcamentos').select('conteudo').order('created_at', { ascending: false }),
  ])

  // Catálogo vazio (primeira utilização): mostra os artigos do v27 até alguém gravar.
  const artigos = artigosRes.data?.length
    ? (artigosRes.data as LinhaArtigo[]).map(artigoDeLinha)
    : structuredClone(ARTIGOS_INICIAIS)

  return {
    parametros,
    artigos,
    clientes: ((clientesRes.data ?? []) as LinhaCliente[]).map(clienteDeLinha),
    orcamentos: ((orcRes.data ?? []) as { conteudo: Orcamento }[]).map(r => r.conteudo),
  }
}
