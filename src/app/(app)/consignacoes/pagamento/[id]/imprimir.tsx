'use client'

export default function BotaoImprimir() {
  return (
    <button className="botao-principal" onClick={() => window.print()}>
      Imprimir / Guardar PDF
    </button>
  )
}
