import type {
  Aplicacao,
  Escalao,
  LinhaOrcamento,
  Maquina,
  Orcamento,
  ParamTecnica,
  Parametros,
  Pessoa,
  Tecnica,
  TipoCliente,
  TipoSetup,
} from "./types";

// ── Constantes ────────────────────────────────────────────────────────────

export const A4_CM2 = 21 * 29.7;

export const TAMANHOS_A: { nome: string; l: number; a: number }[] = [
  { nome: "A8", l: 5.2, a: 7.4 },
  { nome: "A7", l: 7.4, a: 10.5 },
  { nome: "A6", l: 10.5, a: 14.8 },
  { nome: "A5", l: 14.8, a: 21 },
  { nome: "A4", l: 21, a: 29.7 },
  { nome: "A3", l: 29.7, a: 42 },
  { nome: "A2", l: 42, a: 59.4 },
];

export const NOME_TECNICA: Record<Tecnica, string> = {
  bordado: "Bordado (Melco)",
  dtg: "DTG (Brother GTX Pro)",
  dtf: "DTF (Brother GTX Pro)",
  sublimacao: "Sublimação (Sawgrass)",
  cricut: "Vinil (Cricut)",
};

export const NOME_SETUP: Record<TipoSetup, string> = {
  completo: "Completo",
  arte_cliente: "Arte do cliente",
  parcial: "Parcial",
  arte_cliente_preparado: "Arte do cliente + suporte preparado",
  repeticao: "Repetição",
};

// ── Custo da hora ─────────────────────────────────────────────────────────

/** Os colaboradores registados contam quando existem; sem ninguém, valem os valores manuais. */
export function usaRegisto(p: Pessoa): boolean {
  return p.modo === "colaboradores" && !!p.registo && p.registo.fte > 0;
}

/** Fatia do tempo de uma pessoa a tempo inteiro que a função representa na produção. */
export function tempoProducao(p: Pessoa): number {
  return usaRegisto(p) ? p.registo!.fte : p.pctProducao;
}

export function custoAnualPessoa(p: Pessoa): number {
  if (usaRegisto(p)) return p.registo!.custoAnual;
  if (p.modo === "custo_total") return p.valorMensal * p.meses + p.outrosAnual;
  return p.valorMensal * p.meses * (1 + p.encargosPct) + p.subsidioAnual + p.outrosAnual;
}

export function horasFaturaveisPorPessoa(params: Parametros): number {
  const h = params.horas;
  const brutas = h.horasSemana * h.semanasAno;
  const horasDia = h.horasSemana / 5;
  const presentes =
    (brutas - h.diasFerias * horasDia - h.feriados * horasDia - h.horasFormacao) *
    (1 - h.absentismoPct);
  return presentes * h.produtividadePct;
}

export function fseAnual(params: Parametros): number {
  return params.fse.reduce((s, r) => s + r.mensal * 12 * r.pctProducao, 0);
}

// A estrutura reparte-se pelas horas vendáveis de toda a equipa de produção.
// A amortização das máquinas NÃO entra aqui: vai para o custo/hora de cada
// máquina, senão contava a dobrar.
export function quotaFseHora(params: Parametros): number {
  const horas =
    horasFaturaveisPorPessoa(params) *
    params.pessoas.reduce((s, p) => s + tempoProducao(p), 0);
  return horas > 0 ? fseAnual(params) / horas : 0;
}

export function custoHoraPessoa(params: Parametros, id: Pessoa["id"]): number {
  const p = params.pessoas.find((x) => x.id === id);
  if (!p) return 0;
  // Com o registo, o custo anual já é só o das pessoas da função e o FTE dá as
  // horas; à mão, o custo de uma pessoa entra na proporção do tempo na produção.
  const pct = tempoProducao(p);
  const horas = horasFaturaveisPorPessoa(params) * pct;
  if (horas <= 0) return 0;
  const custo = usaRegisto(p) ? custoAnualPessoa(p) : custoAnualPessoa(p) * pct;
  return custo / horas + quotaFseHora(params);
}

