"use client";

import { useState } from "react";
import { CampoNumero, EtiquetaEstimativa, Interruptor, Rotulado, Titulo } from "@/app/(app)/producao/_components/campos";
import { calcularAplicacao, escalaoDe, NOME_TECNICA, paramTecnica, TAMANHOS_A } from "@/lib/producao/engine";
import { euros, eurosFino, horasMin, numero } from "@/lib/producao/format";
import { useDados } from "@/app/(app)/producao/_lib/store";
import type { Aplicacao, Tecnica, TipoCliente } from "@/lib/producao/types";

const BASE = { id: "ref", posicao: "", jaProduzido: false, arteCliente: false, suporteConfigurado: false };
const PONTOS = [1000, 2000, 4000, 6000, 8000, 10000, 15000];

// Referências de mercado indicadas pela SOU (out 2026), só para comparação.
const MERCADO_BORDADO: Record<TipoCliente, [number, number]> = {
  particular: [1.5, 1.5],
  empresa: [0.5, 1],
  parceiro: [0.5, 1],
};

export default function TabelaPrecos() {
  const p = useDados().parametros;
  const [tipo, setTipo] = useState<TipoCliente>("empresa");
  const [qtd, setQtd] = useState(20);
  const [cobertura, setCobertura] = useState(70);
  const [escura, setEscura] = useState(false);
  const esc = escalaoDe(p, qtd);

  const linhaArea = (tecnica: Tecnica, l: number, a: number) => {
    const apl: Aplicacao = {
      ...BASE,
      tecnica,
      larguraCm: l,
      alturaCm: a,
      coberturaPct: cobertura,
      pecaEscura: escura,
      suporte: "texteis",
      complexidadeCorte: "simples",
    };
    const r = calcularAplicacao(p, apl, tipo, qtd);
    const rep = calcularAplicacao(p, { ...apl, jaProduzido: true }, tipo, qtd);
    return { r, rep, cabe: r.peca.avisos.length === 0 };
  };

  return (
    <>
      <Titulo sub="Preço de referência por aplicação e por peça, sem a peça em branco. Muda com o tipo de cliente e com a quantidade.">
        Calculadora · tabela de preços
      </Titulo>

      <div className="cartao mb-6 flex flex-wrap items-end gap-4">
        <Rotulado rotulo="Tipo de cliente">
          <select className="campo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCliente)}>
            {p.tiposCliente.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </Rotulado>
        <Rotulado rotulo="Quantidade" ajuda={`escalão ${esc.nome}`}>
          <CampoNumero valor={qtd} aoMudar={(n) => setQtd(Math.max(1, Math.round(n ?? 1)))} min={1} className="w-28" />
        </Rotulado>
        <Rotulado rotulo="Cobertura de tinta">
          <CampoNumero valor={cobertura} aoMudar={(n) => setCobertura(n ?? 0)} sufixo="%" min={0} className="w-28" />
        </Rotulado>
        <div className="pb-2">
          <Interruptor ligado={escura} aoMudar={setEscura} rotulo="DTG em peça escura" />
        </div>
        <span className="ml-auto flex items-center gap-2 text-xs text-cinza">
          <EtiquetaEstimativa /> consumos e tempos por confirmar
        </span>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {(["dtg", "dtf", "sublimacao", "cricut"] as Tecnica[]).map((t) => (
          <section key={t} className="cartao overflow-x-auto">
            <h2 className="titulo mb-1 text-lg text-verde">{NOME_TECNICA[t]}</h2>
            <p className="mb-3 text-xs text-cinza">
              Área máxima {paramTecnica(p, t).areaMaxCm.join(" × ")} cm · mínimo por peça {euros(paramTecnica(p, t).minimoPorPeca)}
            </p>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Formato</th>
                  <th className="num">€/peça</th>
                  <th className="num">€/cm²</th>
                  <th className="num">Custo/peça</th>
                  <th className="num">Setup novo</th>
                  <th className="num">Setup repetição</th>
                  <th className="num">Máquina</th>
                </tr>
              </thead>
              <tbody>
                {TAMANHOS_A.map((tam) => {
                  const { r, rep, cabe } = linhaArea(t, tam.l, tam.a);
                  const area = tam.l * tam.a;
                  if (!cabe) {
                    return (
                      <tr key={tam.nome} className="text-cinza">
                        <td>{tam.nome}</td>
                        <td colSpan={6} className="text-xs">
                          Não cabe na máquina: dividir em partes ou subcontratar.
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={tam.nome}>
                      <td>
                        {tam.nome} <span className="text-xs text-cinza">{numero(area)} cm²</span>
                      </td>
                      <td className="num font-medium">
                        {euros(r.vendaPeca)}
                        {r.aplicouMinimo && <span className="text-mostarda" title="Preço mínimo por peça"> *</span>}
                      </td>
                      <td className="num text-cinza">{eurosFino(r.vendaPeca / area)}</td>
                      <td className="num text-cinza">{euros(r.custoConsumiveis + r.custoMaquina + r.custoOperador)}</td>
                      <td className="num">{euros(r.vendaSetup)}</td>
                      <td className="num">{euros(rep.vendaSetup)}</td>
                      <td className="num text-cinza">{horasMin(r.peca.maquinaMin)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}

        <section className="cartao overflow-x-auto xl:col-span-2">
          <h2 className="titulo mb-1 text-lg text-verde">{NOME_TECNICA.bordado}</h2>
          <p className="mb-3 text-xs text-cinza">
            Por número de pontos, 3 cores. Referência de mercado para {p.tiposCliente.find((x) => x.id === tipo)?.nome}:{" "}
            {MERCADO_BORDADO[tipo][0] === MERCADO_BORDADO[tipo][1]
              ? euros(MERCADO_BORDADO[tipo][0])
              : `${euros(MERCADO_BORDADO[tipo][0])} a ${euros(MERCADO_BORDADO[tipo][1])}`}{" "}
            por 1000 pontos.
          </p>
          <table className="tabela">
            <thead>
              <tr>
                <th>Pontos</th>
                <th className="num">€/peça</th>
                <th className="num">€/1000 pontos</th>
                <th>vs. mercado</th>
                <th className="num">Custo/peça</th>
                <th className="num">Máquina/peça</th>
                <th className="num">Digitalização simples</th>
                <th className="num">média</th>
                <th className="num">complexa</th>
              </tr>
            </thead>
            <tbody>
              {PONTOS.map((pts) => {
                const apl: Aplicacao = { ...BASE, tecnica: "bordado", pontos: pts, cores: 3, complexidade: "medio" };
                const r = calcularAplicacao(p, apl, tipo, qtd);
                const setup = (c: "simples" | "medio" | "complexo") => calcularAplicacao(p, { ...apl, complexidade: c }, tipo, qtd).vendaSetup;
                const por1000 = r.vendaPeca / (pts / 1000);
                const [min, max] = MERCADO_BORDADO[tipo];
                const comparacao = por1000 < min ? "abaixo" : por1000 > max ? "acima" : "dentro";
                return (
                  <tr key={pts}>
                    <td>{numero(pts)}</td>
                    <td className="num font-medium">
                      {euros(r.vendaPeca)}
                      {r.aplicouMinimo && <span className="text-mostarda" title="Preço mínimo por peça"> *</span>}
                    </td>
                    <td className="num">{euros(por1000)}</td>
                    <td className={comparacao === "dentro" ? "text-verde" : "text-mostarda"}>{comparacao}</td>
                    <td className="num text-cinza">{euros(r.custoConsumiveis + r.custoMaquina + r.custoOperador)}</td>
                    <td className="num text-cinza">{horasMin(r.peca.maquinaMin)}</td>
                    <td className="num">{euros(setup("simples"))}</td>
                    <td className="num">{euros(setup("medio"))}</td>
                    <td className="num">{euros(setup("complexo"))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-cinza">
            * Aplica-se o preço mínimo por peça. Acima de {p.limiteSubcontratar} unidades, pedir preço a um fornecedor: a Melco tem uma
            cabeça e borda uma peça de cada vez.
          </p>
        </section>
      </div>
    </>
  );
}
