// Modelo de dados da calculadora. Tudo o que é número de negócio vive em
// Parametros, para se poder corrigir sem tocar no código.

export type Tecnica = "bordado" | "dtg" | "dtf" | "sublimacao" | "cricut";

export type TipoCliente = "particular" | "empresa" | "parceiro";

// Cancelado: em vez de apagar, para a numeração não ter buracos
export type EstadoOrcamento = "rascunho" | "enviado" | "ganho" | "perdido" | "cancelado";

// Depois de ganho, o trabalho passa pela produção até ser entregue
export type EtapaProducao = "por_iniciar" | "em_producao" | "pronto" | "entregue";

export interface Producao {
  etapa: EtapaProducao;
  ordem: number; // prioridade dentro da etapa: menor primeiro
  prazo?: string; // data prometida ao cliente (AAAA-MM-DD)
  responsavelId?: string;
  notas?: string;
  iniciadoEm?: string;
  prontoEm?: string;
  entregueEm?: string;
}

export type TipoSetup =
  | "completo"
  | "arte_cliente"
  | "parcial"
  | "arte_cliente_preparado"
  | "repeticao";

// ── Parâmetros ────────────────────────────────────────────────────────────

export interface Pessoa {
  id: "designer" | "operador";
  nome: string;
  // "colaboradores": soma o custo dos colaboradores registados no departamento
  //   da função (Design → designer, Produção → operador). É o normal.
  // "ordenado": ordenado base x meses x (1 + encargos) + subsídio + outros.
  // "custo_total": o valor mensal já é tudo o que a empresa paga.
  modo: "colaboradores" | "ordenado" | "custo_total";
  // Preenchido pelo servidor a partir de Colaboradores e Remuneração; não se edita.
  registo?: RegistoPessoas;
  valorMensal: number;
  meses: number;
  encargosPct: number; // TSU patronal + seguro
  subsidioAnual: number;
  outrosAnual: number;
  pctProducao: number; // fatia do tempo afecta à produção
  precoVendaHora: number;
}

export interface RegistoPessoas {
  departamento: string;
  custoAnual: number; // próximos 12 meses, ao salário atual
  fte: number; // tempo inteiro equivalente
  pessoas: { nome: string; custoAnual: number; fte: number }[];
}

export interface Horas {
  horasSemana: number;
  semanasAno: number;
  diasFerias: number;
  feriados: number;
  horasFormacao: number;
  absentismoPct: number;
  produtividadePct: number;
}

export interface RubricaFSE {
  id: string;
  nome: string;
  mensal: number;
  pctProducao: number;
}

export interface Maquina {
  id: string;
  nome: string;
  valor: number;
  vidaAnos: number;
  manutencaoAnual: number;
  horasUsoAno: number;
  energiaHora: number;
  cabecas?: number;
  estimativa: boolean;
  nota?: string;
}

export interface Consumivel {
  id: string;
  nome: string;
  unidade: "ml" | "cm²" | "g" | "m" | "un";
  preco: number; // € por unidade
  maquinaId: string;
  estimativa: boolean;
  stock?: number;
  stockMinimo?: number;
  nota?: string;
}

export interface ParamTecnica {
  tecnica: Tecnica;
  maquinaId: string;
  // Máquinas que fazem esta técnica e podem trabalhar em paralelo no mesmo
  // projeto. A primeira é a principal; vazio = só maquinaId.
  maquinasIds?: string[];
  // Setup completo: preparação de arte (designer) + preparação técnica (operador).
  setupDesignerMin: number;
  setupOperadorMin: number;
  manuseamentoMin: number; // operador por peça: carregar, posicionar, prensar
  desperdicioPct: number;
  minimoPorPeca: number; // preço mínimo da aplicação por peça (venda)
  areaMaxCm: [number, number]; // largura x altura máximas
  // Coeficientes de consumo e tempo. O significado de cada um está em engine.ts.
  k: Record<string, number>;
  estimativa: boolean;
}

export interface ParamTipoCliente {
  id: TipoCliente;
  nome: string;
  margemProduto: number;
  margemPersonalizacao: number;
  fatorHora: number;
  nota: string;
}

export interface Escalao {
  ate: number; // inclusive; o último é o limite antes de subcontratar
  nome: string;
  descontoPersonalizacao: number;
}

export interface DadosEmpresa {
  nome: string;
  nif: string;
  morada: string;
  email: string;
  telefone: string;
  site: string;
  rodape?: string; // entidade legal, no rodapé do orçamento
  condicoes: string; // texto que sai no fim de cada orçamento
  // Só sai nos orçamentos com algum artigo fornecido pelo cliente
  condicoesPecasCliente?: string;
}

