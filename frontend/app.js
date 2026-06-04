const $ = (selector) => document.querySelector(selector);
const app = $("#app");
const API_BASE = (
  window.RESOLVEAI_API_URL ||
  (location.hostname === "localhost" && location.port !== "3000" ? "http://localhost:3000" : "")
).replace(/\/$/, "");
function apiUrl(path) { return `${API_BASE}${path}`; }
function apiFetch(path, options = {}) {
  return fetch(apiUrl(path), {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {})
    }
  });
}
const categories = [
  ["❤️", "Amor e Relacionamentos"], ["🔮", "Espiritualidade"], ["💼", "Trabalho e Emprego"],
  ["💰", "Finanças"], ["🏢", "Negócios"], ["🍽️", "Restaurantes"], ["📚", "Estudos"],
  ["💻", "Tecnologia"], ["🏠", "Casa e Família"], ["☕", "Problemas do Dia a Dia"], ["❓", "Outros"]
];
const channels = [["📱", "WhatsApp", "Receba no seu WhatsApp"], ["📧", "E-mail", "Receba no seu e-mail"], ["📲", "Pelo aplicativo", "Receba por aqui no app"]];
let state = JSON.parse(localStorage.getItem("resolveai_state") || "{}");
let adminItems = [];
let selectedAdmin = null;
let trackItems = [];
const FEATURED_KEY = "resolveai_featured_categories";

