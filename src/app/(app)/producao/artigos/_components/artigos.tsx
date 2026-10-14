"use client";

import { useState } from "react";
import { CampoNumero, Titulo } from "@/app/(app)/producao/_components/campos";
import { apagarArtigo, guardarArtigo, novoId, useDados } from "@/app/(app)/producao/_lib/store";
import type { Artigo } from "@/lib/producao/types";

export default function ListaArtigos() {
  const dados = useDados();
  const [filtro, setFiltro] = useState("");
  const set = (a: Artigo, p: Partial<Artigo>) => guardarArtigo({ ...a, ...p });

  const q = filtro.trim().toLowerCase();
  const artigos = [...dados.artigos]
    .filter((a) => !q || [a.nome, a.categoria, a.fornecedor].some((t) => t.toLowerCase().includes(q)))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, "pt") || a.nome.localeCompare(b.nome, "pt"));

  return (
    <>
      <Titulo
        sub="Peças em branco (t-shirts, toalhas, canecas…). O custo é sem IVA, tal como vem na fatura do fornecedor."
        acoes={
          <button
            className="botao-principal"
            onClick={() =>
              guardarArtigo({ id: novoId(), nome: "Novo artigo", categoria: "Outro", fornecedor: "", custo: 0, minimo: 1, portes: 0 })
            }
          >
            + Novo artigo
          </button>
        }
      >
        Artigos
      </Titulo>

      <input className="campo mb-3 max-w-xs" placeholder="Procurar" value={filtro} onChange={(e) => setFiltro(e.target.value)} />

      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead>
            <tr>
              <th className="w-32">Categoria</th>
              <th>Artigo</th>
              <th className="w-44">Fornecedor</th>
              <th className="w-28 num">Custo/un</th>
              <th className="w-24 num">Mínimo</th>
              <th className="w-28 num">Portes</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {artigos.map((a) => (
              <tr key={a.id}>
                <td>
                  <input className="campo" value={a.categoria} onChange={(e) => set(a, { categoria: e.target.value })} />
                </td>
                <td>
                  <input className="campo" value={a.nome} onChange={(e) => set(a, { nome: e.target.value })} />
                </td>
                <td>
                  <input className="campo" value={a.fornecedor} onChange={(e) => set(a, { fornecedor: e.target.value })} />
                </td>
                <td>
                  <CampoNumero valor={a.custo} aoMudar={(n) => set(a, { custo: n ?? 0 })} sufixo="€" min={0} />
                </td>
                <td>
                  <CampoNumero valor={a.minimo} aoMudar={(n) => set(a, { minimo: Math.max(1, Math.round(n ?? 1)) })} min={1} />
                </td>
                <td>
                  <CampoNumero valor={a.portes} aoMudar={(n) => set(a, { portes: n ?? 0 })} sufixo="€" min={0} />
                </td>
                <td>
                  <button
                    className="botao-perigo"
                    title="Apagar artigo"
                    onClick={() => confirm(`Apagar "${a.nome}" do catálogo?`) && apagarArtigo(a.id)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-cinza">
        Os portes contam uma vez por fornecedor em cada orçamento. Apagar um artigo não mexe nos orçamentos que já o usam: cada
        orçamento guarda a sua cópia do custo.
      </p>
    </>
  );
}
