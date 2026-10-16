"use client";

import { useMemo, useRef, useState } from "react";
import { euros } from "@/lib/producao/format";
import type { Artigo } from "@/lib/producao/types";

const MAX_RESULTADOS = 30;

/**
 * Procura de artigos para o orçamento. Com centenas de artigos, uma lista
 * pendente é impossível de percorrer: escreve-se parte do nome, da família ou
 * do código do TOC e aparecem os que correspondem, provisórios primeiro.
 */
export function SeletorArtigo({
  artigos,
  escolhido,
  aoEscolher,
}: {
  artigos: Artigo[];
  escolhido?: Artigo;
  aoEscolher: (id: string | undefined) => void;
}) {
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  const resultados = useMemo(() => {
    const termos = texto.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return artigos
      .filter((a) => {
        const alvo = `${a.nome} ${a.categoria} ${a.fornecedor} ${a.nota ?? ""}`.toLowerCase();
        return termos.every((t) => alvo.includes(t));
      })
      .sort(
        (a, b) =>
          Number(a.id.startsWith("toc:")) - Number(b.id.startsWith("toc:")) ||
          a.categoria.localeCompare(b.categoria, "pt") ||
          a.nome.localeCompare(b.nome, "pt"),
      );
  }, [artigos, texto]);

  const escolher = (id: string | undefined) => {
    aoEscolher(id);
    setTexto("");
    setAberto(false);
  };

  return (
    <div
      ref={caixa}
      className="relative"
      onBlur={(e) => {
        // Fecha quando o foco sai da caixa e da lista
        if (!caixa.current?.contains(e.relatedTarget as Node | null)) setAberto(false);
      }}
    >
      <input
        className="campo"
        value={aberto ? texto : escolhido ? `${escolhido.categoria} · ${escolhido.nome}` : ""}
        placeholder="Procurar artigo (nome, família ou código)…"
        onFocus={() => setAberto(true)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAberto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAberto(false);
          if (e.key === "Enter" && resultados[0]) {
            e.preventDefault();
            escolher(resultados[0].id);
          }
        }}
      />
      {aberto && (
        <ul className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-linha bg-white text-sm shadow-lg">
          <li>
            <button type="button" className="w-full px-3 py-2 text-left text-cinza hover:bg-papel" onClick={() => escolher(undefined)}>
              — outro / escrever à mão —
            </button>
          </li>
          {resultados.slice(0, MAX_RESULTADOS).map((a) => {
            const provisorio = !a.id.startsWith("toc:");
            return (
              <li key={a.id}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-papel ${a.id === escolhido?.id ? "bg-verde-claro" : ""}`}
                  onClick={() => escolher(a.id)}
                >
                  <span className="flex-1">
                    <span className="text-xs text-cinza">{a.categoria} · </span>
                    {a.nome}
                  </span>
                  {provisorio && <span className="etiqueta bg-beige-claro text-mostarda">Provisório</span>}
                  <span className="text-xs tabular-nums text-cinza">{euros(a.custo)}</span>
                </button>
              </li>
            );
          })}
          {resultados.length > MAX_RESULTADOS && (
            <li className="px-3 py-2 text-xs text-cinza">
              Mais {resultados.length - MAX_RESULTADOS} artigos: escreva mais para filtrar.
            </li>
          )}
          {!resultados.length && <li className="px-3 py-2 text-xs text-cinza">Nenhum artigo com esse texto.</li>}
        </ul>
      )}
    </div>
  );
}
