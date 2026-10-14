# DEVLOG — SOU Creative
> Última atualização: 2026-10-14 (noite)
> Pipeline de desenvolvimento — o que está feito, em curso e por fazer. As ideias da equipa vivem no quadro "Ideias e melhorias", acima.

---

## ✅ CONCLUÍDO

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

### Por decidir
- [ ] Classificar as 35 contas de despesa do TOC (proposta num Google Doc)
- [ ] Template do documento de orçamento: que formato e como se usa
- [ ] Valor de compra da Melco Summit

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
