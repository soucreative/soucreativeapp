import type { Artigo, Parametros } from "./types";

// Valores de partida. Os marcados com estimativa: true são de mercado ou palpite
// e devem ser substituídos pelos valores reais assim que existirem.
// Pessoas, horas e FSE vêm do SOU_Calculadora_v27.xlsx (folha Custo hora).

export const PARAMETROS_INICIAIS: Parametros = {
  versao: 2,
  empresa: {
    nome: "SOU Creative",
    nif: "",
    morada: "",
    email: "",
    telefone: "",
    site: "",
    condicoes:
      "Orçamento válido por 30 dias. Valores sem IVA salvo indicação em contrário.\n" +
      "Produção iniciada após aprovação da prova e adjudicação.\n" +
      "Prazo de entrega a combinar no momento da adjudicação.",
  },
  pessoas: [
    {
      id: "designer",
      nome: "Designer",
      modo: "colaboradores",
      valorMensal: 1300,
      meses: 14,
      encargosPct: 0.2475,
      subsidioAnual: 6 * 242,
      outrosAnual: 0,
      pctProducao: 1,
      precoVendaHora: 35,
    },
    {
      id: "operador",
      nome: "Operador de máquina",
      modo: "colaboradores",
      valorMensal: 1600,
      meses: 12,
      encargosPct: 0,
      subsidioAnual: 0,
      outrosAnual: 0,
      pctProducao: 1,
      precoVendaHora: 25,
    },
  ],
  horas: {
    horasSemana: 40,
    semanasAno: 52,
    diasFerias: 22,
    feriados: 13,
    horasFormacao: 40,
    absentismoPct: 0.04,
    produtividadePct: 0.8,
  },
  fse: [
    { id: "renda", nome: "Renda do armazém", mensal: 300, pctProducao: 1 },
    { id: "agua_luz", nome: "Água, luz e internet", mensal: 90, pctProducao: 1 },
    { id: "sede", nome: "Comparticipação do escritório sede", mensal: 900, pctProducao: 0.25 },
    { id: "contabilidade", nome: "Contabilidade e honorários", mensal: 200, pctProducao: 0.25 },
    { id: "limpeza", nome: "Limpeza", mensal: 200, pctProducao: 0.5 },
    { id: "material", nome: "Material de escritório e embalagem", mensal: 200, pctProducao: 0.5 },
    { id: "software", nome: "Software e licenças", mensal: 0, pctProducao: 1 },
    { id: "seguros", nome: "Seguros (não pessoal)", mensal: 0, pctProducao: 1 },
  ],
  maquinas: [
    {
      id: "gtx",
      nome: "Brother GTX Pro (DTG + DTF, estufa, prensa, pré-tratamento)",
      valor: 37000,
      vidaAnos: 5,
      manutencaoAnual: 1500,
      horasUsoAno: 600,
      energiaHora: 0.4,
      estimativa: true,
      nota: "Valor real. Vida útil, manutenção, horas de uso e energia por confirmar.",
    },
    {
      id: "melco",
      nome: "Melco 1 cabeça, 16 agulhas (com acessórios)",
      valor: 18000,
      vidaAnos: 5,
      manutencaoAnual: 500,
      horasUsoAno: 600,
      energiaHora: 0.03,
      estimativa: true,
      nota: "Valor real. Vida útil, manutenção, horas de uso e energia por confirmar.",
    },
    {
      id: "summit",
      nome: "Melco Summit 1 cabeça, 16 agulhas",
      valor: 16000,
      vidaAnos: 5,
      manutencaoAnual: 500,
      horasUsoAno: 600,
      energiaHora: 0.03,
      cabecas: 1,
      estimativa: true,
      nota: "Valor de compra por confirmar: 16 000 € é estimativa.",
    },
    {
      id: "sawgrass",
      nome: "Sawgrass A3 + prensas",
      valor: 2000,
      vidaAnos: 3,
      manutencaoAnual: 100,
      horasUsoAno: 300,
      energiaHora: 0.3,
      estimativa: true,
      nota: "Valor real. Vida útil, manutenção, horas de uso e energia por confirmar.",
    },
    {
      id: "cricut",
      nome: "Cricut",
      valor: 450,
      vidaAnos: 3,
      manutencaoAnual: 50,
      horasUsoAno: 200,
      energiaHora: 0.05,
      estimativa: true,
      nota: "Valor de compra desconhecido: 450 € é palpite.",
    },
  ],
  consumiveis: [
    // GTX e sublimação: folhas de custos da SOU (out 2026)
    { id: "gtx_cmyk", nome: "Tinta GTX CMYK", unidade: "ml", preco: 0.322, maquinaId: "gtx", estimativa: false, nota: "225,40 € por 0,7 L" },
    { id: "gtx_branco", nome: "Tinta GTX branco", unidade: "ml", preco: 0.2654, maquinaId: "gtx", estimativa: false, nota: "371,50 € por 1,4 L" },
    { id: "dtg_pretrat", nome: "Líquido de pré-tratamento", unidade: "ml", preco: 0.016, maquinaId: "gtx", estimativa: false, nota: "16 € por litro" },
    { id: "gtx_manutencao", nome: "Kit de manutenção GTX", unidade: "un", preco: 0.0132, maquinaId: "gtx", estimativa: false, nota: "330 € a cada 25 000 impressões" },
    { id: "dtf_filme", nome: "Filme DTF", unidade: "cm²", preco: 0.0004, maquinaId: "gtx", estimativa: true },
    { id: "dtf_po", nome: "Pó adesivo DTF", unidade: "g", preco: 0.015, maquinaId: "gtx", estimativa: true },
    { id: "sub_tinta", nome: "Tinta Sawgrass", unidade: "ml", preco: 1.6129, maquinaId: "sawgrass", estimativa: false, nota: "50 € por tinteiro de 31 ml" },
    { id: "sub_papel", nome: "Papel de sublimação", unidade: "cm²", preco: 0.000218, maquinaId: "sawgrass", estimativa: false, nota: "13,60 € por 100 folhas A4" },
    { id: "sub_fita", nome: "Fita térmica", unidade: "un", preco: 0.02, maquinaId: "sawgrass", estimativa: true },
    { id: "bord_linha", nome: "Linha de bordar (agulha + bobina)", unidade: "m", preco: 0.0014, maquinaId: "melco", estimativa: true },
    { id: "bord_entretela", nome: "Entretela", unidade: "cm²", preco: 0.0004, maquinaId: "melco", estimativa: true },
    { id: "cricut_vinil", nome: "Vinil têxtil (HTV)", unidade: "cm²", preco: 0.0022, maquinaId: "cricut", estimativa: true },
  ],
  tecnicas: [
    {
      tecnica: "dtg",
      maquinaId: "gtx",
      setupDesignerMin: 30,
      setupOperadorMin: 15,
      manuseamentoMin: 2,
      desperdicioPct: 0.1,
      minimoPorPeca: 3,
      areaMaxCm: [40, 50],
      k: {
        cmykMlCm2: 0.005, // ml por cm² a 100% de cobertura
        brancoMlCm2: 0.015, // só em peça escura
        pretratMlCm2: 0.03, // só em peça escura
        impressaoMinA4Clara: 1.2,
        impressaoMinA4Escura: 3,
        curaMin: 1.5,
        pretratOperadorMin: 1.5,
      },
      estimativa: true,
    },
    {
      tecnica: "dtf",
      maquinaId: "gtx",
      setupDesignerMin: 30,
      setupOperadorMin: 20,
      manuseamentoMin: 2,
      desperdicioPct: 0.1,
      minimoPorPeca: 2.5,
      areaMaxCm: [40, 50],
      k: {
        cmykMlCm2: 0.005,
        brancoMlCm2: 0.012, // o DTF leva sempre camada branca
        filmeFator: 1.3, // filme gasto por cm² de desenho, com margens e encaixe
        poGCm2: 0.008,
        impressaoMinA4: 2,
        curaMin: 0.5,
        prensaMin: 0.5,
      },
      estimativa: true,
    },
    {
      tecnica: "sublimacao",
      maquinaId: "sawgrass",
      setupDesignerMin: 30,
      setupOperadorMin: 10,
      manuseamentoMin: 1.5,
      desperdicioPct: 0.1,
      minimoPorPeca: 2,
      areaMaxCm: [29.7, 42],
      k: {
        tintaMlCm2: 0.00025, // 0,157 ml num A4 (folha de custos da SOU)
        papelFator: 1, // o papel gasta-se à folha: A5 = meia folha A4
        impressaoMinA4: 1,
        prensaMinTexteis: 1,
        prensaMinCaneca: 3.5,
        prensaMinRigido: 1.5,
      },
      estimativa: true,
    },
    {
      tecnica: "bordado",
      maquinaId: "melco",
      maquinasIds: ["melco", "summit"],
      setupDesignerMin: 0, // a digitalização vem da complexidade
      setupOperadorMin: 20,
      manuseamentoMin: 2,
      desperdicioPct: 0.05,
      minimoPorPeca: 3,
      areaMaxCm: [30, 40],
      k: {
        pontosMinuto: 700, // velocidade efectiva, não a máxima da máquina
        trocaCorMin: 0.15,
        linhaMPor1000: 6,
        entretelaFator: 1.5,
        pontosPorCm2: 180, // para estimar quando ainda não há ficheiro
        atencaoOperadorPct: 0.5, // fatia do tempo de máquina em que o operador está preso
        paraleloAPartirDe: 10, // a partir de quantas peças o automático usa as duas máquinas
      },
      estimativa: true,
    },
    {
      tecnica: "cricut",
      maquinaId: "cricut",
      setupDesignerMin: 20,
      setupOperadorMin: 10,
      manuseamentoMin: 1,
      desperdicioPct: 0.1,
      minimoPorPeca: 2,
      areaMaxCm: [30, 60],
      k: {
        vinilFator: 1.3,
        corteMinPor100cm2: 0.5,
        descasqueMinSimples: 1,
        descasqueMinMedio: 2.5,
        descasqueMinComplexo: 5,
        prensaMin: 0.5,
      },
      estimativa: true,
    },
  ],
  tiposCliente: [
    {
      id: "particular",
      nome: "Particular",
      margemProduto: 0.55,
      margemPersonalizacao: 0.6,
      fatorHora: 1.1,
      nota: "Custo de atendimento alto por euro faturado.",
    },
    {
      id: "empresa",
      nome: "Empresa",
      margemProduto: 0.4,
      margemPersonalizacao: 0.5,
      fatorHora: 1,
      nota: "Referência.",
    },
    {
      id: "parceiro",
      nome: "Parceiro recorrente",
      margemProduto: 0.4,
      margemPersonalizacao: 0.4,
      fatorHora: 1,
      nota: "Margem mais baixa em troca de arte pronta, produtos de catálogo e mínimo de encomenda.",
    },
  ],
  escaloes: [
    { ate: 5, nome: "1–5", descontoPersonalizacao: 0 },
    { ate: 14, nome: "6–14", descontoPersonalizacao: 0 },
    { ate: 49, nome: "15–49", descontoPersonalizacao: 0.05 },
    { ate: 149, nome: "50–149", descontoPersonalizacao: 0.1 },
    { ate: 300, nome: "150–300", descontoPersonalizacao: 0.15 },
  ],
  limiteSubcontratar: 300,
  // Valores das células do v27 (o texto da folha Regras dizia 65/60/55%).
  setups: {
    completo: 1,
    arte_cliente: 0.6,
    parcial: 0.55,
    arte_cliente_preparado: 0.5,
    repeticao: 0.25,
  },
  complexidadeBordado: { simples: 45, medio: 75, complexo: 120 },
  valorMinimoEncomenda: 0,
  capacidade: { horasDiaMaquina: 7, horasDiaPessoa: 7 },
  // Preparar e verificar cada nome; posicionar e trocar o ficheiro na máquina
  nomes: { designerMin: 1, operadorMin: 0.5 },
  // Peças que se personalizam; ficam de fora consignações, criadores e loja
  tocFamiliasArtigos: [
    "T-shirts", "T-shirts manga comprida", "Sweatshirts", "Pólos", "Camisas", "Casacos", "Casacos de malha",
    "Pullover", "Calças", "Vestuário", "Bonés e Chapéus", "Tote Bags e Sacos", "Necessaires e bolsas",
    "Cerâmicas", "Garrafas", "Copos", "Agendas e Notebooks", "Bebé e Criança",
  ],
  iva: 0.23,
  validadeDias: 30,
};

