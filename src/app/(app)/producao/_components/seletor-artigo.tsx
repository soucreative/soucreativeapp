"use client";

import { useMemo, useRef, useState } from "react";
import { euros } from "@/lib/producao/format";
import { ImagemArtigo } from "@/app/(app)/producao/_components/imagem-artigo";
import type { Artigo } from "@/lib/producao/types";
import type { Modelo } from "@/lib/producao/variantes";

const MAX_RESULTADOS = 30;

type Resultado = { tipo: "artigo"; artigo: Artigo } | { tipo: "modelo"; modelo: Modelo };

/**
 * Procura de artigos para o orçamento. Com centenas de artigos, uma lista
 * pendente é impossível de percorrer: escreve-se parte do nome, da família ou
 * do código do TOC e aparecem os que correspondem, provisórios primeiro.
 * As variantes de cor e tamanho aparecem juntas, como um só modelo.
 */
export function SeletorArtigo({
  artigos,
  modelos = [],
  modeloDe,
  escolhido,
  modeloEscolhido,
  aoEscolher,
  aoEscolherModelo,
}: {
  artigos: Artigo[];
  modelos?: Modelo[];
  modeloDe?: Map<string, Modelo>;
  escolhido?: Artigo;
  modeloEscolhido?: Modelo;
  aoEscolher: (id: string | undefined) => void;
  aoEscolherModelo?: (m: Modelo) => void;
}) {
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  const resultados = useMemo<Resultado[]>(() => {
    const termos = texto.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const corresponde = (alvo: string) => termos.every((t) => alvo.toLowerCase().includes(t));
    const soltos: Resultado[] = artigos
      .filter((a) => !(aoEscolherModelo && modeloDe?.has(a.id)))
      .filter((a) => corresponde(`${a.nome} ${a.categoria} ${a.fornecedor} ${a.nota ?? ""}`))
      .map((artigo) => ({ tipo: "artigo", artigo }));
    const agrupados: Resultado[] = aoEscolherModelo
      ? modelos
          .filter((m) =>
            corresponde(`${m.nome} ${m.codigo} ${m.categoria} ${m.cores.join(" ")} ${m.variantes.map((v) => v.artigo.nota ?? "").join(" ")}`),
          )
          .map((modelo) => ({ tipo: "modelo", modelo }))
      : [];
    const chave = (r: Resultado) =>
      r.tipo === "modelo"
        ? { prov: 1, cat: r.modelo.categoria, nome: r.modelo.nome }
        : { prov: Number(r.artigo.id.startsWith("toc:")), cat: r.artigo.categoria, nome: r.artigo.nome };
    return [...soltos, ...agrupados].sort((a, b) => {
      const x = chave(a);
      const y = chave(b);
      return x.prov - y.prov || x.cat.localeCompare(y.cat, "pt") || x.nome.localeCompare(y.nome, "pt");
    });
  }, [artigos, modelos, modeloDe, aoEscolherModelo, texto]);

  const escolher = (r: Resultado | undefined) => {
    if (!r) aoEscolher(undefined);
    else if (r.tipo === "modelo") aoEscolherModelo?.(r.modelo);
    else aoEscolher(r.artigo.id);
    setTexto("");
    setAberto(false);
  };

  const mostrado = modeloEscolhido
    ? `${modeloEscolhido.categoria} · ${modeloEscolhido.nome}`
    : escolhido
      ? `${escolhido.categoria} · ${escolhido.nome}`
      : "";

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
        value={aberto ? texto : mostrado}
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
            escolher(resultados[0]);
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
          {resultados.slice(0, MAX_RESULTADOS).map((r) => {
            if (r.tipo === "modelo") {
              const m = r.modelo;
              const cores = m.cores.filter(Boolean);
              const tamanhos = m.tamanhos.filter(Boolean);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-papel ${m.id === modeloEscolhido?.id ? "bg-verde-claro" : ""}`}
                    onClick={() => escolher(r)}
                  >
                    <ImagemArtigo artigo={m.variantes.find((v) => v.artigo.imagem)?.artigo ?? m.variantes[0].artigo} tamanho={28} />
                    <span className="flex-1">
                      <span className="text-xs text-cinza">{m.categoria} · </span>
                      {m.nome}
                      <span className="block text-[11px] text-cinza">
                        {[
                          cores.length > 1 ? `${cores.length} cores` : cores[0],
                          tamanhos.length > 1 ? `${tamanhos[0]} a ${tamanhos[tamanhos.length - 1]}` : tamanhos[0],
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="etiqueta bg-verde-claro text-verde">{m.variantes.length} variantes</span>
                    <span className="text-xs tabular-nums text-cinza">
                      {m.custoMin === m.custoMax ? euros(m.custoMin) : `${euros(m.custoMin)}–${euros(m.custoMax)}`}
                    </span>
                  </button>
                </li>
              );
            }
            const a = r.artigo;
            const provisorio = !a.id.startsWith("toc:");
            return (
              <li key={a.id}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-papel ${a.id === escolhido?.id && !modeloEscolhido ? "bg-verde-claro" : ""}`}
                  onClick={() => escolher(r)}
                >
                  <ImagemArtigo artigo={a} tamanho={28} />
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
            <li className="px-3 py-2 text-xs text-cinza">Mais {resultados.length - MAX_RESULTADOS} resultados: escreva mais para filtrar.</li>
          )}
          {!resultados.length && <li className="px-3 py-2 text-xs text-cinza">Nenhum artigo com esse texto.</li>}
        </ul>
      )}
    </div>
  );
}
