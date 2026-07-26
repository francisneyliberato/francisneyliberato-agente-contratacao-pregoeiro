import XLSX from "xlsx-js-style";

const FALLBACK_ADMIN_PASSWORD = "146800";
const TEMPLATE = {
  titleFill: "6D28D9",
  headerFill: "7C3AED",
  alternateFill: "F5F3FF",
  border: "E2E8F0",
  subtitle: "475569",
  white: "FFFFFF"
};

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const validTokens = [env.TOKEN_ADMIN, FALLBACK_ADMIN_PASSWORD].filter(Boolean);
  if (!validTokens.some(validToken => constantTimeEqual(token, validToken))) return text("Não autorizado.", 401);
  if (!env.DB) return text("Binding D1 DB não configurado.", 503);

  try {
    const scope = (url.searchParams.get("scope") || "all").toLowerCase();
    const selectedDate = normalizeDate(url.searchParams.get("date")) || new Date().toISOString().slice(0, 10);
    const daily = ["day", "dia", "today"].includes(scope);
    const query = daily
      ? env.DB.prepare("SELECT nome_completo, whatsapp, email FROM leads WHERE substr(created_at, 1, 10) = ? ORDER BY created_at DESC").bind(selectedDate)
      : env.DB.prepare("SELECT nome_completo, whatsapp, email FROM leads ORDER BY created_at DESC");
    const { results } = await query.all();

    const issuedAt = new Date();
    const heading = ["Nome completo", "WhatsApp", "E-mail"];
    const dataRows = (results || []).map(item => [
      safeCell(item.nome_completo),
      formatWhatsapp(item.whatsapp),
      safeCell(item.email)
    ]);
    const subtitle = `Atualizado em ${formatDateTimeLong(issuedAt)} • Total: ${dataRows.length} ${dataRows.length === 1 ? "lead" : "leads"}`;
    const aoa = [
      ["RELATÓRIO DE LEADS"],
      [subtitle],
      heading,
      ...(dataRows.length ? dataRows : [["", "", ""]])
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    applyTemplateFormatting(ws, dataRows.length);

    const wb = XLSX.utils.book_new();
    wb.Props = {
      Title: "Relatório de Leads",
      Subject: daily ? `Leads do dia ${selectedDate}` : "Leads acumulados",
      Author: "Francisney Liberato",
      CreatedDate: issuedAt
    };
    XLSX.utils.book_append_sheet(wb, ws, "Leads");

    const output = XLSX.write(wb, { type: "array", bookType: "xlsx", cellStyles: true, compression: true });
    const fileDate = daily ? selectedDate : issuedAt.toISOString().slice(0, 10);
    const fileScope = daily ? `leads-dia-${fileDate}` : `leads-acumulados-${fileDate}`;
    return new Response(output, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="francisneyliberato-agente-contratacao-pregoeiro-${fileScope}.xlsx"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("Erro na exportação Excel:", error);
    return text("Não foi possível gerar o Excel.", 500);
  }
}

function applyTemplateFormatting(ws, dataCount) {
  const lastRow = Math.max(3 + dataCount, 4);
  ws["!cols"] = [{ wch: 38 }, { wch: 22 }, { wch: 38 }];
  ws["!rows"] = [
    { hpt: 32 },
    { hpt: 20 },
    { hpt: 25 },
    ...Array.from({ length: Math.max(dataCount, 1) }, () => ({ hpt: 21 }))
  ];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } }
  ];
  ws["!autofilter"] = { ref: `A3:C${lastRow}` };
  ws["!freeze"] = { xSplit: 0, ySplit: 3, topLeftCell: "A4", activePane: "bottomLeft", state: "frozen" };

  setStyle(ws, "A1", {
    fill: solid(TEMPLATE.titleFill),
    font: { name: "Aptos Display", sz: 18, bold: true, color: { rgb: TEMPLATE.white } },
    alignment: { horizontal: "center", vertical: "center" }
  });
  setStyle(ws, "A2", {
    font: { name: "Aptos", sz: 10, italic: true, color: { rgb: TEMPLATE.subtitle } },
    alignment: { horizontal: "center", vertical: "center" }
  });

  for (const address of ["A3", "B3", "C3"]) {
    setStyle(ws, address, {
      fill: solid(TEMPLATE.headerFill),
      font: { name: "Aptos", sz: 11, bold: true, color: { rgb: TEMPLATE.white } },
      alignment: { horizontal: "center", vertical: "center" }
    });
  }

  for (let row = 4; row <= lastRow; row++) {
    const isAlternate = row % 2 === 1;
    for (const col of ["A", "B", "C"]) {
      setStyle(ws, `${col}${row}`, {
        fill: isAlternate ? solid(TEMPLATE.alternateFill) : undefined,
        font: { name: "Aptos", sz: 11 },
        alignment: { vertical: "center" },
        border: { bottom: { style: "thin", color: { rgb: TEMPLATE.border } } },
        numFmt: "@"
      });
    }
  }
}

function setStyle(ws, address, style) {
  if (!ws[address]) ws[address] = { t: "s", v: "" };
  ws[address].s = style;
}
function solid(rgb) {
  return { patternType: "solid", fgColor: { rgb } };
}
function normalizeDate(value) {
  const textValue = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(textValue) ? textValue : "";
}
function formatDateTimeLong(date) {
  const textValue = date.toLocaleString("pt-BR", {
    timeZone: "America/Cuiaba",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  return textValue.includes(",") ? textValue : textValue.replace(" ", ", ");
}
function formatWhatsapp(value) {
  const digits = onlyDigits(value);
  const national = digits.startsWith("55") ? digits.slice(2) : digits;
  if (national.length === 11) return `+55 (${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  if (national.length === 10) return `+55 (${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  return safeCell(value);
}
function safeCell(value) {
  const textValue = String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, 32767);
  return /^[=+\-@]/.test(textValue) ? `'${textValue}` : textValue;
}
function onlyDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}
function constantTimeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
function text(message, status) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
