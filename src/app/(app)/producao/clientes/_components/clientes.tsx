"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Titulo } from "@/app/(app)/producao/_components/campos";
import { calcularOrcamento, totalParaListas } from "@/lib/producao/engine";
import { euros, percent } from "@/lib/producao/format";
import { guardarCliente, novoId, useDados } from "@/app/(app)/producao/_lib/store";
import type { TipoCliente } from "@/lib/producao/types";

export default function ListaClientes() {
  const dados = useDados();
  const [procura, setProcura] = useState("");
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoCliente>("empresa");

  const linhas = useMemo(
    () =>
      dados.clientes
        .map((c) => {
          const orcs = dados.orcamentos.filter((o) => o.clienteId === c.id);
          const valor = (estado: string) =>
            orcs
              .filter((o) => o.estado === estado)
              .reduce((s, o) => s + totalParaListas(o, calcularOrcamento(dados.parametros, o)), 0);
          const ganhos = orcs.filter((o) => o.estado === "ganho").length;
          const perdidos = orcs.filter((o) => o.estado === "perdido").length;
          const ultimo = orcs.map((o) => o.data).sort().at(-1);
          return { c, total: orcs.length, ganhos, perdidos, valorGanho: valor("ganho"), ultimo };
        })
        .sort((a, b) => a.c.nome.localeCompare(b.c.nome, "pt")),
    [dados],
  );

  const q = procura.trim().toLowerCase();
  const visiveis = q ? linhas.filter((l) => [l.c.nome, l.c.nif, l.c.email].some((t) => t?.toLowerCase().includes(q))) : linhas;

  return (
    <>
      <Titulo sub="Histórico de pedidos por cliente: o que pediu, o que ganhámos e o que perdemos.">Clientes</Titulo>

      <div className="cartao mb-4 flex flex-wrap items-end gap-2">
        <label className="flex-1">
          <span className="rotulo">Novo cliente</span>
          <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" />
        </label>
        <label>
          <span className="rotulo">Tipo</span>
          <select className="campo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCliente)}>
            {dados.parametros.tiposCliente.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <button
          className="botao-principal"
          disabled={!nome.trim()}
          onClick={() => {
            guardarCliente({ id: novoId(), nome: nome.trim(), tipo, criadoEm: new Date().toISOString() });
            setNome("");
          }}
        >
          Adicionar
        </button>
        <input className="campo ml-auto max-w-xs" placeholder="Procurar" value={procura} onChange={(e) => setProcura(e.target.value)} />
      </div>

      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Tipo</th>
              <th className="num">Orçamentos</th>
              <th className="num">Ganhos</th>
              <th className="num">Perdidos</th>
              <th className="num">Conversão</th>
              <th className="num">Valor ganho</th>
              <th>Último pedido</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.c.id} className="hover:bg-papel">
                <td className="font-medium text-verde">
                  <Link href={`/producao/clientes/${l.c.id}`}>{l.c.nome}</Link>
                </td>
                <td>{dados.parametros.tiposCliente.find((t) => t.id === l.c.tipo)?.nome}</td>
                <td className="num">{l.total}</td>
                <td className="num">{l.ganhos}</td>
                <td className="num">{l.perdidos}</td>
                <td className="num">{l.ganhos + l.perdidos ? percent(l.ganhos / (l.ganhos + l.perdidos)) : "—"}</td>
                <td className="num">{euros(l.valorGanho)}</td>
                <td>{l.ultimo ? l.ultimo.split("-").reverse().join("/") : "—"}</td>
              </tr>
            ))}
            {!visiveis.length && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-cinza">
                  Sem clientes. Também se criam diretamente num orçamento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