function getClientId() {
  let clientId = localStorage.getItem("resolveai_client_id");
  if (!clientId) {
    clientId = crypto.randomUUID ? crypto.randomUUID() : `client_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    localStorage.setItem("resolveai_client_id", clientId);
  }
  return clientId;
}
function saveState() { localStorage.setItem("resolveai_state", JSON.stringify(state)); }
function money(value) { return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function dt(value) { return value ? new Date(value).toLocaleString("pt-BR") : "-"; }
function textKey(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function planValue(plan) { return plan === "Prioritario" ? 9.99 : 2.99; }
function prazo(plan) { return plan === "Prioritario" ? "Ate 1 hora" : "Ate 24 horas"; }
function getFeaturedCategories() {
  try { return JSON.parse(localStorage.getItem(FEATURED_KEY) || "[]"); } catch { return []; }
}
function saveFeaturedCategories(items) { localStorage.setItem(FEATURED_KEY, JSON.stringify(items)); }
function orderedCategories() {
  const featured = getFeaturedCategories();
  return [...categories].sort((a, b) => Number(featured.includes(b[1])) - Number(featured.includes(a[1])));
}
function step(label, back = true) {
  return `<div class="topbar">${back ? `<button class="icon-btn" onclick="goBack()" aria-label="Voltar">‹</button>` : "<span></span>"}<div class="step-pill">${label}</div><span></span></div>`;
}
function phone(content) { app.className = "shell"; app.innerHTML = `<main class="phone">${content}</main>`; }
function goBack() {
  const order = ["welcome", "category", "problem", "priority", "payment", "channel", "about", "confirm", "track"];
  const index = order.indexOf(state.screen || "welcome");
  render(order[Math.max(0, index - 1)]);
}
function render(screen = "welcome") {
  state.screen = screen; saveState();
  const map = { welcome, category, problem, priority, payment, channel, about, confirm, track };
  map[screen]();
}

function welcome() {
  phone(`
    <div class="brand">
      <div class="logo-mark">✓</div>
      <h1>Resolve<span>Ai</span></h1>
      <p>Você traz o problema.<br>Nós buscamos uma <span class="accent">solução.</span></p>
    </div>
    <img class="hero-img" src="/assets/welcome-people.png" alt="Pessoas usando o ResolveAi">
    <button class="btn" onclick="render('category')">ENTRAR</button>
    <div class="bottom"><button class="btn secondary" onclick="render('track')">Minhas Solicitações</button></div>
  `);
}

function category() {
  phone(`${step("2. Escolha a categoria")}
    <h2 class="screen-title">Qual tipo de problema você deseja resolver?</h2>
    <div class="list">${orderedCategories().map(([icon, name]) => `<button class="choice-card" onclick="pickCategory('${name}')"><span class="emoji">${icon}</span><strong>${name}</strong><span class="chev">›</span></button>`).join("")}</div>
  `);
}
function pickCategory(name) { state.categoria = name; saveState(); render("problem"); }

function problem() {
  phone(`${step("3. Conte seu problema")}
    <h2 class="screen-title">Conte seu problema</h2>
    <p class="screen-copy">Descreva seu problema com o máximo de detalhes possível para que possamos analisar melhor sua situação.</p>
    <div class="textarea-wrap"><textarea maxlength="1000" placeholder="Escreva aqui..." oninput="state.problema=this.value; saveState(); $('#count').textContent=this.value.length" autofocus>${state.problema || ""}</textarea><div class="counter"><span id="count">${(state.problema || "").length}</span>/1000</div></div>
    <div class="bottom"><button class="btn" onclick="state.problema && state.problema.trim().length > 10 ? render('priority') : alert('Conte um pouco mais sobre o problema.')">Continuar</button><div class="progress" style="--p:42%"><span></span></div></div>
  `);
}

function priority() {
  phone(`${step("4. Escolha seu prazo")}
    <h2 class="screen-title">Escolha seu prazo de atendimento</h2>
    <p class="screen-copy">Você escolhe a prioridade. Nós damos o nosso melhor.</p>
    <section class="plan-card"><div class="plan-head">🟢 Normal</div><ul><li>Atendimento normal</li><li>Proposta de solução em até 24 horas</li></ul><div class="price">R$ 2,99</div><button class="btn secondary" onclick="pickPlan('Normal')">Escolher Normal</button></section>
    <section class="plan-card gold-card"><div class="plan-head">⭐ Prioritário</div><ul><li>Atendimento prioritário</li><li>Proposta de solução em até 1 hora</li></ul><div class="price">R$ 9,99</div><button class="btn gold" onclick="pickPlan('Prioritario')">Atendimento Prioritário</button></section>
    <div class="progress" style="--p:54%"><span></span></div>
  `);
}
function pickPlan(plan) { state.plano = plan; saveState(); render("payment"); }

async function payment() {
  phone(`${step("Pagamento")}
    <section class="payment-card details">
      <h2 class="screen-title">Atendimento ${state.plano === "Prioritario" ? "Prioritário" : "Normal"}</h2>
      <p class="screen-copy">Receba a proposta de solução em ${state.plano === "Prioritario" ? "até 1 hora" : "até 24 horas"}.</p>
      <div class="price">${money(planValue(state.plano))}</div>
      <button class="btn gold" id="mercadoPagoButton" onclick="requestMercadoPagoPreference()">Pagar com Mercado Pago</button>
      <div id="payError"></div>
    </section>
    <div class="progress" style="--p:64%"><span></span></div>
  `);
}
function paymentFallback(message = "Nao foi possivel gerar o pagamento agora. Tente novamente.") {
  const target = $("#payError");
  if (target) target.innerHTML = message ? `<div class="notice">${message}</div>` : "";
}
async function requestMercadoPagoPreference() {
  const button = $("#mercadoPagoButton");
  try {
    if (button) { button.disabled = true; button.textContent = "Abrindo Mercado Pago..."; }
    paymentFallback("");
    const res = await apiFetch("/api/payments/mercadopago/preference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: getClientId(), plano: state.plano, categoria: state.categoria, problema: state.problema })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Nao foi possivel gerar o pagamento agora. Tente novamente.");
    if (!data.init_point) throw new Error("Nao foi possivel abrir o Mercado Pago agora. Tente novamente.");
    state.paymentPreferenceId = data.preference_id || "";
    state.tempRequest = null;
    saveState();
    window.location.href = data.init_point;
  } catch (err) {
    state.paymentError = err.message;
    saveState();
    paymentFallback(err.message || "Nao foi possivel gerar o pagamento agora. Tente novamente.");
    if (button) { button.disabled = false; button.textContent = "Pagar com Mercado Pago"; }
  }
}
async function approveDemoPayment() {
  state.pagamentoAprovado = true;
  state.paymentId = "demo";
  state.canalResposta = state.canalResposta || "Pelo aplicativo";
  saveState();
  render("about");
}

function channel() {
  phone(`${step("5. Como deseja receber")}
    <h2 class="screen-title">Como deseja receber sua resposta?</h2>
    <p class="screen-copy">Escolha o melhor canal para recebermos sua resposta.</p>
    <div class="list">${channels.map(([icon, title, text]) => `<button class="choice-card channel-card ${state.canalResposta === title ? "selected" : ""}" onclick="state.canalResposta='${title}'; saveState(); render('channel')"><span class="emoji">${icon}</span><span><strong>${title}</strong><br><span class="subtle">${text}</span></span><span class="radio"></span></button>`).join("")}</div>
    <div class="bottom"><button class="btn" onclick="state.canalResposta ? render('about') : alert('Escolha um canal de resposta.')">Continuar</button><div class="progress" style="--p:76%"><span></span></div></div>
  `);
}

function about() {
  phone(`${step("6. Sobre você")}
    <h2 class="screen-title">Sobre você</h2>
    <p class="screen-copy">Precisamos de algumas informações para enviar sua resposta.</p>
    <div class="form">
      <label>Nome Completo<input value="${state.nome || ""}" oninput="state.nome=this.value; saveState()" placeholder="Digite seu nome"></label>
      <label>Cidade<input value="${state.cidade || ""}" oninput="state.cidade=this.value; saveState()" placeholder="Digite sua cidade"></label>
      <label>WhatsApp<input value="${state.whatsapp || ""}" oninput="state.whatsapp=this.value; saveState()" placeholder="(00) 00000-0000"></label>
      <label>E-mail<input value="${state.email || ""}" oninput="state.email=this.value; saveState()" placeholder="seu@email.com"></label>
    </div>
    <div class="bottom"><button class="btn" onclick="submitClient()">Enviar Problema</button><div class="progress" style="--p:90%"><span></span></div></div>
  `);
}

async function createRequest(temporary = false) {
  const payload = { clientId: getClientId(), categoria: state.categoria, problema: state.problema, plano: state.plano, canalResposta: state.canalResposta || "Pelo aplicativo", nome: state.nome || "Cliente", cidade: state.cidade || "A definir", whatsapp: state.whatsapp || "", email: state.email || "", paymentId: state.paymentId || "", preferenceId: state.paymentPreferenceId || "" };
  const res = await apiFetch("/api/solicitacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || "Não foi possível criar a solicitação.");
    return null;
  }
  return res.json();
}
async function submitClient() {
  if (!state.pagamentoAprovado || !state.paymentId) return alert("Confirme o pagamento antes de enviar a solicitação.");
  if (!state.nome || !state.cidade) return alert("Informe nome e cidade.");
  if (state.canalResposta === "WhatsApp" && !state.whatsapp) return alert("WhatsApp obrigatório para este canal.");
  if (state.canalResposta === "E-mail" && !state.email) return alert("E-mail obrigatório para este canal.");
  state.tempRequest = null;
  let item = await createRequest();
  if (!item) return;
  state.last = { ...item, nome: state.nome, cidade: state.cidade, whatsapp: state.whatsapp, email: state.email, canalResposta: state.canalResposta };
  localStorage.setItem("resolveai_last_protocol", item.protocolo);
  saveState();
  render("confirm");
}

function confirm() {
  const item = state.last || state.tempRequest || {};
  phone(`${step("7. Confirmação", false)}
    <div class="success"><div class="success-icon">✓</div><h2 class="screen-title">Pronto!</h2><p class="screen-copy">Seu problema foi enviado com sucesso.</p></div>
    <section class="info-card details"><span class="subtle">Seu protocolo</span><div class="protocol">${item.protocolo}</div>
      ${row("Categoria", item.categoria || state.categoria)}${row("Plano", item.plano || state.plano)}${row("Canal", item.canalResposta || state.canalResposta)}${row("Prazo previsto", prazo(item.plano || state.plano))}${row("Data", dt(item.dataCriacao || new Date()))}
    </section>
    <div class="bottom"><button class="btn" onclick="render('track')">Ok, entendi</button></div>
  `);
}
function row(a, b) { return `<div class="detail-row"><span>${a}</span><strong>${b || "-"}</strong></div>`; }

async function track() {
  const res = await apiFetch(`/api/solicitacoes?clientId=${encodeURIComponent(getClientId())}`);
  const items = res.ok ? await res.json() : [];
  trackItems = items;
  const hasSolution = items.some((item) => item.respostaAdmin);
  phone(`${step("8. Minhas Solicitações")}
    <h2 class="screen-title">Minhas Solicitações</h2>
    <p class="screen-copy">Este aparelho mostra apenas as solicitações enviadas por ele.</p>
    ${hasSolution ? `<div class="response-box"><strong>Você possui uma solução disponível.</strong></div>` : ""}
    <div class="list">${items.length ? items.map(trackCard).join("") : `<div class="notice">Nenhuma solicitação encontrada neste aparelho.</div>`}</div>
    <section class="info-card details" style="margin-top:14px">
      <strong>Consultar em outro aparelho</strong>
      <p class="subtle">Informe o protocolo e o WhatsApp ou e-mail usado no envio.</p>
      <div class="form">
        <label>Protocolo<input id="recoverProtocol" placeholder="#202606030001"></label>
        <label>WhatsApp ou e-mail<input id="recoverContact" placeholder="Seu contato"></label>
        <button class="btn secondary" onclick="recoverRequest()">Consultar protocolo</button>
      </div>
      <div id="recoverResult"></div>
    </section>
    <div class="bottom"><button class="btn secondary" onclick="state={}; saveState(); render('welcome')">Nova solicitação</button></div>
  `);
}

function trackCard(item) {
  return `<section class="info-card details">
    <span class="subtle">Protocolo</span><div class="protocol">${item.protocolo}</div>
    ${row("Categoria", item.categoria)}${row("Data", dt(item.dataCriacao))}${row("Status", item.status)}
    ${item.respostaAdmin ? `<button class="btn secondary" onclick="showSolution('${item.id}')">Ver Solução</button>` : `<div class="notice">Assim que tivermos uma resposta, vamos te avisar pelo canal escolhido.</div>`}
  </section>`;
}

function showSolution(id) {
  const item = trackItems.find((entry) => entry.id === id) || state.last || {};
  phone(`${step("Solução")}
    <section class="info-card details">
      <span class="subtle">Protocolo</span><div class="protocol">${item.protocolo || "-"}</div>
      ${row("Categoria", item.categoria)}${row("Status", item.status)}${row("Data", dt(item.dataResposta || item.dataCriacao))}
      <div><strong>Proposta de solução</strong><p>${item.respostaAdmin || "Ainda não há solução disponível."}</p></div>
    </section>
    <div class="bottom"><button class="btn secondary" onclick="render('track')">Voltar</button></div>
  `);
}

async function recoverRequest() {
  const protocolo = $("#recoverProtocol")?.value || "";
  const contato = $("#recoverContact")?.value || "";
  const result = $("#recoverResult");
  if (!protocolo || !contato) {
    if (result) result.innerHTML = `<div class="notice">Informe protocolo e WhatsApp ou e-mail.</div>`;
    return;
  }
  const res = await apiFetch("/api/solicitacoes/recuperar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: getClientId(), protocolo, contato })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (result) result.innerHTML = `<div class="notice">${data.error || "Não encontramos essa solicitação."}</div>`;
    return;
  }
  state.last = data;
  localStorage.setItem("resolveai_last_protocol", data.protocolo);
  saveState();
  render("track");
}

function paymentReturn(kind) {
  const params = new URLSearchParams(location.search);
  const paymentId = params.get("payment_id") || params.get("collection_id") || "";
  const preferenceId = params.get("preference_id") || state.paymentPreferenceId || "";
  if (paymentId) state.paymentId = paymentId;
  if (preferenceId) state.paymentPreferenceId = preferenceId;
  saveState();
  const config = {
    success: {
      pill: "Pagamento aprovado",
      icon: "✓",
      title: "Confirme seu pagamento",
      text: "Depois que o Mercado Pago confirmar, liberamos o formulário para enviar sua solicitação.",
      action: "Já realizei o pagamento"
    },
    failure: {
      pill: "Pagamento não concluído",
      icon: "!",
      title: "Não foi possível concluir",
      text: "O pagamento não foi aprovado. Você pode tentar novamente com outra forma de pagamento.",
      action: "Tentar novamente"
    },
    pending: {
      pill: "Pagamento pendente",
      icon: "…",
      title: "Pagamento em análise",
      text: "Recebemos o retorno do Mercado Pago e estamos aguardando a confirmação final.",
      action: "Já realizei o pagamento"
    }
  }[kind] || {
    pill: "Pagamento",
    icon: "✓",
    title: "Pagamento",
    text: "Acompanhe sua solicitação para ver o status atualizado.",
      action: "Acompanhar solicitação"
  };
  phone(`${step(config.pill, false)}
    <div class="success">
      <div class="success-icon">${config.icon}</div>
      <h2 class="screen-title">${config.title}</h2>
      <p class="screen-copy">${config.text}</p>
    </div>
    <div id="paymentStatusNotice"></div>
    <div class="bottom"><button class="btn" onclick="${kind === "failure" ? "render('priority')" : "confirmMercadoPagoPayment()"}">${kind === "failure" ? config.action : "Já realizei o pagamento"}</button></div>
  `);
}

async function confirmMercadoPagoPayment() {
  const params = new URLSearchParams(location.search);
  const paymentId = params.get("payment_id") || params.get("collection_id") || state.paymentId || "";
  const target = $("#paymentStatusNotice");
  if (!paymentId) {
    if (target) target.innerHTML = `<div class="notice">Não encontramos o código do pagamento no retorno do Mercado Pago.</div>`;
    return;
  }
  try {
    if (target) target.innerHTML = `<div class="notice">Consultando pagamento...</div>`;
    const res = await apiFetch(`/api/payments/mercadopago/status?payment_id=${encodeURIComponent(paymentId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || "Não foi possível consultar o pagamento.");
    if (data.status === "approved" || data.statusPagamento === "aprovado") {
      state.pagamentoAprovado = true;
      state.paymentId = String(paymentId);
      state.canalResposta = state.canalResposta || "Pelo aplicativo";
      saveState();
      render("about");
      return;
    }
    if (["pending", "in_process", "authorized", "aguardando_pagamento"].includes(data.status || data.statusPagamento)) {
      if (target) target.innerHTML = `<div class="notice">Pagamento ainda não confirmado. Aguarde alguns instantes e tente novamente.</div>`;
      return;
    }
    if (target) target.innerHTML = `<div class="notice">Pagamento não aprovado. Tente novamente.</div>`;
  } catch (err) {
    if (target) target.innerHTML = `<div class="notice">${err.message || "Não foi possível consultar o pagamento agora."}</div>`;
  }
}

async function adminInit() {
  app.className = "admin-app";
  const me = await apiFetch("/api/admin/me");
  if (!me.ok) return adminLogin();
  await loadAdmin("dashboard");
}
function adminLogin() {
  app.className = "login-wrap";
  app.innerHTML = `<section class="login-card"><div class="admin-logo">Resolve<span class="accent">Ai</span></div><h1>Painel Administrativo</h1><p class="subtle">Acesse para analisar solicitações e enviar respostas.</p><div class="form"><label>E-mail<input id="email" value="victorjuniorlanadasilva@gmail.com"></label><label>Senha<input id="senha" type="password"></label><div class="error" id="err"></div><button class="btn" onclick="loginAdmin()">Entrar</button></div></section>`;
}
async function loginAdmin() {
  const res = await apiFetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: $("#email").value, senha: $("#senha").value }) });
  if (!res.ok) return $("#err").textContent = "E-mail ou senha inválidos.";
  loadAdmin("dashboard");
}
async function loadAdmin(view) {
  const res = await apiFetch("/api/admin/solicitacoes");
  adminItems = await res.json();
  app.className = "admin-app";
  app.innerHTML = `<div class="admin-layout"><aside class="sidebar"><div class="admin-logo">Resolve<span class="accent">Ai</span></div><button class="nav-btn ${view==="dashboard"?"active":""}" onclick="loadAdmin('dashboard')">Dashboard</button><button class="nav-btn ${view==="requests"?"active":""}" onclick="loadAdmin('requests')">Solicitações</button><button class="nav-btn ${view==="password"?"active":""}" onclick="loadAdmin('password')">Trocar senha</button><button class="nav-btn" onclick="logoutAdmin()">Sair</button></aside><main class="admin-main" id="adminMain"></main></div>`;
  if (view === "dashboard") adminDashboard();
  if (view === "requests") adminRequests();
  if (view === "password") adminPassword();
}
function stats(items) {
  const now = new Date();
  const sameDay = (d) => new Date(d).toDateString() === now.toDateString();
  const within = (d, days) => (now - new Date(d)) / 86400000 <= days;
  const paidItems = items.filter((i) => i.statusPagamento === "aprovado");
  const revenue = (arr) => arr.reduce((s, i) => s + Number(i.valorPago || 0), 0);
  return { total: items.length, today: items.filter(i => sameDay(i.dataCriacao)).length, week: items.filter(i => within(i.dataCriacao, 7)).length, month: items.filter(i => within(i.dataCriacao, 31)).length, pending: items.filter(i => textKey(i.status) === "em analise").length, answered: items.filter(i => textKey(i.status) === "respondido").length, canceled: items.filter(i => textKey(i.status) === "cancelado").length, normal: items.filter(i => i.plano === "Normal").length, priority: items.filter(i => i.plano === "Prioritario").length, revToday: revenue(paidItems.filter(i => sameDay(i.dataCriacao))), revMonth: revenue(paidItems.filter(i => within(i.dataCriacao, 31))), revTotal: revenue(paidItems) };
}
function topBy(key) {
  const counts = {};
  adminItems.forEach(i => counts[i[key] || "-"] = (counts[i[key] || "-"] || 0) + 1);
  return Object.entries(counts).sort((a,b) => b[1] - a[1])[0]?.[0] || "-";
}
function topList(key, limit = 3) {
  const counts = {};
  adminItems.forEach(i => counts[i[key] || "-"] = (counts[i[key] || "-"] || 0) + 1);
  return Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, limit);
}
function featuredAdmin() {
  const selected = getFeaturedCategories();
  return `<section class="info-card details"><strong>Categorias em destaque</strong><p class="subtle">As categorias marcadas aparecem primeiro para o cliente neste navegador.</p><div class="featured-grid">${categories.map(([icon, name]) => `<button class="choice-card ${selected.includes(name) ? "selected" : ""}" onclick="toggleFeaturedCategory('${name}')"><span class="emoji">${icon}</span><strong>${name}</strong></button>`).join("")}</div></section>`;
}
function toggleFeaturedCategory(name) {
  const selected = getFeaturedCategories();
  const next = selected.includes(name) ? selected.filter((item) => item !== name) : [...selected, name];
  saveFeaturedCategories(next);
  adminDashboard();
}
function adminDashboard() {
  const s = stats(adminItems);
  $("#adminMain").innerHTML = `<div class="admin-head"><h1>Dashboard</h1><span class="badge">Visão geral</span></div><div class="metric-grid">
    ${metric("Quantidade de solicitações", s.total)}${metric("Solicitações Hoje", s.today)}${metric("Solicitações Semana", s.week)}${metric("Solicitações Mês", s.month)}${metric("Pendentes", s.pending)}${metric("Respondidas", s.answered)}${metric("Canceladas", s.canceled)}${metric("Solicitações Normais", s.normal)}${metric("Solicitações Prioritárias", s.priority)}${metric("Receita do dia", money(s.revToday))}${metric("Receita do mês", money(s.revMonth))}${metric("Receita total", money(s.revTotal))}
  </div>${adminItems.length ? "" : `<div class="notice">Nenhuma solicitação encontrada.</div>`}<h2 class="section-title">Indicadores</h2><div class="metric-grid">${metric("Categoria mais procurada", topBy("categoria"))}${metric("Cidade com mais solicitações", topBy("cidade"))}${metric("Canal mais utilizado", topBy("canalResposta"))}${metric("Plano mais utilizado", topBy("plano"))}</div><h2 class="section-title">Top 3 categorias</h2><div class="metric-grid">${topList("categoria").length ? topList("categoria").map(([name, value]) => metric(name, `${value} solicitações`)).join("") : metric("Categorias", "Nenhuma solicitação encontrada.")}</div>${featuredAdmin()}<h2 class="section-title">Gráficos</h2><div class="chart-grid">${["categoria","cidade","plano","status"].map(k => `<div class="chart-card"><strong>${labelChart(k)}</strong><canvas data-chart="${k}"></canvas></div>`).join("")}</div>`;
  document.querySelectorAll("canvas[data-chart]").forEach(drawChart);
}
function metric(name, value) { return `<div class="metric"><span>${name}</span><strong>${value}</strong></div>`; }
function labelChart(k) { return ({ categoria: "Solicitações por categoria", cidade: "Solicitações por cidade", plano: "Solicitações por plano", status: "Solicitações por período" })[k]; }
function drawChart(canvas) {
  const key = canvas.dataset.chart;
  const ctx = canvas.getContext("2d");
  const data = {};
  adminItems.forEach(i => data[i[key] || "-"] = (data[i[key] || "-"] || 0) + 1);
  const entries = Object.entries(data).slice(0, 6);
  const w = canvas.width = canvas.clientWidth * devicePixelRatio;
  const h = canvas.height = 220 * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.clearRect(0,0,w,h);
  const max = Math.max(...entries.map(e => e[1]), 1);
  entries.forEach(([name, value], index) => {
    const y = 28 + index * 30;
    ctx.fillStyle = index % 2 ? "#f5a623" : "#279342";
    ctx.fillRect(0, y, (canvas.clientWidth - 120) * value / max, 18);
    ctx.fillStyle = "#17211b";
    ctx.font = "12px system-ui";
    ctx.fillText(`${name} (${value})`, 8, y + 14);
  });
}
function adminRequests() {
  $("#adminMain").innerHTML = `<div class="admin-head"><h1>Solicitações</h1><div class="actions"><span class="badge">${adminItems.length} registros</span><button class="btn secondary" onclick="clearMockData()">Limpar dados fictícios</button></div></div><div class="filters">${["Data Inicial","Data Final","Pesquisar por Dia","Cidade","Categoria","Plano","Status","Nome","Protocolo"].map((p,i)=>`<input id="f${i}" placeholder="${p}" oninput="filterTable()">`).join("")}</div><div id="requestArea"></div>`;
  filterTable();
}
function filterTable() {
  const terms = Array.from(document.querySelectorAll(".filters input")).map(i => i.value.toLowerCase()).filter(Boolean);
  let items = adminItems.filter(i => terms.every(t => JSON.stringify(i).toLowerCase().includes(t)));
  items = items.sort((a,b) => (b.plano === "Prioritario") - (a.plano === "Prioritario") || new Date(b.dataCriacao) - new Date(a.dataCriacao));
  $("#requestArea").innerHTML = items.length ? `<div class="table-wrap"><table><thead><tr><th>Protocolo</th><th>Nome</th><th>Cidade</th><th>Categoria</th><th>Plano</th><th>Canal</th><th>Data</th><th>Status</th></tr></thead><tbody>${items.map(i => `<tr onclick="adminDetail('${i.id}')"><td>${i.protocolo}</td><td>${i.nome}</td><td>${i.cidade}</td><td>${i.categoria}</td><td><span class="badge ${i.plano==="Prioritario"?"gold":""}">${i.plano === "Prioritario" ? "⭐ " : "🟢 "}${i.plano}</span></td><td>${i.canalResposta}</td><td>${dt(i.dataCriacao)}</td><td>${i.status}</td></tr>`).join("")}</tbody></table></div>` : `<div class="notice">Nenhuma solicitação encontrada.</div>`;
}