export function precoHora(params: Parametros, id: Pessoa["id"]): number {
  return params.pessoas.find((x) => x.id === id)?.precoVendaHora ?? 0;
}

export function amortizacaoAnual(m: Maquina): number {
  return m.vidaAnos > 0 ? m.valor / m.vidaAnos : 0;
}

export function custoHoraMaquina(m: Maquina | undefined): number {
  if (!m || m.horasUsoAno <= 0) return 0;
  return (amortizacaoAnual(m) + m.manutencaoAnual) / m.horasUsoAno + m.energiaHora;
}

// ── Escalões, tipos de cliente e setup ────────────────────────────────────

export function escalaoDe(params: Parametros, qtd: number): Escalao {
  const lista = params.escaloes;
  return lista.find((e) => qtd <= e.ate) ?? lista[lista.length - 1];
}

export function tipoClienteDe(params: Parametros, id: TipoCliente) {
  return params.tiposCliente.find((t) => t.id === id) ?? params.tiposCliente[0];
}

export function tipoSetupDe(a: Pick<Aplicacao, "jaProduzido" | "arteCliente" | "suporteConfigurado">): TipoSetup {
  if (a.jaProduzido) return "repeticao";
  if (a.arteCliente && a.suporteConfigurado) return "arte_cliente_preparado";
  if (a.arteCliente) return "arte_cliente";
  if (a.suporteConfigurado) return "parcial";
  return "completo";
}

export function paramTecnica(params: Parametros, t: Tecnica): ParamTecnica {
  const p = params.tecnicas.find((x) => x.tecnica === t);
  if (!p) throw new Error(`Técnica sem parâmetros: ${t}`);
  return p;
}

// ── Máquinas em paralelo ─────────────────────────────────────────────────

/** Máquinas que fazem a técnica, pela ordem em que entram ao trabalho. */
export function maquinasDaTecnica(params: Parametros, t: Tecnica): string[] {
  const pt = paramTecnica(params, t);
  const ids = pt.maquinasIds?.length ? pt.maquinasIds : [pt.maquinaId];
  return ids.filter((id) => params.maquinas.some((m) => m.id === id));
}

/**
 * Quantas máquinas trabalham este bordado ao mesmo tempo. Escolhido à mão na
 * aplicação, ou automático: todas as disponíveis a partir de k.paraleloAPartirDe
 * peças. Fora do bordado é sempre uma.
 */
export function maquinasEmParalelo(params: Parametros, a: Aplicacao, quantidade: number): number {
  const disponiveis = maquinasDaTecnica(params, a.tecnica).length || 1;
  if (a.tecnica !== "bordado") return 1;
  const pedido = a.maquinasParalelo;
  if (pedido && pedido > 0) return Math.min(pedido, disponiveis);
  const limiar = paramTecnica(params, "bordado").k.paraleloAPartirDe ?? Infinity;
  return quantidade >= limiar ? disponiveis : 1;
}

// ── Uma aplicação, numa peça ──────────────────────────────────────────────

export interface ResultadoPeca {
  areaCm2: number;
  pontos: number;
  consumos: Record<string, number>; // id do consumível → quantidade, já com desperdício
  maquinaMin: number;
  operadorMin: number;
  avisos: string[];
}

