const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const DOTENV_RESULT = require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
if (DOTENV_RESULT.error && DOTENV_RESULT.error.code !== "ENOENT") {
  console.warn("[ENV] dotenv nao carregou .env local:", DOTENV_RESULT.error.message);
}
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data", "db.json");
const ENV = process.env;
const PORT = Number(ENV.PORT || 3000);
const SESSION_SECRET = ENV.SESSION_SECRET || "resolveai-local-session-secret";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function nowIso() {
  return new Date().toISOString();
}

function readDb() {
  if (!fs.existsSync(DATA)) seedDb();
  return JSON.parse(fs.readFileSync(DATA, "utf8"));
}

function writeDb(db) {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(db, null, 2));
}

function seedDb() {
  const base = new Date();
  const mkDate = (days, h = 13) => {
    const date = new Date(base);
    date.setDate(date.getDate() - days);
    date.setHours(h, 30, 0, 0);
    return date.toISOString();
  };
  writeDb({
    solicitacoes: [
      {
        id: crypto.randomUUID(),
        clientId: "demo-admin",
        protocolo: "#202606030001",
        nome: "Ana Ribeiro",
        cidade: "Sao Paulo",
        whatsapp: "(11) 99999-0001",
        email: "ana@email.com",
        contato: "(11) 99999-0001",
        categoria: "Amor e Relacionamentos",
        problema: "Estou em duvida sobre como conversar com meu parceiro sem transformar tudo em discussao.",
        plano: "Prioritario",
        canalResposta: "WhatsApp",
        status: "Respondido",
        statusPagamento: "aprovado",
        respostaAdmin: "A principal proposta e iniciar uma conversa curta, com um unico tema, usando exemplos objetivos e combinando um proximo passo simples para os dois.",
        valorPago: 9.99,
        mercadoPagoPaymentId: "demo_pay_001",
        dataCriacao: mkDate(0, 10),
        dataResposta: mkDate(0, 12)
      },
      {
        id: crypto.randomUUID(),
        clientId: "demo-admin",
        protocolo: "#202606020004",
        nome: "Marcos Lima",
        cidade: "Campinas",
        whatsapp: "(19) 98888-1111",
        email: "marcos@email.com",
        contato: "(19) 98888-1111",
        categoria: "Negocios",
        problema: "Meu restaurante recebe movimento no almoco, mas o faturamento nao fecha no fim do mes.",
        plano: "Gratuito",
        canalResposta: "E-mail",
        status: "Em análise",
        statusPagamento: "aprovado",
        respostaAdmin: "",
        valorPago: 0,
        mercadoPagoPaymentId: "",
        dataCriacao: mkDate(1, 16),
        dataResposta: ""
      },
      {
        id: crypto.randomUUID(),
        clientId: "demo-admin",
        protocolo: "#202606010003",
        nome: "Julia Costa",
        cidade: "Rio de Janeiro",
        whatsapp: "",
        email: "julia@email.com",
        contato: "julia@email.com",
        categoria: "Estudos",
        problema: "Nao consigo manter rotina para estudar depois do trabalho.",
        plano: "Gratuito",
        canalResposta: "Pelo aplicativo",
        status: "Em análise",
        statusPagamento: "aprovado",
        respostaAdmin: "",
        valorPago: 0,
        mercadoPagoPaymentId: "",
        dataCriacao: mkDate(2, 19),
        dataResposta: ""
      }
    ],
    administradores: [
      {
        id: crypto.randomUUID(),
        nome: "Victor Junior",
        email: "victorjuniorlanadasilva@gmail.com",
        senhaHash: "resolveai-admin-v1:1f479f45af01c5f3aeb2f6855738d30133a5dc45497be51f6c5ab3c12a0de9eb5923596db6b2e7f1282f5315913e244894c24518bfea058e3ce318e377635f72",
        ultimoLogin: "",
        dataCriacao: nowIso()
      }
    ],
    sessoes: []
  });
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_500_000) req.destroy();
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (err) { reject(err); }
    });
  });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const current = crypto.scryptSync(password, salt, 64);
  const saved = Buffer.from(hash, "hex");
  return saved.length === current.length && crypto.timingSafeEqual(saved, current);
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, decodeURIComponent(rest.join("="))];
  }));
}

