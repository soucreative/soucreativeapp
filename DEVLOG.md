# DEVLOG — SOU Creative
> Última atualização: 2026-10-16
> Pipeline de desenvolvimento — o que está feito, em curso e por fazer. As ideias da equipa vivem no quadro "Ideias e melhorias", acima.

---

## ✅ CONCLUÍDO

### Folha de obra e custos por rubrica *(2026-10-16)*

- Resumo do orçamento mostra de onde vem o custo (artigos, consumíveis, máquinas, operador, designer, portes) em € e % da venda, e a margem em €.
- Nova Folha de obra (uso interno, imprimível): resumo económico, produção por artigo com os códigos do TOC por cor/tamanho, técnicas, máquinas e tempos, consumíveis previstos, linhas para faturação e lista de controlo (aceite, pagamento, maquete, encomenda, produção, entrega, fatura).

### Variantes de cor e tamanho, descontos e preços por quantidade *(2026-10-16)*

- Artigos do TOC agrupados em modelos pelo código (Família-Modelo-Tamanho-Cor_Fornecedor; nos códigos de 8 dígitos, 5 de modelo + 3 de cor). 325 dos 574 artigos ficam em 57 modelos.
- No orçamento escolhe-se o modelo e reparte-se a quantidade numa grelha cores × tamanhos; a quantidade é a soma e o custo a média ponderada. O PDF mostra a repartição.
- Página Artigos → "Modelos com variantes" para corrigir cor, tamanho, nome ou tirar um artigo do modelo; as correções ficam nos parâmetros e sobrevivem às sincronizações.
- Preço praticado: até 5% abaixo do sugerido (parâmetro), sem limite para cima; alerta de margem segura / arriscada / prejuízo; desconto visível no PDF.
- Preço noutras quantidades ("Mostrar também para") e total com cada opção no fim do documento; rodapé com a entidade legal.

### Pipeline, artigos do TOC e equipa *(2026-10-14)*
- [x] Pipeline de produção: por iniciar, em produção, pronto, entregue; prazo prometido, responsável, notas e prioridade por trabalho
- [x] Data prevista de cada trabalho pela carga de cada máquina e da equipa, em dias úteis; aviso quando passa o prazo prometido
- [x] "Que prazo posso dar?" para um orçamento ainda não ganho; arquivo dos entregues com prazo cumprido ou atrasado
- [x] Artigos sincronizados com o TOC Online (produtos e famílias): 561 artigos de 18 famílias de peças
- [x] Custo de designer e operador a partir dos colaboradores registados em Design e Produção
- [x] Segunda máquina de bordar (Melco Summit) e bordado em 1 ou 2 máquinas em paralelo
- [x] Calculadora com painel fixo e técnicas que abrem e fecham
- [x] Botão Gravar alterações com estado em todas as páginas da produção; aviso de gravação na tabela de colaboradores
- [x] TOC ligado (servidor 30, regresso pelo Postman); login com Google; emails pelo Google Workspace da SOU

### Base da app — cópia da app de RH da Descomunal *(2026-10-14)*
A SOU parte do código da app de RH da Descomunal, sem o histórico e com Supabase, GitHub e Vercel próprios.
- [x] Ficam: Colaboradores, Remuneração, Férias e faltas, Objetivos, Avaliações, Produtividade, Financeiro (TOC), Orçamento anual, Dados, Devlog
- [x] Saem: Eventos, Comercial, Projetos, Sprint, Contratos (página), Fornecedores e toda a ligação ao ClickUp
- [x] Marca SOU: verde, beige e mostarda do manual de normas; Spalla nos títulos e Lexend Deca no texto
- [x] Centros de custo provisórios: Produção, Design, Gestão e Outros
- [x] Schema consolidado num único ficheiro, `supabase/sou-schema.sql`

### Calculadora de orçamentos de produção *(2026-10-14)*
Parte do `SOU_Calculadora_v27.xlsx` e corrige o que nele não batia certo.
- [x] Um orçamento é uma lista de artigos, e cada artigo leva uma ou mais técnicas: bordado (Melco), DTG e DTF (Brother GTX Pro), sublimação (Sawgrass) e vinil (Cricut)
- [x] O preço resulta de quatro partes: peça em branco com margem de produto, consumível e máquina com margem de personalização, mão de obra ao preço/hora e setup por aplicação
- [x] DTG, DTF e sublimação calculados por cm², com uma parte fixa por peça; a tabela A8 a A3 é calculada e não escrita à mão
- [x] Bordado calculado por pontos, cores e velocidade efetiva, com digitalização simples, média ou complexa
- [x] Duas escolhas separadas: a quantidade define o escalão; o tipo de cliente (Particular, Empresa, Parceiro recorrente) define a margem
- [x] Desconto por potencial do cliente com motivo obrigatório
- [x] Setup em cinco tipos, decididos por três perguntas, como no v27
- [x] Custo por hora de cada máquina a partir do valor real de compra, e tarifa de aluguer sugerida
- [x] Estados: rascunho, enviado, ganho e perdido (com motivo). O preço fica fixo quando o orçamento é enviado
- [x] Documento para o cliente com a marca SOU, pronto a guardar em PDF (e a importar no Canva)
- [x] Histórico por cliente: pedidos, ganhos, perdidos, conversão e motivos de perda
- [x] Consumíveis com stock, stock mínimo e consumo reservado pelos orçamentos ganhos; o stock desce quando a produção é marcada como feita
- [x] Painel de produção: carga por produzir por máquina, alertas de stock e orçamentos sem resposta

