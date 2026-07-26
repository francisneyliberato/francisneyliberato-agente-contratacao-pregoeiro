const DESTINATION_EMAIL = "francisneyliberato10@gmail.com";
const SITE_ID = "francisneyliberato-agente-contratacao-pregoeiro";

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const startedAt = clean(body.startedAt, 80);
    const submittedAt = new Date();
    const payload = {
      nomeCompleto: clean(body.nomeCompleto, 180),
      email: clean(body.email, 250).toLowerCase(),
      whatsapp: clean(body.whatsapp, 40),
      mensagem: clean(body.mensagem, 4000),
      website: clean(body.website, 200),
      origin: clean(body.origin || request.headers.get("Referer") || "", 500)
    };

    if (payload.website) return json({ success: true });
    if (isTooFast(startedAt, submittedAt)) return json({ success: false, error: "Envio muito rápido. Revise a mensagem e tente novamente." }, 429);

    const errors = validate(payload);
    if (errors.length) return json({ success: false, error: errors.join(" ") }, 400);
    if (!env.RESEND_API_KEY) return json({ success: false, error: "Serviço de e-mail não configurado." }, 503);

    const from = env.EDITORA_FROM_EMAIL || "Editora Liberato <onboarding@resend.dev>";
    const subject = `Novo contato - Editora Liberato - ${payload.nomeCompleto}`;
    const sentAt = submittedAt.toLocaleString("pt-BR", { timeZone: "America/Cuiaba", dateStyle: "full", timeStyle: "short" });
    const text = [
      "Novo contato pelo formulário da Editora Liberato",
      "",
      `Nome: ${payload.nomeCompleto}`,
      `E-mail: ${payload.email}`,
      `WhatsApp: ${payload.whatsapp}`,
      `Data e horário: ${sentAt}`,
      `Site de origem: ${SITE_ID}`,
      `Página de origem: ${payload.origin}`,
      "",
      "Mensagem:",
      payload.mensagem
    ].join("\n");
    const html = renderEmail({ ...payload, sentAt });

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [DESTINATION_EMAIL],
        reply_to: payload.email,
        subject,
        text,
        html
      })
    });
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      console.error("Erro Resend:", response.status, details.slice(0, 500));
      return json({ success: false, error: "Não foi possível enviar o e-mail agora." }, 502);
    }

    return json({ success: true });
  } catch (error) {
    console.error("Erro no contato da Editora:", error);
    return json({ success: false, error: "Não foi possível processar a mensagem agora." }, 500);
  }
}

function validate(payload) {
  const errors = [];
  const digits = onlyDigits(payload.whatsapp);
  if (payload.nomeCompleto.length < 3) errors.push("Informe o nome completo.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) errors.push("Informe um e-mail válido.");
  if (digits.length < 10 || digits.length > 13) errors.push("Informe um WhatsApp válido com DDD.");
  if (payload.mensagem.length < 10) errors.push("Informe uma mensagem com pelo menos 10 caracteres.");
  return errors;
}

function isTooFast(startedAt, submittedAt) {
  if (!startedAt) return false;
  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) return false;
  return submittedAt.getTime() - started.getTime() < 2500;
}

function renderEmail(data) {
  return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#12263a">
  <div style="max-width:680px;margin:0 auto;padding:28px">
    <div style="background:#071522;color:#fff;border-radius:18px 18px 0 0;padding:24px">
      <div style="color:#f6b94a;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Editora Liberato</div>
      <h1 style="margin:8px 0 0;font-size:24px">Novo contato editorial</h1>
    </div>
    <div style="background:#fff;border:1px solid #dbe5ec;border-top:0;border-radius:0 0 18px 18px;padding:24px">
      ${row("Nome", data.nomeCompleto)}
      ${row("E-mail", data.email)}
      ${row("WhatsApp", data.whatsapp)}
      ${row("Data e horário", data.sentAt)}
      ${row("Site de origem", SITE_ID)}
      ${row("Página de origem", data.origin)}
      <div style="margin-top:18px">
        <strong style="display:block;margin-bottom:8px;color:#0b3048">Mensagem</strong>
        <div style="white-space:pre-wrap;line-height:1.55;background:#f6fafc;border:1px solid #e2ebf1;border-radius:12px;padding:14px">${escapeHTML(data.mensagem)}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function row(label, value) {
  return `<p style="margin:0 0 10px"><strong style="color:#0b3048">${escapeHTML(label)}:</strong> ${escapeHTML(value)}</p>`;
}
function clean(value, maxLength) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F<>]/g, " ").trim().slice(0, maxLength);
}
function onlyDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
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