export const ARTIGOS_INICIAIS: Artigo[] = [
  { id: "a-k3008", nome: "T-shirt Top Tex K3008 oversized 220g algodão", categoria: "T-shirt", fornecedor: "Top Tex", custo: 5.36, minimo: 1, portes: 5 },
  { id: "a-by102", nome: "T-shirt Top Tex BY102 oversized 240g algodão", categoria: "T-shirt", fornecedor: "Top Tex", custo: 5.39, minimo: 1, portes: 5 },
  { id: "a-sols3996", nome: "T-shirt SOL'S Legacy 3996 oversized algodão reciclado", categoria: "T-shirt", fornecedor: "Sologroup Portugal", custo: 5.2, minimo: 1, portes: 5 },
  { id: "a-ns308", nome: "Sweat Top Tex NS308 300g French Terry eco", categoria: "Sweat", fornecedor: "Top Tex", custo: 11.67, minimo: 1, portes: 5 },
  { id: "a-tshirt-base", nome: "T-shirt básica", categoria: "T-shirt", fornecedor: "", custo: 2, minimo: 1, portes: 5 },
  { id: "a-bondi", nome: "Tote Bondi cru 140g algodão", categoria: "Tote bag", fornecedor: "Stock interno", custo: 0.78, minimo: 1, portes: 0 },
  { id: "a-arm001", nome: "Tote ARM001 310g algodão reciclado", categoria: "Tote bag", fornecedor: "Stock interno", custo: 1.11, minimo: 1, portes: 0 },
  { id: "a-caneca", nome: "Caneca cerâmica AAA+ 325ml sublimação", categoria: "Caneca", fornecedor: "Stock interno", custo: 1.26, minimo: 1, portes: 0 },
  { id: "a-caneca-madeira", nome: "Caneca cerâmica com asa de madeira 325ml", categoria: "Caneca", fornecedor: "Stock interno", custo: 2.33, minimo: 1, portes: 0 },
];

