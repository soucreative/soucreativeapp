"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { CampoNumero, EtiquetaEstimativa, Interruptor, Rotulado, Titulo } from "@/app/(app)/producao/_components/campos";
import {
  calcularAplicacao,
  escalaoDe,
  maquinasDaTecnica,
  NOME_TECNICA,
  paramTecnica,
  TAMANHOS_A,
} from "@/lib/producao/engine";
import { euros, eurosFino, horasMin, numero } from "@/lib/producao/format";
import { useDados } from "@/app/(app)/producao/_lib/store";
import type { Aplicacao, Tecnica, TipoCliente } from "@/lib/producao/types";

const BASE = { id: "ref", posicao: "", jaProduzido: false, arteCliente: false, suporteConfigurado: false };
const PONTOS = [1000, 2000, 4000, 6000, 8000, 10000, 15000];
const ORDEM: Tecnica[] = ["bordado", "dtg", "dtf", "sublimacao", "cricut"];
const CHAVE_ABERTAS = "sou-calculadora-abertas";

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
  const [maquinasBordado, setMaquinasBordado] = useState<number | undefined>(undefined);
  // Que técnicas estavam abertas neste browser; no servidor, todas
  const guardadas = useSyncExternalStore(semSubscricao, lerAbertas, () => null);
  const [escolha, setEscolha] = useState<Tecnica[] | null>(null);
  const abertas = escolha ?? interpretarAbertas(guardadas);
  const esc = escalaoDe(p, qtd);

  const mudarAbertas = (lista: Tecnica[]) => {
    setEscolha(lista);
    try {
      window.localStorage.setItem(CHAVE_ABERTAS, JSON.stringify(lista));
    } catch {
      // sem armazenamento: vale só nesta visita
    }
  };
  const alternar = (t: Tecnica) => mudarAbertas(abertas.includes(t) ? abertas.filter((x) => x !== t) : [...abertas, t]);

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

  const resumoArea = (t: Tecnica) => {
    const a4 = TAMANHOS_A.find((x) => x.nome === "A4")!;
    const { r, cabe } = linhaArea(t, a4.l, a4.a);
    return cabe ? `A4 a ${euros(r.vendaPeca)}/peça` : "";
  };

  const aplBordado = (pts: number, complexidade: Aplicacao["complexidade"] = "medio"): Aplicacao => ({
    ...BASE,
    tecnica: "bordado",
    pontos: pts,
    cores: 3,
    complexidade,
    maquinasParalelo: maquinasBordado,
  });
  const nBordado = calcularAplicacao(p, aplBordado(6000), tipo, qtd).maquinasIds.length;
  const [mercadoMin, mercadoMax] = MERCADO_BORDADO[tipo];

  return (
    <>
      <Titulo sub="Preço de referência por aplicação e por peça, sem a peça em branco. Muda com o tipo de cliente e com a quantidade.">
        Calculadora · tabela de preços
      </Titulo>

      {/* Painel do projeto: fica no topo enquanto se percorre as tabelas */}
      <div className="cartao sticky top-0 z-20 mb-6 space-y-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
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
          <Rotulado rotulo="Bordado em" ajuda={nBordado === 1 ? "1 máquina" : `${nBordado} máquinas`}>
            <select
              className="campo"
              value={maquinasBordado ?? 0}
              onChange={(e) => setMaquinasBordado(Number(e.target.value) || undefined)}
            >
              <option value={0}>Automático</option>
              <option value={1}>1 máquina</option>
              {maquinasDaTecnica(p, "bordado").length > 1 && <option value={2}>2 em paralelo</option>}
            </select>
          </Rotulado>
          <div className="pb-2">
            <Interruptor ligado={escura} aoMudar={setEscura} rotulo="DTG em peça escura" />
          </div>
          <span className="ml-auto flex items-center gap-2 text-xs text-cinza">
            <EtiquetaEstimativa /> consumos e tempos por confirmar
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-linha pt-3">
          {ORDEM.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => alternar(t)}
              className={`rounded-full px-3 py-1 text-xs ${
                abertas.includes(t) ? "bg-verde text-white" : "bg-white text-tinta ring-1 ring-linha"
              }`}
            >
              {NOME_TECNICA[t].split(" (")[0]}
            </button>
          ))}
          <span className="mx-1 text-linha">|</span>
          <button type="button" className="text-xs text-verde hover:underline" onClick={() => mudarAbertas(ORDEM)}>
            Abrir todas
          </button>
          <button type="button" className="text-xs text-verde hover:underline" onClick={() => mudarAbertas([])}>
            Fechar todas
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <Seccao
          titulo={NOME_TECNICA.bordado}
          resumo={`6 000 pontos a ${euros(calcularAplicacao(p, aplBordado(6000), tipo, qtd).vendaPeca)}/peça`}
          aberta={abertas.includes("bordado")}
          alternar={() => alternar("bordado")}
        >
          <p className="mb-3 text-xs text-cinza">
            Por número de pontos, 3 cores, em {nBordado === 1 ? "1 máquina" : `${nBordado} máquinas em paralelo`}. Referência de
            mercado para {p.tiposCliente.find((x) => x.id === tipo)?.nome}:{" "}
            {mercadoMin === mercadoMax ? euros(mercadoMin) : `${euros(mercadoMin)} a ${euros(mercadoMax)}`} por 1000 pontos.
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
                const r = calcularAplicacao(p, aplBordado(pts), tipo, qtd);
                const setup = (c: "simples" | "medio" | "complexo") => calcularAplicacao(p, aplBordado(pts, c), tipo, qtd).vendaSetup;
                const por1000 = r.vendaPeca / (pts / 1000);
                const comparacao = por1000 < mercadoMin ? "abaixo" : por1000 > mercadoMax ? "acima" : "dentro";
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
            * Aplica-se o preço mínimo por peça. Acima de {p.limiteSubcontratar} unidades, pedir preço a um fornecedor: cada máquina
            tem uma cabeça e borda uma peça de cada vez.
          </p>
        </Seccao>

        {(["dtg", "dtf", "sublimacao", "cricut"] as Tecnica[]).map((t) => (
          <Seccao key={t} titulo={NOME_TECNICA[t]} resumo={resumoArea(t)} aberta={abertas.includes(t)} alternar={() => alternar(t)}>
            <p className="mb-3 text-xs text-cinza">
              Área máxima {paramTecnica(p, t).areaMaxCm.join(" × ")} cm · mínimo por peça{" "}
              {euros(paramTecnica(p, t).minimoPorPeca)}
              {paramTecnica(p, t).minimoAteQtd > 0 && ` até ${paramTecnica(p, t).minimoAteQtd} un.`}
              {!p.tiposCliente.every((c) => c.aplicaMinimo) &&
                `, só para ${p.tiposCliente.filter((c) => c.aplicaMinimo).map((c) => c.nome.toLowerCase()).join(" e ") || "ninguém"}`}
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
          </Seccao>
        ))}
      </div>
    </>
  );
}

const semSubscricao = () => () => {};

function lerAbertas(): string | null {
  try {
    return window.localStorage.getItem(CHAVE_ABERTAS);
  } catch {
    return null;
  }
}

function interpretarAbertas(texto: string | null): Tecnica[] {
  try {
    const lista = JSON.parse(texto ?? "null");
    return Array.isArray(lista) ? ORDEM.filter((t) => lista.includes(t)) : ORDEM;
  } catch {
    return ORDEM;
  }
}

function Seccao({
  titulo,
  resumo,
  aberta,
  alternar,
  children,
}: {
  titulo: string;
  resumo: string;
  aberta: boolean;
  alternar: () => void;
  children: ReactNode;
}) {
  return (
    <section className="cartao p-0">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberta}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-papel"
      >
        <span className={`text-verde transition-transform ${aberta ? "rotate-90" : ""}`} aria-hidden>
          ▶
        </span>
        <h2 className="titulo text-lg text-verde">{titulo}</h2>
        {!aberta && resumo && <span className="ml-auto text-sm text-cinza">{resumo}</span>}
      </button>
      {aberta && <div className="overflow-x-auto px-5 pb-5">{children}</div>}
    </section>
  );
}
