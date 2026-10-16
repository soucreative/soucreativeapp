"use client";

import { useRef, useState } from "react";
import { carregarImagem, retirarImagem } from "@/app/(app)/producao/_lib/store";
import type { Artigo } from "@/lib/producao/types";

/**
 * Miniatura da imagem do artigo. Com `editavel`, clicar escolhe uma imagem
 * nova (o browser reduz-na antes de a enviar) e há um ✕ para a retirar.
 */
export function ImagemArtigo({
  artigo,
  tamanho = 40,
  editavel = false,
}: {
  artigo?: Pick<Artigo, "id" | "nome" | "imagem">;
  tamanho?: number;
  editavel?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [aCarregar, setACarregar] = useState(false);
  const estilo = { width: tamanho, height: tamanho };

  const quadro = artigo?.imagem ? (
    // eslint-disable-next-line @next/next/no-img-element -- imagens do Supabase, já reduzidas
    <img src={artigo.imagem} alt={artigo.nome} className="h-full w-full rounded object-cover" />
  ) : (
    <span className="text-[10px] leading-tight text-cinza">{editavel ? "+ imagem" : ""}</span>
  );

  if (!editavel || !artigo) {
    return (
      <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded bg-papel ring-1 ring-linha" style={estilo}>
        {quadro}
      </span>
    );
  }

  return (
    <span className="group relative inline-block shrink-0" style={estilo}>
      <button
        type="button"
        title={artigo.imagem ? "Trocar a imagem" : "Carregar uma imagem"}
        className={`flex h-full w-full items-center justify-center overflow-hidden rounded bg-papel text-center ring-1 ring-linha hover:ring-verde ${aCarregar ? "opacity-50" : ""}`}
        disabled={aCarregar}
        onClick={() => input.current?.click()}
      >
        {aCarregar ? <span className="text-[10px] text-cinza">a enviar…</span> : quadro}
      </button>
      {artigo.imagem && !aCarregar && (
        <button
          type="button"
          title="Retirar a imagem"
          className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] text-alerta ring-1 ring-linha group-hover:flex"
          onClick={() => confirm("Retirar a imagem deste artigo?") && void retirarImagem(artigo.id)}
        >
          ✕
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setACarregar(true);
          await carregarImagem(artigo.id, f);
          setACarregar(false);
        }}
      />
    </span>
  );
}