export function calcularPeca(params: Parametros, a: Aplicacao, emParalelo = 1): ResultadoPeca {
  const pt = paramTecnica(params, a.tecnica);
  const k = pt.k;
  const l = a.larguraCm ?? 0;
  const h = a.alturaCm ?? 0;
  const area = l * h;
  const cob = (a.coberturaPct ?? 100) / 100;
  const consumos: Record<string, number> = {};
  const avisos: string[] = [];
  let maquinaMin = 0;
  let operadorMin = pt.manuseamentoMin;
  let pontos = 0;

  const [maxL, maxA] = pt.areaMaxCm;
  const cabe = (l <= maxL && h <= maxA) || (l <= maxA && h <= maxL);
  if (area > 0 && !cabe) {
    avisos.push(
      `${l}×${h} cm não cabe na área máxima de ${NOME_TECNICA[a.tecnica]} (${maxL}×${maxA} cm). Dividir em partes ou subcontratar.`,
    );
  }

  switch (a.tecnica) {
    case "dtg": {
      const escura = !!a.pecaEscura;
      consumos.gtx_cmyk = area * cob * k.cmykMlCm2;
      if (escura) {
        consumos.gtx_branco = area * cob * k.brancoMlCm2;
        consumos.dtg_pretrat = area * k.pretratMlCm2;
        operadorMin += k.pretratOperadorMin;
      }
      maquinaMin = (area / A4_CM2) * (escura ? k.impressaoMinA4Escura : k.impressaoMinA4Clara) + k.curaMin;
      operadorMin += k.curaMin;
      break;
    }
    case "dtf": {
      consumos.gtx_cmyk = area * cob * k.cmykMlCm2;
      consumos.gtx_branco = area * cob * k.brancoMlCm2;
      consumos.dtf_filme = area * k.filmeFator;
      consumos.dtf_po = area * cob * k.poGCm2;
      maquinaMin = (area / A4_CM2) * k.impressaoMinA4 + k.curaMin + k.prensaMin;
      operadorMin += k.prensaMin;
      break;
    }
    case "sublimacao": {
      consumos.sub_tinta = area * cob * k.tintaMlCm2;
      consumos.sub_papel = area * k.papelFator;
      consumos.sub_fita = 1;
      const prensa =
        a.suporte === "caneca" ? k.prensaMinCaneca : a.suporte === "rigido" ? k.prensaMinRigido : k.prensaMinTexteis;
      maquinaMin = (area / A4_CM2) * k.impressaoMinA4 + prensa;
      // Na caneca o operador não fica preso à prensa o tempo todo.
      operadorMin += Math.min(prensa, 1);
      break;
    }
    case "bordado": {
      pontos = a.pontos && a.pontos > 0 ? a.pontos : Math.round(area * k.pontosPorCm2);
      if (!a.pontos && area > 0) avisos.push(`Pontos estimados pela área (${pontos.toLocaleString("pt-PT")}). Substituir pelo valor do ficheiro.`);
      if (pontos === 0) avisos.push("Bordado sem pontos nem medidas: o preço fica só com o manuseamento.");
      const cores = Math.max(1, a.cores ?? 1);
      if (cores > 16) avisos.push("Mais de 16 cores: a Melco tem 16 agulhas, há troca manual de linhas.");
      maquinaMin = pontos / k.pontosMinuto + (cores - 1) * k.trocaCorMin;
      // Com duas máquinas, o operador embastida numa enquanto a outra borda:
      // a vigilância reparte-se, o manuseamento de cada peça não.
      operadorMin += (maquinaMin * k.atencaoOperadorPct) / Math.max(1, emParalelo);
      consumos.bord_linha = (pontos / 1000) * k.linhaMPor1000;
      const areaEntretela = area > 0 ? area : pontos / k.pontosPorCm2;
      consumos.bord_entretela = areaEntretela * k.entretelaFator;
      break;
    }
    case "cricut": {
      consumos.cricut_vinil = area * k.vinilFator;
      const descasque =
        a.complexidadeCorte === "complexo"
          ? k.descasqueMinComplexo
          : a.complexidadeCorte === "medio"
            ? k.descasqueMinMedio
            : k.descasqueMinSimples;
      maquinaMin = (area / 100) * k.corteMinPor100cm2 + k.prensaMin;
      operadorMin += (area / 100) * descasque + k.prensaMin;
      break;
    }
  }

  for (const id of Object.keys(consumos)) consumos[id] *= 1 + pt.desperdicioPct;

  return { areaCm2: area, pontos, consumos, maquinaMin, operadorMin, avisos };
}

