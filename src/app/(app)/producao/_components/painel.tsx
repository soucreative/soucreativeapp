"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Titulo } from "@/app/(app)/producao/_components/campos";
import { calcularOrcamento } from "@/lib/producao/engine";
import { ESTADOS } from "@/lib/producao/estados";
import { dataPt, euros, horasMin, numero, percent } from "@/lib/producao/format";
import { criarOrcamento, hoje, useDados } from "@/app/(app)/producao/_lib/store";

const DIAS_SEM_RESPOSTA = 14;

export default function PainelProducao() {
  const dados = useDados();
  const router = useRouter();
  const p = dados.parametros;

  const v = useMemo(() => {
    const calc = dados.orcamentos.map((o) => ({ o, r: calcularOrcamento(p, o) }));
    const total = (x: (typeof calc)[number]) => x.o.congelado?.total ?? x.r.total;
    const porEstado = (e: string) => calc.filter((x) => x.o.estado === e);

    const porProduzir = porEstado("ganho").filter((x) => !x.o.produzidoEm);
    const minutosMaquina: Record<string, number> = {};
    let minutosOperador = 0;
    const consumos: Record<string, number> = {};
    for (const x of porProduzir) {
      for (const [id, m] of Object.entries(x.r.minutosMaquina)) minutosMaquina[id] = (minutosMaquina[id] ?? 0) + m;
      minutosOperador += x.r.minutosOperador;
      for (const [id, q] of Object.entries(x.r.consumos)) consumos[id] = (consumos[id] ?? 0) + q;
    }

    const limite = new Date();
    limite.setDate(limite.getDate() - DIAS_SEM_RESPOSTA);
    const semResposta = porEstado("enviado").filter((x) => x.o.data <= limite.toISOString().slice(0, 10));

    const stockAlertas = p.consumiveis
      .filter((c) => c.stock != null)
      .map((c) => ({ c, fica: (c.stock ?? 0) - (consumos[c.id] ?? 0) }))
      .filter(({ c, fica }) => fica < 0 || (c.stockMinimo != null && fica < c.stockMinimo));

    const mes = hoje().slice(0, 7);
    const ganhos = porEstado("ganho");
    const perdidos = porEstado("perdido");
    const motivos = perdidos.reduce<Record<string, number>>((acc, x) => {
      const m = x.o.motivoPerda ?? "Sem motivo";
      acc[m] = (acc[m] ?? 0) + 1;
      return acc;
    }, {});

    return {
      rascunhos: porEstado("rascunho").length,
      enviados: porEstado("enviado"),
      valorEnviado: porEstado("enviado").reduce((s, x) => s + total(x), 0),
      porProduzir,
      valorPorProduzir: porProduzir.reduce((s, x) => s + total(x), 0),
      produzidosMes: ganhos.filter((x) => x.o.produzidoEm?.slice(0, 7) === mes).length,
      conversao: ganhos.length + perdidos.length ? ganhos.length / (ganhos.length + perdidos.length) : null,
      minutosMaquina,
      minutosOperador,
      semResposta,
      stockAlertas,
      motivos: Object.entries(motivos).sort((a, b) => b[1] - a[1]),
      recentes: [...calc].sort((a, b) => b.o.atualizadoEm.localeCompare(a.o.atualizadoEm)).slice(0, 6),
      total,
    };
  }, [dados, p]);

  const nomeMaquina = (id: string) => p.maquinas.find((m) => m.id === id)?.nome.split(" (")[0] ?? id;

  return (
    <>
      <Titulo
        sub="O que está para orçamentar, o que está para produzir e o que pode faltar."
        acoes={
          <button
            className="botao-principal"
            onClick={async () => {
              const o = await criarOrcamento();
              if (o) router.push(`/producao/orcamentos/${o.id}`);
            }}
          >
            + Novo orçamento
          </button>
        }
      >
        Painel de produção
      </Titulo>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Indicador nome="Rascunhos" valor={String(v.rascunhos)} />
        <Indicador nome="Enviados, à espera" valor={String(v.enviados.length)} detalhe={euros(v.valorEnviado)} />
        <Indicador nome="Ganhos por produzir" valor={String(v.porProduzir.length)} detalhe={euros(v.valorPorProduzir)} />
        <Indicador nome="Produzidos este mês" valor={String(v.produzidosMes)} />
        <Indicador nome="Conversão" valor={v.conversao == null ? "—" : percent(v.conversao)} detalhe="ganhos ÷ decididos" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="cartao">
          <h2 className="titulo mb-3 text-lg text-verde">Carga por produzir</h2>
          {v.porProduzir.length === 0 ? (
            <p className="text-sm text-cinza">Nada ganho à espera de produção.</p>
          ) : (
            <dl className="space-y-1.5 text-sm">
              {Object.entries(v.minutosMaquina).map(([id, min]) => (
                <div key={id} className="flex justify-between">
                  <dt className="text-cinza">{nomeMaquina(id)}</dt>
                  <dd className="tabular-nums">{horasMin(min)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-linha pt-1.5">
                <dt className="text-cinza">Operador</dt>
                <dd className="tabular-nums">{horasMin(v.minutosOperador)}</dd>
              </div>
            </dl>
          )}
          <ul className="mt-3 space-y-1 text-sm">
            {v.porProduzir.map((x) => (
              <li key={x.o.id}>
                <Link className="text-verde hover:underline" href={`/producao/orcamentos/${x.o.id}`}>
                  {x.o.numero}
                </Link>{" "}
                <span className="text-cinza">{dados.clientes.find((c) => c.id === x.o.clienteId)?.nome ?? x.o.titulo}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="cartao">
          <h2 className="titulo mb-3 text-lg text-verde">Alertas</h2>
          {v.stockAlertas.length === 0 && v.semResposta.length === 0 && <p className="text-sm text-cinza">Sem alertas.</p>}
          <ul className="space-y-2 text-sm">
            {v.stockAlertas.map(({ c, fica }) => (
              <li key={c.id} className={fica < 0 ? "text-alerta" : "text-mostarda"}>
                {fica < 0 ? "Falta" : "Encomendar"}: {c.nome} (fica {numero(fica)} {c.unidade})
              </li>
            ))}
            {v.semResposta.map((x) => (
              <li key={x.o.id}>
                Sem resposta há mais de {DIAS_SEM_RESPOSTA} dias:{" "}
                <Link className="text-verde hover:underline" href={`/producao/orcamentos/${x.o.id}`}>
                  {x.o.numero}
                </Link>{" "}
                <span className="text-cinza">({dataPt(x.o.data)})</span>
              </li>
            ))}
          </ul>
          <Link href="/producao/consumiveis" className="mt-3 inline-block text-xs text-verde underline">
            Ver stock de consumíveis
          </Link>
        </section>

        <section className="cartao">
          <h2 className="titulo mb-3 text-lg text-verde">Porque perdemos</h2>
          {v.motivos.length === 0 ? (
            <p className="text-sm text-cinza">Ainda sem orçamentos perdidos.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {v.motivos.map(([m, n]) => (
                <li key={m} className="flex justify-between">
                  <span>{m}</span>
                  <span className="tabular-nums text-cinza">{n}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-cinza">Se for quase sempre o preço, o problema está nos parâmetros e não na equipa.</p>
        </section>
      </div>

      <section className="cartao mt-6 overflow-x-auto p-0">
        <h2 className="titulo px-5 pt-4 text-lg text-verde">Mexidos recentemente</h2>
        <table className="tabela">
          <tbody>
            {v.recentes.map((x) => (
              <tr key={x.o.id} className="hover:bg-papel">
                <td className="font-medium text-verde">
                  <Link href={`/producao/orcamentos/${x.o.id}`}>{x.o.numero}</Link>
                </td>
                <td>{dados.clientes.find((c) => c.id === x.o.clienteId)?.nome ?? "—"}</td>
                <td>{x.o.titulo || "—"}</td>
                <td>
                  <span className={`etiqueta ${ESTADOS[x.o.estado].classe}`}>{ESTADOS[x.o.estado].nome}</span>
                </td>
                <td className="num">{euros(v.total(x))}</td>
              </tr>
            ))}
            {!v.recentes.length && (
              <tr>
                <td className="py-8 text-center text-cinza">Ainda não há orçamentos.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
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
