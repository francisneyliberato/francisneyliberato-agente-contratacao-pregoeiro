export async function onRequestGet({ request, env }) {
  if (!env.TOKEN_ADMIN) return response("TOKEN_ADMIN não configurado.", 503);
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!constantTimeEqual(token, env.TOKEN_ADMIN)) return response("Não autorizado.", 401);
  if (!env.DB) return response("Binding D1 DB não configurado.", 503);

  try {
    const { results } = await env.DB.prepare("SELECT * FROM leads ORDER BY created_at DESC").all();
    const headers = [
      "Projeto", "ID", "Data e Hora do Teste", "Nome Completo", "WhatsApp", "E-mail",
      "Consentimento LGPD", "Órgão ou Entidade", "Unidade Administrativa", "Município/Estado",
      "Cargo/Função", "Telefone", "Modalidade de atuação", "Tempo de atuação", "Processos por ano",
      "Data Último Inventário", "Última Conciliação", "Responsável Validação", "Pontuação Total",
      "Pontuação Máxima", "Percentual Bruto", "Percentual Ajustado", "Classificação",
      "Pilar Mais Forte", "Pilar Prioritário", "Alertas", "Resultados por Eixo",
      "Resumo das Respostas", "Plano de Ação", "URL de Origem", "User Agent"
    ];
    const rows = results.map(item => [
      "francisneyliberato-agente-contratacao-pregoeiro",
      item.id, item.created_at, item.nome_completo, item.whatsapp, item.email,
      item.consentimento_lgpd ? "Sim" : "Não", item.orgao_entidade, item.unidade_administrativa,
      item.municipio_estado, item.cargo_funcao, item.telefone, item.sistema_patrimonial,
      item.qtd_bens_moveis, item.qtd_bens_imoveis, item.data_ultimo_inventario,
      item.ultima_conciliacao, item.responsavel_validacao, item.pontuacao_total,
      item.pontuacao_maxima, item.percentual_bruto, item.percentual_ajustado,
      item.classificacao, item.eixo_mais_forte, item.eixo_prioritario,
      compactJSON(item.alertas_json), compactJSON(item.resultados_eixos_json),
      compactAnswers(item.respostas_json), compactJSON(item.plano_acao_json),
      item.url_origem, item.user_agent
    ]);
    const csv = "\uFEFF" + [headers, ...rows].map(row => row.map(csvCell).join(";")).join("\r\n");
    const date = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="francisneyliberato-agente-contratacao-pregoeiro-leads-${date}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("Erro na exportação CSV:", error);
    return response("Não foi possível gerar o CSV.", 500);
  }
}

function compactAnswers(value) {
  try {
    const answers = JSON.parse(value || "{}");
    return Object.entries(answers).map(([number, answer]) =>
      `Q${number}:${answer.score}${answer.observation ? ` (${answer.observation})` : ""}`
    ).join(" | ");
  } catch {
    return value || "";
  }
}
function compactJSON(value) {
  try { return JSON.stringify(JSON.parse(value || "null")); } catch { return value || ""; }
}
function csvCell(value) {
  let text = String(value ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(text)) text = `'${text}`; // evita injeção de fórmula
  return `"${text.replace(/"/g, '""')}"`;
}
function constantTimeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
function response(message, status) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