function custoConsumos(params: Parametros, consumos: Record<string, number>): number {
  let s = 0;
  for (const [id, q] of Object.entries(consumos)) {
    const c = params.consumiveis.find((x) => x.id === id);
    if (c) s += q * c.preco;
  }
  return s;
}

// ── Preço de uma aplicação ────────────────────────────────────────────────

export interface ResultadoAplicacao {
  aplicacao: Aplicacao;
  peca: ResultadoPeca;
  maquinaId: string;
  // Máquinas usadas em paralelo; os minutos de máquina repartem-se por elas
  maquinasIds: string[];
  // por peça
  custoConsumiveis: number;
  custoMaquina: number;
  custoOperador: number;
  vendaPeca: number;
  vendaPecaSemMinimo: number;
  aplicouMinimo: boolean;
  // por encomenda
  tipoSetup: TipoSetup;
  setupDesignerMin: number;
  setupOperadorMin: number;
  custoSetup: number;
  vendaSetup: number;
}

export function calcularAplicacao(
  params: Parametros,
  a: Aplicacao,
  tipoCliente: TipoCliente,
  quantidade: number,
): ResultadoAplicacao {
  const pt = paramTecnica(params, a.tecnica);
  const tc = tipoClienteDe(params, tipoCliente);
  const esc = escalaoDe(params, quantidade);
  const n = maquinasEmParalelo(params, a, quantidade);
  const maquinasIds = (maquinasDaTecnica(params, a.tecnica).length ? maquinasDaTecnica(params, a.tecnica) : [pt.maquinaId]).slice(0, n);
  // Custo/hora médio das máquinas usadas: cada peça ocupa uma delas
  const custoHoraMaq =
    maquinasIds.reduce((s, id) => s + custoHoraMaquina(params.maquinas.find((m) => m.id === id)), 0) / maquinasIds.length;
  const peca = calcularPeca(params, a, n);

  const cOp = custoHoraPessoa(params, "operador");
  const cDes = custoHoraPessoa(params, "designer");
  const pvOp = precoHora(params, "operador") * tc.fatorHora;
  const pvDes = precoHora(params, "designer") * tc.fatorHora;

  const custoConsumiveis = custoConsumos(params, peca.consumos);
  const custoMaquina = (peca.maquinaMin / 60) * custoHoraMaq;
  const custoOperador = (peca.operadorMin / 60) * cOp;

  // Consumível e máquina levam a margem de personalização; a mão de obra
  // vende-se ao preço/hora, que já tem a margem dentro.
  const vendaPecaSemMinimo =
    ((custoConsumiveis + custoMaquina) / (1 - tc.margemPersonalizacao) + (peca.operadorMin / 60) * pvOp) *
    (1 - esc.descontoPersonalizacao);
  const vendaPeca = Math.max(vendaPecaSemMinimo, pt.minimoPorPeca);

  const tipoSetup = tipoSetupDe(a);
  const pct = params.setups[tipoSetup];
  const digitalizacao = a.tecnica === "bordado" ? params.complexidadeBordado[a.complexidade ?? "medio"] : 0;
  const setupDesignerMin = (pt.setupDesignerMin + digitalizacao) * pct;
  // Cada máquina a mais tem de ser preparada: cores, bastidor e prova
  const setupOperadorMin = pt.setupOperadorMin * pct * n;

  return {
    aplicacao: a,
    peca,
    maquinaId: pt.maquinaId,
    maquinasIds,
    custoConsumiveis,
    custoMaquina,
    custoOperador,
    vendaPeca,
    vendaPecaSemMinimo,
    aplicouMinimo: vendaPeca > vendaPecaSemMinimo,
    tipoSetup,
    setupDesignerMin,
    setupOperadorMin,
    custoSetup: (setupDesignerMin / 60) * cDes + (setupOperadorMin / 60) * cOp,
    vendaSetup: (setupDesignerMin / 60) * pvDes + (setupOperadorMin / 60) * pvOp,
  };
}