function clearMockData() {
  localStorage.removeItem("resolveai_state");
  alert("Dados locais de demonstração limpos. O painel continuará exibindo somente solicitações reais do banco.");
  loadAdmin("requests");
}
function adminDetail(id) {
  selectedAdmin = adminItems.find(i => i.id === id);
  $("#adminMain").innerHTML = `<div class="admin-head"><h1>${selectedAdmin.protocolo}</h1><button class="btn secondary" onclick="adminRequests()">Voltar</button></div><div class="detail-grid">${["nome","cidade","whatsapp","email","categoria","canalResposta","plano","status"].map(k => metric(k, selectedAdmin[k] || "-")).join("")}</div><h2 class="section-title">Problema completo</h2><section class="info-card details"><p>${selectedAdmin.problema}</p></section><h2 class="section-title">Resposta do administrador</h2><textarea class="admin-textarea" id="resp">${selectedAdmin.respostaAdmin || ""}</textarea><div class="actions"><button class="btn" onclick="saveAnswer()">Salvar Resposta</button><button class="btn secondary" onclick="setStatus('Respondido')">Marcar como Respondido</button><button class="btn secondary" onclick="setStatus('Cancelado')">Cancelar Solicitação</button><button class="btn secondary" onclick="adminRequests()">Voltar</button></div>`;
}
async function patchSelected(data) {
  const res = await apiFetch(`/api/admin/solicitacoes/${selectedAdmin.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  selectedAdmin = await res.json();
  await loadAdmin("requests");
}
function saveAnswer() { patchSelected({ respostaAdmin: $("#resp").value }); }
function setStatus(status) { patchSelected({ respostaAdmin: $("#resp").value, status }); }
function adminPassword() {
  $("#adminMain").innerHTML = `<div class="admin-head"><h1>Trocar senha</h1></div><div class="form" style="max-width:460px"><label>Senha atual<input id="old" type="password"></label><label>Nova senha<input id="new" type="password"></label><div class="error" id="passMsg"></div><button class="btn" onclick="changePass()">Alterar senha</button></div>`;
}
async function changePass() {
  const res = await apiFetch("/api/admin/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senhaAtual: $("#old").value, novaSenha: $("#new").value }) });
  $("#passMsg").textContent = res.ok ? "Senha alterada com sucesso." : (await res.json()).error;
}
async function logoutAdmin() { await apiFetch("/api/admin/logout", { method: "POST" }); adminLogin(); }

if (location.pathname.startsWith("/admin")) {
  adminInit();
} else if (location.pathname === "/pagamento/sucesso") {
  paymentReturn("success");
} else if (location.pathname === "/pagamento/erro") {
  paymentReturn("failure");
} else if (location.pathname === "/pagamento/pendente") {
  paymentReturn("pending");
} else {
  render(state.screen || "welcome");
}
