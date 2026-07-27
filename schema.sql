-- Banco D1 do projeto francisneyliberato-gestao-patrimonial-publica
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  nome_completo TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  email TEXT NOT NULL,
  consentimento_lgpd INTEGER NOT NULL DEFAULT 0 CHECK (consentimento_lgpd IN (0, 1)),
  orgao_entidade TEXT NOT NULL,
  unidade_administrativa TEXT NOT NULL,
  municipio_estado TEXT NOT NULL,
  cargo_funcao TEXT,
  telefone TEXT,
  sistema_patrimonial TEXT,
  qtd_bens_moveis INTEGER,
  qtd_bens_imoveis INTEGER,
  data_ultimo_inventario TEXT,
  ultima_conciliacao TEXT,
  responsavel_validacao TEXT,
  pontuacao_total REAL NOT NULL DEFAULT 0,
  pontuacao_maxima REAL NOT NULL DEFAULT 0,
  percentual_bruto REAL NOT NULL DEFAULT 0,
  percentual_ajustado REAL NOT NULL DEFAULT 0,
  classificacao TEXT NOT NULL,
  eixo_mais_forte TEXT,
  eixo_prioritario TEXT,
  alertas_json TEXT,
  resultados_eixos_json TEXT,
  respostas_json TEXT,
  plano_acao_json TEXT,
  url_origem TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_classificacao ON leads(classificacao);

-- Rascunhos para retomada segura pelo WhatsApp informado no cadastro.
CREATE TABLE IF NOT EXISTS assessment_drafts (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'em_andamento',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  whatsapp TEXT NOT NULL,
  email TEXT NOT NULL,
  participant_json TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_assessment_drafts_whatsapp ON assessment_drafts(whatsapp, updated_at DESC);
