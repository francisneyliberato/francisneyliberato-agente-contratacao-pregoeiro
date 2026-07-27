export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return json({ success: false, drafts: [], error: "Banco de dados não configurado." }, 503);
    await ensureDraftTable(env.DB);
    const whatsapp = onlyDigits(new URL(request.url).searchParams.get("whatsapp"));
    if (!whatsapp) return json({ success: false, drafts: [], error: "Informe o WhatsApp usado no cadastro." }, 400);

    const { results } = await env.DB.prepare(`
      SELECT id, updated_at, participant_json, answers_json, current_step
      FROM assessment_drafts
      WHERE status = 'em_andamento'
        AND replace(replace(replace(replace(replace(whatsapp, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') LIKE ?
      ORDER BY updated_at DESC
      LIMIT 25
    `).bind(`%${whatsapp}%`).all();

    return json({
      success: true,
      drafts: (results || []).map(row => ({
        id: `draft-${row.id}`,
        draftId: row.id,
        status: "em_andamento",
        updatedAt: row.updated_at,
        participant: parseJSON(row.participant_json, {}),
        answers: parseJSON(row.answers_json, {}),
        currentStep: Number(row.current_step || 0)
      }))
    });
  } catch (error) {
    console.error("Erro ao consultar rascunhos:", error);
    return json({ success: false, drafts: [], error: "Não foi possível consultar os rascunhos agora." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return json({ success: false, error: "Banco de dados não configurado." }, 503);
    await ensureDraftTable(env.DB);
    if (!(request.headers.get("content-type") || "").includes("application/json")) {
      return json({ success: false, error: "Envie os dados no formato JSON." }, 415);
    }
    const body = await request.json();
    const participant = body.participant || {};
    const id = clean(body.id, 100);
    const whatsapp = onlyDigits(participant.whatsapp);
    const email = clean(participant.email, 200).toLowerCase();
    if (!id || !whatsapp || !email || participant.consentimentoLgpd !== true) {
      return json({ success: false, error: "Dados de identificação e consentimento são obrigatórios." }, 400);
    }

    await env.DB.prepare(`
      INSERT INTO assessment_drafts (id, status, updated_at, whatsapp, email, participant_json, answers_json, current_step)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        updated_at = excluded.updated_at,
        whatsapp = excluded.whatsapp,
        email = excluded.email,
        participant_json = excluded.participant_json,
        answers_json = excluded.answers_json,
        current_step = excluded.current_step
    `).bind(
      id,
      body.status === "concluido" ? "concluido" : "em_andamento",
      new Date().toISOString(),
      whatsapp,
      email,
      safeJSON(participant),
      safeJSON(body.answers || {}),
      Math.max(0, Math.min(11, Number(body.currentStep) || 0))
    ).run();
    return json({ success: true });
  } catch (error) {
    console.error("Erro ao salvar rascunho:", error);
    return json({ success: false, error: "Não foi possível salvar o rascunho agora." }, 500);
  }
}

function clean(value, max = 5000) { return String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max); }
function onlyDigits(value) { return String(value || "").replace(/\D+/g, ""); }
function parseJSON(value, fallback) { try { return JSON.parse(value || ""); } catch { return fallback; } }
function safeJSON(value) { try { return JSON.stringify(value).slice(0, 2_000_000); } catch { return "{}"; } }
async function ensureDraftTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS assessment_drafts (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'em_andamento',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      whatsapp TEXT NOT NULL,
      email TEXT NOT NULL,
      participant_json TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      current_step INTEGER NOT NULL DEFAULT 0
    )
  `).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_assessment_drafts_whatsapp ON assessment_drafts(whatsapp, updated_at DESC)").run();
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
