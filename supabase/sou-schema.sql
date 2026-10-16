-- ============================================================
-- SOU CREATIVE — schema completo do Supabase
--
-- Corre uma vez, numa base de dados nova, no SQL Editor do Supabase.
--
-- Junta num só ficheiro o que a app de origem tinha espalhado por vários,
-- acrescenta o que lá faltava (tabelas e colunas que o código usa mas que não
-- estavam em nenhum .sql) e as tabelas novas da Produção.
--
-- Segurança: a app lê e escreve sempre com a chave de serviço, depois de
-- verificar o papel de quem pede (src/lib/auth.ts). Todas as tabelas ficam
-- com RLS ligado e sem políticas, o que fecha a chave pública por completo.
--
-- Centros de custo: Produção, Design, Gestão, Outros (src/lib/departments.ts).
-- Ao mudar essa lista, mudar também os CHECK marcados "centros".
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Enums ───────────────────────────────────────────────────

CREATE TYPE work_regime      AS ENUM ('full_time', 'part_time');
CREATE TYPE employee_status  AS ENUM ('active', 'inactive', 'on_leave');
CREATE TYPE contract_type    AS ENUM ('permanent', 'fixed_term', 'internship', 'service_agreement');
CREATE TYPE contract_status  AS ENUM ('active', 'terminated', 'expired');
CREATE TYPE variable_model   AS ENUM ('1', '2', '3');
CREATE TYPE objective_type   AS ENUM ('individual', 'team', 'department');
CREATE TYPE objective_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
CREATE TYPE review_status    AS ENUM ('draft', 'submitted', 'approved');
CREATE TYPE payment_status   AS ENUM ('pending', 'paid', 'overdue');
CREATE TYPE user_role        AS ENUM ('master', 'admin', 'management', 'director', 'employee', 'intern');

-- ── updated_at automático ───────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PESSOAS
-- ============================================================

