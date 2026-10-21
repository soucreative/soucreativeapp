import type {
  Aplicacao,
  Consumivel,
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
  // Só as que já estão na SOU; se nenhuma estiver, fica a principal, para o cálculo não parar
  const presentes = ids.filter((id) => params.maquinas.some((m) => m.id === id && m.disponivel !== false));
  return presentes.length ? presentes : ids.filter((id) => params.maquinas.some((m) => m.id === id)).slice(0, 1);
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
  designerMin: number; // por peça, só com nomes individuais
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
      // Os ml medidos no software da Brother mandam sobre a estimativa por área
      repartirCor(consumos, a.tintaCorMl ?? area * cob * k.cmykMlCm2);
      consumos.gtx_manutencao = 1; // kit de manutenção, por impressão
      if (escura) {
        consumos.gtx_branco = a.tintaBrancoMl ?? area * cob * k.brancoMlCm2;
        consumos.dtg_pretrat = area * k.pretratMlCm2;
        operadorMin += k.pretratOperadorMin;
      }
      maquinaMin = (area / A4_CM2) * (escura ? k.impressaoMinA4Escura : k.impressaoMinA4Clara) + k.curaMin;
      operadorMin += k.curaMin;
      break;
    }
    case "dtf": {
      repartirCor(consumos, a.tintaCorMl ?? area * cob * k.cmykMlCm2);
      consumos.gtx_branco = a.tintaBrancoMl ?? area * cob * k.brancoMlCm2;
      consumos.dtf_filme = area * k.filmeFator;
      consumos.dtf_po = area * cob * k.poGCm2;
      consumos.gtx_manutencao = 1;
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
      repartirMistura(consumos, params, "entretela", areaEntretela * k.entretelaFator, "bord_entretela");
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

  // Nomes individuais: cada peça tem o seu ficheiro, a preparar e a carregar
  let designerMin = 0;
  if (a.nomesIndividuais) {
    const n = params.nomes ?? { designerMin: 1, operadorMin: 0.5 };
    designerMin = n.designerMin;
    operadorMin += n.operadorMin;
  }

  return { areaCm2: area, pontos, consumos, maquinaMin, operadorMin, designerMin, avisos };
}

/**
 * Preço por unidade de um consumível. Vem da embalagem quando ela está
 * preenchida: é o que se tem à mão quando chega a factura do fornecedor, e
 * evita que alguém actualize o frasco e se esqueça de refazer a divisão.
 */
export function precoConsumivel(c: Pick<Consumivel, "preco" | "embalagemPreco" | "embalagemQtd">): number {
  const { embalagemPreco: p, embalagemQtd: q } = c;
  if (p != null && q != null && q > 0) return p / q;
  return c.preco;
}

/**
 * Consumíveis que o motor sabe gastar. Apagar um destes não dá erro nenhum —
 * o custo dele desaparece em silêncio e todos os orçamentos ficam mais
 * baratos sem que ninguém perceba porquê. Por isso a interface avisa antes.
 */
export const CONSUMIVEIS_DO_MOTOR = [
  "gtx_ciano", "gtx_magenta", "gtx_amarelo", "gtx_preto", "gtx_branco",
  "gtx_manutencao", "dtg_pretrat", "dtf_filme", "dtf_po",
  "sub_tinta", "sub_papel", "sub_fita", "bord_linha", "bord_entretela", "cricut_vinil",
] as const;

/** As quatro tintas de cor da GTX. O branco é à parte: só entra em peça escura. */
export const TINTAS_COR = ["gtx_ciano", "gtx_magenta", "gtx_amarelo", "gtx_preto"] as const;

/**
 * Repartir a tinta de cor pelas quatro cores.
 *
 * A divisão é igual porque não sabemos o consumo real de cada cor — isso vem
 * do software da Brother, desenho a desenho, e entra pelo campo de ml medidos.
 * Enquanto for estimativa, a repartição não muda o custo (as quatro custam o
 * mesmo por ml); muda o stock, que é para isso que serve.
 */
