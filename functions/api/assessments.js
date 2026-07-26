export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return json({ success: false, assessments: [], error: "Binding D1 DB não configurado." }, 503);
    const url = new URL(request.url);
    const email = clean(url.searchParams.get("email"), 250).toLowerCase();
    const whatsapp = onlyDigits(url.searchParams.get("whatsapp"));
    if (!email && !whatsapp) return json({ success: false, assessments: [], error: "Informe e-mail e/ou WhatsApp." }, 400);

    const clauses = [];
    const values = [];
    if (email) {
      clauses.push("lower(email) = ?");
      values.push(email);
    }
    if (whatsapp) {
      clauses.push("replace(replace(replace(replace(replace(whatsapp, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') LIKE ?");
      values.push(`%${whatsapp}%`);
    }

    const sql = `
      SELECT id, created_at, nome_completo, whatsapp, email, orgao_entidade,
             unidade_administrativa, municipio_estado, cargo_funcao,
             pontuacao_total, pontuacao_maxima, percentual_bruto, percentual_ajustado,
             classificacao, eixo_mais_forte, eixo_prioritario, alertas_json,
             resultados_eixos_json, respostas_json, plano_acao_json
      FROM leads
      WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT 25
    `;
    const { results } = await env.DB.prepare(sql).bind(...values).all();
    return json({ success: true, assessments: (results || []).map(row => ({
      id: `remote-${row.id}`,
      created_at: row.created_at,
      status: "concluido",
      nome_completo: row.nome_completo,
      whatsapp: row.whatsapp,
      email: row.email,
      orgao_entidade: row.orgao_entidade,
      unidade_administrativa: row.unidade_administrativa,
      municipio_estado: row.municipio_estado,
      cargo_funcao: row.cargo_funcao,
      pontuacao_total: row.pontuacao_total,
      pontuacao_maxima: row.pontuacao_maxima,
      percentual_bruto: row.percentual_bruto,
      percentual_ajustado: row.percentual_ajustado,
      classificacao: row.classificacao,
      eixo_mais_forte: row.eixo_mais_forte,
      eixo_prioritario: row.eixo_prioritario,
      alertas: parseJSON(row.alertas_json, []),
      resultados_eixos: parseJSON(row.resultados_eixos_json, []),
      respostas: parseJSON(row.respostas_json, {}),
      plano_acao: parseJSON(row.plano_acao_json, [])
    })) });
  } catch (error) {
    console.error("Erro ao consultar avaliações:", error);
    return json({ success: false, assessments: [], error: "Não foi possível consultar avaliações agora." }, 500);
  }
}

function clean(value, maxLength = 5000) {
  return String(value ?? "").replace(/[<>]/g, "").trim().slice(0, maxLength);
}
function onlyDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}
function parseJSON(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
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