function createSession(res, adminId) {
  const id = crypto.randomUUID();
  const token = `${id}.${sign(id)}`;
  const db = readDb();
  db.sessoes = db.sessoes.filter((s) => s.adminId !== adminId);
  db.sessoes.push({ id, adminId, dataCriacao: nowIso() });
  writeDb(db);
  res.setHeader("Set-Cookie", `resolveai_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
}

function getAdmin(req) {
  const token = parseCookies(req).resolveai_session || "";
  const [id, signature] = token.split(".");
  if (!id || signature !== sign(id)) return null;
  const db = readDb();
  const session = db.sessoes.find((s) => s.id === id);
  if (!session) return null;
  return db.administradores.find((a) => a.id === session.adminId) || null;
}

function protocol(db) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = db.solicitacoes.filter((s) => s.protocolo.includes(today)).length + 1;
  return `#${today}${String(count).padStart(4, "0")}`;
}

function normalizePlan(plan) {
  return plan === "Prioritario" ? "Prioritario" : "Gratuito";
}

function mercadoPagoBaseUrl() {
  return "https://api.mercadopago.com";
}

function mercadoPagoConfigSnapshot() {
  return {
    dotenvLoaded: !DOTENV_RESULT.error,
    dotenvPath: path.join(ROOT, ".env"),
    dotenvError: DOTENV_RESULT.error ? DOTENV_RESULT.error.message : null,
    accessTokenPresent: Boolean(ENV.MERCADOPAGO_ACCESS_TOKEN),
    accessTokenLength: ENV.MERCADOPAGO_ACCESS_TOKEN ? ENV.MERCADOPAGO_ACCESS_TOKEN.length : 0,
    publicKeyPresent: Boolean(ENV.MERCADOPAGO_PUBLIC_KEY),
    baseUrl: mercadoPagoBaseUrl()
  };
}

function appBaseUrl() {
  return (ENV.APP_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
}

function mercadoPagoBackUrls() {
  const baseUrl = appBaseUrl();
  const backUrls = {
    success: `${baseUrl}/pagamento/sucesso`,
    failure: `${baseUrl}/pagamento/erro`,
    pending: `${baseUrl}/pagamento/pendente`
  };
  if (!backUrls.success || !backUrls.failure || !backUrls.pending) {
    const error = new Error("Nao foi possivel criar checkout sem back_urls completos.");
    error.status = 500;
    error.details = backUrls;
    throw error;
  }
  return backUrls;
}

function isLocalAppUrl(value) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(value);
}

function mercadoPagoHeaders() {
  return {
    "Content-Type": "application/json",
    "User-Agent": "ResolveAi/1.0",
    Authorization: `Bearer ${ENV.MERCADOPAGO_ACCESS_TOKEN}`
  };
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeContact(value) {
  return String(value || "").trim().toLowerCase();
}

function contactMatches(item, contact) {
  const normalized = normalizeContact(contact);
  const digits = onlyDigits(contact);
  if (!normalized && !digits) return false;
  return normalizeContact(item.email) === normalized || (digits && onlyDigits(item.whatsapp) === digits);
}

function logMercadoPago(step, details = {}) {
  const safe = JSON.parse(JSON.stringify(details, (key, value) => {
    if (key.toLowerCase().includes("token")) return "[redigido]";
    if (key.toLowerCase().includes("authorization")) return "[redigido]";
    if (key === "number" && typeof value === "string") return `****${value.slice(-4)}`;
    if (key === "ccv") return "***";
    return value;
  }));
  console.log(`[MERCADO_PAGO] ${step}`, safe);
}

async function mercadoPagoRequest(pathname, payload, step, method = "POST") {
  const url = `${mercadoPagoBaseUrl()}${pathname}`;
  logMercadoPago(`${step} request`, {
    method,
    url,
    headers: {
      "Content-Type": "application/json",
      Authorization: ENV.MERCADOPAGO_ACCESS_TOKEN ? "Bearer [presente]" : "Bearer [vazio]"
    },
    payload
  });
  const response = await fetch(url, {
    method,
    headers: mercadoPagoHeaders(),
    body: method === "GET" ? undefined : JSON.stringify(payload)
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    logMercadoPago(`${step} falhou`, { status: response.status, response: data });
    const message = data.message || data.error || data.cause?.map((err) => err.description || err.message).join(" | ") || `Mercado Pago respondeu HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  logMercadoPago(`${step} ok`, { status: response.status, id: data.id });
  return data;
}

function createDemoMercadoPagoPreference(solicitacao) {
  return {
    id: `demo_mp_${crypto.randomUUID()}`,
    init_point: "#",
    sandbox_init_point: "#",
    status: "demo",
    external_reference: solicitacao.id,
    back_urls: mercadoPagoBackUrls(),
    auto_return: "approved",
    payment_methods: {
      enabled: ["PIX", "CREDIT_CARD", "BOLETO"]
    }
  };
}

async function createMercadoPagoPreference(solicitacao) {
  logMercadoPago("configuracao", mercadoPagoConfigSnapshot());
  if (!ENV.MERCADOPAGO_ACCESS_TOKEN) {
    logMercadoPago("modo demonstracao", { reason: "MERCADOPAGO_ACCESS_TOKEN ausente" });
    return createDemoMercadoPagoPreference(solicitacao);
  }
  const baseUrl = appBaseUrl();
  const backUrls = mercadoPagoBackUrls();
  const preference = {
    items: [
      {
        id: "resolveai-prioritario",
        title: `Atendimento prioritario ResolveAi ${solicitacao.protocolo}`,
        description: "Proposta de solucao em ate 2 horas",
        quantity: 1,
        currency_id: "BRL",
        unit_price: 9.99
      }
    ],
    payer: {
      name: solicitacao.nome || undefined,
      email: solicitacao.email || undefined,
      phone: onlyDigits(solicitacao.whatsapp) ? { number: onlyDigits(solicitacao.whatsapp) } : undefined
    },
    external_reference: solicitacao.id,
    notification_url: `${baseUrl}/api/webhooks/mercadopago`,
    back_urls: backUrls,
    back_url: backUrls,
    payment_methods: {
      excluded_payment_methods: [],
      excluded_payment_types: [],
      installments: 6
    }
  };
  if (isLocalAppUrl(baseUrl)) {
    logMercadoPago("auto_return desativado localmente", {
      reason: "Mercado Pago nao aceita localhost em back_urls com auto_return.",
      appUrl: baseUrl
    });
  } else {
    preference.auto_return = "approved";
  }
  logMercadoPago("criando preferencia", { payload: preference });
  return mercadoPagoRequest("/checkout/preferences", preference, "preferencia");
}

function mapMercadoPagoStatus(status) {
  if (status === "approved" || status === "accredited") return "aprovado";
  if (["pending", "in_process", "in_mediation", "authorized"].includes(status)) return "aguardando_pagamento";
  if (["rejected", "cancelled", "refunded", "charged_back"].includes(status)) return "recusado";
  return "aguardando_pagamento";
}

function applyPaymentStatus(item, status, paymentId) {
  item.statusPagamento = mapMercadoPagoStatus(status);
  item.mercadoPagoPaymentId = paymentId ? String(paymentId) : item.mercadoPagoPaymentId || "";
  if (item.statusPagamento === "aprovado") {
    item.plano = "Prioritario";
    item.status = "Em análise";
    item.valorPago = 9.99;
  }
  if (item.statusPagamento === "recusado") {
    item.valorPago = 0;
  }
  return item;
}

async function fetchMercadoPagoPayment(paymentId) {
  if (!ENV.MERCADOPAGO_ACCESS_TOKEN) {
    const error = new Error("MERCADOPAGO_ACCESS_TOKEN nao esta configurado.");
    error.status = 500;
    error.details = "A variavel MERCADOPAGO_ACCESS_TOKEN esta vazia no .env.";
    throw error;
  }
  return mercadoPagoRequest(`/v1/payments/${paymentId}`, {}, "consulta pagamento", "GET");
}

function publicRequest(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (urlPath === "/") urlPath = "/index.html";
  if (!path.extname(urlPath)) urlPath = "/index.html";
  const filePath = path.normalize(path.join(PUBLIC, urlPath));
  if (!filePath.startsWith(PUBLIC)) return json(res, 403, { error: "Acesso negado" });
  fs.readFile(filePath, (err, file) => {
    if (err) return json(res, 404, { error: "Arquivo nao encontrado" });
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(file);
  });
}

async function api(req, res) {
  const url = new URL(req.url, "http://localhost");
  const db = readDb();
  try {
    if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { ok: true });
    if (req.method === "GET" && url.pathname === "/api/solicitacoes") {
      const clientId = String(url.searchParams.get("clientId") || "").trim();
      if (!clientId) return json(res, 400, { error: "clientId obrigatorio" });
      const items = db.solicitacoes
        .filter((s) => s.clientId === clientId)
        .sort((a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));
      return json(res, 200, items);
    }
    if (req.method === "POST" && url.pathname === "/api/solicitacoes/recuperar") {
      const data = await body(req);
      const protocoloBusca = String(data.protocolo || "").trim();
      const item = db.solicitacoes.find((s) => s.protocolo === protocoloBusca && contactMatches(s, data.contato));
      if (!item) return json(res, 404, { error: "Solicitacao nao encontrada para esse protocolo e contato." });
      if (data.clientId) {
        item.clientId = String(data.clientId).trim();
        writeDb(db);
      }
      return json(res, 200, item);
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/solicitacoes/")) {
      const protocolo = decodeURIComponent(url.pathname.split("/").pop());
      const clientId = String(url.searchParams.get("clientId") || "").trim();
      const item = db.solicitacoes.find((s) => s.protocolo === protocolo && s.clientId === clientId);
      return item ? json(res, 200, item) : json(res, 404, { error: "Protocolo nao encontrado" });
    }
    if (req.method === "POST" && url.pathname === "/api/solicitacoes") {
      const data = await body(req);
      const plan = normalizePlan(data.plano);
      const item = {
        id: crypto.randomUUID(),
        clientId: String(data.clientId || "").trim(),
        protocolo: protocol(db),
        nome: String(data.nome || "").trim(),
        cidade: String(data.cidade || "").trim(),
        whatsapp: String(data.whatsapp || "").trim(),
        email: String(data.email || "").trim(),
        contato: String(data.whatsapp || data.email || "").trim(),
        categoria: String(data.categoria || "Outros").trim(),
        problema: String(data.problema || "").slice(0, 1000),
        plano: plan,
        canalResposta: String(data.canalResposta || "Pelo aplicativo"),
        status: "Em análise",
        statusPagamento: plan === "Prioritario" ? "aguardando_pagamento" : "aprovado",
        respostaAdmin: "",
        valorPago: plan === "Prioritario" ? 9.99 : 0,
        mercadoPagoPaymentId: "",
        dataCriacao: nowIso(),
        dataResposta: ""
      };
      if (!item.clientId || !item.problema || !item.nome || !item.cidade) return json(res, 400, { error: "Dados obrigatorios ausentes" });
      db.solicitacoes.unshift(item);
      writeDb(db);
      return json(res, 201, item);
    }
    if (req.method === "PATCH" && url.pathname.startsWith("/api/solicitacoes/")) {
      const id = url.pathname.split("/").pop();
      const data = await body(req);
      const item = db.solicitacoes.find((s) => s.id === id);
      if (!item) return json(res, 404, { error: "Solicitacao nao encontrada" });
      if (item.clientId && data.clientId && item.clientId !== String(data.clientId).trim()) return json(res, 403, { error: "Acesso negado" });
      ["nome", "cidade", "whatsapp", "email", "canalResposta"].forEach((key) => {
        if (typeof data[key] === "string") item[key] = data[key].trim();
      });
      item.contato = item.whatsapp || item.email || "";
      if (typeof data.clientId === "string" && !item.clientId) item.clientId = data.clientId.trim();
      if (!item.nome || !item.cidade) return json(res, 400, { error: "Nome e cidade sao obrigatorios" });
      writeDb(db);
      return json(res, 200, item);
    }
    if (req.method === "POST" && url.pathname === "/api/payments/mercadopago/preference") {
      const data = await body(req);
      const item = db.solicitacoes.find((s) => s.id === data.solicitacaoId);
      if (!item || item.plano !== "Prioritario") return json(res, 404, { error: "Solicitacao prioritaria nao encontrada" });
      if (item.clientId && item.clientId !== String(data.clientId || "").trim()) return json(res, 403, { error: "Acesso negado" });
      try {
        const preference = await createMercadoPagoPreference(item);
        item.mercadoPagoPreferenceId = preference.id || item.mercadoPagoPreferenceId || "";
        item.statusPagamento = "aguardando_pagamento";
        writeDb(db);
        const initPoint = preference.init_point || preference.sandbox_init_point || "";
        return json(res, 200, { init_point: initPoint, preference_id: preference.id || "" });
      } catch (err) {
        const details = err.details || err.message || "Erro sem detalhes retornados.";
        console.error("[MERCADO_PAGO] erro ao gerar pagamento", {
          message: err.message,
          status: err.status || 500,
          solicitacaoId: item.id,
          protocolo: item.protocolo,
          details
        });
        return json(res, err.status || 500, {
          error: true,
          message: err.message || "Nao foi possivel gerar o pagamento agora. Tente novamente.",
          details
        });
      }
    }
    if (url.pathname === "/api/payments/mercadopago/preference") {
      return json(res, 405, {
        error: true,
        message: "Use POST para criar a preferencia de pagamento Mercado Pago."
      });
    }
    if (req.method === "GET" && url.pathname === "/api/payments/mercadopago/status") {
      return json(res, 200, {
        ok: true,
        route: "/api/payments/mercadopago/preference",
        method: "POST",
        accessTokenPresent: Boolean(ENV.MERCADOPAGO_ACCESS_TOKEN),
        publicKeyPresent: Boolean(ENV.MERCADOPAGO_PUBLIC_KEY)
      });
    }
    if (req.method === "POST" && url.pathname === "/api/payments/demo-approve") {
      if (ENV.MERCADOPAGO_ACCESS_TOKEN) return json(res, 403, { error: "Aprovacao demonstrativa desativada com Mercado Pago configurado." });
      const data = await body(req);
      const item = db.solicitacoes.find((s) => s.id === data.solicitacaoId);
      if (!item) return json(res, 404, { error: "Solicitacao nao encontrada" });
      if (item.clientId && item.clientId !== String(data.clientId || "").trim()) return json(res, 403, { error: "Acesso negado" });
      item.statusPagamento = "aprovado";
      item.plano = "Prioritario";
      item.status = "Em análise";
      writeDb(db);
      return json(res, 200, item);
    }
    if (req.method === "POST" && url.pathname === "/api/webhooks/mercadopago") {
      const signature = req.headers["x-signature"] || "";
      if (ENV.MERCADOPAGO_WEBHOOK_SECRET) {
        logMercadoPago("webhook assinatura recebida", { signaturePresent: Boolean(signature) });
      }
      const event = await body(req);
      logMercadoPago("webhook recebido", { event });
      const paymentId = event.data?.id || event.id || event.resource;
      if (paymentId && (event.type === "payment" || event.topic === "payment" || String(paymentId).match(/^\d+$/))) {
        const payment = await fetchMercadoPagoPayment(paymentId);
        const item = db.solicitacoes.find((s) => s.id === payment.external_reference || s.mercadoPagoPaymentId === String(payment.id));
        if (item) {
          applyPaymentStatus(item, payment.status, payment.id);
          writeDb(db);
        }
      }
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/admin/login") {
      const data = await body(req);
      const admin = db.administradores.find((a) => a.email.toLowerCase() === String(data.email || "").toLowerCase());
      if (!admin || !verifyPassword(String(data.senha || ""), admin.senhaHash)) return json(res, 401, { error: "Login invalido" });
      admin.ultimoLogin = nowIso();
      writeDb(db);
      createSession(res, admin.id);
      return json(res, 200, { nome: admin.nome, email: admin.email });
    }
    if (req.method === "POST" && url.pathname === "/api/admin/logout") {
      res.setHeader("Set-Cookie", "resolveai_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
      return json(res, 200, { ok: true });
    }
    const admin = getAdmin(req);
    if (url.pathname.startsWith("/api/admin") && !admin) return json(res, 401, { error: "Nao autenticado" });
    if (req.method === "GET" && url.pathname === "/api/admin/me") return json(res, 200, { nome: admin.nome, email: admin.email });
    if (req.method === "POST" && url.pathname === "/api/admin/password") {
      const data = await body(req);
      const target = db.administradores.find((a) => a.id === admin.id);
      if (!verifyPassword(String(data.senhaAtual || ""), target.senhaHash)) return json(res, 400, { error: "Senha atual incorreta" });
      if (String(data.novaSenha || "").length < 8) return json(res, 400, { error: "A nova senha deve ter ao menos 8 caracteres" });
      target.senhaHash = hashPassword(String(data.novaSenha));
      writeDb(db);
      return json(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/api/admin/solicitacoes") return json(res, 200, db.solicitacoes);
    if (req.method === "PATCH" && url.pathname.startsWith("/api/admin/solicitacoes/")) {
      const id = url.pathname.split("/").pop();
      const data = await body(req);
      const item = db.solicitacoes.find((s) => s.id === id);
      if (!item) return json(res, 404, { error: "Solicitacao nao encontrada" });
      ["respostaAdmin", "status"].forEach((key) => {
        if (typeof data[key] === "string") item[key] = data[key];
      });
      if (item.status === "Respondido" && !item.dataResposta) item.dataResposta = nowIso();
      writeDb(db);
      return json(res, 200, item);
    }
    return publicRequest(req, res);
  } catch (err) {
    return json(res, 500, { error: err.message || "Erro interno" });
  }
}

http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) return api(req, res);
  return publicRequest(req, res);
}).listen(PORT, () => {
  console.log(`ResolveAi rodando em http://localhost:${PORT}`);
});