### Registo de horas *(2026-10-14)*
- [x] A SOU não usa ClickUp: as horas registam-se na app, de preferência ligadas ao orçamento
- [x] Alimenta a Produtividade (horas trabalhadas e faturáveis) e o custo/hora do Financeiro

---

## 🔵 EM CURSO

### Artigos do TOC: simplificar nomes e variantes
A app junta as cores e os tamanhos do mesmo artigo num modelo, a partir do código e do nome do TOC (325 dos 574 artigos em 57 modelos). Onde os nomes estão escritos de formas diferentes, o agrupamento baralha-se: **Fruit of the Loom** (a cor sai como "T-shirt branca", "Tshirt preta 190g"), **Gildan 2000** ("Branca" e "Branco" como cores diferentes), **T-shirt vermelha** e **T-shirt 11380** (parte do nome do modelo, "Tsra150" e "Regent", sai como cor). Hoje corrige-se à mão em Artigos → Modelos com variantes.

**Ver como simplificar:**
- [ ] Combinar uma regra única para criar artigos no TOC: código  e nome  (ex.:  · "T-shirt K380 mulher, branca, tamanho M"). Com a regra cumprida, a app agrupa sem correções
- [ ] Rever no TOC os nomes dos modelos baralhados acima, em vez de os corrigir na app
- [ ] Ver se o TOC Online permite artigos com variantes (um artigo, várias cores/tamanhos) ou se fica um código por variante

**Ver como gerir:**
- [ ] Definir quem cria os artigos no TOC e seguir a regra (uma lista de verificação curta)
- [ ] Depois de cada sincronização, a app assinala os artigos novos que não entraram em nenhum modelo ou ficaram sem cor/tamanho, para rever logo
- [ ] Decidir se as correções feitas na app voltam ao TOC (corrigir lá o nome) ou se ficam só na app

### Documento do orçamento e templates
O documento que vai para o cliente já sai da app, com a marca SOU. Falta adaptá-lo ao modelo que a SOU usa hoje.

**Já existe** (Produção → Orçamentos → Documento / PDF):
- [x] Logótipo, cores e fontes do manual de normas; dados da empresa e condições editáveis em Parâmetros
- [x] Uma linha por artigo, com as técnicas, a posição e as medidas; preço por peça e total
- [x] Criação gráfica, desconto por potencial, IVA e total; notas do orçamento
- [x] Validade calculada a partir da data (30 dias por omissão)
- [x] Depois de enviado, o documento mostra sempre o preço fixado
- [x] Guardar como PDF pelo browser; o PDF importa-se no Canva para propostas especiais

**A seguir:**
- [ ] Receber da SOU o template atual: um orçamento real em PDF, tal como o cliente o recebe, e o ficheiro original (link do Canva, .docx, .ai ou .indd)
- [ ] Refazer o documento da app a partir desse template: estrutura, secções, textos fixos e aspeto
- [ ] Decidir se o documento precisa de imagens dos artigos ou de mockups
- [ ] Decidir se há modelos diferentes por tipo de cliente (particular, empresa, parceiro) ou por tipo de trabalho

O preenchimento automático de um modelo do Canva por API exige Canva Enterprise. Sem isso, o caminho é a app gerar o documento com o aspeto do template.

### Por decidir
- [ ] Classificar as 35 contas de despesa do TOC (proposta num Google Doc; à espera da resposta da contabilidade)

### Substituir as estimativas por valores reais
- [ ] Preço de compra da tinta, do filme, do pó, do papel, da linha, da entretela e do vinil
- [ ] Consumo por cm² e tempos de máquina, cronometrados na produção
- [ ] Vida útil das máquinas, como está nas contas de 2025; manutenção anual; horas de uso
- [ ] Valor de compra da Cricut

---

## 🚫 BLOQUEADO

| Item | Bloqueio |
|---|---|
| Centros de custo definitivos | Decidir como a SOU quer repartir custos e receita |
| Artigos e vendas do TOC | A API só dá documentos comerciais: os artigos PER… vêm das linhas das faturas e têm de ser mapeados |
| Impressão 3D (Bambu) e laser | Ficam para depois das cinco técnicas atuais |