export interface Parametros {
  versao: number;
  empresa: DadosEmpresa;
  pessoas: Pessoa[];
  horas: Horas;
  fse: RubricaFSE[];
  maquinas: Maquina[];
  consumiveis: Consumivel[];
  tecnicas: ParamTecnica[];
  tiposCliente: ParamTipoCliente[];
  escaloes: Escalao[];
  limiteSubcontratar: number;
  setups: Record<TipoSetup, number>;
  complexidadeBordado: Record<"simples" | "medio" | "complexo", number>; // min de digitalização
  valorMinimoEncomenda: number;
  // Abaixo desta margem, um desconto é arriscado; abaixo de 0 dá prejuízo
  margemSegura?: number;
  // Desconto máximo do preço praticado sobre o sugerido (para cima não há limite)
  descontoMaximo?: number;
  // Correções ao agrupamento automático de variantes, por id de artigo
  ajustesVariantes?: Record<string, AjusteVariante>;
  // Famílias de produtos do TOC que entram no catálogo de artigos (nomes)
  tocFamiliasArtigos?: string[];
  tocUltimaSincronizacao?: string;
  // Minutos a mais por peça quando cada peça leva um nome diferente
  nomes?: { designerMin: number; operadorMin: number };
  // Horas de trabalho por dia útil, para o pipeline calcular datas previstas
  capacidade: { horasDiaMaquina: number; horasDiaPessoa: number };
  iva: number;
  validadeDias: number;
}

// ── Catálogo, clientes e orçamentos ───────────────────────────────────────

export interface Artigo {
  id: string;
  nome: string;
  categoria: string;
  fornecedor: string;
  custo: number;
  minimo: number;
  portes: number;
  nota?: string;
  // URL pública da imagem (armazenamento "artigos"); vem do servidor, não se edita
  imagem?: string;
}

// Correção manual de um artigo no agrupamento de variantes.
// modelo: nome do modelo onde entra; null = fica sozinho, fora de qualquer modelo.
export interface AjusteVariante {
  modelo?: string | null;
  cor?: string;
  tamanho?: string;
}

export interface Cliente {
  id: string;
  nome: string;
  tipo: TipoCliente;
  nif?: string;
  email?: string;
  telefone?: string;
  notas?: string;
  criadoEm: string;
}

export interface Aplicacao {
  id: string;
  tecnica: Tecnica;
  posicao: string;
  // DTG, DTF, sublimação e Cricut
  larguraCm?: number;
  alturaCm?: number;
  coberturaPct?: number;
  pecaEscura?: boolean; // DTG
  suporte?: "texteis" | "caneca" | "rigido"; // sublimação
  complexidadeCorte?: "simples" | "medio" | "complexo"; // Cricut
  // Bordado
  pontos?: number;
  cores?: number;
  complexidade?: "simples" | "medio" | "complexo";
  // Quantas máquinas bordam este trabalho ao mesmo tempo. Vazio = automático.
  maquinasParalelo?: number;
  // Cada peça leva um texto diferente (nomes, números): trabalho a mais por peça
  nomesIndividuais?: boolean;
  // Setup: as três perguntas
  jaProduzido: boolean;
  arteCliente: boolean;
  suporteConfigurado: boolean;
}

export interface LinhaOrcamento {
  id: string;
  artigoId?: string;
  descricao: string;
  custoArtigo: number; // copiado do catálogo, editável
  minimoArtigo: number;
  portes: number;
  fornecedor: string;
  quantidade: number;
  artigoDoCliente: boolean; // o cliente traz a peça
  aplicacoes: Aplicacao[];
  precoUnitManual?: number;
  // Em alternativa ao preço à mão: desconto sobre o sugerido (0,05 = 5%).
  // Fica em percentagem, para acompanhar o sugerido se a quantidade mudar.
  descontoPct?: number;
  // Linhas com o mesmo lote são o mesmo trabalho em variantes (cores, tamanhos):
  // somam as quantidades para o escalão e pagam o setup uma vez.
  lote?: string;
  // Peças já encomendadas deste trabalho noutras encomendas: contam para o escalão
  pecasAnteriores?: number;
  // Outras quantidades a mostrar ao cliente, com o preço de cada uma
  quantidadesAlternativas?: number[];
  // Linhas com o mesmo grupo são alternativas: o cliente escolhe uma.
  // Vazio = linha normal, que conta sempre.
  grupoOpcao?: string;
  // Modelo com variantes: a quantidade reparte-se por cores e tamanhos. A
  // quantidade e o custo da linha são a soma e a média ponderada da grelha.
  modeloId?: string;
  grelha?: { artigoId: string; quantidade: number }[];
}

export interface Orcamento {
  id: string;
  numero: string;
  clienteId?: string;
  tipoCliente: TipoCliente;
  titulo: string;
  data: string;
  estado: EstadoOrcamento;
  motivoPerda?: string;
  // Cancelamento: porquê, quando e em que estado estava (para o poder reativar)
  motivoCancelamento?: string;
  canceladoEm?: string;
  estadoAntesCancelar?: EstadoOrcamento;
  horasCriacao: number;
  descontoPotencialPct: number;
  descontoMotivo?: string;
  notas?: string;
  linhas: LinhaOrcamento[];
  // Fotografia do cálculo quando sai de rascunho: um orçamento enviado
  // não pode mudar de preço porque alguém mexeu nos parâmetros.
  congelado?: {
    total: number;
    totalComIva: number;
    margem: number;
    em: string;
    // Total de cada linha no momento do envio: o documento e as opções usam
    // estes valores, para o preço não mudar depois de o cliente o receber
    linhas?: Record<string, number>;
    // Total sugerido de cada linha no envio: o desconto mostrado não muda depois
    sugeridos?: Record<string, number>;
  };
  // Opção escolhida pelo cliente em cada grupo (grupo → id da linha)
  opcaoEscolhida?: Record<string, string>;
  // Quando a produção termina, o consumo estimado sai do stock.
  produzidoEm?: string;
  producao?: Producao;
  atualizadoEm: string;
}