function repartirCor(consumos: Record<string, number>, ml: number) {
  for (const id of TINTAS_COR) consumos[id] = (consumos[id] ?? 0) + ml / TINTAS_COR.length;
}
/**
 * Gastar um consumível que na verdade é uma mistura de vários.
 *
 * As entretelas do bordado fazem todas o mesmo papel e usam-se em proporções
 * diferentes. Em vez de escolher uma, reparte-se pelo peso de cada: o custo
 * fica a média ponderada e o stock gasta-se na proporção certa.
 *
 * Sem pesos definidos cai no consumível de sempre. É deliberado: uma mistura
 * por preencher não deve mudar o preço de nada.
 */
function repartirMistura(
  consumos: Record<string, number>,
  params: Parametros,
  grupo: string,
  quantidade: number,
  semMistura: string,
) {
  const membros = params.consumiveis.filter((c) => c.grupoMistura === grupo && (c.pesoMistura ?? 0) > 0);
  const total = membros.reduce((s, c) => s + (c.pesoMistura ?? 0), 0);
  if (total <= 0) {
    consumos[semMistura] = (consumos[semMistura] ?? 0) + quantidade;
    return;
  }
  for (const c of membros) {
    consumos[c.id] = (consumos[c.id] ?? 0) + (quantidade * (c.pesoMistura ?? 0)) / total;
  }
}
function custoConsumos(params: Parametros, consumos: Record<string, number>): number {
  let s = 0;
  for (const [id, q] of Object.entries(consumos)) {
    const c = params.consumiveis.find((x) => x.id === id);
    if (c) s += q * precoConsumivel(c);
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
  custoDesigner: number;
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
  const tipoSetup = tipoSetupDe(a);

  // Uma repetição nunca entra no escalão da peça única. A arte e o setup já
  // estão feitos de uma encomenda anterior, e repetir uma peça não nos custa
  // mais do que repetir duas: agravar aí seria penalizar o cliente que volta,
  // que é exactamente o que queremos que aconteça o ano todo.
  const eRepeticao = tipoSetup === "repeticao";
  const escBruto = escalaoDe(params, quantidade);
  const esc =
    eRepeticao && escBruto === params.escaloes[0] && params.escaloes.length > 1
      ? params.escaloes[1]
      : escBruto;
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
  const custoDesigner = (peca.designerMin / 60) * cDes;

  // Consumível e máquina levam a margem de personalização; a mão de obra
  // vende-se ao preço/hora, que já tem a margem dentro.
  const vendaPecaSemMinimo =
    ((custoConsumiveis + custoMaquina) / (1 - tc.margemPersonalizacao) +
      (peca.operadorMin / 60) * pvOp +
      (peca.designerMin / 60) * pvDes) *
    (1 - esc.descontoPersonalizacao);
  // O piso de preço cobre o atendimento de uma encomenda minúscula, que é um
  // custo fixo e não proporcional — por isso é um valor em euros e não uma
  // percentagem. Vale para qualquer cliente: uma peça única custa o que custa,
  // compre-a quem comprar. O que não leva piso é a repetição.
  const minimoAplicavel = !eRepeticao && quantidade <= pt.minimoAteQtd;
  const vendaPeca = minimoAplicavel ? Math.max(vendaPecaSemMinimo, pt.minimoPorPeca) : vendaPecaSemMinimo;

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
    custoDesigner,
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
  qtdEscalao: number; // a que define o escalão: lote + peças anteriores
  setupRepartido: boolean; // o setup do lote está repartido pelas suas linhas
  escalao: Escalao;
  aplicacoes: ResultadoAplicacao[];
  vendaArtigoUn: number;
  portes: number;
  totalSugerido: number;
  precoUnitSugerido: number;
  // Preço por unidade pedido (à mão ou pelo desconto %), antes do limite de desconto
  precoPraticado?: number;
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
  lote: { quantidade?: number; fracaoSetup?: number } = {},
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
  // O escalão conta o lote inteiro (variantes do mesmo trabalho) e as peças
  // já encomendadas antes. O setup é um só para o lote e reparte-se pelas
  // linhas na proporção da quantidade, para a mesma peça ter o mesmo preço.
  const qtdEscalao = (lote.quantidade ?? qtdFaturada) + Math.max(0, linha.pecasAnteriores ?? 0);
  const escalao = escalaoDe(params, qtdEscalao);
  const fracao = lote.fracaoSetup ?? 1;
  const aplicacoes = linha.aplicacoes.map((a) => {
    const r = calcularAplicacao(params, a, tipoCliente, qtdEscalao);
    return fracao === 1
      ? r
      : {
          ...r,
          setupDesignerMin: r.setupDesignerMin * fracao,
          setupOperadorMin: r.setupOperadorMin * fracao,
          custoSetup: r.custoSetup * fracao,
          vendaSetup: r.vendaSetup * fracao,
        };
  });
  for (const r of aplicacoes) avisos.push(...r.peca.avisos.map((t) => `${NOME_TECNICA[r.aplicacao.tecnica]}: ${t}`));

  const vendaArtigoUn = linha.artigoDoCliente ? 0 : linha.custoArtigo / (1 - tc.margemProduto);
  const portes = cobrarPortes && !linha.artigoDoCliente ? linha.portes : 0;

  const vendaAplPeca = aplicacoes.reduce((s, r) => s + r.vendaPeca, 0);
  const vendaSetup = aplicacoes.reduce((s, r) => s + r.vendaSetup, 0);
  const totalSugerido = qtdFaturada * (vendaArtigoUn + vendaAplPeca) + vendaSetup + portes;
  const precoUnitSugerido = qtdFaturada > 0 ? totalSugerido / qtdFaturada : 0;

  // Preço à mão (ou desconto em % sobre o sugerido): para cima sem limite;
  // para baixo, no máximo o desconto comercial
  const manual =
    linha.precoUnitManual != null && linha.precoUnitManual > 0
      ? linha.precoUnitManual
      : linha.descontoPct && linha.descontoPct > 0
        ? Math.round(precoUnitSugerido * (1 - linha.descontoPct) * 100) / 100
        : undefined;
  const piso = precoUnitSugerido * (1 - (params.descontoMaximo ?? 0.05));
  const descontoLimitado = manual != null && manual > 0 && manual < piso - 0.005;
  if (descontoLimitado) {
    avisos.push(`Desconto acima de ${Math.round((params.descontoMaximo ?? 0.05) * 100)}%: o preço fica em ${piso.toFixed(2)} €/un.`);
  }
  const total = manual != null && manual > 0 ? Math.max(manual, descontoLimitado ? piso : 0) * qtdFaturada : totalSugerido;

  const custoPeca = aplicacoes.reduce((s, r) => s + r.custoConsumiveis + r.custoMaquina + r.custoOperador + r.custoDesigner, 0);
  const custo =
    (linha.artigoDoCliente ? 0 : linha.custoArtigo * qtdFaturada) +
    qtdFaturada * custoPeca +
    aplicacoes.reduce((s, r) => s + r.custoSetup, 0) +
    portes;

  if (total < custo) avisos.push("O preço desta linha não cobre o custo.");

  return {
    linha,
    qtdFaturada,
    qtdEscalao,
    setupRepartido: fracao < 1,
    escalao,
    aplicacoes,
    vendaArtigoUn,
    portes,
    totalSugerido,
    precoUnitSugerido,
    precoPraticado: manual,
    total,
    precoUnit: qtdFaturada > 0 ? total / qtdFaturada : 0,
    custo,
    margem: total > 0 ? (total - custo) / total : 0,
    avisos,
  };
}

// ── O orçamento inteiro ───────────────────────────────────────────────────

export interface OpcaoResultado {
  linhaId: string;
  descricao: string;
  total: number; // só esta linha
  totalComBase: number; // o orçamento todo se for esta a escolhida (com desconto, sem IVA)
}

export interface GrupoOpcoes {
  grupo: string;
  opcoes: OpcaoResultado[];
  escolhida?: string;
}

export interface ResultadoOrcamento {
  linhas: (ResultadoLinha & { incluida: boolean })[];
  // Alternativas por grupo; o total só conta as escolhidas
  grupos: GrupoOpcoes[];
  opcoesPorEscolher: boolean;
  // Para listas: o total, ou "desde" (base + opção mais barata) enquanto não houver escolha
  totalReferencia: number;
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
  // Portes uma vez por fornecedor: primeiro nas linhas normais; cada opção
  // paga os seus se o fornecedor ainda não estiver nas normais.
  const fornecedoresComPortes = new Set<string>();
  const chaveF = (l: LinhaOrcamento) => l.fornecedor.trim().toLowerCase();
  const porId = new Map<string, ResultadoLinha>();
  // Lotes: só nas linhas normais (as opções são alternativas, não variantes)
  const chaveLote = (l: LinhaOrcamento) => l.lote?.trim().toLowerCase() || "";
  const qtdLote = new Map<string, number>();
  for (const l of o.linhas.filter((x) => !x.grupoOpcao && chaveLote(x))) {
    qtdLote.set(chaveLote(l), (qtdLote.get(chaveLote(l)) ?? 0) + l.quantidade);
  }
  for (const l of o.linhas.filter((x) => !x.grupoOpcao)) {
    const cobrar = !fornecedoresComPortes.has(chaveF(l));
    if (l.portes > 0 && !l.artigoDoCliente) fornecedoresComPortes.add(chaveF(l));
    const k = chaveLote(l);
    const total = k ? qtdLote.get(k) ?? 0 : 0;
    const lote = k && total > 0 ? { quantidade: total, fracaoSetup: l.quantidade / total } : {};
    porId.set(l.id, calcularLinha(params, l, o.tipoCliente, cobrar, lote));
  }
  for (const l of o.linhas.filter((x) => x.grupoOpcao)) {
    porId.set(l.id, calcularLinha(params, l, o.tipoCliente, !fornecedoresComPortes.has(chaveF(l))));
  }

  // Depois de enviado, contam os totais de cada linha no momento do envio
  const fixados = o.estado !== "rascunho" ? o.congelado?.linhas : undefined;
  const totalLinha = (l: ResultadoLinha) => fixados?.[l.linha.id] ?? l.total;

  // A escolha do cliente só conta num orçamento ganho: num rascunho ou enviado
  // (duplicado de um ganho, ou ganho anulado) mostram-se todas as opções
  const escolha = o.estado === "ganho" ? (o.opcaoEscolhida ?? {}) : {};
  const incluida = (l: LinhaOrcamento) => !l.grupoOpcao || escolha[l.grupoOpcao] === l.id;
  const linhasTodas = o.linhas.map((l) => ({ ...porId.get(l.id)!, incluida: incluida(l) }));
  const linhas = linhasTodas.filter((l) => l.incluida);

  const vendaCriacao = o.horasCriacao * precoHora(params, "designer") * tc.fatorHora;
  const custoCriacao = o.horasCriacao * custoHoraPessoa(params, "designer");
  const fatorDesconto = 1 - (o.descontoPotencialPct || 0);
  const subtotalBase = linhasTodas.filter((l) => !l.linha.grupoOpcao).reduce((s, l) => s + totalLinha(l), 0) + vendaCriacao;
  const subtotal = linhas.reduce((s, l) => s + totalLinha(l), 0) + vendaCriacao;
  const desconto = subtotal * (o.descontoPotencialPct || 0);
  const total = subtotal - desconto;
  const custo = linhas.reduce((s, l) => s + l.custo, 0) + custoCriacao;

  const nomesGrupos = [...new Set(o.linhas.map((l) => l.grupoOpcao).filter((g): g is string => !!g))];
  const grupos: GrupoOpcoes[] = nomesGrupos.map((grupo) => ({
    grupo,
    escolhida: escolha[grupo],
    opcoes: linhasTodas
      .filter((l) => l.linha.grupoOpcao === grupo)
      .map((l) => ({
        linhaId: l.linha.id,
        descricao: l.linha.descricao,
        total: totalLinha(l),
        totalComBase: (subtotalBase + totalLinha(l)) * fatorDesconto,
      })),
  }));
  const opcoesPorEscolher = grupos.some((g) => !g.escolhida);
  // "Desde": base com a opção mais barata de cada grupo ainda por escolher
  const totalReferencia =
    total +
    grupos
      .filter((g) => !g.escolhida)
      .reduce((s, g) => s + Math.min(...g.opcoes.map((x) => x.total)) * fatorDesconto, 0);

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
      minutosDesigner += r.setupDesignerMin + r.peca.designerMin * l.qtdFaturada;
      for (const [id, q] of Object.entries(r.peca.consumos)) consumos[id] = (consumos[id] ?? 0) + q * l.qtdFaturada;
      if (paramTecnica(params, r.aplicacao.tecnica).estimativa) usaEstimativas = true;
      if (r.maquinasIds.some((id) => params.maquinas.find((m) => m.id === id)?.estimativa)) usaEstimativas = true;
    }
  }
  for (const id of Object.keys(consumos)) {
    if (params.consumiveis.find((c) => c.id === id)?.estimativa) usaEstimativas = true;
  }

  const avisos: string[] = [];
  for (const l of linhasTodas) avisos.push(...l.avisos.map((t) => `${l.linha.descricao || "Linha"}: ${t}`));
  for (const g of grupos) {
    if (g.opcoes.length < 2) avisos.push(`O grupo de opções "${g.grupo}" só tem uma opção.`);
  }
  if (o.descontoPotencialPct > 0 && !o.descontoMotivo?.trim()) {
    avisos.push("Desconto por potencial sem motivo escrito.");
  }
  if (params.valorMinimoEncomenda > 0 && total > 0 && total < params.valorMinimoEncomenda) {
    avisos.push(`Abaixo do valor mínimo de encomenda (${params.valorMinimoEncomenda} €).`);
  }
  if (total > 0 && total < custo) avisos.push("O orçamento não cobre o custo.");

  return {
    linhas: linhasTodas,
    grupos,
    opcoesPorEscolher,
    totalReferencia,
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

/**
 * Total a mostrar em listas e painéis. Os orçamentos novos já calculam sobre os
 * totais fixados de cada linha; com opções por escolher, é o "desde" (base mais
 * a opção mais barata). Nos antigos, só há o total fixado.
 */
export function totalParaListas(o: Orcamento, r: ResultadoOrcamento): number {
  return o.congelado && !o.congelado.linhas && o.estado !== "rascunho" ? o.congelado.total : r.totalReferencia;
}

/**
 * Preço de uma linha noutras quantidades, para o cliente comparar (25 vs 50).
 * Recalcula o orçamento com a quantidade trocada, para os escalões, os lotes e
 * os mínimos contarem como contariam de verdade. É sempre ao preço de hoje.
 * Se a linha tem preço à mão, o desconto por quantidade aplica-se a esse
 * preço: 9,90 à mão sobre 10,50 sugeridos dá 9,90 × (sugerido a 50 / 10,50).
 */
export function precosPorQuantidade(
  params: Parametros,
  o: Orcamento,
  linhaId: string,
  quantidades: number[],
): { quantidade: number; precoUnit: number; total: number }[] {
  const sugeridoCom = (q?: number) => {
    const simulado: Orcamento = {
      ...o,
      estado: "rascunho",
      congelado: undefined,
      linhas: o.linhas.map((l) => (l.id === linhaId ? { ...l, quantidade: q ?? l.quantidade, precoUnitManual: undefined } : l)),
    };
    return calcularOrcamento(params, simulado).linhas.find((x) => x.linha.id === linhaId)!;
  };
  const manual = o.linhas.find((l) => l.id === linhaId)?.precoUnitManual;
  const base = manual != null && manual > 0 ? sugeridoCom().precoUnitSugerido : 0;
  const fator = base > 0 ? Math.max(manual! / base, 1 - (params.descontoMaximo ?? 0.05)) : 1;
  return quantidades
    .filter((q) => q > 0)
    .map((q) => {
      const l = sugeridoCom(q);
      // Com desconto em %, a simulação já o aplica a cada quantidade
      const precoUnit = fator === 1 ? l.precoUnit : Math.round(l.precoUnitSugerido * fator * 100) / 100;
      return { quantidade: l.qtdFaturada, precoUnit, total: precoUnit * l.qtdFaturada };
    });
}

/**
 * PVP sugerido para um parceiro que revende: o preço que paga à SOU (sem IVA)
 * com a margem de revenda dos parâmetros, mais IVA, arredondado a 0,10 € acima.
 */
export function pvpSugerido(params: Parametros, precoParceiro: number): number {
  const m = Math.min(0.95, Math.max(0, params.margemRevenda ?? 0.5));
  return precoParceiro > 0 ? Math.ceil((precoParceiro / (1 - m)) * (1 + params.iva) * 10) / 10 : 0;
}

// ── Custos por rubrica, para o resumo interno e a folha de obra ───────────

export interface CustosRubrica {
  artigos: number; // peças em branco
  consumiveis: number;
  maquinas: number; // amortização, manutenção e energia
  operador: number; // produção e preparação das máquinas
  designer: number; // preparação de artes, nomes e criação gráfica
  portes: number;
  total: number;
  // Consumíveis gastos, por id: quantidade (já com desperdício) e custo
  detalheConsumiveis: { id: string; nome: string; unidade: string; quantidade: number; custo: number }[];
}

/** Divide o custo das linhas que contam (r.linhas incluídas) pelas rubricas. Soma o mesmo que r.custo. */
export function custosPorRubrica(params: Parametros, r: ResultadoOrcamento): CustosRubrica {
  const cOp = custoHoraPessoa(params, "operador");
  const cDes = custoHoraPessoa(params, "designer");
  const c = { artigos: 0, consumiveis: 0, maquinas: 0, operador: 0, designer: r.custoCriacao, portes: 0 };
  for (const l of r.linhas.filter((x) => x.incluida)) {
    if (!l.linha.artigoDoCliente) c.artigos += l.linha.custoArtigo * l.qtdFaturada;
    c.portes += l.portes;
    for (const a of l.aplicacoes) {
      c.consumiveis += a.custoConsumiveis * l.qtdFaturada;
      c.maquinas += a.custoMaquina * l.qtdFaturada;
      c.operador += a.custoOperador * l.qtdFaturada + (a.setupOperadorMin / 60) * cOp;
      c.designer += a.custoDesigner * l.qtdFaturada + (a.setupDesignerMin / 60) * cDes;
    }
  }
  const detalheConsumiveis = Object.entries(r.consumos)
    .map(([id, quantidade]) => {
      const k = params.consumiveis.find((x) => x.id === id);
      return { id, nome: k?.nome ?? id, unidade: k?.unidade ?? "", quantidade, custo: quantidade * (k?.preco ?? 0) };
    })
    .sort((a, b) => b.custo - a.custo);
  return { ...c, total: c.artigos + c.consumiveis + c.maquinas + c.operador + c.designer + c.portes, detalheConsumiveis };
}
