-- Consignações: produtos de criadores que a SOU vende na loja e paga depois de vendidos.
-- Correr uma vez no SQL Editor do Supabase.

CREATE TABLE consig_criadores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 200),
  nif         TEXT,
  email       TEXT,
  telefone    TEXT,
  iban        TEXT,
  notas       TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- preco_criador: o que a SOU paga ao criador por cada unidade vendida.
-- preco_venda: o preço na loja, com IVA (iva = taxa, 0,23 = 23%).
CREATE TABLE consig_produtos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  criador_id     UUID NOT NULL REFERENCES consig_criadores(id) ON DELETE RESTRICT,
  nome           TEXT NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 200),
  referencia     TEXT,
  preco_criador  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (preco_criador >= 0),
  preco_venda    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (preco_venda >= 0),
  iva            NUMERIC(5,4) NOT NULL DEFAULT 0.23 CHECK (iva >= 0 AND iva < 1),
  notas          TEXT,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX consig_produtos_criador_idx ON consig_produtos (criador_id);

-- Pagamento a um criador: junta as vendas ainda por pagar até uma data.
CREATE TABLE consig_liquidacoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  criador_id  UUID NOT NULL REFERENCES consig_criadores(id) ON DELETE RESTRICT,
  data        DATE NOT NULL DEFAULT CURRENT_DATE,
  ate         DATE NOT NULL,
  total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  pago_em     DATE,
  referencia  TEXT,
  notas       TEXT,
  created_by  UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX consig_liquidacoes_criador_idx ON consig_liquidacoes (criador_id, data);

-- Movimentos de stock. entrada: o criador deixa peças; venda: vendida na loja;
-- devolucao: volta para o criador; ajuste: correção de inventário (+ ou −).
-- Os preços ficam guardados no movimento, para o histórico não mudar quando o produto muda.
CREATE TABLE consig_movimentos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id     UUID NOT NULL REFERENCES consig_produtos(id) ON DELETE RESTRICT,
  tipo           TEXT NOT NULL CHECK (tipo IN ('entrada', 'venda', 'devolucao', 'ajuste')),
  quantidade     INTEGER NOT NULL CHECK (quantidade <> 0 AND (tipo = 'ajuste' OR quantidade > 0)),
  data           DATE NOT NULL DEFAULT CURRENT_DATE,
  preco_criador  NUMERIC(10,2),
  preco_venda    NUMERIC(10,2),
  liquidacao_id  UUID REFERENCES consig_liquidacoes(id) ON DELETE SET NULL,
  notas          TEXT,
  created_by     UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX consig_movimentos_produto_idx ON consig_movimentos (produto_id, data);
CREATE INDEX consig_movimentos_liquidacao_idx ON consig_movimentos (liquidacao_id);

-- Só a app (chave de serviço) lê e escreve: RLS ligado e sem políticas, como nas outras tabelas
ALTER TABLE consig_criadores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE consig_produtos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE consig_liquidacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE consig_movimentos  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER consig_criadores_updated_at   BEFORE UPDATE ON consig_criadores   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER consig_produtos_updated_at    BEFORE UPDATE ON consig_produtos    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER consig_liquidacoes_updated_at BEFORE UPDATE ON consig_liquidacoes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
