const FALLBACK_ADMIN_PASSWORD = "146800";

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ success: false, error: "Banco não configurado." }, 503);

  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || "");
    const validTokens = [env.TOKEN_ADMIN, FALLBACK_ADMIN_PASSWORD].filter(Boolean);
    if (!validTokens.some(validToken => constantTimeEqual(token, validToken))) {
      return json({ success: false, error: "Não autorizado." }, 401);
    }

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run();

    const cutoff = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind("dashboard_cutoff", cutoff, cutoff).run();

    return json({
      success: true,
      cutoff,
      message: "Dashboard zerado para uma nova sessão. Leads e avaliações individuais foram preservados."
    });
  } catch (error) {
    console.error("Erro ao zerar dashboard:", error);
    return json({ success: false, error: "Não foi possível zerar o Dashboard agora." }, 500);
  }
}

function constantTimeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