/**
 * Junta os parâmetros gravados aos de partida. O que foi gravado ganha sempre;
 * do lado dos de partida só entra o que ainda não existia (uma máquina nova,
 * um coeficiente novo de uma técnica), para as alterações feitas à mão nunca
 * se perderem quando a app ganha um parâmetro.
 */
export function completarParametros(guardado: Partial<Parametros>): Parametros {
  const base = structuredClone(PARAMETROS_INICIAIS);
  // Versão 2: as pessoas passam a contar a partir dos colaboradores registados.
  // Os valores manuais ficam guardados como alternativa.
  if ((guardado.versao ?? 1) < 2 && guardado.pessoas) {
    guardado = { ...guardado, versao: 2, pessoas: guardado.pessoas.map((p) => ({ ...p, modo: "colaboradores" as const })) };
  }
  const juntarPorId = <T extends { id: string }>(g: T[] | undefined, b: T[]) =>
    g ? [...g, ...b.filter((x) => !g.some((y) => y.id === x.id))] : b;
  return {
    ...base,
    ...guardado,
    empresa: { ...base.empresa, ...guardado.empresa },
    maquinas: juntarPorId(guardado.maquinas, base.maquinas),
    consumiveis: juntarPorId(guardado.consumiveis, base.consumiveis),
    tecnicas: base.tecnicas.map((b) => {
      const g = guardado.tecnicas?.find((t) => t.tecnica === b.tecnica);
      return g ? { ...b, ...g, maquinasIds: g.maquinasIds ?? b.maquinasIds, k: { ...b.k, ...g.k } } : b;
    }),
  };
}
