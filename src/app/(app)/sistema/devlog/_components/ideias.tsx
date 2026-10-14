'use client'

import { useActionState, useEffect, useRef, useTransition } from 'react'
import { mudarEstadoIdeia, registarIdeia, type EstadoIdeia } from '../actions'

export type Ideia = {
  id: string
  titulo: string
  descricao: string | null
  area: string
  tipo: 'ideia' | 'melhoria'
  estado: EstadoIdeia
  autor: string
  created_at: string
}

const AREAS = ['Geral', 'Calculadora', 'Orçamentos', 'Consumíveis', 'Horas', 'Pessoas', 'Financeiro']

const ESTADO: Record<EstadoIdeia, { nome: string; classe: string }> = {
  nova:      { nome: 'Nova',      classe: 'bg-beige text-tinta' },
  aceite:    { nome: 'Aceite',    classe: 'bg-verde-claro text-verde' },
  em_curso:  { nome: 'Em curso',  classe: 'bg-indigo-100 text-indigo-700' },
  feita:     { nome: 'Feita',     classe: 'bg-verde text-white' },
  rejeitada: { nome: 'Rejeitada', classe: 'bg-slate-100 text-slate-500' },
}

export default function QuadroIdeias({ ideias, podeDecidir }: { ideias: Ideia[]; podeDecidir: boolean }) {
  const [estado, enviar, aEnviar] = useActionState(registarIdeia, null)
  const [, iniciar] = useTransition()
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado && 'ok' in estado) form.current?.reset()
  }, [estado])

  const fechada = (i: Ideia) => i.estado === 'feita' || i.estado === 'rejeitada'
  const ordenadas = [...ideias.filter(i => !fechada(i)), ...ideias.filter(fechada)]

  return (
    <section className="mb-10">
      <h2 className="titulo mb-1 text-2xl text-verde">Ideias e melhorias</h2>
      <p className="mb-4 text-sm text-slate-500">
        Qualquer pessoa da equipa regista aqui o que lhe faz falta ou o que podia ser melhor. A gestão decide o que entra.
      </p>

      <form ref={form} action={enviar} className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-6">
        <label className="sm:col-span-3">
          <span className="rotulo">Título</span>
          <input name="titulo" required className="campo" placeholder="ex.: avisar quando a tinta branca estiver a acabar" />
        </label>
        <label>
          <span className="rotulo">Tipo</span>
          <select name="tipo" className="campo">
            <option value="ideia">Ideia</option>
            <option value="melhoria">Melhoria</option>
          </select>
        </label>
        <label>
          <span className="rotulo">Área</span>
          <select name="area" className="campo">{AREAS.map(a => <option key={a}>{a}</option>)}</select>
        </label>
        <div className="flex items-end">
          <button className="botao-principal w-full" disabled={aEnviar}>Registar</button>
        </div>
        <label className="sm:col-span-6">
          <span className="rotulo">Descrição (opcional)</span>
          <textarea name="descricao" className="campo min-h-16" />
        </label>
        {estado && 'error' in estado && <p className="text-sm text-alerta sm:col-span-6">{estado.error}</p>}
      </form>

      <ul className="space-y-2">
        {ordenadas.map(i => (
          <li key={i.id} className={`rounded-lg border border-slate-200 bg-white p-3 ${i.estado === 'rejeitada' ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`etiqueta ${ESTADO[i.estado].classe}`}>{ESTADO[i.estado].nome}</span>
              <span className="text-xs text-slate-400">{i.tipo === 'melhoria' ? 'Melhoria' : 'Ideia'} · {i.area}</span>
              <span className="font-medium">{i.titulo}</span>
              <span className="ml-auto text-xs text-slate-400">
                {i.autor} · {i.created_at.slice(0, 10).split('-').reverse().join('/')}
              </span>
              {podeDecidir && (
                <select
                  className="campo w-auto py-0.5 text-xs"
                  value={i.estado}
                  onChange={e => {
                    const novo = e.target.value as EstadoIdeia
                    iniciar(async () => { await mudarEstadoIdeia(i.id, novo) })
                  }}
                >
                  {(Object.keys(ESTADO) as EstadoIdeia[]).map(k => <option key={k} value={k}>{ESTADO[k].nome}</option>)}
                </select>
              )}
            </div>
            {i.descricao && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{i.descricao}</p>}
          </li>
        ))}
        {!ideias.length && <li className="text-sm text-slate-400">Ainda não há ideias registadas.</li>}
      </ul>
    </section>
  )
}
