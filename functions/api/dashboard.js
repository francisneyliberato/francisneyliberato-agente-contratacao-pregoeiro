export async function onRequestGet({ env }) {
  if (!env.DB) return json({ success: false, error: "Banco não configurado." }, 503);

  try {
    const cutoff = await getDashboardCutoff(env);
    const query = cutoff
      ? env.DB.prepare(`
        SELECT created_at, percentual_ajustado, classificacao, eixo_prioritario,
               alertas_json, resultados_eixos_json
        FROM leads
        WHERE created_at >= ?
        ORDER BY created_at DESC
      `).bind(cutoff)
      : env.DB.prepare(`
        SELECT created_at, percentual_ajustado, classificacao, eixo_prioritario,
               alertas_json, resultados_eixos_json
        FROM leads
        ORDER BY created_at DESC
      `);
    const { results } = await query.all();

    return json({ success: true, data: { ...aggregate(results), cutoff } });
  } catch (error) {
    console.error("Erro no dashboard:", error);
    return json({ success: false, error: "Não foi possível carregar o dashboard." }, 500);
  }
}

async function getDashboardCutoff(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind("dashboard_cutoff").first();
  return row?.value || "";
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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
