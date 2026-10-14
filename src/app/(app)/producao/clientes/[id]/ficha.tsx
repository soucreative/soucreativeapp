"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Rotulado, Titulo } from "@/app/(app)/producao/_components/campos";
import { calcularOrcamento } from "@/lib/producao/engine";
import { ESTADOS } from "@/lib/producao/estados";
import { dataPt, euros, percent } from "@/lib/producao/format";
import { criarOrcamento, guardarCliente, useDados } from "@/app/(app)/producao/_lib/store";
import type { Cliente, TipoCliente } from "@/lib/producao/types";
import { EstadoGravacao } from "@/app/(app)/producao/_components/estado-gravacao";

export default function FichaCliente() {
  const { id } = useParams<{ id: string }>();
  const dados = useDados();
  const router = useRouter();
  const c = dados.clientes.find((x) => x.id === id);
  if (!c) {
    return (
      <p className="text-cinza">
        Cliente não encontrado. <Link className="text-verde underline" href="/producao/clientes">Voltar</Link>
      </p>
    );
  }
  const set = (p: Partial<Cliente>) => guardarCliente({ ...c, ...p });
  const orcs = dados.orcamentos
    .filter((o) => o.clienteId === c.id)
    .map((o) => ({ o, total: o.congelado?.total ?? calcularOrcamento(dados.parametros, o).total }))
    .sort((a, b) => b.o.data.localeCompare(a.o.data));
  const ganhos = orcs.filter((x) => x.o.estado === "ganho");
  const perdidos = orcs.filter((x) => x.o.estado === "perdido");
  const motivos = perdidos.reduce<Record<string, number>>((acc, x) => {
    const m = x.o.motivoPerda ?? "Sem motivo";
    acc[m] = (acc[m] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <Link href="/producao/clientes" className="text-xs text-cinza hover:text-verde">
        ← Clientes
      </Link>
      <Titulo
        acoes={
          <>
          <EstadoGravacao forcar={() => guardarCliente(c)} />
          <button
            className="botao-principal"
            onClick={async () => {
              const o = await criarOrcamento({ clienteId: c.id, tipoCliente: c.tipo });
              if (o) router.push(`/producao/orcamentos/${o.id}`);
            }}
          >
            + Novo orçamento para este cliente
          </button>
          </>
        }
      >
        {c.nome}
      </Titulo>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="cartao space-y-3">
          <Rotulado rotulo="Nome">
            <input className="campo" value={c.nome} onChange={(e) => set({ nome: e.target.value })} />
          </Rotulado>
          <Rotulado rotulo="Tipo de cliente">
            <select className="campo" value={c.tipo} onChange={(e) => set({ tipo: e.target.value as TipoCliente })}>
              {dados.parametros.tiposCliente.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </Rotulado>
          <Rotulado rotulo="NIF">
            <input className="campo" value={c.nif ?? ""} onChange={(e) => set({ nif: e.target.value })} />
          </Rotulado>
          <Rotulado rotulo="Email">
            <input className="campo" value={c.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
          </Rotulado>
          <Rotulado rotulo="Telefone">
            <input className="campo" value={c.telefone ?? ""} onChange={(e) => set({ telefone: e.target.value })} />
          </Rotulado>
          <Rotulado rotulo="Notas">
            <textarea className="campo min-h-24" value={c.notas ?? ""} onChange={(e) => set({ notas: e.target.value })} />
          </Rotulado>
        </section>

        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Numero nome="Pedidos" valor={String(orcs.length)} />
            <Numero nome="Ganhos" valor={String(ganhos.length)} detalhe={euros(ganhos.reduce((s, x) => s + x.total, 0))} />
            <Numero nome="Perdidos" valor={String(perdidos.length)} detalhe={euros(perdidos.reduce((s, x) => s + x.total, 0))} />
            <Numero
              nome="Conversão"
              valor={ganhos.length + perdidos.length ? percent(ganhos.length / (ganhos.length + perdidos.length)) : "—"}
            />
          </div>
          {Object.keys(motivos).length > 0 && (
            <p className="text-sm text-cinza">
              Porque perdemos:{" "}
              {Object.entries(motivos)
                .map(([m, n]) => `${m} (${n})`)
                .join(" · ")}
            </p>
          )}
          <div className="cartao overflow-x-auto p-0">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Data</th>
                  <th>Título</th>
                  <th>Artigos</th>
                  <th>Estado</th>
                  <th className="num">Total s/ IVA</th>
                </tr>
              </thead>
              <tbody>
                {orcs.map(({ o, total }) => (
                  <tr key={o.id} className="hover:bg-papel">
                    <td className="font-medium text-verde">
                      <Link href={`/producao/orcamentos/${o.id}`}>{o.numero}</Link>
                    </td>
                    <td>{dataPt(o.data)}</td>
                    <td>{o.titulo || "—"}</td>
                    <td className="text-xs text-cinza">
                      {o.linhas.map((l) => `${l.quantidade}× ${l.descricao || "artigo"}`).join(", ") || "—"}
                    </td>
                    <td>
                      <span className={`etiqueta ${ESTADOS[o.estado].classe}`}>{ESTADOS[o.estado].nome}</span>
                    </td>
                    <td className="num">{euros(total)}</td>
                  </tr>
                ))}
                {!orcs.length && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-cinza">
                      Ainda sem pedidos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function Numero({ nome, valor, detalhe }: { nome: string; valor: string; detalhe?: string }) {
  return (
    <div className="cartao py-4">
      <div className="text-xs text-cinza">{nome}</div>
      <div className="titulo mt-1 text-2xl text-verde">{valor}</div>
      {detalhe && <div className="text-xs text-cinza">{detalhe}</div>}
    </div>
  );
}