CREATE TABLE employees (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  -- Opcional: nem toda a gente entra na app. Vazio tem de ir a NULL, senão
  -- colide no índice único.
  email            TEXT UNIQUE,
  phone            TEXT,
  role             TEXT NOT NULL,
  department       TEXT,
  position_type    TEXT NOT NULL DEFAULT 'employee'
                     CHECK (position_type IN ('director', 'employee', 'professional_intern',
                                              'curricular_intern', 'management', 'outsourcing')),
  app_role         user_role NOT NULL DEFAULT 'employee',
  status           employee_status NOT NULL DEFAULT 'active',
  work_regime      work_regime NOT NULL DEFAULT 'full_time',
  days_per_week    NUMERIC(3,1) CHECK (days_per_week > 0 AND days_per_week <= 5),
  start_date       DATE NOT NULL,
  end_date         DATE,
  notes            TEXT,
  -- % produtiva definida à mão; a medida vem do registo de horas
  utilization_pct  NUMERIC(5,4),
  -- Quanto do tempo de alguém de estrutura entra no centro "Outros"
  outros_pct       INTEGER DEFAULT 0 CHECK (outros_pct >= 0 AND outros_pct <= 100),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE contracts (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id    UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  contract_type  contract_type NOT NULL,
  start_date     DATE NOT NULL,
  end_date       DATE,
  status         contract_status NOT NULL DEFAULT 'active',
  document_url   TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE compensation (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  base_salary     NUMERIC(10,2) NOT NULL CHECK (base_salary >= 0),
  variable_model  variable_model,
  effective_date  DATE NOT NULL,
  end_date        DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE variable_rules (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id          UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  model                variable_model NOT NULL,
  max_variable_amount  NUMERIC(10,2),
  rule_data            JSONB NOT NULL DEFAULT '{}',
  effective_date       DATE NOT NULL,
  end_date             DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE employee_tax_info (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id             UUID NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  nif                     TEXT,
  niss                    TEXT,
  date_of_birth           DATE,
  address                 TEXT,
  city                    TEXT,
  postal_code             TEXT,
  iban                    TEXT,
  marital_status          TEXT NOT NULL DEFAULT 'single'
                            CHECK (marital_status IN ('single', 'married_two_earners', 'married_single_earner')),
  dependents_count        INT NOT NULL DEFAULT 0 CHECK (dependents_count >= 0),
  is_disabled             BOOLEAN NOT NULL DEFAULT FALSE,
  social_security_rate    NUMERIC(5,4) NOT NULL DEFAULT 0.11,
  meal_allowance_daily    NUMERIC(6,2) DEFAULT 9.60,
  meal_allowance_type     TEXT NOT NULL DEFAULT 'card' CHECK (meal_allowance_type IN ('card', 'cash')),
  working_days_per_month  INT NOT NULL DEFAULT 22,
  -- 'none' = sem subsídios de férias e Natal (estágio profissional)
  subsidy_payment_mode    TEXT NOT NULL DEFAULT 'full' CHECK (subsidy_payment_mode IN ('full', 'twelfths', 'none')),
  prize_payment_method    TEXT NOT NULL DEFAULT 'payroll'
                            CHECK (prize_payment_method IN ('payroll', 'km_map', 'tax_exempt', 'prize_exempt')),
  km_monthly_amount       NUMERIC(10,2),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE salary_proposals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  current_salary   NUMERIC NOT NULL CHECK (current_salary >= 0),
  proposed_salary  NUMERIC NOT NULL CHECK (proposed_salary >= 0),
  effective_date   DATE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'proposta' CHECK (status IN ('proposta', 'aprovada', 'rejeitada')),
  notes            TEXT,
  created_by       UUID REFERENCES employees(id) ON DELETE SET NULL,
  decided_by       UUID REFERENCES employees(id) ON DELETE SET NULL,
  decided_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Uma pessoa não pode ter duas propostas por decidir ao mesmo tempo
CREATE UNIQUE INDEX salary_proposals_one_open ON salary_proposals (employee_id) WHERE status = 'proposta';
CREATE INDEX salary_proposals_status_idx ON salary_proposals (status);

-- ── Férias e faltas ─────────────────────────────────────────

CREATE TABLE absences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT 'vacation'
                  CHECK (type IN ('vacation', 'sick_leave', 'justified', 'unjustified', 'other', 'company_day')),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  working_days  INT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX absences_employee_id_idx ON absences (employee_id);
CREATE INDEX absences_dates_idx ON absences (start_date, end_date);

-- Dia oferecido pela empresa (24 ou 31 de dezembro) e ponte, por ano
CREATE TABLE vacation_settings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year              INT NOT NULL UNIQUE,
  company_gift_day  DATE,
  bridge_day        DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Troca de prémio por dias de férias, por pessoa e por ano
CREATE TABLE vacation_prize_exchanges (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id            UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year                   INT NOT NULL,
  extra_days             INT NOT NULL DEFAULT 0 CHECK (extra_days BETWEEN 0 AND 7),
  prize_amount_deducted  NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, year)
);

-- ── Objetivos, desempenho e prémios ─────────────────────────

CREATE TABLE objectives (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id     UUID REFERENCES employees(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  weight          NUMERIC(5,2) CHECK (weight >= 0 AND weight <= 100),
  target_value    NUMERIC(15,2),
  actual_value    NUMERIC(15,2),
  unit            TEXT,
  year            INT NOT NULL,
  quarter         INT CHECK (quarter BETWEEN 1 AND 4),
  type            objective_type NOT NULL DEFAULT 'individual',
  department      TEXT,
  responsible_id  UUID REFERENCES employees(id) ON DELETE SET NULL,
  -- Piso de faturação abaixo do qual não há prémio
  minimum_base    NUMERIC(15,2),
  status          objective_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE performance_records (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id             UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year                    INT NOT NULL,
  month                   INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  target_achievement_pct  NUMERIC(6,2),
  variable_earned         NUMERIC(10,2),
  model_calculation       JSONB,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, year, month)
);

CREATE TABLE quarterly_reviews (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id            UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reviewer_id            UUID REFERENCES employees(id) ON DELETE SET NULL,
  year                   INT NOT NULL,
  quarter                INT NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  score                  NUMERIC(4,2) CHECK (score >= 0 AND score <= 10),
  qualitative_notes      TEXT,
  strengths              TEXT,
  areas_for_improvement  TEXT,
  status                 review_status NOT NULL DEFAULT 'draft',
  submitted_at           TIMESTAMPTZ,
  approved_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, year, quarter)
);

-- 50% durante o ano + 50% até 90 dias após o fecho do ano
CREATE TABLE annual_bonus (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id              UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year                     INT NOT NULL,
  total_amount             NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  first_payment_amount     NUMERIC(10,2) GENERATED ALWAYS AS (total_amount * 0.5) STORED,
  first_payment_date       DATE,
  first_payment_status     payment_status NOT NULL DEFAULT 'pending',
  second_payment_amount    NUMERIC(10,2) GENERATED ALWAYS AS (total_amount * 0.5) STORED,
  second_payment_deadline  DATE GENERATED ALWAYS AS (MAKE_DATE(year + 1, 1, 1) + 90) STORED,
  second_payment_date      DATE,
  second_payment_status    payment_status NOT NULL DEFAULT 'pending',
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, year)
);

-- ============================================================
-- FINANCEIRO
-- ============================================================

CREATE TABLE financial_records (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year                 INT NOT NULL,
  month                INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  revenue              NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Subsídios, apoios e outros proveitos fora do TOC
  other_revenue        NUMERIC(15,2) NOT NULL DEFAULT 0,
  other_revenue_notes  TEXT,
  -- Faturação manual fora do TOC (na app de origem era a Plunet). Na SOU fica a 0.
  plunet_revenue       NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Só custo operacional — o mapa toc_expense_map decide o que entra
  fse                  NUMERIC(15,2) NOT NULL DEFAULT 0,
  fse_exclusion        NUMERIC(15,2) NOT NULL DEFAULT 0,
  fse_exclusion_notes  TEXT,
  -- Vinha do módulo de fornecedores, que não existe na SOU: fica a 0
  fse_suppliers        NUMERIC(15,2) NOT NULL DEFAULT 0,
  direct_costs         NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_payroll        NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Abaixo do EBITDA
  financial_costs      NUMERIC NOT NULL DEFAULT 0,
  investments          NUMERIC NOT NULL DEFAULT 0,
  -- Contas de despesa sem classificação quando o mês foi sincronizado
  unmapped_accounts    JSONB NOT NULL DEFAULT '[]'::jsonb,
  ebitda               NUMERIC(15,2) GENERATED ALWAYS AS
                         (revenue + other_revenue + plunet_revenue - fse - fse_suppliers - direct_costs - total_payroll) STORED,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, month)
);

CREATE TABLE cost_center_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year            INT NOT NULL,
  month           INT NOT NULL,
  cost_center     TEXT NOT NULL,
  revenue         NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Parte de revenue que a fatura atribui ao centro; o resto foi repartido por regra
  revenue_direct  NUMERIC NOT NULL DEFAULT 0,
  fse             NUMERIC(15,2) NOT NULL DEFAULT 0,
  direct_costs    NUMERIC(15,2) NOT NULL DEFAULT 0,
  payroll         NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, month, cost_center)
);

