"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Titulo } from "@/app/(app)/producao/_components/campos";
import { calcularOrcamento } from "@/lib/producao/engine";
import { ESTADOS } from "@/lib/producao/estados";
import { dataPt, euros, percent } from "@/lib/producao/format";
import { criarOrcamento, useDados } from "@/app/(app)/producao/_lib/store";
import type { EstadoOrcamento } from "@/lib/producao/types";

export default function ListaOrcamentos() {
  const dados = useDados();
  const router = useRouter();
  const [filtro, setFiltro] = useState<EstadoOrcamento | "todos">("todos");
  const [procura, setProcura] = useState("");

  const linhas = useMemo(
    () =>
      dados.orcamentos.map((o) => {
        const r = calcularOrcamento(dados.parametros, o);
        const cliente = dados.clientes.find((c) => c.id === o.clienteId);
        return {
          o,
          cliente,
          total: o.congelado?.total ?? r.total,
          margem: o.congelado?.margem ?? r.margem,
        };
      }),
    [dados],
  );

  const contagem = (e: EstadoOrcamento) => linhas.filter((l) => l.o.estado === e);
  const ganhos = contagem("ganho");
  const perdidos = contagem("perdido");
  const decididos = ganhos.length + perdidos.length;

  const visiveis = linhas.filter((l) => {
    if (filtro !== "todos" && l.o.estado !== filtro) return false;
    const q = procura.trim().toLowerCase();
    if (!q) return true;
    return [l.o.numero, l.o.titulo, l.cliente?.nome].some((t) => t?.toLowerCase().includes(q));
  });

  return (
    <>
      <Titulo
        sub="Cada orçamento é uma lista de artigos, cada artigo com uma ou mais técnicas."
        acoes={
          <button className="botao-principal" onClick={async () => {
            const o = await criarOrcamento();
            if (o) router.push(`/producao/orcamentos/${o.id}`);
          }}>
            + Novo orçamento
          </button>
        }
      >
        Orçamentos
      </Titulo>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador nome="Em aberto" valor={String(contagem("rascunho").length + contagem("enviado").length)} />
        <Indicador nome="Ganhos" valor={String(ganhos.length)} detalhe={euros(ganhos.reduce((s, l) => s + l.total, 0))} />
        <Indicador nome="Perdidos" valor={String(perdidos.length)} detalhe={euros(perdidos.reduce((s, l) => s + l.total, 0))} />
        <Indicador nome="Taxa de conversão" valor={decididos ? percent(ganhos.length / decididos) : "—"} detalhe="ganhos ÷ decididos" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["todos", "rascunho", "enviado", "ganho", "perdido"] as const).map((e) => (
          <button
            key={e}
            onClick={() => setFiltro(e)}
            className={`rounded-full px-3 py-1 text-sm ${filtro === e ? "bg-verde text-white" : "bg-white text-tinta ring-1 ring-linha"}`}
          >
            {e === "todos" ? "Todos" : ESTADOS[e].nome}
          </button>
        ))}
        <input
          className="campo ml-auto max-w-xs"
          placeholder="Procurar nº, título ou cliente"
          value={procura}
          onChange={(e) => setProcura(e.target.value)}
        />
      </div>

      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead>
            <tr>
              <th>Nº</th>
              <th>Data</th>
              <th>Cliente</th>
              <th>Título</th>
              <th>Estado</th>
              <th className="num">Total s/ IVA</th>
              <th className="num">Margem</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map(({ o, cliente, total, margem }) => (
              <tr key={o.id} className="cursor-pointer hover:bg-papel" onClick={() => router.push(`/producao/orcamentos/${o.id}`)}>
                <td className="font-medium text-verde">
                  <Link href={`/producao/orcamentos/${o.id}`}>{o.numero}</Link>
                </td>
                <td>{dataPt(o.data)}</td>
                <td>{cliente?.nome ?? <span className="text-cinza">sem cliente</span>}</td>
                <td>{o.titulo || <span className="text-cinza">—</span>}</td>
                <td>
                  <span className={`etiqueta ${ESTADOS[o.estado].classe}`}>{ESTADOS[o.estado].nome}</span>
                  {o.produzidoEm && <span className="etiqueta ml-1 bg-verde-claro text-verde">produzido</span>}
                </td>
                <td className="num">{euros(total)}</td>
                <td className={`num ${margem < 0 ? "text-alerta" : ""}`}>{percent(margem)}</td>
              </tr>
            ))}
            {!visiveis.length && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-cinza">
                  {dados.orcamentos.length ? "Nada com este filtro." : "Ainda não há orçamentos. Comece pelo botão Novo orçamento."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Indicador({ nome, valor, detalhe }: { nome: string; valor: string; detalhe?: string }) {
  return (
    <div className="cartao py-4">
      <div className="text-xs text-cinza">{nome}</div>
      <div className="titulo mt-1 text-2xl text-verde">{valor}</div>
      {detalhe && <div className="text-xs text-cinza">{detalhe}</div>}
    </div>
  );
}
