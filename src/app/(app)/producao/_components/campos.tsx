"use client";

import { useState, type ReactNode } from "react";

// Aceita vírgula ou ponto e só devolve o número quando é válido, para se poder
// escrever "0," a caminho de "0,5" sem o campo saltar.
export function CampoNumero({
  valor,
  aoMudar,
  passo,
  min,
  sufixo,
  percentagem,
  estimativa,
  className = "",
  placeholder,
  vazio,
}: {
  valor: number | undefined;
  aoMudar: (n: number | undefined) => void;
  passo?: number;
  min?: number;
  sufixo?: string;
  percentagem?: boolean; // mostra 0,25 como 25
  estimativa?: boolean;
  className?: string;
  placeholder?: string;
  vazio?: boolean; // permite ficar em branco (undefined)
}) {
  const mostrar = (v: number | undefined) =>
    v == null ? "" : String(Math.round((percentagem ? v * 100 : v) * 10000) / 10000).replace(".", ",");
  const [texto, setTexto] = useState(mostrar(valor));
  const [focado, setFocado] = useState(false);
  const visivel = focado ? texto : mostrar(valor);

  return (
    <div className={`relative ${className}`}>
      <input
        inputMode="decimal"
        className={`campo pr-8 text-right tabular-nums ${estimativa ? "campo-estimativa" : ""}`}
        value={visivel}
        placeholder={placeholder}
        step={passo}
        onFocus={() => {
          setTexto(mostrar(valor));
          setFocado(true);
        }}
        onBlur={() => setFocado(false)}
        onChange={(e) => {
          const t = e.target.value;
          setTexto(t);
          if (t.trim() === "") {
            aoMudar(vazio ? undefined : 0);
            return;
          }
          const n = Number(t.replace(/\s/g, "").replace(",", "."));
          if (Number.isFinite(n)) {
            const v = percentagem ? n / 100 : n;
            aoMudar(min != null ? Math.max(min, v) : v);
          }
        }}
      />
      {(sufixo || percentagem) && (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-cinza">
          {percentagem ? "%" : sufixo}
        </span>
      )}
    </div>
  );
}

export function Rotulado({ rotulo, children, ajuda }: { rotulo: string; children: ReactNode; ajuda?: string }) {
  return (
    <label className="block">
      <span className="rotulo">{rotulo}</span>
      {children}
      {ajuda && <span className="mt-1 block text-xs text-cinza">{ajuda}</span>}
    </label>
  );
}

export function Interruptor({
  ligado,
  aoMudar,
  rotulo,
}: {
  ligado: boolean;
  aoMudar: (v: boolean) => void;
  rotulo: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 accent-[var(--color-verde)]"
        checked={ligado}
        onChange={(e) => aoMudar(e.target.checked)}
      />
      {rotulo}
    </label>
  );
}

export function Titulo({ children, acoes, sub }: { children: ReactNode; acoes?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="titulo text-3xl text-verde">{children}</h1>
        {sub && <p className="mt-1 text-sm text-cinza">{sub}</p>}
      </div>
      {acoes && <div className="nao-imprimir flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function EtiquetaEstimativa() {
  return (
    <span className="etiqueta bg-beige-claro text-mostarda" title="Valor de partida: substituir pelo real">
      estimativa
    </span>
  );
}

export function Avisos({ lista }: { lista: string[] }) {
  if (!lista.length) return null;
  return (
    <ul className="space-y-1 rounded-lg border border-alerta/30 bg-alerta/5 p-3 text-sm text-alerta">
      {lista.map((a, i) => (
        <li key={i}>⚠ {a}</li>
      ))}
    </ul>
  );
}
