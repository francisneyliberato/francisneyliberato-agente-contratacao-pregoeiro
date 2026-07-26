const REQUIRED_FIELDS = [
  "nome_completo",
  "whatsapp",
  "email",
  "consentimento_lgpd"
];

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    if (!env.DB) return json({ success: false, error: "Binding D1 DB não configurado." }, 503);

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return json({ success: false, error: "Envie os dados no formato JSON." }, 415);
    }

    const body = await request.json();
    const missing = REQUIRED_FIELDS.filter(field => {
      if (field === "consentimento_lgpd") return body[field] !== true;
      return !clean(body[field], 500);
    });
    if (missing.length) {
      return json({ success: false, error: "Campos obrigatórios ausentes ou inválidos.", fields: missing }, 400);
    }
    if (!isValidEmail(body.email)) {
      return json({ success: false, error: "E-mail inválido." }, 400);
    }

    const statement = env.DB.prepare(`
      INSERT INTO leads (
        created_at, nome_completo, whatsapp, email, consentimento_lgpd,
        orgao_entidade, unidade_administrativa, municipio_estado, cargo_funcao,
        telefone, sistema_patrimonial, qtd_bens_moveis, qtd_bens_imoveis,
        data_ultimo_inventario, ultima_conciliacao, responsavel_validacao,
        pontuacao_total, pontuacao_maxima, percentual_bruto, percentual_ajustado,
        classificacao, eixo_mais_forte, eixo_prioritario, alertas_json,
        resultados_eixos_json, respostas_json, plano_acao_json, url_origem, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      clean(body.created_at, 50) || new Date().toISOString(),
      clean(body.nome_completo, 200),
      clean(body.whatsapp, 50),
      clean(body.email, 200),
      body.consentimento_lgpd ? 1 : 0,
      clean(body.orgao_entidade, 300),
      clean(body.unidade_administrativa, 300),
      clean(body.municipio_estado, 150),
      clean(body.cargo_funcao, 200),
      clean(body.telefone, 50),
      clean(body.sistema_patrimonial, 200),
      nullableNumber(body.qtd_bens_moveis),
      nullableNumber(body.qtd_bens_imoveis),
      clean(body.data_ultimo_inventario, 30),
      clean(body.ultima_conciliacao, 30),
      clean(body.responsavel_validacao, 250),
      finiteNumber(body.pontuacao_total),
      finiteNumber(body.pontuacao_maxima),
      finiteNumber(body.percentual_bruto),
      finiteNumber(body.percentual_ajustado),
      clean(body.classificacao, 50),
      clean(body.eixo_mais_forte, 300),
      clean(body.eixo_prioritario, 300),
      safeJSON(body.alertas),
      safeJSON(body.resultados_eixos),
      safeJSON(body.respostas),
      safeJSON(body.plano_acao),
      clean(body.url_origem, 1000),
      clean(body.user_agent || request.headers.get("user-agent"), 1000)
    );

    const result = await statement.run();
    return json({ success: true, id: result.meta?.last_row_id, message: "Diagnóstico salvo com sucesso." }, 201);
  } catch (error) {
    console.error("Erro ao salvar lead:", error);
    return json({ success: false, error: "Não foi possível salvar o diagnóstico agora." }, 500);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}

function clean(value, maxLength = 5000) {
  return String(value ?? "").replace(/[<>]/g, "").trim().slice(0, maxLength);
}
function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value, 250));
}
function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
function nullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  return finiteNumber(value);
}
function safeJSON(value) {
  try {
    return JSON.stringify(value ?? null).slice(0, 2_000_000);
  } catch {
    return "null";
  }
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
