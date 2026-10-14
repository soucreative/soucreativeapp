'use client'

import { useState, type ReactNode } from 'react'
import { ContextoProducao, hidratar, useErroGravacao, type Dados } from './store'

export function HidratarProducao({ dados, children }: { dados: Dados; children: ReactNode }) {
  // Hidrata durante o render, antes de os ecrãs lerem. Dados novos do servidor
  // (router.refresh, nova navegação) substituem a cópia se não houver gravações
  // por fazer.
  const [ultimo, setUltimo] = useState<Dados | null>(null)
  if (ultimo !== dados) {
    hidratar(dados)
    setUltimo(dados)
  }
  return (
    <ContextoProducao.Provider value={dados}>
      <AvisoGravacao />
      {children}
    </ContextoProducao.Provider>
  )
}

function AvisoGravacao() {
  const erro = useErroGravacao()
  if (!erro) return null
  return (
    <div className="nao-imprimir sticky top-0 z-30 border-b border-alerta/30 bg-alerta/10 px-6 py-2 text-sm text-alerta">
      Não foi possível gravar a última alteração: {erro}. O que está no ecrã continua cá; tente outra vez.
    </div>
  )
}