// ── Uma linha (artigo × quantidade × aplicações) ──────────────────────────

export interface ResultadoLinha {
  linha: LinhaOrcamento;
  qtdFaturada: number;
  escalao: Escalao;
  aplicacoes: ResultadoAplicacao[];
  vendaArtigoUn: number;
  portes: number;
  totalSugerido: number;
  precoUnitSugerido: number;
  total: number;
  precoUnit: number;
  custo: number;
  margem: number;
  avisos: string[];
}

export function calcularLinha(
  params: Parametros,
  linha: LinhaOrcamento,
  tipoCliente: TipoCliente,
  cobrarPortes: boolean,
): ResultadoLinha {
  const tc = tipoClienteDe(params, tipoCliente);
  const avisos: string[] = [];
  const qtdFaturada = linha.artigoDoCliente ? linha.quantidade : Math.max(linha.quantidade, linha.minimoArtigo || 1);
  if (qtdFaturada > linha.quantidade) {
    avisos.push(`Mínimo do fornecedor é ${linha.minimoArtigo}: fatura-se e entrega-se ${qtdFaturada}.`);
  }
  if (linha.quantidade > params.limiteSubcontratar) {
    avisos.push(
      `Acima de ${params.limiteSubcontratar} un. As máquinas são para séries pequenas e médias: pedir preço a um fornecedor.`,
    );
  }
  const escalao = escalaoDe(params, qtdFaturada);
  const aplicacoes = linha.aplicacoes.map((a) => calcularAplicacao(params, a, tipoCliente, qtdFaturada));
  for (const r of aplicacoes) avisos.push(...r.peca.avisos.map((t) => `${NOME_TECNICA[r.aplicacao.tecnica]}: ${t}`));

  const vendaArtigoUn = linha.artigoDoCliente ? 0 : linha.custoArtigo / (1 - tc.margemProduto);
  const portes = cobrarPortes && !linha.artigoDoCliente ? linha.portes : 0;

  const vendaAplPeca = aplicacoes.reduce((s, r) => s + r.vendaPeca, 0);
  const vendaSetup = aplicacoes.reduce((s, r) => s + r.vendaSetup, 0);
  const totalSugerido = qtdFaturada * (vendaArtigoUn + vendaAplPeca) + vendaSetup + portes;
  const precoUnitSugerido = qtdFaturada > 0 ? totalSugerido / qtdFaturada : 0;

  const manual = linha.precoUnitManual;
  const total = manual != null && manual > 0 ? manual * qtdFaturada : totalSugerido;

  const custoPeca = aplicacoes.reduce((s, r) => s + r.custoConsumiveis + r.custoMaquina + r.custoOperador, 0);
  const custo =
    (linha.artigoDoCliente ? 0 : linha.custoArtigo * qtdFaturada) +
    qtdFaturada * custoPeca +
    aplicacoes.reduce((s, r) => s + r.custoSetup, 0) +
    portes;

  if (total < custo) avisos.push("O preço desta linha não cobre o custo.");

  return {
    linha,
    qtdFaturada,
    escalao,
    aplicacoes,
    vendaArtigoUn,
    portes,
    totalSugerido,
    precoUnitSugerido,
    total,
    precoUnit: qtdFaturada > 0 ? total / qtdFaturada : 0,
    custo,
    margem: total > 0 ? (total - custo) / total : 0,
    avisos,
  };
}

// ── O orçamento inteiro ───────────────────────────────────────────────────

