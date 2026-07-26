const FALLBACK_ADMIN_PASSWORD = "146800";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const validTokens = [env.TOKEN_ADMIN, FALLBACK_ADMIN_PASSWORD].filter(Boolean);
  if (!validTokens.some(validToken => constantTimeEqual(token, validToken))) {
    return json({ success: false, error: "Não autorizado." }, 401);
  }
  if (!env.DB) return json({ success: false, error: "Banco de dados não configurado." }, 503);

  const from = normalizeIso(url.searchParams.get("from"));
  const to = normalizeIso(url.searchParams.get("to"));
  if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
    return json({ success: false, error: "O período informado é inválido." }, 400);
  }

  try {
    const clauses = [];
    const values = [];
    if (from) {
      clauses.push("datetime(created_at) >= datetime(?)");
      values.push(from);
    }
    if (to) {
      clauses.push("datetime(created_at) <= datetime(?)");
      values.push(to);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const { results } = await env.DB.prepare(`
      SELECT created_at, percentual_ajustado, classificacao, eixo_prioritario,
             alertas_json, resultados_eixos_json
      FROM leads
      ${where}
      ORDER BY datetime(created_at) DESC
    `).bind(...values).all();

    return json({
      success: true,
      data: aggregate(results || []),
      filters: { from, to }
    });
  } catch (error) {
    console.error("Erro ao gerar dados do PDF administrativo do dashboard:", error);
    return json({ success: false, error: "Não foi possível preparar os dados do Dashboard." }, 500);
  }
}

function aggregate(rows) {
  const levels = ["Zona crítica", "Zona de atenção", "Desenvolvimento necessário", "Desempenho consistente", "Alta performance consolidada"];
  const distribution = Object.fromEntries(levels.map(level => [level, 0]));
  const axes = {};
  const priorities = {};
  let totalPercent = 0;
  let alertCount = 0;
  let today = 0;
  const todayKey = new Date().toISOString().slice(0, 10);

  rows.forEach(row => {
    const level = distribution[row.classificacao] === undefined ? "Zona crítica" : row.classificacao;
    distribution[level]++;
    totalPercent += Number(row.percentual_ajustado || 0);
    if (String(row.created_at || "").slice(0, 10) === todayKey) today++;
    if (row.eixo_prioritario) priorities[row.eixo_prioritario] = (priorities[row.eixo_prioritario] || 0) + 1;
    try { alertCount += (JSON.parse(row.alertas_json || "[]") || []).length; } catch {}
    try {
      (JSON.parse(row.resultados_eixos_json || "[]") || []).forEach(axis => {
        axes[axis.id] ||= { id: axis.id, name: axis.name, short: axis.short, sum: 0, count: 0 };
        axes[axis.id].sum += Number(axis.percent || 0);
        axes[axis.id].count++;
      });
    } catch {}
  });

  return {
    total: rows.length,
    today,
    average: rows.length ? totalPercent / rows.length : 0,
    alertCount,
    distribution,
    axes: Object.values(axes).map(axis => ({ ...axis, average: axis.count ? axis.sum / axis.count : 0 })).sort((a, b) => a.id - b.id),
    priorities: Object.entries(priorities).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
    recent: rows.slice(0, 7).map(row => ({ createdAt: row.created_at, level: row.classificacao, percent: Number(row.percentual_ajustado || 0) }))
  };
}

function normalizeIso(value) {
  const text = String(value || "").trim();
  const date = new Date(text);
  return text && Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function constantTimeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}
