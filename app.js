(() => {
  "use strict";

  const DATA = window.DIAGNOSTIC_DATA;
  const state = {
    currentStep: 0,
    answers: {},
    result: null,
    participant: null,
    answered: new Set(),
    streak: 0,
    currentDraftId: null,
    lastSavedAt: null,
    pdfReady: false,
    dashboardData: null
  };

  const STORAGE_KEYS = {
    leads: `${DATA.projectName}:leads`,
    drafts: `${DATA.projectName}:drafts`,
    activeDraft: `${DATA.projectName}:activeDraft`,
    dashboardCutoff: `${DATA.projectName}:dashboardCutoff`
  };
  const MAX_UPLOAD_BYTES = 1536 * 1024;
  const ADMIN_PASSWORD = "146800";
  const PDF_LINKS = {
    assessment: "https://francisneyliberato-agente-contratacao-pregoeiro.pages.dev/",
    site: "https://www.francisney.com.br/",
    whatsapp: "https://wa.me/5565999031061",
    email: "mailto:francisneyliberato10@gmail.com"
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    clearLocalDataFromUrl();
    renderQuestionSteps();
    bindNavigation();
    bindGeneralUI();
    initAutoSave();
    syncQuestionTotals();
    updateProgress();
    observeReveals();
    initAdminArea();
    initDashboard();
    $("#currentYear").textContent = new Date().getFullYear();
    if (window.lucide) window.lucide.createIcons();
  }

  function clearLocalDataFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("limparAvaliacoes")) return;
    const prefix = `${DATA.projectName}:`;
    Object.keys(localStorage).filter(key => key.startsWith(prefix)).forEach(key => localStorage.removeItem(key));
    sessionStorage.removeItem(`${DATA.projectName}:activeDraft`);
    params.delete("limparAvaliacoes");
    const query = params.toString();
    const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", cleanUrl);
  }

  function renderQuestionSteps() {
    const container = $("#questionSteps");
    container.innerHTML = DATA.axes.map((axis, axisIndex) => `
      <section class="form-step" data-step="${axisIndex + 2}" aria-labelledby="axis-title-${axis.id}">
        <div class="step-heading">
          <span class="step-icon"><i data-lucide="${axis.icon}"></i></span>
          <div>
            <small>Dimensão ${axis.id} de ${DATA.axes.length}</small>
            <h3 id="axis-title-${axis.id}">${escapeHTML(axis.name)}</h3>
            <p>Responda de acordo com sua conduta predominante nos últimos doze meses.</p>
          </div>
        </div>
        ${axis.questions.map(question => renderQuestion(question, axis)).join("")}
        <div class="validation-summary step-error" role="alert" aria-live="polite"></div>
        <div class="step-actions">
          <button class="button button-ghost prev-button" type="button"><i data-lucide="arrow-left"></i> Anterior</button>
          ${axisIndex === DATA.axes.length - 1
            ? `<button class="button button-primary calculate-button" type="button">Calcular resultado <i data-lucide="sparkles"></i></button>`
            : `<button class="button button-primary next-button" type="button">Próxima dimensão <i data-lucide="arrow-right"></i></button>`}
        </div>
      </section>
    `).join("");

    const totalSteps = DATA.axes.length + 2;
    $("#stepDots").innerHTML = Array.from({ length: totalSteps }, (_, i) => `<i data-dot="${i}"></i>`).join("");
    $("#missionMap").innerHTML = DATA.axes.map(axis => `
      <button class="mission-node" type="button" data-mission="${axis.id}" aria-label="Dimensão ${axis.id}: ${escapeHTML(axis.name)}" disabled>
        <span><i data-lucide="${axis.icon}"></i></span><small>${axis.id}</small>
      </button>
    `).join("");
    bindQuestionEvents();
  }

  function renderQuestion(question, axis) {
    return `
      <article class="question-card" id="question-${question.number}" data-question="${question.number}" data-axis="${axis.id}">
        <div class="question-head">
          <span class="question-number">${question.number}</span>
          <div>
            <h4>${escapeHTML(question.text)}</h4>
          </div>
        </div>
        <div class="scale-options situational-options" role="radiogroup" aria-label="Resposta da questão ${question.number}">
          ${question.options.map((option, index) => `
            <label class="score-option" title="${escapeHTML(option.text)}">
              <input type="radio" name="score-${question.number}" value="${index + 1}" data-question="${question.number}">
              <span><b>${escapeHTML(option.letter)}</b><small>${escapeHTML(option.text)}</small></span>
            </label>
          `).join("")}
        </div>
        <div class="question-extras">
          <label class="field observation-field">
            <span>Reflexão ou providência <em>facultativo</em></span>
            <textarea name="observation-${question.number}" placeholder="Registre um aprendizado, uma evidência ou uma providência..."></textarea>
            <small class="conditional-note"></small>
          </label>
          <label class="field evidence-field">
            <span>Evidência de desenvolvimento <em>facultativo</em></span>
            <textarea name="evidence-${question.number}" placeholder="Informe documento, processo, link, relatório ou registro, se desejar..."></textarea>
            <small class="conditional-note"></small>
          </label>
          <label class="field upload-field">
            <span>Upload de documento comprobatório <em>facultativo</em></span>
            <input type="file" name="upload-${question.number}" data-upload-question="${question.number}" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt">
            <small class="upload-note" data-upload-note="${question.number}">PDF, imagem, Word ou Excel até 1,5 MB.</small>
          </label>
        </div>
      </article>
    `;
  }

  function bindQuestionEvents() {
    $$('input[type="radio"][data-question]').forEach(input => {
      input.addEventListener("change", event => updateQuestionRequirement(Number(event.target.dataset.question)));
    });
    $$('input[type="file"][data-upload-question]').forEach(input => {
      input.addEventListener("change", event => handleUploadChange(event.target));
    });
  }

  function updateQuestionRequirement(number) {
    const card = $(`#question-${number}`);
    const value = $(`input[name="score-${number}"]:checked`)?.value;
    const observation = $(`[name="observation-${number}"]`);
    const evidence = $(`[name="evidence-${number}"]`);
    const observationNote = $(".observation-field .conditional-note", card);
    const evidenceNote = $(".evidence-field .conditional-note", card);
    observation.required = false;
    evidence.required = false;
    observationNote.textContent = ["0", "1", "2", "NA"].includes(value)
      ? "Campo facultativo, recomendado para registrar reflexão sobre respostas A, B ou C."
      : "";
    evidenceNote.textContent = ["4", "5"].includes(value) ? "Campo facultativo, recomendado para comprovar boas práticas." : "";
    card.classList.remove("invalid");
    if (!state.answered.has(number)) {
      state.answered.add(number);
      state.streak++;
      card.classList.add("just-answered");
      setTimeout(() => card.classList.remove("just-answered"), 650);
      showXpPop(number);
    }
    updateGameHUD();
    autoSaveDraftSoon();
  }

  function bindNavigation() {
    $("#diagnosticForm").addEventListener("click", event => {
      const next = event.target.closest(".next-button");
      const previous = event.target.closest(".prev-button");
      const calculate = event.target.closest(".calculate-button");

      if (next && validateStep(state.currentStep)) showStep(state.currentStep + 1);
      if (previous) showStep(state.currentStep - 1);
      if (calculate && validateStep(state.currentStep)) completeDiagnostic();
    });
  }

  function showStep(index) {
    // O contexto institucional é complementar: após o cadastro, o teste deve começar imediatamente.
    if (index === 1) index = 2;
    const steps = $$(".form-step");
    if (index < 0 || index >= steps.length) return;
    steps.forEach(step => step.classList.remove("active"));
    steps[index].classList.add("active");
    state.currentStep = index;
    updateProgress();
    const shellTop = $("#teste").getBoundingClientRect().top + window.scrollY + 180;
    window.scrollTo({ top: shellTop, behavior: "smooth" });
    if (window.lucide) window.lucide.createIcons();
  }

  function updateProgress() {
    // A etapa institucional é opcional e não compõe o avanço principal do questionário.
    const effectiveStep = state.currentStep === 0 ? 0 : state.currentStep - 1;
    const percent = Math.round((effectiveStep / DATA.axes.length) * 100);
    $("#progressPercent").textContent = `${percent}%`;
    $("#progressBar").style.width = `${percent}%`;
    $(".progress-track").style.setProperty("--progress", `${Math.min(percent, 98)}%`);
    $("#progressLabel").textContent = state.currentStep === 0
      ? "Identificação e acesso"
      : `Dimensão ${state.currentStep - 1}: ${DATA.axes[state.currentStep - 2].short}`;
    $$("#stepDots i").forEach((dot, i) => {
      dot.classList.toggle("done", i < state.currentStep);
      dot.classList.toggle("active", i === state.currentStep);
    });
    $$(".mission-node").forEach((node, i) => {
      node.classList.toggle("complete", i + 2 < state.currentStep);
      node.classList.toggle("active", i + 2 === state.currentStep);
    });
    updateGameHUD();
  }

  function validateStep(index) {
    if (index === 0) return validateLeadForm();
    if (index === 1) return true;
    const axis = DATA.axes[index - 2];
    const step = $(`.form-step[data-step="${index}"]`);
    let firstInvalid = null;
    let invalidCount = 0;

    axis.questions.forEach(question => {
      const card = $(`#question-${question.number}`);
      const score = $(`input[name="score-${question.number}"]:checked`)?.value;
      const invalid = !score;
      card.classList.toggle("invalid", invalid);
      if (invalid) {
        invalidCount++;
        firstInvalid ||= card;
      }
    });

    $(".step-error", step).textContent = invalidCount
      ? `Revise ${invalidCount} ${invalidCount === 1 ? "questão" : "questões"}: selecione uma resposta para cada quesito. Os campos de observação, evidência e upload são facultativos.`
      : "";
    if (firstInvalid) firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
    return !invalidCount;
  }

  function validateLeadForm() {
    const form = $("#diagnosticForm");
    const requiredNames = ["nomeCompleto", "whatsapp", "email", "codigoAcesso"];
    let firstInvalid = null;
    const messages = [];

    requiredNames.forEach(name => {
      const input = form.elements[name];
      const invalid = !input.value.trim() || (name === "email" && !isValidEmail(input.value));
      input.closest(".field").classList.toggle("invalid", invalid);
      if (invalid) firstInvalid ||= input;
    });

    if (!form.elements.nomeCompleto.value.trim()) messages.push("Informe o nome completo.");
    if (!form.elements.whatsapp.value.trim()) messages.push("Informe o WhatsApp.");
    if (!isValidEmail(form.elements.email.value)) messages.push("Informe um e-mail válido.");
    if (normalize(form.elements.codigoAcesso.value) !== normalize(DATA.accessCode)) {
      messages.push("O código de acesso está incorreto.");
      form.elements.codigoAcesso.closest(".field").classList.add("invalid");
      firstInvalid ||= form.elements.codigoAcesso;
    }

    const consent = $(".consent-box");
    const hasConsent = form.elements.consentimentoLgpd.checked;
    consent.classList.toggle("invalid", !hasConsent);
    if (!hasConsent) messages.push("Confirme o consentimento LGPD.");

    $("#leadErrors").innerHTML = messages.map(message => `• ${escapeHTML(message)}`).join("<br>");
    if (firstInvalid) firstInvalid.focus();
    return messages.length === 0;
  }

  async function completeDiagnostic() {
    collectAnswers();
    state.participant = collectParticipant();
    state.result = calculateResult(state.answers);
    $("#resultado").classList.remove("hidden");
    $("#resultContent").classList.add("hidden");
    $("#resultLoader").classList.remove("hidden");
    $("#resultado").scrollIntoView({ behavior: "smooth" });

    await delay(2200);
    $("#resultLoader").classList.add("hidden");
    $("#resultContent").classList.remove("hidden");
    renderResult();
    preparePdfButton();
    launchConfetti();
    saveLead();
  }

  function collectAnswers() {
    DATA.axes.forEach(axis => axis.questions.forEach(question => {
      state.answers[question.number] = {
        question: question.text,
        axisId: axis.id,
        axis: axis.name,
        score: $(`input[name="score-${question.number}"]:checked`).value,
        weight: question.weight,
        expectedEvidence: question.evidence,
        observation: sanitizeText($(`[name="observation-${question.number}"]`).value),
        indicatedEvidence: sanitizeText($(`[name="evidence-${question.number}"]`).value),
        document: state.answers[question.number]?.document || null
      };
    }));
  }

  function collectParticipant() {
    const formData = new FormData($("#diagnosticForm"));
    const fields = [
      "nomeCompleto", "whatsapp", "email", "orgaoEntidade", "unidadeAdministrativa",
      "municipioEstado", "cargoFuncao", "telefone", "sistemaPatrimonial", "qtdBensMoveis",
      "qtdBensImoveis", "dataUltimoInventario", "ultimaConciliacao", "responsavelValidacao"
    ];
    const participant = {};
    fields.forEach(field => participant[field] = sanitizeText(formData.get(field) || ""));
    participant.consentimentoLgpd = formData.get("consentimentoLgpd") === "on";
    participant.dataHora = new Date().toISOString();
    return participant;
  }

  /**
   * Cálculo ponderado:
   * obtida = resposta (A=1 a E=5); máxima = 5 por questão.
   */
  function calculateResult(answers) {
    let obtained = 0;
    let maximum = 0;
    let applicable = 0;
    const axisResults = DATA.axes.map(axis => {
      let axisObtained = 0;
      let axisMaximum = 0;
      let axisApplicable = 0;
      axis.questions.forEach(question => {
        const answer = answers[question.number];
        if (answer.score === "NA") return;
        const score = Number(answer.score);
        axisObtained += score * question.weight;
        axisMaximum += 5 * question.weight;
        axisApplicable++;
      });
      obtained += axisObtained;
      maximum += axisMaximum;
      applicable += axisApplicable;
      return {
        id: axis.id,
        name: axis.name,
        short: axis.short,
        obtained: axisObtained,
        maximum: axisMaximum,
        applicable: axisApplicable,
        percent: axisMaximum ? (axisObtained / axisMaximum) * 100 : 0,
        recommendation: axis.recommendation
      };
    });

    const rawPercent = maximum ? (obtained / maximum) * 100 : 0;
    const alerts = evaluateRiskTriggers(answers);
    const caps = alerts.filter(alert => alert.cap).map(alert => alert.cap);
    const activeCap = caps.length ? Math.min(...caps) : null;
    const adjustedPercent = activeCap === null ? rawPercent : Math.min(rawPercent, activeCap);
    const level = classifyMaturity(adjustedPercent);
    const sortedAxes = [...axisResults].sort((a, b) => b.percent - a.percent);
    const actionPlan = generateActionPlan(answers);

    return {
      obtained,
      maximum,
      applicable,
      rawPercent,
      adjustedPercent,
      activeCap,
      level,
      axisResults,
      strongest: sortedAxes[0],
      priority: sortedAxes[sortedAxes.length - 1],
      alerts,
      actionPlan,
      generatedAt: new Date().toISOString()
    };
  }

  function classifyMaturity(percent) {
    return DATA.maturityLevels.find(level => percent >= level.min && percent <= level.max)
      || DATA.maturityLevels[DATA.maturityLevels.length - 1];
  }

  function evaluateRiskTriggers(answers) {
    return DATA.riskTriggers
      .filter(trigger => {
        const score = answers[trigger.question]?.score;
        return score !== "NA" && Number(score) <= 2;
      })
      .map(trigger => ({ ...trigger, score: Number(answers[trigger.question].score) }));
  }

  function generateActionPlan(answers) {
    const plans = [];
    DATA.axes.forEach(axis => axis.questions.forEach(question => {
      const answer = answers[question.number];
      if (answer.score === "NA") {
        plans.push({
          question: question.number, axis: axis.name, score: "N/A",
          finding: `Critério declarado como não aplicável: ${answer.observation}`,
          risk: "A justificativa deve ser validada para evitar exclusão indevida do cálculo.",
          cause: "Não aplicabilidade declarada pelo respondente.",
          recommendation: "Validar e documentar formalmente a não aplicabilidade.",
          owner: axis.owner, ownerRole: "", deadline: "30 dias", priority: "Alta", evidence: "Justificativa formal aprovada.", status: "Pendente de validação"
        });
        return;
      }
      const score = Number(answer.score);
      const trigger = DATA.riskTriggers.find(item => item.question === question.number);
      const priority = score <= 1 ? "Crítica" : score === 2 ? "Alta" : score === 3 ? "Média" : "Baixa";
      const deadline = suggestDeadline(priority);
      const finding = score <= 2
        ? `A conduta declarada para “${question.text}” recebeu ${score}/5. ${answer.observation}`
        : score === 3
          ? `A conduta demonstra desenvolvimento intermediário e requer aplicação mais consistente. ${answer.observation}`
          : `Conduta declarada com nota ${score}/5 e evidência indicada.`;
      plans.push({
        question: question.number,
        axis: axis.name,
        score,
        finding,
        risk: trigger?.risk || riskByWeight(question.weight, score),
        cause: probableCause(axis.id, score),
        recommendation: trigger?.recommendation || (score <= 3 ? axis.recommendation : "Manter a prática, preservar evidências e monitorar indicadores e oportunidades de melhoria."),
        owner: axis.owner,
        ownerRole: "",
        deadline,
        priority,
        evidence: score <= 3 ? question.evidence : answer.indicatedEvidence || question.evidence,
        status: score <= 3 ? "Não iniciado" : "Monitoramento"
      });
    }));
    return plans;
  }

  function suggestDeadline(priority) {
    if (priority === "Crítica") return "30 dias";
    if (priority === "Alta") return "60 dias";
    return "90 dias";
  }

  function riskByWeight(weight, score) {
    if (score >= 4) return "Risco residual baixo, condicionado à manutenção das evidências e do monitoramento.";
    if (score <= 2) return "Risco de decisão insuficientemente fundamentada, quebra de isonomia, perda de competitividade ou retrabalho.";
    if (score === 3) return "A prática requer sistematização, evidências e aplicação consistente em casos reais.";
    return "Manutenção da qualidade decisória e evolução contínua.";
  }

  function probableCause(axisId, score) {
    const causes = {
      1: "Registros insuficientes, conflito não declarado ou baixa proteção da independência decisória.",
      2: "Papéis pouco claros, controles compensatórios frágeis ou escalonamento tardio.",
      3: "Diagnóstico incompleto da necessidade, dos riscos, do mercado ou da solução.",
      4: "Pesquisa de preços ou análise de mercado pouco comparável e insuficientemente fundamentada.",
      5: "Revisão cruzada incompleta entre ETP, TR, edital e minuta contratual.",
      6: "Pressão de tempo, comunicação insuficiente ou motivação incompleta da decisão.",
      7: "Diligências sem critérios consistentes ou compreensão limitada do formalismo moderado.",
      8: "Negociação, recursos ou incidentes tratados sem roteiro ou registro robusto.",
      9: "Comunicação, priorização ou autorregulação emocional precisam de desenvolvimento.",
      10: "Ausência de rotina de atualização normativa, indicadores ou aprendizagem estruturada."
    };
    return `${causes[axisId]} A conduta declarada ainda não alcançou o padrão profissional esperado.`;
  }

  function renderResult() {
    const result = state.result;
    const participant = state.participant;
    const adjusted = formatPercent(result.adjustedPercent);
    $("#resultInstitution").textContent = `${participant.nomeCompleto} · ${participant.orgaoEntidade} · ${formatDateTime(result.generatedAt)}`;
    $("#adjustedPercent").textContent = adjusted;
    $("#rawPercent").textContent = formatPercent(result.rawPercent);
    $("#totalScore").textContent = `${formatNumber(result.obtained)} / ${formatNumber(result.maximum)}`;
    $("#applicableCount").textContent = `${result.applicable} de ${totalQuestions()}`;
    $("#maturityBadge").textContent = result.level.name;
    $("#maturityBadge").style.color = result.level.color;
    $("#resultTitle").textContent = `Maturidade profissional: ${result.level.name.toLowerCase()}`;
    $("#resultAnalysis").textContent = `${result.level.diagnosis} ${result.activeCap ? `O percentual final foi limitado a ${result.activeCap}% por gatilho estrutural crítico.` : ""}`;
    $("#resultRing").style.setProperty("--score", Math.min(result.adjustedPercent, 100).toFixed(2));
    $("#resultRing").style.setProperty("--result-color", result.level.color);
    $("#strongestAxis").textContent = result.strongest.name;
    $("#strongestPercent").textContent = formatPercent(result.strongest.percent);
    $("#priorityAxis").textContent = result.priority.name;
    $("#priorityPercent").textContent = formatPercent(result.priority.percent);

    $("#axisChart").innerHTML = result.axisResults.map(axis => `
      <div class="axis-bar-row">
        <span title="${escapeHTML(axis.name)}">${axis.id}. ${escapeHTML(axis.short)}</span>
        <div class="bar-track"><div class="bar-fill" data-width="${axis.percent.toFixed(2)}"></div></div>
        <strong>${formatPercent(axis.percent)}</strong>
      </div>
    `).join("");
    requestAnimationFrame(() => $$(".bar-fill").forEach(bar => bar.style.width = `${bar.dataset.width}%`));

    $("#criticalAlerts").innerHTML = result.alerts.length
      ? result.alerts.map(alert => `
        <div class="alert-item">
          <i data-lucide="triangle-alert"></i>
          <div><h4>${escapeHTML(alert.title)}</h4><p><strong>Efeito:</strong> ${alert.cap ? `maturidade limitada a ${alert.cap}%. ` : ""}<strong>Risco:</strong> ${escapeHTML(alert.risk)} <strong>Recomendação:</strong> ${escapeHTML(alert.recommendation)}</p></div>
          <span class="priority-pill">${escapeHTML(alert.priority)}</span>
        </div>
      `).join("")
      : `<div class="no-alerts"><i data-lucide="shield-check"></i><p>Nenhum dos nove gatilhos críticos foi acionado.</p></div>`;

    const priorityPlans = result.actionPlan.filter(plan => typeof plan.score === "number" && plan.score <= 3);
    $("#actionPlanBody").innerHTML = priorityPlans.map(plan => `
      <tr>
        <td><strong>${plan.question}</strong><br>Nota ${plan.score}</td>
        <td><strong>${escapeHTML(plan.finding)}</strong><br><small>${escapeHTML(plan.risk)}</small></td>
        <td>${escapeHTML(plan.recommendation)}</td>
        <td>${escapeHTML(plan.owner)}</td>
        <td>${escapeHTML(plan.ownerRole || "Opcional")}</td>
        <td>${escapeHTML(plan.deadline)}</td>
        <td><span class="status-pill">${escapeHTML(plan.status)}</span></td>
      </tr>
    `).join("") || `<tr><td colspan="7">Não há ações corretivas ou de aperfeiçoamento pendentes.</td></tr>`;

    const recommendationAxes = [...result.axisResults].sort((a, b) => a.percent - b.percent).slice(0, 6);
    $("#recommendations").innerHTML = `
      <div class="recommendation-item"><span>Recomendação geral</span><p>${escapeHTML(result.level.recommendation)}</p></div>
      ${recommendationAxes.map(axis => `<div class="recommendation-item"><span>Dimensão ${axis.id} · ${formatPercent(axis.percent)}</span><p>${escapeHTML(axis.recommendation)}</p></div>`).join("")}
    `;
    if (window.lucide) window.lucide.createIcons();
  }

  async function saveLead() {
    const payload = buildLeadPayload();
    saveToLocalStorage(payload);
    renderDashboard(aggregateDashboardData(loadLocalLeads()));
    const status = $("#saveStatus");
    status.textContent = "Diagnóstico preservado localmente neste navegador.";

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("API indisponível");
      status.textContent = "Diagnóstico salvo com segurança.";
    } catch {
      status.textContent = "Diagnóstico salvo localmente. O envio ao banco ocorrerá quando a API estiver configurada.";
    }
  }

  function buildLeadPayload() {
    const p = state.participant;
    const r = state.result;
    return {
      created_at: r.generatedAt,
      nome_completo: p.nomeCompleto,
      whatsapp: p.whatsapp,
      email: p.email,
      consentimento_lgpd: p.consentimentoLgpd,
      orgao_entidade: p.orgaoEntidade,
      unidade_administrativa: p.unidadeAdministrativa,
      municipio_estado: p.municipioEstado,
      cargo_funcao: p.cargoFuncao,
      telefone: p.telefone,
      sistema_patrimonial: p.sistemaPatrimonial,
      qtd_bens_moveis: p.qtdBensMoveis,
      qtd_bens_imoveis: p.qtdBensImoveis,
      data_ultimo_inventario: p.dataUltimoInventario,
      ultima_conciliacao: p.ultimaConciliacao,
      responsavel_validacao: p.responsavelValidacao,
      pontuacao_total: r.obtained,
      pontuacao_maxima: r.maximum,
      percentual_bruto: round(r.rawPercent),
      percentual_ajustado: round(r.adjustedPercent),
      classificacao: r.level.name,
      eixo_mais_forte: r.strongest.name,
      eixo_prioritario: r.priority.name,
      alertas: r.alerts,
      resultados_eixos: r.axisResults,
      respostas: stripDocumentData(state.answers),
      plano_acao: r.actionPlan,
      url_origem: window.location.href,
      user_agent: navigator.userAgent
    };
  }

  function stripDocumentData(answers) {
    return Object.fromEntries(Object.entries(answers || {}).map(([number, answer]) => [number, {
      ...answer,
      document: answer.document ? {
        name: answer.document.name,
        type: answer.document.type,
        size: answer.document.size,
        uploadedAt: answer.document.uploadedAt
      } : null
    }]));
  }

  function saveToLocalStorage(payload) {
    try {
      const key = STORAGE_KEYS.leads;
      const current = JSON.parse(localStorage.getItem(key) || "[]");
      current.push(payload);
      localStorage.setItem(key, JSON.stringify(current.slice(-30)));
      saveDraftNow();
    } catch (error) {
      console.warn("Não foi possível salvar no localStorage.", error);
    }
  }

  function loadLocalLeads() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.leads) || "[]");
    } catch {
      return [];
    }
  }

  function initAutoSave() {
    restoreActiveDraftSilently();
    $("#diagnosticForm").addEventListener("input", autoSaveDraftSoon);
    $("#diagnosticForm").addEventListener("change", autoSaveDraftSoon);
    window.addEventListener("beforeunload", () => saveDraftNow());
  }

  function autoSaveDraftSoon() {
    clearTimeout(autoSaveDraftSoon.timer);
    autoSaveDraftSoon.timer = setTimeout(saveDraftNow, 250);
  }

  function saveDraftNow() {
    const form = $("#diagnosticForm");
    if (!form) return;
    const participant = collectParticipant();
    const answers = collectPartialAnswers();
    const hasIdentity = participant.email || participant.whatsapp || participant.nomeCompleto;
    const hasAnswers = Object.values(answers).some(answer => answer.score || answer.observation || answer.indicatedEvidence || answer.document);
    if (!hasIdentity && !hasAnswers) return;

    const drafts = loadDrafts();
    const id = state.currentDraftId || localStorage.getItem(STORAGE_KEYS.activeDraft) || cryptoRandomId();
    const draft = {
      id,
      status: state.result ? "concluido" : "em_andamento",
      currentStep: state.currentStep,
      participant,
      answers,
      result: state.result,
      updatedAt: new Date().toISOString()
    };
    const next = [draft, ...drafts.filter(item => item.id !== id)].slice(0, 50);
    localStorage.setItem(STORAGE_KEYS.drafts, JSON.stringify(next));
    localStorage.setItem(STORAGE_KEYS.activeDraft, id);
    state.currentDraftId = id;
    state.lastSavedAt = draft.updatedAt;
    saveRemoteDraftSoon(draft);
    const status = $("#draftStatus");
    if (status) status.textContent = `Salvo automaticamente às ${new Date(draft.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`;
  }

  function collectPartialAnswers() {
    const answers = {};
    DATA.axes.forEach(axis => axis.questions.forEach(question => {
      const score = $(`input[name="score-${question.number}"]:checked`)?.value || "";
      const previous = state.answers[question.number] || {};
      answers[question.number] = {
        question: question.text,
        axisId: axis.id,
        axis: axis.name,
        score,
        weight: question.weight,
        expectedEvidence: question.evidence,
        observation: sanitizeText($(`[name="observation-${question.number}"]`)?.value || ""),
        indicatedEvidence: sanitizeText($(`[name="evidence-${question.number}"]`)?.value || ""),
        document: previous.document || null
      };
    }));
    return answers;
  }

  function saveRemoteDraftSoon(draft) {
    clearTimeout(saveRemoteDraftSoon.timer);
    saveRemoteDraftSoon.timer = setTimeout(async () => {
      if (!draft.participant?.consentimentoLgpd || !draft.participant?.whatsapp || !draft.participant?.email) return;
      try {
        await fetch("/api/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: draft.id, status: draft.status, participant: draft.participant, answers: draft.answers, currentStep: draft.currentStep })
        });
      } catch {
        // O rascunho local permanece disponível caso a conexão esteja indisponível.
      }
    }, 1200);
  }

  function loadDrafts() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.drafts) || "[]");
    } catch {
      return [];
    }
  }

  function restoreActiveDraftSilently() {
    const id = localStorage.getItem(STORAGE_KEYS.activeDraft);
    const draft = loadDrafts().find(item => item.id === id && item.status !== "concluido");
    if (draft) applyDraft(draft, false);
  }

  function applyDraft(draft, announce = true) {
    state.currentDraftId = draft.draftId || draft.id;
    state.answers = draft.answers || {};
    state.participant = draft.participant || null;
    state.result = draft.result || null;
    fillParticipant(draft.participant || {});
    fillAnswers(draft.answers || {});
    localStorage.setItem(STORAGE_KEYS.activeDraft, state.currentDraftId);
    showStep(Math.min(Number(draft.currentStep || 0), DATA.axes.length + 1));
    if (announce) {
      $("#teste").scrollIntoView({ behavior: "smooth" });
      showToast("Avaliao retomada exatamente do ponto salvo.");
    }
  }

  function fillParticipant(participant) {
    const form = $("#diagnosticForm");
    Object.entries(participant).forEach(([key, value]) => {
      const input = form.elements[key];
      if (!input || input.type === "checkbox") return;
      input.value = value || "";
    });
    if (form.elements.consentimentoLgpd) form.elements.consentimentoLgpd.checked = Boolean(participant.consentimentoLgpd);
  }

  function fillAnswers(answers) {
    state.answered.clear();
    Object.entries(answers).forEach(([number, answer]) => {
      if (answer.score) {
        const score = $(`input[name="score-${number}"][value="${answer.score}"]`);
        if (score) {
          score.checked = true;
          state.answered.add(Number(number));
          updateQuestionRequirement(Number(number));
        }
      }
      const observation = $(`[name="observation-${number}"]`);
      const evidence = $(`[name="evidence-${number}"]`);
      if (observation) observation.value = answer.observation || "";
      if (evidence) evidence.value = answer.indicatedEvidence || "";
      updateUploadNote(number, answer.document);
    });
    updateGameHUD();
  }

  async function handleUploadChange(input) {
    const number = Number(input.dataset.uploadQuestion);
    const file = input.files?.[0];
    if (!file) {
      if (state.answers[number]) state.answers[number].document = null;
      updateUploadNote(number, null);
      autoSaveDraftSoon();
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      input.value = "";
      showToast("Arquivo acima de 1,5 MB. Informe a evidncia no campo de texto ou selecione um arquivo menor.");
      return;
    }
    const dataUrl = await readFileAsDataURL(file);
    state.answers[number] ||= {};
    state.answers[number].document = {
      name: sanitizeText(file.name).slice(0, 180),
      type: sanitizeText(file.type || "arquivo"),
      size: file.size,
      dataUrl,
      uploadedAt: new Date().toISOString()
    };
    updateUploadNote(number, state.answers[number].document);
    autoSaveDraftSoon();
  }

  function updateUploadNote(number, document) {
    const note = $(`[data-upload-note="${number}"]`);
    if (!note) return;
    note.textContent = document ? `Anexado: ${document.name} (${formatFileSize(document.size)}).` : "PDF, imagem, Word ou Excel até 1,5 MB.";
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function bindGeneralUI() {
    const menuToggle = $("#menuToggle");
    menuToggle.addEventListener("click", () => {
      const open = !menuToggle.classList.contains("open");
      menuToggle.classList.toggle("open", open);
      $("#mainNav").classList.toggle("open", open);
      menuToggle.setAttribute("aria-expanded", String(open));
      menuToggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    });
    $$("#mainNav a").forEach(link => link.addEventListener("click", () => {
      menuToggle.classList.remove("open");
      $("#mainNav").classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Abrir menu");
    }));

    $("#restartTest").addEventListener("click", restartDiagnostic);
    $("#shareResult").addEventListener("click", shareResult);
    $("#downloadPdf").addEventListener("click", generatePDF);
    $("#refreshDashboard").addEventListener("click", () => loadDashboard(true));
    $("#downloadDashboardPdf")?.addEventListener("click", () => generateDashboardPDF());
    $("#shareDashboardPdf")?.addEventListener("click", shareDashboardPDF);
    $("#lookupAssessments")?.addEventListener("click", lookupAssessments);
    $("#startNewAssessment")?.addEventListener("click", startNewAssessment);
    $("#adminUnlock")?.addEventListener("click", unlockAdminArea);
    $("#adminPassword")?.addEventListener("keydown", event => {
      if (event.key === "Enter") unlockAdminArea();
    });
    $("#downloadDailyLeads")?.addEventListener("click", () => downloadAdminExcel("day"));
    $("#downloadAllLeads")?.addEventListener("click", () => downloadAdminExcel("all"));
    $("#downloadAdminDashboardPdf")?.addEventListener("click", downloadAdminDashboardPdf);
    $("#resetDashboardData")?.addEventListener("click", resetDashboardData);
    $("#publisherForm")?.addEventListener("submit", submitPublisherForm);
    $("#publisherStartedAt") && ($("#publisherStartedAt").value = new Date().toISOString());
    $$("[data-missing-link]").forEach(link => link.addEventListener("click", event => {
      event.preventDefault();
      showToast(`Link oficial de ${link.dataset.missingLink} ainda não configurado.`);
    }));

    $("#diagnosticForm").addEventListener("input", event => {
      event.target.closest(".field")?.classList.remove("invalid");
    });
    $("#publisherForm")?.addEventListener("input", event => {
      event.target.closest(".field")?.classList.remove("invalid");
      const feedback = $("#publisherFeedback");
      if (feedback) {
        feedback.textContent = "";
        feedback.classList.remove("success");
      }
    });
  }

  async function submitPublisherForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("#publisherSubmit");
    const feedback = $("#publisherFeedback");
    const formData = new FormData(form);
    const data = {
      nomeCompleto: sanitizeText(formData.get("nomeCompleto")),
      email: sanitizeText(formData.get("email")),
      whatsapp: sanitizeText(formData.get("whatsapp")),
      mensagem: sanitizeText(formData.get("mensagem")),
      website: sanitizeText(formData.get("website")),
      startedAt: sanitizeText(formData.get("startedAt")),
      origin: window.location.href
    };
    const errors = [];
    if (data.website) return;
    if (data.nomeCompleto.length < 3) errors.push("Informe o nome completo.");
    if (!isValidEmail(data.email)) errors.push("Informe um e-mail válido.");
    if (onlyDigits(data.whatsapp).length < 10 || onlyDigits(data.whatsapp).length > 13) errors.push("Informe um WhatsApp válido com DDD.");
    if (data.mensagem.length < 10) errors.push("Escreva uma mensagem com pelo menos 10 caracteres.");
    if (errors.length) {
      if (feedback) {
        feedback.innerHTML = errors.map(error => `<p>${escapeHTML(error)}</p>`).join("");
        feedback.classList.remove("success");
      }
      markPublisherInvalidFields(form, data);
      return;
    }
    if (button?.disabled) return;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i data-lucide="loader-circle"></i> Enviando...';
    }
    if (feedback) {
      feedback.textContent = "Enviando sua mensagem...";
      feedback.classList.remove("success");
    }
    if (window.lucide) window.lucide.createIcons();
    try {
      const response = await fetch("/api/editora-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(data)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Não foi possível enviar a mensagem agora.");
      form.reset();
      $("#publisherStartedAt").value = new Date().toISOString();
      if (feedback) {
        feedback.textContent = "Mensagem enviada com sucesso. A Editora Liberato entrará em contato em breve.";
        feedback.classList.add("success");
      }
      showToast("Mensagem enviada para a Editora Liberato.");
    } catch (error) {
      if (feedback) {
        feedback.textContent = error.message || "Não foi possível enviar. Tente novamente em instantes.";
        feedback.classList.remove("success");
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i data-lucide="book-plus"></i> Quero publicar meu livro';
      }
      if (window.lucide) window.lucide.createIcons();
    }
  }

  function markPublisherInvalidFields(form, data) {
    const checks = {
      nomeCompleto: data.nomeCompleto.length >= 3,
      email: isValidEmail(data.email),
      whatsapp: onlyDigits(data.whatsapp).length >= 10 && onlyDigits(data.whatsapp).length <= 13,
      mensagem: data.mensagem.length >= 10
    };
    Object.entries(checks).forEach(([name, ok]) => {
      if (!ok) form.elements[name]?.closest(".field")?.classList.add("invalid");
    });
  }

  function initAdminArea() {
    const dateInput = $("#adminLeadDate");
    if (dateInput && !dateInput.value) dateInput.value = todayInputValue();
  }

  function unlockAdminArea() {
    const password = $("#adminPassword")?.value?.trim() || "";
    const message = $("#adminMessage");
    if (password !== ADMIN_PASSWORD) {
      if (message) {
        message.textContent = "Senha incorreta. Verifique e tente novamente.";
        message.classList.remove("success");
      }
      return;
    }
    $("#adminLogin")?.classList.add("hidden");
    $("#adminDownloads")?.classList.remove("hidden");
    if (message) {
      message.textContent = "Acesso liberado.";
      message.classList.add("success");
    }
    showToast("Área administrativa liberada.");
    if (window.lucide) window.lucide.createIcons();
  }

  function downloadAdminExcel(scope) {
    const params = new URLSearchParams({ token: ADMIN_PASSWORD, scope });
    if (scope === "day") {
      const date = $("#adminLeadDate")?.value || todayInputValue();
      params.set("date", date);
    }
    const url = `/api/leads-export-excel?${params.toString()}`;
    const link = document.createElement("a");
    link.href = url;
    link.rel = "noopener";
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function downloadAdminDashboardPdf() {
    const button = $("#downloadAdminDashboardPdf");
    const message = $("#adminDashboardPdfMessage");
    const filters = readAdminDashboardFilters();
    if (filters.error) {
      if (message) {
        message.textContent = filters.error;
        message.classList.remove("success");
      }
      return;
    }

    let preview = null;
    try {
      if (button) {
        button.disabled = true;
        button.innerHTML = '<span>Preparando PDF...</span>';
      }
      if (message) {
        message.textContent = "Consultando os dados do Dashboard...";
        message.classList.remove("success");
      }
      const params = new URLSearchParams({ token: ADMIN_PASSWORD });
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      const response = await fetch(`/api/dashboard-export?${params.toString()}`, { headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Não foi possível preparar os dados do Dashboard.");

      preview = createAdminDashboardPdfPreview(payload.data, filters.label);
      const file = await generateDashboardPDF({
        target: preview,
        data: payload.data,
        filterLabel: filters.label,
        returnFile: true,
        silent: true,
        skipRefresh: true,
        filename: adminDashboardPdfFileName(filters)
      });
      if (!file) throw new Error("Não foi possível gerar o PDF do Dashboard.");
      downloadBlob(file, file.name);
      if (message) {
        message.textContent = `PDF gerado com ${Number(payload.data?.total || 0).toLocaleString("pt-BR")} ${Number(payload.data?.total || 0) === 1 ? "avaliação" : "avaliações"}.`;
        message.classList.add("success");
      }
      showToast("PDF do Dashboard gerado com sucesso.");
    } catch (error) {
      console.error("Erro ao gerar PDF administrativo do Dashboard:", error);
      if (message) {
        message.textContent = error.message || "Não foi possível gerar o PDF do Dashboard agora.";
        message.classList.remove("success");
      }
    } finally {
      preview?.remove();
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i data-lucide="file-down"></i> Baixar PDF do Dashboard';
      }
      if (window.lucide) window.lucide.createIcons();
    }
  }

  function readAdminDashboardFilters() {
    const startDate = $("#adminDashboardStartDate")?.value || "";
    const startTime = $("#adminDashboardStartTime")?.value || "";
    const endDate = $("#adminDashboardEndDate")?.value || "";
    const endTime = $("#adminDashboardEndTime")?.value || "";
    if ((startTime && !startDate) || (endTime && !endDate)) {
      return { error: "Informe a data correspondente para cada horário selecionado." };
    }

    const from = startDate ? dateTimeToIso(startDate, startTime || "00:00") : "";
    const to = endDate ? dateTimeToIso(endDate, endTime || "23:59", true) : "";
    if ((startDate && !from) || (endDate && !to)) return { error: "Informe datas e horários válidos." };
    if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
      return { error: "A data e o horário finais devem ser posteriores aos iniciais." };
    }
    const format = (date, time, fallback) => date ? `${new Date(`${date}T12:00`).toLocaleDateString("pt-BR")}${time ? ` às ${time}` : fallback}` : "";
    const label = !startDate && !endDate
      ? "Todos os registros"
      : `Período: ${format(startDate, startTime, " desde o início")} — ${format(endDate, endTime, " até o momento")}`;
    return { from, to, label };
  }

  function dateTimeToIso(date, time, endOfMinute = false) {
    const value = new Date(`${date}T${time}:00`);
    if (!Number.isFinite(value.getTime())) return "";
    if (endOfMinute) value.setSeconds(59, 999);
    return value.toISOString();
  }

  function adminDashboardPdfFileName(filters) {
    const suffix = filters.from || filters.to ? "filtrado" : "todos-os-registros";
    return `dashboard-agente-contratacao-${suffix}-${new Date().toISOString().slice(0, 10)}.pdf`;
  }

  function createAdminDashboardPdfPreview(data, filterLabel) {
    const source = $("#dashboard");
    if (!source) throw new Error("Dashboard não encontrado.");
    const preview = source.cloneNode(true);
    preview.id = "adminDashboardPdfPreview";
    preview.classList.add("dashboard-pdf-preview");
    preview.querySelector(".dashboard-actions")?.remove();
    const heading = preview.querySelector(".section-heading");
    if (heading) {
      const summary = document.createElement("p");
      summary.className = "dashboard-filter-summary";
      summary.textContent = filterLabel;
      heading.appendChild(summary);
    }
    source.before(preview);
    renderDashboard(data, preview);
    return preview;
  }

  async function resetDashboardData() {
    const confirmed = window.confirm(
      "Deseja iniciar um novo período no Dashboard?\n\nOs leads, pesquisas individuais e relatórios continuarão salvos. Apenas o painel consolidado passará a contar as respostas feitas a partir de agora."
    );
    if (!confirmed) return;
    const button = $("#resetDashboardData");
    const message = $("#dashboardResetMessage");
    if (button) button.disabled = true;
    if (message) {
      message.textContent = "Zerando Dashboard...";
      message.classList.remove("success");
    }
    try {
      const response = await fetch("/api/dashboard-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token: ADMIN_PASSWORD })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Não foi possível zerar o Dashboard.");
      if (payload.cutoff) {
        localStorage.setItem(STORAGE_KEYS.dashboardCutoff, payload.cutoff);
      }
      if (message) {
        message.textContent = `Dashboard zerado. Nova sessão iniciada em ${formatDateTime(payload.cutoff)}.`;
        message.classList.add("success");
      }
      showToast("Dashboard local e online zerado. Leads e avaliações individuais continuam salvos.");
      await loadDashboard(true);
      window.location.hash = "dashboard";
    } catch (error) {
      if (message) {
        message.textContent = error.message || "Não foi possível zerar o Dashboard agora.";
        message.classList.remove("success");
      }
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function lookupAssessments() {
    const whatsapp = onlyDigits($("#lookupWhatsapp")?.value || "");
    const container = $("#lookupResults");
    if (!whatsapp) {
      container.innerHTML = `<div class="lookup-empty">Informe o WhatsApp usado no cadastro para consultar.</div>`;
      return;
    }
    container.innerHTML = `<div class="lookup-empty">Buscando avaliações...</div>`;
    const matchesContact = item => {
      const p = item.participant || item;
      const itemWhatsapp = onlyDigits(p.whatsapp || "");
      return itemWhatsapp.includes(whatsapp) || whatsapp.includes(itemWhatsapp);
    };
    const drafts = loadDrafts().filter(matchesContact);
    const localCompleted = loadLocalLeads().filter(matchesContact).map(item => ({ ...item, status: "concluido" }));
    let remoteCompleted = [];
    let remoteDrafts = [];
    try {
      const params = new URLSearchParams();
      params.set("whatsapp", whatsapp);
      const [completedResponse, draftsResponse] = await Promise.all([
        fetch(`/api/assessments?${params}`, { headers: { Accept: "application/json" } }),
        fetch(`/api/drafts?${params}`, { headers: { Accept: "application/json" } })
      ]);
      if (completedResponse.ok) remoteCompleted = (await completedResponse.json()).assessments || [];
      if (draftsResponse.ok) remoteDrafts = (await draftsResponse.json()).drafts || [];
    } catch {
      remoteCompleted = [];
      remoteDrafts = [];
    }
    renderLookupResults([...drafts, ...remoteDrafts, ...localCompleted, ...remoteCompleted]);
  }

  function renderLookupResults(items) {
    const container = $("#lookupResults");
    if (!items.length) {
      container.innerHTML = `<div class="lookup-empty">Nenhuma avaliação encontrada para esse WhatsApp. Você pode iniciar uma nova agora.</div>`;
      return;
    }
    const unique = [];
    const seen = new Set();
    items.forEach(item => {
      const id = item.id || `${item.created_at}-${item.email}-${item.whatsapp}`;
      if (seen.has(id)) return;
      seen.add(id);
      unique.push(item);
    });
    container.innerHTML = unique.map(item => {
      const participant = item.participant || item;
      const result = item.result || null;
      const completed = item.status === "concluido" || item.classificacao || result;
      const title = completed ? "Avaliação concluída" : "Questionário em andamento";
      const date = item.updatedAt || item.created_at || item.createdAt || result?.generatedAt;
      const percent = result?.adjustedPercent ?? item.percentual_ajustado;
      return `
        <article class="lookup-card">
          <div><small>${escapeHTML(title)}</small><h4>${escapeHTML(participant.nomeCompleto || item.nome_completo || "Respondente")}</h4><p>${escapeHTML(participant.email || item.email || "")} ${participant.whatsapp || item.whatsapp ? " " + escapeHTML(participant.whatsapp || item.whatsapp) : ""}</p></div>
          <div><strong>${completed ? `${escapeHTML(result?.level?.name || item.classificacao || "Concluída")} ${percent !== undefined ? " " + formatPercent(percent) : ""}` : "Rascunho salvo"}</strong><time>${date ? formatDateTime(date) : "sem data"}</time></div>
          <div class="lookup-actions">
            ${!completed && item.id ? `<button class="button button-secondary" type="button" data-resume-draft="${escapeHTML(item.id)}">Continuar</button>` : ""}
            ${completed ? `<button class="button button-ghost" type="button" data-download-result="${escapeHTML(item.id || "")}">Baixar PDF</button>` : ""}
          </div>
        </article>
      `;
    }).join("");
    $$("[data-resume-draft]", container).forEach(button => button.addEventListener("click", () => {
      const draft = unique.find(item => item.id === button.dataset.resumeDraft) || loadDrafts().find(item => item.id === button.dataset.resumeDraft);
      if (draft) applyDraft(draft, true);
    }));
    $$("[data-download-result]", container).forEach(button => button.addEventListener("click", () => {
      const item = unique.find(entry => String(entry.id || "") === button.dataset.downloadResult) || unique.find(entry => entry.status === "concluido" || entry.classificacao || entry.result);
      loadCompletedForPdf(item);
    }));
  }

  function loadCompletedForPdf(item) {
    if (!item) return;
    if (item.result && item.answers) {
      state.currentDraftId = item.id || state.currentDraftId;
      state.participant = item.participant;
      state.answers = item.answers;
      state.result = item.result;
    } else {
      state.participant = {
        nomeCompleto: item.nome_completo || item.nomeCompleto || "",
        whatsapp: item.whatsapp || "",
        email: item.email || "",
        orgaoEntidade: item.orgao_entidade || "",
        unidadeAdministrativa: item.unidade_administrativa || "",
        municipioEstado: item.municipio_estado || "",
        cargoFuncao: item.cargo_funcao || ""
      };
      state.answers = item.respostas || {};
      state.result = rebuildResultFromLead(item);
    }
    $("#resultado").classList.remove("hidden");
    $("#resultLoader").classList.add("hidden");
    $("#resultContent").classList.remove("hidden");
    renderResult();
    preparePdfButton();
    $("#resultado").scrollIntoView({ behavior: "smooth" });
  }

  function rebuildResultFromLead(item) {
    const level = DATA.maturityLevels.find(entry => entry.name === item.classificacao) || classifyMaturity(Number(item.percentual_ajustado || 0));
    const axisResults = item.resultados_eixos || [];
    return {
      obtained: Number(item.pontuacao_total || 0),
      maximum: Number(item.pontuacao_maxima || 0),
      applicable: Object.values(item.respostas || {}).filter(answer => answer.score && answer.score !== "NA").length,
      rawPercent: Number(item.percentual_bruto || 0),
      adjustedPercent: Number(item.percentual_ajustado || 0),
      activeCap: null,
      level,
      axisResults,
      strongest: axisResults[0] || { name: item.eixo_mais_forte || "", percent: 0 },
      priority: axisResults[axisResults.length - 1] || { name: item.eixo_prioritario || "", percent: 0 },
      alerts: item.alertas || [],
      actionPlan: item.plano_acao || [],
      generatedAt: item.created_at || new Date().toISOString()
    };
  }

  function startNewAssessment() {
    if (state.result || Object.keys(collectPartialAnswers()).some(key => collectPartialAnswers()[key].score)) {
      if (!window.confirm("Deseja iniciar uma nova avaliação? A avaliação atual continuará salva para consulta.")) return;
    }
    localStorage.removeItem(STORAGE_KEYS.activeDraft);
    state.currentDraftId = cryptoRandomId();
    restartDiagnostic(false);
  }

  function restartDiagnostic(confirmBefore = true) {
    if (confirmBefore && !window.confirm("Deseja limpar as respostas e iniciar um novo diagnóstico?")) return;
    $("#diagnosticForm").reset();
    state.answers = {};
    state.result = null;
    state.participant = null;
    state.answered.clear();
    state.streak = 0;
    $$(".question-card,.field,.consent-box").forEach(item => item.classList.remove("invalid"));
    $$(".conditional-note,.validation-summary").forEach(item => item.textContent = "");
    $("#resultado").classList.add("hidden");
    showStep(0);
    $("#teste").scrollIntoView({ behavior: "smooth" });
  }

  async function shareResult() {
    if (!state.result) {
      showToast("Conclua a avaliação antes de compartilhar.");
      return;
    }
    const text = `${DATA.title}
Classificação: ${state.result.level.name}
Resultado: ${formatPercent(state.result.adjustedPercent)}
Página da avaliação: ${PDF_LINKS.assessment}
Site: ${PDF_LINKS.site}
WhatsApp: ${PDF_LINKS.whatsapp}`;
    const button = $("#shareResult");
    let file = null;
    try {
      button.disabled = true;
      button.innerHTML = '<span>Preparando PDF...</span>';
      file = await generatePDF({ returnFile: true, silent: true });
      if (!file) throw new Error("PDF não foi gerado.");

      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ title: DATA.title, text, files: [file] });
        showToast("PDF compartilhado com sucesso.");
        return;
      }

      if (navigator.share) {
        await navigator.share({ title: DATA.title, text, url: PDF_LINKS.assessment });
        downloadBlob(file, file.name);
        showToast("Seu navegador não compartilha PDF diretamente; o relatório foi baixado.");
        return;
      }

      downloadBlob(file, file.name);
      await copyShareText(text);
      showToast("PDF baixado e resumo copiado para compartilhamento.");
    } catch (error) {
      if (error.name === "AbortError") return;
      if (file) downloadBlob(file, file.name);
      await copyShareText(text);
      showToast("Não foi possível abrir o compartilhamento. PDF baixado e resumo copiado.");
    } finally {
      button.disabled = false;
      button.innerHTML = '<i data-lucide="share-2"></i> Compartilhar PDF';
      if (window.lucide) window.lucide.createIcons();
    }
  }

  async function shareDashboardPDF() {
    const text = `Dashboard da Autoavaliação do Agente de Contratação e Pregoeiro
Página da avaliação: ${PDF_LINKS.assessment}
Site: ${PDF_LINKS.site}
WhatsApp: ${PDF_LINKS.whatsapp}`;
    const button = $("#shareDashboardPdf");
    let file = null;
    try {
      if (button) {
        button.disabled = true;
        button.innerHTML = '<span>Preparando PDF...</span>';
      }
      file = await generateDashboardPDF({ returnFile: true, silent: true });
      if (!file) throw new Error("PDF do Dashboard não foi gerado.");
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ title: "Dashboard da Autoavaliação do Agente de Contratação e Pregoeiro", text, files: [file] });
        showToast("PDF do Dashboard compartilhado com sucesso.");
        return;
      }
      downloadBlob(file, file.name);
      await copyShareText(text);
      showToast("PDF do Dashboard baixado e resumo copiado para compartilhamento.");
    } catch (error) {
      if (error.name === "AbortError") return;
      if (file) downloadBlob(file, file.name);
      await copyShareText(text);
      showToast("Não foi possível compartilhar. PDF do Dashboard baixado e resumo copiado.");
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i data-lucide="share-2"></i> Compartilhar PDF';
      }
      if (window.lucide) window.lucide.createIcons();
    }
  }

  async function generateDashboardPDF(options = {}) {
    const silent = Boolean(options.silent);
    const ready = await waitForPdfLibrary(12000);
    if (!ready) {
      if (!silent) showToast("Bibliotecas do PDF ainda não carregaram. Recarregue a página e tente novamente.");
      return null;
    }
    const button = options.button || $("#downloadDashboardPdf");
    if (!silent && button) {
      button.disabled = true;
      button.innerHTML = '<span>Gerando PDF...</span>';
    }
    try {
      if (!options.skipRefresh) await loadDashboard(false);
      const data = options.data || state.dashboardData || aggregateDashboardData(loadLocalLeads());
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
      const W = 297, H = 210, M = 14;
      drawDashboardPdf(doc, data, options.filterLabel || "Todos os registros", W, H, M);

      const blob = doc.output("blob");
      const filename = options.filename || `dashboard-agente-contratacao-${new Date().toISOString().slice(0, 10)}.pdf`;
      if (options.returnFile) return new File([blob], filename, { type: "application/pdf" });
      downloadBlob(blob, filename);
      if (!silent) showToast("PDF do Dashboard gerado com sucesso.");
      return blob;
    } catch (error) {
      console.error("Erro ao gerar PDF do Dashboard:", error);
      if (!silent) showToast("Não foi possível gerar o PDF do Dashboard agora.");
      return null;
    } finally {
      if (!silent && button) {
        button.disabled = false;
        button.innerHTML = '<i data-lucide="file-down"></i> Baixar PDF';
      }
      if (window.lucide) window.lucide.createIcons();
    }
  }

  function drawDashboardPdf(doc, data, filterLabel, W, H, M) {
    const ink = [18, 35, 53], teal = [85, 199, 164], gold = [246, 185, 74], muted = [116, 137, 153];
    const total = Number(data.total || 0), average = Number(data.average || 0), distribution = data.distribution || {};
    const dominant = Object.entries(distribution).sort((a, b) => b[1] - a[1])[0] || ["Sem dados", 0];
    const card = (x, label, value, detail, color) => {
      doc.setFillColor(...ink); doc.setDrawColor(43, 69, 91); doc.roundedRect(x, 43, 64, 31, 4, 4, "FD");
      doc.setFillColor(...color); doc.roundedRect(x + 5, 49, 4, 19, 2, 2, "F");
      doc.setTextColor(160, 177, 193); doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.text(label.toUpperCase(), x + 13, 52);
      doc.setTextColor(245, 249, 252); doc.setFont("times", "bold"); doc.setFontSize(value.length > 20 ? 12 : 18); doc.text(value, x + 13, 63);
      doc.setTextColor(...muted); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.text(detail, x + 13, 69);
    };
    addDashboardPdfHeader(doc, W, M);
    doc.setTextColor(...muted); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.text(filterLabel, M, 34); doc.text(`Emitido em ${formatDateTime(new Date().toISOString())}`, W - M, 34, { align: "right" });
    card(M, "Diagnósticos realizados", total.toLocaleString("pt-BR"), `${Number(data.today || 0)} hoje`, teal);
    card(M + 69, "Maturidade média", formatPercent(average), total ? classifyMaturity(average).name : "Sem dados", gold);
    card(M + 138, "Nível predominante", dominant[0], `${dominant[1]} ${dominant[1] === 1 ? "diagnóstico" : "diagnósticos"}`, [169, 139, 244]);
    card(M + 207, "Alertas identificados", Number(data.alertCount || 0).toLocaleString("pt-BR"), "gatilhos críticos", [239, 92, 103]);
    doc.setFillColor(...ink); doc.setDrawColor(43, 69, 91); doc.roundedRect(M, 83, W - M * 2, 88, 4, 4, "FD");
    doc.setTextColor(...gold); doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.text("PANORAMA GERAL", M + 8, 94);
    doc.setTextColor(245, 249, 252); doc.setFont("times", "bold"); doc.setFontSize(18); doc.text("Distribuição por maturidade", M + 8, 106);
    const colors = [[239,92,103],[240,138,75],[243,189,79],[85,199,164],[82,191,230]];
    Object.entries(distribution).forEach(([name, count], index) => { const y = 119 + index * 10; doc.setFillColor(...(colors[index] || muted)); doc.circle(M + 11, y - 2, 2.2, "F"); doc.setTextColor(215,225,233); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.text(name, M + 17, y); doc.setTextColor(245,249,252); doc.setFont("helvetica", "bold"); doc.text(String(count), M + 110, y, { align:"right" }); });
    doc.setFillColor(7, 21, 34); doc.circle(M + 179, 133, 29, "F"); doc.setTextColor(245,249,252); doc.setFont("times", "bold"); doc.setFontSize(28); doc.text(String(total), M + 179, 131, { align:"center" }); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(188,203,216); doc.text(total === 1 ? "avaliação" : "avaliações", M + 179, 141, { align:"center" });
    addDashboardPdfFooter(doc, W, H, M, 1, 2);
    doc.addPage(); addDashboardPdfHeader(doc, W, M);
    doc.setTextColor(...gold); doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.text("DESEMPENHO COLETIVO", M, 37); doc.setTextColor(245,249,252); doc.setFont("times", "bold"); doc.setFontSize(18); doc.text("Média por dimensão", M, 48);
    const axes = data.axes?.length ? data.axes : DATA.axes.map(axis => ({ id: axis.id, short: axis.short, average: 0 }));
    axes.slice(0, 10).forEach((axis, index) => { const y = 59 + index * 11; doc.setTextColor(209,222,232); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.text(`${axis.id}. ${String(axis.short || axis.name).slice(0, 30)}`, M, y); doc.setFillColor(36,59,78); doc.roundedRect(M + 72, y - 4, 93, 4, 2, 2, "F"); doc.setFillColor(...teal); doc.roundedRect(M + 72, y - 4, Math.max(0, Math.min(93, 93 * Number(axis.average || 0) / 100)), 4, 2, 2, "F"); doc.setTextColor(...gold); doc.setFont("helvetica", "bold"); doc.text(formatPercent(axis.average || 0), M + 175, y); });
    const x = M + 194, w = W - M - x; doc.setFillColor(...ink); doc.setDrawColor(43,69,91); doc.roundedRect(x, 43, w, 59, 4, 4, "FD"); doc.setTextColor(...gold); doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.text("PRIORIDADES RECORRENTES", x + 7, 53);
    const priorities = data.priorities || [];
    if (!priorities.length) { doc.setTextColor(...muted); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text("Ainda não há prioridades consolidadas.", x + 7, 67); }
    priorities.slice(0, 3).forEach((item, index) => { const y = 65 + index * 12; doc.setFillColor(169,139,244); doc.circle(x + 10, y - 2, 3.2, "F"); doc.setTextColor(245,249,252); doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.text(String(index + 1), x + 10, y, { align:"center" }); doc.setTextColor(215,225,233); doc.setFont("helvetica", "normal"); doc.text(doc.splitTextToSize(String(item.name), w - 25).slice(0, 2), x + 17, y - 1); doc.setTextColor(...gold); doc.text(`${item.count}x`, x + w - 7, y - 1, { align:"right" }); });
    doc.setFillColor(...ink); doc.setDrawColor(43,69,91); doc.roundedRect(x, 111, w, 50, 4, 4, "FD"); doc.setTextColor(...gold); doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.text("ÚLTIMOS DIAGNÓSTICOS", x + 7, 121);
    const recent = data.recent || [];
    if (!recent.length) { doc.setTextColor(...muted); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text("Nenhum diagnóstico concluído no período.", x + 7, 135); }
    recent.slice(0, 3).forEach((item, index) => { const y = 133 + index * 8; doc.setFillColor(...teal); doc.circle(x + 9, y - 2, 1.8, "F"); doc.setTextColor(215,225,233); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.text(`${String(item.level || "Sem classificação").slice(0, 22)} · ${formatPercent(item.percent || 0)}`, x + 15, y); });
    addDashboardPdfFooter(doc, W, H, M, 2, 2);
  }

  function addDashboardPdfHeader(doc, W, M) {
    doc.setFillColor(7, 21, 34);
    doc.rect(0, 0, W, 26, "F");
    doc.setFillColor(246, 185, 74);
    doc.roundedRect(M, 5, 9, 9, 2, 2, "F");
    doc.setTextColor(7, 21, 34);
    doc.setFont("times", "bold");
    doc.setFontSize(10);
    doc.text("F", M + 4.5, 11.8, { align: "center" });
    doc.setTextColor(246, 185, 74);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("FRANCISNEY LIBERATO", M + 14, 8.5);
    doc.setTextColor(245, 249, 252);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Dashboard da Autoavaliação do Agente de Contratação e Pregoeiro", M + 14, 14.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.7);
    doc.setTextColor(197, 211, 224);
    doc.text("Relatório consolidado de resultados e prioridades de desenvolvimento", M + 14, 20);
  }

  function addDashboardPdfFooter(doc, W, H, M, page, pageCount) {
    const muted = [82, 101, 119];
    doc.setDrawColor(220, 226, 232);
    doc.line(M, H - 12, W - M, H - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    let x = M;
    const y = H - 7;
    const textPart = text => {
      doc.setTextColor(...muted);
      doc.text(text, x, y);
      x += doc.getTextWidth(text);
    };
    const linkPart = (text, url) => {
      doc.setTextColor(33, 90, 140);
      doc.textWithLink(text, x, y, { url });
      x += doc.getTextWidth(text);
    };
    linkPart("Página da avaliação", PDF_LINKS.assessment);
    textPart(" | ");
    linkPart("www.francisney.com.br", PDF_LINKS.site);
    textPart(" | ");
    linkPart("WhatsApp", PDF_LINKS.whatsapp);
    textPart(" | ");
    linkPart("E-mail", PDF_LINKS.email);
    textPart(" | Francisney Liberato");
    doc.setTextColor(...muted);
    doc.text(`${page}/${pageCount}`, W - M, y, { align: "right" });
  }

  function waitForHtml2Canvas(timeout = 12000) {
    if (window.html2canvas) return Promise.resolve(true);
    return new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (window.html2canvas) {
          clearInterval(timer);
          resolve(true);
        } else if (Date.now() - started > timeout) {
          clearInterval(timer);
          resolve(false);
        }
      }, 150);
    });
  }

  async function copyShareText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  }

  /**
   * PDF estruturado em A4 com paginação automática, tabelas, barras e rodapé.
   */
  async function preparePdfButton() {
    const button = $("#downloadPdf");
    if (!button) return;
    button.disabled = true;
    button.innerHTML = '<span>Preparando PDF...</span>';
    const ready = await waitForPdfLibrary(12000);
    state.pdfReady = ready;
    button.disabled = !ready || !state.result;
    button.innerHTML = ready
      ? '<i data-lucide="file-down"></i> Baixar relatório em PDF'
      : '<i data-lucide="wifi-off"></i> Recarregue para liberar o PDF';
    if (window.lucide) window.lucide.createIcons();
  }

  function waitForPdfLibrary(timeout = 12000) {
    if (window.jspdf?.jsPDF) return Promise.resolve(true);
    loadPdfLibraryFallback();
    return new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (window.jspdf?.jsPDF) {
          clearInterval(timer);
          resolve(true);
        } else if (Date.now() - started > timeout) {
          clearInterval(timer);
          resolve(false);
        }
      }, 150);
    });
  }

  let pdfLibraryLoadPromise = null;
  function loadPdfLibraryFallback() {
    if (window.jspdf?.jsPDF) return Promise.resolve(true);
    if (pdfLibraryLoadPromise) return pdfLibraryLoadPromise;
    pdfLibraryLoadPromise = new Promise(resolve => {
      const script = document.createElement("script");
      script.src = `/vendor/jspdf.umd.min.js?v=2.0.2&retry=${Date.now()}`;
      script.async = true;
      script.onload = () => resolve(Boolean(window.jspdf?.jsPDF));
      script.onerror = async () => {
        try {
          const response = await fetch("/vendor/jspdf.umd.min.js?v=2.0.2", { cache: "no-store" });
          const code = await response.text();
          (0, eval)(`${code}\n//# sourceURL=/vendor/jspdf.umd.min.js`);
          resolve(Boolean(window.jspdf?.jsPDF));
        } catch {
          resolve(false);
        }
      };
      document.head.appendChild(script);
    });
    return pdfLibraryLoadPromise;
  }

  async function generatePDF(options = {}) {
    const silent = Boolean(options.silent);
    const ready = state.pdfReady || await waitForPdfLibrary(12000);
    if (!ready || !state.result) {
      if (!silent) await preparePdfButton();
      return;
    }
    const button = $("#downloadPdf");
    if (!silent && button) {
      button.disabled = true;
      button.innerHTML = '<span>Gerando PDF...</span>';
    }
    try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    const W = 210, H = 297, M = 15, contentW = W - M * 2;
    let y = 0;
    const navy = [7, 21, 34], navy2 = [16, 40, 60], gold = [246, 185, 74], muted = [82, 101, 119], white = [245, 249, 252], red = [220, 78, 91];

    const addFooter = () => {
      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page++) {
        doc.setPage(page);
        doc.setDrawColor(220, 226, 232);
        doc.line(M, H - 12, W - M, H - 12);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...muted);
        let footerX = M;
        const footerY = H - 7;
        footerX = footerLink("Página da avaliação", PDF_LINKS.assessment, footerX, footerY);
        footerX = footerText(" | ", footerX, footerY);
        footerX = footerLink("www.francisney.com.br", PDF_LINKS.site, footerX, footerY);
        footerX = footerText(" | ", footerX, footerY);
        footerX = footerLink("WhatsApp", PDF_LINKS.whatsapp, footerX, footerY);
        footerX = footerText(" | ", footerX, footerY);
        footerX = footerLink("E-mail", PDF_LINKS.email, footerX, footerY);
        footerX = footerText(" | Francisney Liberato", footerX, footerY);
        doc.text(`${page}/${pageCount}`, W - M, footerY, { align: "right" });
      }
    };
    const footerText = (text, x, yPos) => {
      doc.setTextColor(...muted);
      doc.text(text, x, yPos);
      return x + doc.getTextWidth(text);
    };
    const footerLink = (text, url, x, yPos) => {
      doc.setTextColor(33, 90, 140);
      doc.textWithLink(text, x, yPos, { url });
      return x + doc.getTextWidth(text);
    };
    const newPage = (title = "") => {
      doc.addPage();
      doc.setFillColor(...navy);
      doc.rect(0, 0, W, 22, "F");
      doc.setTextColor(...gold);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(title.toUpperCase(), M, 14);
      y = 31;
    };
    const ensure = (height, title) => {
      if (y + height > H - 18) newPage(title);
    };
    const paragraph = (text, options = {}) => {
      const size = options.size || 9;
      const color = options.color || muted;
      const style = options.bold ? "bold" : "normal";
      const maxWidth = options.width || contentW;
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(String(text || "—"), maxWidth);
      ensure(lines.length * (size * .42) + 4, options.section || "Relatório");
      doc.text(lines, options.x || M, y);
      y += lines.length * (size * .42) + (options.after ?? 3);
    };
    const sectionTitle = title => {
      ensure(15, title);
      doc.setFillColor(241, 245, 248);
      doc.roundedRect(M, y, contentW, 10, 2, 2, "F");
      doc.setTextColor(...navy2);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(title, M + 4, y + 6.5);
      y += 15;
    };
    const keyValue = (label, value, x, width) => {
      doc.setTextColor(...muted); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.text(label.toUpperCase(), x, y);
      doc.setTextColor(...navy2); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      const lines = doc.splitTextToSize(String(value || "—"), width);
      doc.text(lines, x, y + 5);
      return lines.length;
    };


  function pdfInlineText(text, x, yPos, options = {}) {
    doc.setFont("helvetica", options.bold ? "bold" : "normal");
    doc.setFontSize(options.size || 9);
    doc.setTextColor(...(options.color || muted));
    doc.text(text, x, yPos);
  }
  function pdfInlineLink(text, url, x, yPos, options = {}) {
    doc.setFont("helvetica", options.bold ? "bold" : "normal");
    doc.setFontSize(options.size || 9);
    doc.setTextColor(33, 90, 140);
    doc.textWithLink(text, x, yPos, { url });
  }
    // Capa
    doc.setFillColor(...navy);
    doc.rect(0, 0, W, H, "F");
    doc.setFillColor(...gold);
    doc.roundedRect(M, 22, 16, 16, 4, 4, "F");
    doc.setTextColor(...navy);
    doc.setFont("times", "bold");
    doc.setFontSize(17);
    doc.text("F", M + 8, 33, { align: "center" });
    doc.setTextColor(...gold);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("FRANCISNEY LIBERATO", M + 23, 28);
    doc.setTextColor(...white);
    doc.setFont("times", "bold");
    doc.setFontSize(28);
    const coverTitle = doc.splitTextToSize("Relatório de Autoavaliação do Agente de Contratação e Pregoeiro", 155);
    doc.text(coverTitle, M, 76);
    doc.setDrawColor(...gold); doc.setLineWidth(1); doc.line(M, 117, 70, 117);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(180, 198, 214);
    doc.text("Autoavaliação profissional, resultados e", M, 130);
    doc.text("plano de desenvolvimento para contratações públicas", M, 137);
    doc.setFillColor(...navy2);
    doc.roundedRect(M, 170, contentW, 62, 5, 5, "F");
    doc.setTextColor(...gold); doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.text("PARTICIPANTE", M + 8, 182);
    doc.setTextColor(...white); doc.setFont("times", "bold"); doc.setFontSize(18); doc.text(state.participant.nomeCompleto, M + 8, 195);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(180, 198, 214);
    doc.text(state.participant.orgaoEntidade, M + 8, 205);
    doc.text(`${state.participant.municipioEstado} · ${formatDateTime(state.result.generatedAt)}`, M + 8, 214);
    doc.setTextColor(...gold); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(`${state.result.level.name} · ${formatPercent(state.result.adjustedPercent)}`, M + 8, 225);
    doc.setFontSize(7); doc.setTextColor(140, 160, 177);
    doc.text("francisneyliberato-agente-contratacao-pregoeiro", M, 276);

    // Resumo executivo
    newPage("Resumo executivo");
    sectionTitle("Identificação");
    keyValue("Nome completo", state.participant.nomeCompleto, M, 82);
    keyValue("Órgão ou entidade", state.participant.orgaoEntidade, M + 95, 80);
    y += 14;
    keyValue("WhatsApp", state.participant.whatsapp, M, 55);
    keyValue("E-mail", state.participant.email, M + 62, 113);
    y += 14;
    keyValue("Unidade administrativa", state.participant.unidadeAdministrativa, M, 82);
    keyValue("Município/Estado", state.participant.municipioEstado, M + 95, 80);
    y += 18;

    sectionTitle("Resultado geral");
    doc.setFillColor(...navy2); doc.roundedRect(M, y, contentW, 40, 4, 4, "F");
    doc.setTextColor(...gold); doc.setFont("times", "bold"); doc.setFontSize(25);
    doc.text(formatPercent(state.result.adjustedPercent), M + 10, y + 18);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text(state.result.level.name.toUpperCase(), M + 10, y + 29);
    doc.setTextColor(...white); doc.setFontSize(8);
    doc.text(`Percentual bruto: ${formatPercent(state.result.rawPercent)}`, M + 75, y + 15);
    doc.text(`Pontuação: ${formatNumber(state.result.obtained)} de ${formatNumber(state.result.maximum)}`, M + 75, y + 23);
    doc.text(`Questões aplicáveis: ${state.result.applicable} de ${totalQuestions()}`, M + 75, y + 31);
    y += 47;
    paragraph(state.result.level.diagnosis, { size: 9, color: navy2 });
    paragraph(`Recomendação geral: ${state.result.level.recommendation}`, { size: 9, color: muted });
    if (state.result.activeCap) paragraph(`Ajuste por gatilho crítico: o resultado final foi limitado a ${state.result.activeCap}%.`, { size: 9, color: red, bold: true });

    sectionTitle("Destaques");
    paragraph(`Dimensão mais forte: ${state.result.strongest.name} (${formatPercent(state.result.strongest.percent)}).`, { bold: true, color: navy2 });
    paragraph(`Dimensão prioritária: ${state.result.priority.name} (${formatPercent(state.result.priority.percent)}).`, { bold: true, color: navy2 });

    // Dimensões
    newPage("Resultados por dimensão");
    state.result.axisResults.forEach(axis => {
      ensure(16, "Resultados por dimensão");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...navy2);
      doc.text(`${axis.id}. ${axis.name}`, M, y);
      doc.setTextColor(...muted); doc.text(formatPercent(axis.percent), W - M, y, { align: "right" });
      y += 4;
      doc.setFillColor(229, 234, 239); doc.roundedRect(M, y, contentW, 4, 2, 2, "F");
      doc.setFillColor(...(axis.percent < 41 ? red : axis.percent < 61 ? [236, 166, 62] : [55, 180, 155]));
      doc.roundedRect(M, y, contentW * axis.percent / 100, 4, 2, 2, "F");
      y += 10;
    });
    y += 3;
    sectionTitle("Recomendações por dimensão");
    [...state.result.axisResults].sort((a, b) => a.percent - b.percent).forEach(axis => {
      paragraph(`${axis.id}. ${axis.short} (${formatPercent(axis.percent)}): ${axis.recommendation}`, { size: 8, color: muted, after: 3, section: "Recomendações por dimensão" });
    });

    // Alertas
    newPage("Gatilhos de risco");
    if (!state.result.alerts.length) {
      paragraph("Nenhum dos nove gatilhos críticos foi acionado.", { bold: true, color: [33, 143, 119] });
    } else {
      state.result.alerts.forEach((alert, index) => {
        ensure(35, "Gatilhos de risco");
        doc.setFillColor(253, 240, 241); doc.roundedRect(M, y, contentW, 9, 2, 2, "F");
        doc.setTextColor(...red); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        doc.text(`${index + 1}. ${alert.title}`, M + 4, y + 6);
        y += 14;
        paragraph(`Questão ${alert.question} · Nota ${alert.score} · Prioridade ${alert.priority}${alert.cap ? ` · Limite de ${alert.cap}%` : ""}`, { size: 7.5, color: red, bold: true, after: 2, section: "Gatilhos de risco" });
        paragraph(`Risco: ${alert.risk}`, { size: 8, section: "Gatilhos de risco" });
        paragraph(`Recomendação: ${alert.recommendation}`, { size: 8, color: navy2, after: 6, section: "Gatilhos de risco" });
      });
    }

    // Plano de ação
    newPage("Plano de desenvolvimento");
    state.result.actionPlan.filter(plan => typeof plan.score === "number" && plan.score <= 3).forEach(plan => {
      ensure(55, "Plano de desenvolvimento");
      doc.setFillColor(...navy2); doc.roundedRect(M, y, contentW, 10, 2, 2, "F");
      doc.setTextColor(...gold); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
      doc.text(`QUESTÃO ${plan.question} · NOTA ${plan.score} · ${plan.axis}`, M + 4, y + 6.5);
      y += 15;
      paragraph(`Achado: ${plan.finding}`, { size: 8, color: navy2, bold: true, after: 2, section: "Plano de desenvolvimento" });
      paragraph(`Risco: ${plan.risk}`, { size: 7.5, after: 2, section: "Plano de desenvolvimento" });
      paragraph(`Causa provável: ${plan.cause}`, { size: 7.5, after: 2, section: "Plano de desenvolvimento" });
      paragraph(`Recomendação: ${plan.recommendation}`, { size: 7.5, color: navy2, after: 2, section: "Plano de desenvolvimento" });
      paragraph(`Responsável sugerido: ${plan.owner || "Opcional"} · Cargo/Função: ${plan.ownerRole || "Opcional"} · Prazo sugerido: ${plan.deadline || suggestDeadline(plan.priority)} · Status: ${plan.status}`, { size: 7.5, bold: true, after: 2, section: "Plano de desenvolvimento" });
      paragraph(`Evidência de conclusão: ${plan.evidence}`, { size: 7.5, after: 6, section: "Plano de desenvolvimento" });
    });

    // Respostas completas
    newPage("Resumo das respostas");
    DATA.axes.forEach(axis => {
      ensure(16, "Resumo das respostas");
      doc.setFillColor(236, 241, 245); doc.roundedRect(M, y, contentW, 9, 2, 2, "F");
      doc.setTextColor(...navy2); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text(`Dimensão ${axis.id} — ${axis.name}`, M + 4, y + 6);
      y += 14;
      axis.questions.forEach(question => {
        const answer = state.answers[question.number];
        ensure(28, "Resumo das respostas");
        paragraph(`${question.number}. ${question.text}`, { size: 8, color: navy2, bold: true, after: 1, section: "Resumo das respostas" });
        paragraph(`Resposta: ${answer.score === "NA" ? "N/A" : `${answer.score}/5`} · Peso ${question.weight}`, { size: 7.5, color: answer.score === "NA" || Number(answer.score) <= 2 ? red : muted, bold: true, after: 1, section: "Resumo das respostas" });
        if (answer.observation) paragraph(`Observação/justificativa: ${answer.observation}`, { size: 7, after: 1, section: "Resumo das respostas" });
        if (answer.indicatedEvidence) paragraph(`Evidência indicada: ${answer.indicatedEvidence}`, { size: 7, after: 4, section: "Resumo das respostas" });
        if (answer.document) paragraph(`Documento comprobatório anexado: ${answer.document.name} (${formatFileSize(answer.document.size)}).`, { size: 7, after: 4, section: "Resumo das respostas" });
        else y += 2;
      });
    });

    // Encerramento
    newPage("Conclusão");
    sectionTitle("Transforme diagnóstico em plano de ação");
    paragraph("A maturidade profissional não é um ponto de chegada. Use este relatório para pactuar prioridades, atribuir responsáveis, monitorar prazos e demonstrar a evolução da atuação em contratações públicas.", { size: 11, color: navy2, after: 8 });
    paragraph("Conheça os livros, cursos, palestras e mentorias de Francisney Liberato.", { size: 9, color: muted, after: 3 });
    pdfInlineText("Site: ", M, y, { size: 9, color: muted });
    const siteX = M + doc.getTextWidth("Site: ");
    pdfInlineLink("www.francisney.com.br", PDF_LINKS.site, siteX, y, { size: 9 });
    y += 6;
    pdfInlineText("WhatsApp: ", M, y, { size: 9, color: muted });
    const whatsX = M + doc.getTextWidth("WhatsApp: ");
    pdfInlineLink("+55 65 99903-1061", PDF_LINKS.whatsapp, whatsX, y, { size: 9 });
    y += 6;
    pdfInlineText("E-mail: ", M, y, { size: 9, color: muted });
    const emailX = M + doc.getTextWidth("E-mail: ");
    pdfInlineLink("francisneyliberato10@gmail.com", PDF_LINKS.email, emailX, y, { size: 9 });
    y += 6;
    pdfInlineText("Página da avaliação: ", M, y, { size: 9, color: muted });
    const evalX = M + doc.getTextWidth("Página da avaliação: ");
    pdfInlineLink("acessar questionário", PDF_LINKS.assessment, evalX, y, { size: 9 });
    addFooter();

    const filename = pdfFileName();
    const blob = doc.output("blob");
    if (options.returnFile) return new File([blob], filename, { type: "application/pdf" });
    downloadBlob(blob, filename);
    if (!silent) showToast("Relatório PDF gerado com sucesso.");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      if (!silent) showToast("Não foi possível gerar o PDF agora. Recarregue a página e tente novamente.");
      return null;
    } finally {
      if (!silent && button) {
        button.disabled = false;
        button.innerHTML = '<i data-lucide="file-down"></i> Baixar relatório em PDF';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  function pdfFileName() {
    const safeName = (state.participant?.nomeCompleto || "relatorio").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `${DATA.projectName}-${safeName || "relatorio"}.pdf`;
  }

  function downloadBlob(blobOrFile, filename) {
    const url = URL.createObjectURL(blobOrFile);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function launchConfetti() {
    if (!window.confetti) return;
    const colors = ["#f6b94a", "#ef704d", "#42d6c3", "#7c6df2"];
    window.confetti({ particleCount: 90, spread: 75, origin: { y: .62 }, colors });
    setTimeout(() => window.confetti({ particleCount: 45, angle: 60, spread: 50, origin: { x: 0 }, colors }), 250);
    setTimeout(() => window.confetti({ particleCount: 45, angle: 120, spread: 50, origin: { x: 1 }, colors }), 350);
  }

  function observeReveals() {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .12 });
    $$(".reveal").forEach(element => observer.observe(element));
  }

  function showToast(message) {
    const toast = $("#toast");
    $("span", toast).textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 3500);
  }

  function updateGameHUD() {
    const answered = state.answered.size;
    const xp = answered * 10;
    const levels = [
      { min: 0, name: "Explorador" },
      { min: 10, name: "Analista" },
      { min: 25, name: "Guardião" },
      { min: 40, name: "Estrategista" },
      { min: 50, name: "Mestre da Contratação" }
    ];
    const level = [...levels].reverse().find(item => answered >= item.min) || levels[0];
    $("#xpValue").textContent = xp;
    $("#answeredValue").textContent = answered;
    $("#streakValue").textContent = state.streak;
    $("#gameLevel").textContent = level.name;
  }

  function syncQuestionTotals() {
    const total = totalQuestions();
    $("#answeredValue")?.parentElement?.querySelector("em") && ($("#answeredValue").parentElement.querySelector("em").textContent = `/ ${total}`);
    $("#xpValue")?.parentElement?.querySelector("em") && ($("#xpValue").parentElement.querySelector("em").textContent = `/ ${total * 10}`);
    $$(".hero-proof div strong").forEach(strong => {
      if (strong.textContent.trim() === "60") strong.textContent = total;
    });
    const xpHero = $(".hero-quest strong");
  }

  function showXpPop(number) {
    const pop = $("#xpPop");
    const card = $(`#question-${number}`);
    const rect = card.getBoundingClientRect();
    pop.style.left = `${Math.min(window.innerWidth - 100, Math.max(20, rect.right - 80))}px`;
    pop.style.top = `${Math.max(90, rect.top + 20)}px`;
    pop.classList.remove("show");
    void pop.offsetWidth;
    pop.classList.add("show");
  }

  function initDashboard() {
    renderDashboard(aggregateDashboardData(loadLocalLeads()));
    loadDashboard(false);
    window.setInterval(() => loadDashboard(false), 30000);
  }

  async function loadDashboard(showFeedback) {
    const button = $("#refreshDashboard");
    if (showFeedback) {
      button.disabled = true;
      button.classList.add("is-loading");
    }
    try {
      const response = await fetch("/api/dashboard", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Dashboard remoto indisponível");
      const payload = await response.json();
      if (payload.success) {
        if (payload.data?.cutoff) localStorage.setItem(STORAGE_KEYS.dashboardCutoff, payload.data.cutoff);
        renderDashboard(payload.data);
      }
      if (showFeedback) showToast("Dashboard atualizado.");
    } catch {
      renderDashboard(aggregateDashboardData(loadLocalLeads()));
      if (showFeedback) showToast("Painel atualizado com os dados deste navegador.");
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  }

  function getDashboardCutoff() {
    try {
      return localStorage.getItem(STORAGE_KEYS.dashboardCutoff) || "";
    } catch {
      return "";
    }
  }

  function getLeadCreatedAt(lead) {
    return String(lead?.created_at || lead?.createdAt || lead?.generatedAt || "");
  }

  function filterLeadsForDashboard(leads) {
    const cutoff = getDashboardCutoff();
    if (!cutoff) return leads;
    return leads.filter(lead => {
      const createdAt = getLeadCreatedAt(lead);
      return createdAt && createdAt >= cutoff;
    });
  }

  function aggregateDashboardData(leads) {
    const dashboardLeads = filterLeadsForDashboard(leads);
    const levels = DATA.maturityLevels.map(level => level.name);
    const distribution = Object.fromEntries(levels.map(level => [level, 0]));
    const axes = {};
    const priorities = {};
    let totalPercent = 0;
    let alertCount = 0;
    let today = 0;
    const todayKey = new Date().toISOString().slice(0, 10);

    dashboardLeads.forEach(lead => {
      const level = distribution[lead.classificacao] === undefined ? "Zona crítica" : lead.classificacao;
      distribution[level]++;
      totalPercent += Number(lead.percentual_ajustado || 0);
      if (getLeadCreatedAt(lead).slice(0, 10) === todayKey) today++;
      if (lead.eixo_prioritario) priorities[lead.eixo_prioritario] = (priorities[lead.eixo_prioritario] || 0) + 1;
      alertCount += Array.isArray(lead.alertas) ? lead.alertas.length : 0;
      (lead.resultados_eixos || []).forEach(axis => {
        axes[axis.id] ||= { id: axis.id, name: axis.name, short: axis.short, sum: 0, count: 0 };
        axes[axis.id].sum += Number(axis.percent || 0);
        axes[axis.id].count++;
      });
    });
    return {
      total: dashboardLeads.length,
      today,
      average: dashboardLeads.length ? totalPercent / dashboardLeads.length : 0,
      alertCount,
      distribution,
      axes: Object.values(axes).map(axis => ({ ...axis, average: axis.count ? axis.sum / axis.count : 0 })).sort((a, b) => a.id - b.id),
      priorities: Object.entries(priorities).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
      recent: dashboardLeads.slice(-7).reverse().map(lead => ({ createdAt: getLeadCreatedAt(lead), level: lead.classificacao, percent: Number(lead.percentual_ajustado || 0) })),
      cutoff: getDashboardCutoff()
    };
  }

  function renderDashboard(data) {
    state.dashboardData = data;
    const total = Number(data.total || 0);
    const distributionEntries = Object.entries(data.distribution || {});
    const dominant = [...distributionEntries].sort((a, b) => b[1] - a[1])[0] || ["—", 0];
    const averageLevel = classifyMaturity(Number(data.average || 0));

    $("#dashTotal").textContent = total.toLocaleString("pt-BR");
    $("#dashToday").textContent = `${Number(data.today || 0)} hoje`;
    $("#dashAverage").textContent = formatPercent(data.average || 0);
    $("#dashAverageLevel").textContent = total ? averageLevel.name : "Sem dados";
    $("#dashDominant").textContent = total ? dominant[0] : "—";
    $("#dashDominantCount").textContent = `${dominant[1]} ${dominant[1] === 1 ? "diagnóstico" : "diagnósticos"}`;
    $("#dashAlerts").textContent = Number(data.alertCount || 0).toLocaleString("pt-BR");
    $("#donutTotal").textContent = total.toLocaleString("pt-BR");
    $("#dashboardUpdated").textContent = `Atualizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

    const colors = ["#ef5c67", "#f08a4b", "#f3bd4f", "#55c7a4", "#52bfe6", "#a98bf4"];
    let cursor = 0;
    const segments = distributionEntries.map(([name, count], index) => {
      const start = cursor;
      const share = total ? count / total * 100 : 0;
      cursor += share;
      return `${colors[index]} ${start}% ${cursor}%`;
    });
    $("#dashboardDonut").style.background = total
      ? `conic-gradient(${segments.join(",")})`
      : "conic-gradient(#213b50 0 100%)";
    $("#donutLegend").innerHTML = distributionEntries.map(([name, count], index) => `
      <div class="legend-row"><i style="background:${colors[index]}"></i><span>${escapeHTML(name)}</span><strong>${count}</strong></div>
    `).join("");

    const axes = data.axes?.length ? data.axes : DATA.axes.map(axis => ({ id: axis.id, name: axis.name, short: axis.short, average: 0 }));
    $("#dashboardAxisChart").innerHTML = axes.map(axis => `
      <div class="dashboard-axis-row" title="${escapeHTML(axis.name)}">
        <span>${axis.id}. ${escapeHTML(axis.short)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Number(axis.average || 0).toFixed(2)}%"></div></div>
        <strong>${formatPercent(axis.average || 0)}</strong>
      </div>
    `).join("");

    $("#priorityRanking").innerHTML = data.priorities?.length
      ? data.priorities.map((item, index) => `
        <div class="ranking-item"><span class="ranking-position">${index + 1}</span><div><h4>${escapeHTML(item.name)}</h4><p>Indicada como dimensão prioritária</p></div><strong>${item.count}×</strong></div>
      `).join("")
      : `<div class="no-alerts">Ainda não há prioridades consolidadas.</div>`;

    $("#recentDiagnostics").innerHTML = data.recent?.length
      ? data.recent.map(item => {
        const level = DATA.maturityLevels.find(entry => entry.name === item.level) || DATA.maturityLevels[0];
        return `<div class="recent-item"><span class="recent-level" style="background:${level.color}"></span><div><h4>${escapeHTML(item.level || "Sem classificação")} · ${formatPercent(item.percent || 0)}</h4><p>Novo diagnóstico concluído</p></div><time>${relativeTime(item.createdAt)}</time></div>`;
      }).join("")
      : `<div class="no-alerts">Nenhum diagnóstico concluído neste navegador.</div>`;

    $("#dashboardEmpty").classList.toggle("hidden", total > 0);
    if (window.lucide) window.lucide.createIcons();
  }

  function relativeTime(value) {
    const diff = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(diff)) return "agora";
    const minutes = Math.max(0, Math.floor(diff / 60000));
    if (minutes < 1) return "agora";
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    return new Date(value).toLocaleDateString("pt-BR");
  }

  function weightLabel(weight) {
    return weight === 3 ? "Crítico" : weight === 2 ? "Relevante" : "Complementar";
  }
  function totalQuestions() {
    return DATA.axes.reduce((total, axis) => total + axis.questions.length, 0);
  }
  function normalize(value) {
    return String(value || "").trim().toLocaleLowerCase("pt-BR");
  }
  function onlyDigits(value) {
    return String(value || "").replace(/\D+/g, "");
  }
  function cryptoRandomId() {
    return (crypto?.randomUUID?.() || `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }
  function sanitizeText(value) {
    return String(value || "").replace(/[<>]/g, "").trim().slice(0, 5000);
  }
  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
  }
  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }
  function formatPercent(value) {
    return `${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }
  function formatNumber(value) {
    return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
  function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`;
    return `${(size / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  }
  function formatDateTime(value) {
    return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }
  function todayInputValue() {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 10);
  }
  function round(value) {
    return Math.round(Number(value) * 100) / 100;
  }
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
})();