-- Repartição da receita sem centro próprio. Tudo a zero = reparte pelas horas
-- faturáveis do registo de horas.
CREATE TABLE revenue_distribution (
  department  TEXT PRIMARY KEY
                CHECK (department IN ('Produção', 'Design', 'Gestão', 'Outros')),  -- centros
  share       NUMERIC NOT NULL DEFAULT 0 CHECK (share >= 0 AND share <= 100),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TOC Online: token OAuth2 (linha única)
CREATE TABLE toc_tokens (
  id             INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token   TEXT NOT NULL,
  refresh_token  TEXT NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Código de artigo das faturas de venda → centro de custo
CREATE TABLE toc_item_map (
  id          SERIAL PRIMARY KEY,
  item_code   TEXT NOT NULL UNIQUE,
  department  TEXT,
  label       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conta SNC das faturas de compra → centro de custo e natureza
--   fse          → custo operacional; entra no FSE do centro
--   investimento → imobilizado (classe 4), abaixo do EBITDA
--   financeiro   → juros e encargos (classe 69), abaixo do EBITDA
--   ignorar      → não é custo (empréstimos, leasing, acréscimos)
CREATE TABLE toc_expense_map (
  id            SERIAL PRIMARY KEY,
  account_code  TEXT NOT NULL UNIQUE,
  cost_center   TEXT CHECK (cost_center IS NULL OR cost_center IN ('Produção', 'Design', 'Gestão', 'Outros')),  -- centros
  label         TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL DEFAULT 'fse' CHECK (kind IN ('fse', 'investimento', 'financeiro', 'ignorar')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT toc_expense_map_center_only_fse CHECK (cost_center IS NULL OR kind = 'fse')
);
CREATE INDEX toc_expense_map_kind_idx ON toc_expense_map (kind);

-- ── Orçamento anual da empresa ──────────────────────────────

CREATE TABLE budget_versions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year                  INTEGER NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  revision              INTEGER NOT NULL CHECK (revision >= 0),
  status                TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aprovado', 'substituido')),
  based_on              UUID REFERENCES budget_versions(id),
  actual_through_month  INTEGER NOT NULL DEFAULT 0 CHECK (actual_through_month BETWEEN 0 AND 12),
  notes                 TEXT,
  created_by            UUID REFERENCES employees(id) ON DELETE SET NULL,
  approved_by           UUID REFERENCES employees(id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, revision),
  CHECK ((revision = 0) = (based_on IS NULL))
);
CREATE UNIQUE INDEX idx_budget_versions_aprovado ON budget_versions (year) WHERE status = 'aprovado';
CREATE UNIQUE INDEX idx_budget_versions_rascunho ON budget_versions (year) WHERE status = 'rascunho';

CREATE TABLE budget_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id   UUID NOT NULL REFERENCES budget_versions(id) ON DELETE CASCADE,
  rubric       TEXT NOT NULL CHECK (rubric IN ('faturacao', 'plunet', 'outros_proveitos', 'massa_salarial',
                                               'fse', 'marketing', 'custos_diretos', 'investimentos')),
  description  TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
  -- Vazio = estrutura, repartida pelos centros operacionais
  cost_center  TEXT CHECK (cost_center IS NULL OR cost_center IN ('Produção', 'Design', 'Gestão', 'Outros')),  -- centros
  m01 NUMERIC(12,2) NOT NULL DEFAULT 0, m02 NUMERIC(12,2) NOT NULL DEFAULT 0, m03 NUMERIC(12,2) NOT NULL DEFAULT 0,
  m04 NUMERIC(12,2) NOT NULL DEFAULT 0, m05 NUMERIC(12,2) NOT NULL DEFAULT 0, m06 NUMERIC(12,2) NOT NULL DEFAULT 0,
  m07 NUMERIC(12,2) NOT NULL DEFAULT 0, m08 NUMERIC(12,2) NOT NULL DEFAULT 0, m09 NUMERIC(12,2) NOT NULL DEFAULT 0,
  m10 NUMERIC(12,2) NOT NULL DEFAULT 0, m11 NUMERIC(12,2) NOT NULL DEFAULT 0, m12 NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_budget_lines_version ON budget_lines (version_id, rubric, sort_order);

-- ============================================================
-- PRODUÇÃO (calculadora, orçamentos, horas)
-- ============================================================

-- Parâmetros da calculadora: um único documento (pessoas, máquinas,
-- consumíveis e stock, técnicas, margens, escalões, setups, dados da empresa).
-- Vazio = valores de partida de src/lib/producao/defaults.ts.
CREATE TABLE prod_parametros (
  id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dados       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES employees(id) ON DELETE SET NULL
);

-- Peças em branco
CREATE TABLE prod_artigos (
  id          TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  categoria   TEXT NOT NULL DEFAULT 'Outro',
  fornecedor  TEXT NOT NULL DEFAULT '',
  custo       NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (custo >= 0),
  minimo      INTEGER NOT NULL DEFAULT 1 CHECK (minimo >= 1),
  portes      NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (portes >= 0),
  nota        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE prod_clientes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'empresa' CHECK (tipo IN ('particular', 'empresa', 'parceiro')),
  nif         TEXT,
  email       TEXT,
  telefone    TEXT,
  notas       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- O orçamento inteiro vive em `conteudo` (linhas, aplicações, preço fixado).
-- As outras colunas são cópias para listar e filtrar sem abrir o JSON.
CREATE TABLE prod_orcamentos (
  id          UUID PRIMARY KEY,
  numero      TEXT NOT NULL UNIQUE,
  cliente_id  UUID REFERENCES prod_clientes(id) ON DELETE SET NULL,
  estado      TEXT NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho', 'enviado', 'ganho', 'perdido', 'cancelado')),
  data        DATE NOT NULL,
  conteudo    JSONB NOT NULL,
  total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  margem      NUMERIC(8,4) NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX prod_orcamentos_cliente_idx ON prod_orcamentos (cliente_id);
CREATE INDEX prod_orcamentos_estado_idx ON prod_orcamentos (estado, data);

-- Registo de horas (substitui o ClickUp): alimenta a Produtividade e o custo/hora
CREATE TABLE time_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  hours         NUMERIC(5,2) NOT NULL CHECK (hours > 0 AND hours <= 16),
  billable      BOOLEAN NOT NULL DEFAULT TRUE,
  orcamento_id  UUID REFERENCES prod_orcamentos(id) ON DELETE SET NULL,
  description   TEXT,
  created_by    UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX time_entries_date_idx ON time_entries (date);
CREATE INDEX time_entries_employee_idx ON time_entries (employee_id, date);
CREATE INDEX time_entries_orcamento_idx ON time_entries (orcamento_id);

-- Devlog: ideias e melhorias registadas pela equipa
CREATE TABLE dev_ideias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo      TEXT NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 200),
  descricao   TEXT,
  area        TEXT NOT NULL DEFAULT 'Geral',
  tipo        TEXT NOT NULL DEFAULT 'ideia' CHECK (tipo IN ('ideia', 'melhoria')),
  estado      TEXT NOT NULL DEFAULT 'nova' CHECK (estado IN ('nova', 'aceite', 'em_curso', 'feita', 'rejeitada')),
  autor_id    UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- updated_at e RLS em todas as tabelas
-- ============================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'employees', 'contracts', 'compensation', 'variable_rules', 'employee_tax_info', 'salary_proposals',
    'absences', 'vacation_settings', 'vacation_prize_exchanges', 'objectives', 'performance_records',
    'quarterly_reviews', 'annual_bonus', 'financial_records', 'cost_center_records', 'revenue_distribution',
    'toc_tokens', 'toc_item_map', 'toc_expense_map', 'budget_versions', 'budget_lines',
    'prod_parametros', 'prod_artigos', 'prod_clientes', 'prod_orcamentos', 'time_entries', 'dev_ideias'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'updated_at') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
                     t || '_updated_at', t);
    END IF;
  END LOOP;
END $$;

-- A API do Supabase só vê as tabelas novas depois de recarregar o esquema
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRIMEIRO UTILIZADOR
--
-- Depois de correr o schema, criar a ficha da pessoa que vai gerir a app
-- (trocar o email). O login liga-se sozinho à ficha pelo email.
--
-- INSERT INTO employees (first_name, last_name, email, role, department,
--                        position_type, app_role, start_date)
-- VALUES ('Nome', 'Apelido', 'finance@soucreative.pt', 'Gestão', 'Gestão',
--         'management', 'master', '2025-01-01');
-- ============================================================
