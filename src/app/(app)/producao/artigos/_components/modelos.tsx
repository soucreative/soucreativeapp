"use client";

import { useState } from "react";
import { ImagemArtigo } from "@/app/(app)/producao/_components/imagem-artigo";
import { useModelos } from "@/app/(app)/producao/_lib/modelos";
import { atualizarParametros, useDados } from "@/app/(app)/producao/_lib/store";
import { euros } from "@/lib/producao/format";
import type { AjusteVariante } from "@/lib/producao/types";
import type { Modelo } from "@/lib/producao/variantes";

/** Grava a correção de um artigo; um ajuste vazio sai da lista. */
function ajustar(id: string, p: Partial<AjusteVariante>) {
  atualizarParametros((d) => {
    const todos = { ...(d.ajustesVariantes ?? {}) };
    const novo: AjusteVariante = { ...todos[id], ...p };
    for (const k of Object.keys(novo) as (keyof AjusteVariante)[]) if (novo[k] === undefined) delete novo[k];
    if (Object.keys(novo).length) todos[id] = novo;
    else delete todos[id];
    d.ajustesVariantes = todos;
  });
}

/**
 * Revisão dos modelos: as variantes do TOC agrupadas por modelo, com a cor e
 * o tamanho que a app leu do nome. Corrige-se aqui o que a regra não acertou;
 * o TOC não muda.
 */
export function ListaModelos({ filtro, categoria }: { filtro: string; categoria: string }) {
  const { modelos } = useModelos();
  const q = filtro.trim().toLowerCase();
  const lista = modelos
    .filter((m) => !categoria || m.categoria === categoria)
    .filter((m) => !q || `${m.nome} ${m.codigo} ${m.cores.join(" ")}`.toLowerCase().includes(q));
  const agrupados = lista.reduce((s, m) => s + m.variantes.length, 0);

  return (
    <>
      <p className="mb-3 text-xs text-cinza">
        {lista.length} modelos juntam {agrupados} artigos do TOC. A app agrupa pelo código do TOC e lê a cor e o tamanho do nome; o
        que estiver errado corrige-se aqui e o TOC fica igual. No orçamento escolhe-se o modelo e reparte-se a quantidade por cores e
        tamanhos.
      </p>
      <div className="space-y-2">
        {lista.map((m) => (
          <CartaoModelo key={m.id} m={m} />
        ))}
        {!lista.length && <p className="cartao text-sm text-cinza">Nenhum modelo com esse filtro.</p>}
      </div>
    </>
  );
}