export interface ResultadoOrcamento {
  linhas: ResultadoLinha[];
  vendaCriacao: number;
  custoCriacao: number;
  subtotal: number;
  desconto: number;
  total: number;
  iva: number;
  totalComIva: number;
  custo: number;
  margem: number;
  minutosMaquina: Record<string, number>;
  // Tempo até a máquina mais carregada acabar: as máquinas trabalham em paralelo
  prazoMaquinaMin: number;
  minutosOperador: number;
  minutosDesigner: number;
  consumos: Record<string, number>;
  usaEstimativas: boolean;
  avisos: string[];
}

export function calcularOrcamento(params: Parametros, o: Orcamento): ResultadoOrcamento {
  const tc = tipoClienteDe(params, o.tipoCliente);
  const fornecedoresComPortes = new Set<string>();
  const linhas = o.linhas.map((l) => {
    // Portes uma vez por fornecedor em cada orçamento.
    const chave = l.fornecedor.trim().toLowerCase();
    const cobrar = !fornecedoresComPortes.has(chave);
    if (l.portes > 0 && !l.artigoDoCliente) fornecedoresComPortes.add(chave);
    return calcularLinha(params, l, o.tipoCliente, cobrar);
  });

  const vendaCriacao = o.horasCriacao * precoHora(params, "designer") * tc.fatorHora;
  const custoCriacao = o.horasCriacao * custoHoraPessoa(params, "designer");
  const subtotal = linhas.reduce((s, l) => s + l.total, 0) + vendaCriacao;
  const desconto = subtotal * (o.descontoPotencialPct || 0);
  const total = subtotal - desconto;
  const custo = linhas.reduce((s, l) => s + l.custo, 0) + custoCriacao;

  const minutosMaquina: Record<string, number> = {};
  const consumos: Record<string, number> = {};
  let minutosOperador = 0;
  let minutosDesigner = o.horasCriacao * 60;
  let usaEstimativas = false;

  for (const l of linhas) {
    for (const r of l.aplicacoes) {
      for (const id of r.maquinasIds) {
        minutosMaquina[id] = (minutosMaquina[id] ?? 0) + (r.peca.maquinaMin * l.qtdFaturada) / r.maquinasIds.length;
      }
      minutosOperador += r.peca.operadorMin * l.qtdFaturada + r.setupOperadorMin;
      minutosDesigner += r.setupDesignerMin;
      for (const [id, q] of Object.entries(r.peca.consumos)) consumos[id] = (consumos[id] ?? 0) + q * l.qtdFaturada;
      if (paramTecnica(params, r.aplicacao.tecnica).estimativa) usaEstimativas = true;
      if (r.maquinasIds.some((id) => params.maquinas.find((m) => m.id === id)?.estimativa)) usaEstimativas = true;
    }
  }
  for (const id of Object.keys(consumos)) {
    if (params.consumiveis.find((c) => c.id === id)?.estimativa) usaEstimativas = true;
  }

  const avisos: string[] = [];
  for (const l of linhas) avisos.push(...l.avisos.map((t) => `${l.linha.descricao || "Linha"}: ${t}`));
  if (o.descontoPotencialPct > 0 && !o.descontoMotivo?.trim()) {
    avisos.push("Desconto por potencial sem motivo escrito.");
  }
  if (params.valorMinimoEncomenda > 0 && total > 0 && total < params.valorMinimoEncomenda) {
    avisos.push(`Abaixo do valor mínimo de encomenda (${params.valorMinimoEncomenda} €).`);
  }
  if (total > 0 && total < custo) avisos.push("O orçamento não cobre o custo.");

  return {
    linhas,
    vendaCriacao,
    custoCriacao,
    subtotal,
    desconto,
    total,
    iva: total * params.iva,
    totalComIva: total * (1 + params.iva),
    custo,
    margem: total > 0 ? (total - custo) / total : 0,
    minutosMaquina,
    prazoMaquinaMin: Math.max(0, ...Object.values(minutosMaquina)),
    minutosOperador,
    minutosDesigner,
    consumos,
    usaEstimativas,
    avisos,
  };
}