function CartaoModelo({ m }: { m: Modelo }) {
  const ajustes = useDados().parametros.ajustesVariantes ?? {};
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(m.nome);
  const cores = m.cores.filter(Boolean);
  const tamanhos = m.tamanhos.filter(Boolean);
  const imagem = m.variantes.find((v) => v.artigo.imagem)?.artigo ?? m.variantes[0].artigo;

  return (
    <section className="cartao p-0">
      <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-papel" onClick={() => setAberto(!aberto)}>
        <ImagemArtigo artigo={imagem} tamanho={36} />
        <span className="flex-1">
          <span className="text-xs text-cinza">
            {m.categoria}
            {m.codigo ? ` · ${m.codigo}` : ""} ·{" "}
          </span>
          <span className="font-medium">{m.nome}</span>
          <span className="block text-xs text-cinza">
            {[cores.length ? `${cores.length} ${cores.length === 1 ? "cor" : "cores"}: ${cores.join(", ")}` : "", tamanhos.length ? tamanhos.join(" · ") : ""]
              .filter(Boolean)
              .join(" — ")}
          </span>
        </span>
        <span className="etiqueta bg-verde-claro text-verde">{m.variantes.length} variantes</span>
        <span className="w-28 text-right text-xs tabular-nums text-cinza">
          {m.custoMin === m.custoMax ? euros(m.custoMin) : `${euros(m.custoMin)}–${euros(m.custoMax)}`}
        </span>
        <span className="text-cinza">{aberto ? "▴" : "▾"}</span>
      </button>

      {aberto && (
        <div className="border-t border-linha px-4 py-3">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <label className="flex-1">
              <span className="rotulo">Nome do modelo</span>
              <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} />
            </label>
            <button
              className="botao-secundario"
              disabled={!nome.trim() || nome.trim() === m.nome}
              title="Passa a ser um modelo à mão, com este nome, para todas as variantes"
              onClick={() => m.variantes.forEach((v) => ajustar(v.artigo.id, { modelo: nome.trim() }))}
            >
              Mudar o nome
            </button>
          </div>
          <table className="tabela">
            <thead>
              <tr>
                <th className="w-12" />
                <th>Artigo no TOC</th>
                <th className="w-44">Cor</th>
                <th className="w-32">Tamanho</th>
                <th className="w-24 num">Custo</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {m.variantes.map((v) => {
                const aj = ajustes[v.artigo.id];
                return (
                  <tr key={v.artigo.id}>
                    <td>
                      <ImagemArtigo artigo={v.artigo} tamanho={28} editavel />
                    </td>
                    <td>
                      {v.artigo.nome}
                      <div className="text-[11px] text-cinza">{v.artigo.id.replace(/^toc:/, "")}</div>
                    </td>
                    <td>
                      <input
                        key={v.cor}
                        className={`campo ${aj?.cor != null ? "border-mostarda" : ""}`}
                        defaultValue={v.cor}
                        placeholder="—"
                        onBlur={(e) => e.target.value !== v.cor && ajustar(v.artigo.id, { cor: e.target.value.trim() })}
                      />
                    </td>
                    <td>
                      <input
                        key={v.tamanho}
                        className={`campo ${aj?.tamanho != null ? "border-mostarda" : ""}`}
                        defaultValue={v.tamanho}
                        placeholder="—"
                        onBlur={(e) => e.target.value !== v.tamanho && ajustar(v.artigo.id, { tamanho: e.target.value.trim() })}
                      />
                    </td>
                    <td className="num tabular-nums">{euros(v.artigo.custo)}</td>
                    <td className="text-right">
                      {(aj?.cor != null || aj?.tamanho != null) && (
                        <button
                          className="mr-2 text-xs text-verde hover:underline"
                          title="Voltar à cor e ao tamanho lidos do nome"
                          onClick={() => ajustar(v.artigo.id, { cor: undefined, tamanho: undefined })}
                        >
                          repor
                        </button>
                      )}
                      <button
                        className="text-xs text-alerta hover:underline"
                        title="Este artigo não é deste modelo: fica sozinho no catálogo"
                        onClick={() => ajustar(v.artigo.id, { modelo: null })}
                      >
                        tirar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-cinza">
            As correções guardam-se nos parâmetros e mantêm-se nas sincronizações seguintes. Um campo com borda dourada foi corrigido à
            mão. Para juntar um artigo solto a um modelo, use o campo &quot;Modelo&quot; na lista de artigos.
          </p>
        </div>
      )}
    </section>
  );
}

/** Campo para pôr um artigo num modelo (por nome) ou tirá-lo de todos. */
export function CampoModelo({ artigoId, atual, nomes }: { artigoId: string; atual?: string; nomes: string[] }) {
  const aj = useDados().parametros.ajustesVariantes?.[artigoId];
  return (
    <span className="mt-1 flex items-center gap-1 text-[11px] text-cinza">
      Modelo:
      <input
        className="campo h-6 flex-1 px-1.5 py-0 text-[11px]"
        list="nomes-modelos"
        defaultValue={aj?.modelo === null ? "" : (atual ?? "")}
        placeholder={aj?.modelo === null ? "fora de modelos" : "nenhum"}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v === (atual ?? "")) return;
          ajustar(artigoId, { modelo: v ? v : atual ? null : undefined });
        }}
      />
      {aj?.modelo !== undefined && (
        <button className="text-verde hover:underline" title="Voltar ao agrupamento automático" onClick={() => ajustar(artigoId, { modelo: undefined })}>
          auto
        </button>
      )}
      <datalist id="nomes-modelos">
        {nomes.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </span>
  );
}
