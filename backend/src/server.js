const dotenvResult = require("dotenv").config({ quiet: true });
if (dotenvResult.error && dotenvResult.error.code !== "ENOENT") {
  console.warn("[ENV] dotenv nao carregou .env local:", dotenvResult.error.message);
}

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT || 3000);
const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
const APP_URL = (process.env.APP_URL || FRONTEND_URL).replace(/\/$/, "");
const BACKEND_URL = (process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const SESSION_SECRET = process.env.SESSION_SECRET || "resolveai-local-session-secret";
const DEFAULT_ADMIN_HASH = "resolveai-admin-v1:1f479f45af01c5f3aeb2f6855738d30133a5dc45497be51f6c5ab3c12a0de9eb5923596db6b2e7f1282f5315913e244894c24518bfea058e3ce318e377635f72";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const app = express();
app.set("trust proxy", 1);
const allowedCorsOrigins = [
  "https://resolveai-nine.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173"
];
const corsOptions = {
  origin: allowedCorsOrigins,
  credentials: true
};
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  console.log("[CORS] request", {
    frontendUrl: process.env.FRONTEND_URL || "",
    origin,
    method: req.method,
    path: req.path
  });
  res.on("finish", () => {
    console.log("[CORS] response", {
      status: res.statusCode,
      origin,
      allowOrigin: res.getHeader("Access-Control-Allow-Origin") || "",
      allowCredentials: res.getHeader("Access-Control-Allow-Credentials") || ""
    });
  });
  next();
});
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  if (allowedCorsOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

function toClient(row) {
  if (!row) return null;
  return {
    id: row.id,
    clientId: row.client_id,
    protocolo: row.protocolo,
    nome: row.nome,
    cidade: row.cidade,
    whatsapp: row.whatsapp || "",
    email: row.email || "",
    contato: row.contato || "",
    categoria: row.categoria,
    problema: row.problema,
    plano: row.plano,
    canalResposta: row.canal_resposta,
    status: row.status,
    statusPagamento: row.status_pagamento,
    respostaAdmin: row.resposta_admin || "",
    valorPago: Number(row.valor_pago || 0),
    mercadoPagoPaymentId: row.mercado_pago_payment_id || "",
    mercadoPagoPreferenceId: row.mercado_pago_preference_id || "",
    dataCriacao: row.data_criacao,
    dataResposta: row.data_resposta || ""
  };
}

function nowIso() {
  return new Date().toISOString();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const current = crypto.scryptSync(password, salt, 64);
  const saved = Buffer.from(hash, "hex");
  return saved.length === current.length && crypto.timingSafeEqual(saved, current);
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function sessionCookieOptions() {
  const secure = FRONTEND_URL.startsWith("https://");
  return {
    httpOnly: true,
    sameSite: secure ? "none" : "lax",
    secure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  };
}

async function createSession(res, adminId) {
  const id = crypto.randomUUID();
  const token = `${id}.${sign(id)}`;
  await pool.query("delete from sessoes where admin_id = $1", [adminId]);
  await pool.query("insert into sessoes (id, admin_id) values ($1, $2)", [id, adminId]);
  res.cookie("resolveai_session", token, sessionCookieOptions());
}

async function getAdmin(req) {
  const token = req.cookies.resolveai_session || "";
  const [id, signature] = token.split(".");
  if (!id || signature !== sign(id)) return null;
  const result = await pool.query(
    "select a.* from sessoes s join administradores a on a.id = s.admin_id where s.id = $1",
    [id]
  );
  return result.rows[0] || null;
}

async function protocol() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const result = await pool.query("select count(*)::int as total from solicitacoes where protocolo like $1", [`#${today}%`]);
  return `#${today}${String(result.rows[0].total + 1).padStart(4, "0")}`;
}

function normalizePlan(plan) {
  return plan === "Prioritario" ? "Prioritario" : "Gratuito";
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function mercadoPagoPhone(value) {
  const digits = onlyDigits(value);
  if (digits.length < 10) return undefined;
  const withoutCountry = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return {
    area_code: withoutCountry.slice(0, 2),
    number: withoutCountry.slice(2)
  };
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

function mercadoPagoBaseUrl() {
  return "https://api.mercadopago.com";
}

function mercadoPagoHeaders() {
  return {
    "Content-Type": "application/json",
    "User-Agent": "ResolveAi/1.0",
    Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`
  };
}

function mercadoPagoBackUrls() {
  return {
    success: `${APP_URL}/pagamento/sucesso`,
    failure: `${APP_URL}/pagamento/erro`,
    pending: `${APP_URL}/pagamento/pendente`
  };
}

function isLocalAppUrl(value) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(value);
}

function logMercadoPago(step, details = {}) {
  const safe = JSON.parse(JSON.stringify(details, (key, value) => {
    if (key.toLowerCase().includes("token")) return "[redigido]";
    if (key.toLowerCase().includes("authorization")) return "[redigido]";
    return value;
  }));
  console.log(`[MERCADO_PAGO] ${step}`, safe);
}

function mercadoPagoEnvSnapshot() {
  return {
    accessTokenPresent: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN),
    publicKeyPresent: Boolean(process.env.MERCADOPAGO_PUBLIC_KEY),
    accessTokenLength: process.env.MERCADOPAGO_ACCESS_TOKEN ? process.env.MERCADOPAGO_ACCESS_TOKEN.length : 0,
    publicKeyLength: process.env.MERCADOPAGO_PUBLIC_KEY ? process.env.MERCADOPAGO_PUBLIC_KEY.length : 0
  };
}

async function mercadoPagoRequest(pathname, payload, step, method = "POST") {
  const url = `${mercadoPagoBaseUrl()}${pathname}`;
  logMercadoPago(`${step} request`, { method, url, payload });
  const response = await fetch(url, {
    method,
    headers: mercadoPagoHeaders(),
    body: method === "GET" ? undefined : JSON.stringify(payload)
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    logMercadoPago(`${step} falhou`, {
      status: response.status,
      statusText: response.statusText,
      response: data,
      rawResponse: text
    });
    const message = data.message || data.error || `Mercado Pago respondeu HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function createMercadoPagoPreference(solicitacao) {
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
    const error = new Error("MERCADOPAGO_ACCESS_TOKEN nao configurado no backend.");
    error.status = 500;
    throw error;
  }
  const preference = {
    items: [{
      id: "resolveai-prioritario",
      title: `Atendimento prioritario ResolveAi ${solicitacao.protocolo}`,
      description: "Proposta de solucao em ate 2 horas",
      quantity: 1,
      currency_id: "BRL",
      unit_price: 9.99
    }],
    payer: {
      name: solicitacao.nome || undefined,
      email: solicitacao.email || undefined,
      phone: mercadoPagoPhone(solicitacao.whatsapp)
    },
    external_reference: solicitacao.id,
    notification_url: `${BACKEND_URL}/api/webhooks/mercadopago`,
    back_urls: mercadoPagoBackUrls(),
    metadata: {
      protocolo: solicitacao.protocolo
    },
    payment_methods: {
      excluded_payment_methods: [],
      excluded_payment_types: [],
      installments: 6
    }
  };
  if (!isLocalAppUrl(APP_URL)) preference.auto_return = "approved";
  logMercadoPago("preferencia payload pronto", {
    solicitacaoId: solicitacao.id,
    protocolo: solicitacao.protocolo,
    appUrl: APP_URL,
    backendUrl: BACKEND_URL,
    backUrls: preference.back_urls,
    autoReturn: preference.auto_return || "",
    env: mercadoPagoEnvSnapshot(),
    payload: preference
  });
  return mercadoPagoRequest("/checkout/preferences", preference, "preferencia");
}

function mapMercadoPagoStatus(status) {
  if (status === "approved" || status === "accredited") return "aprovado";
  if (["pending", "in_process", "in_mediation", "authorized"].includes(status)) return "aguardando_pagamento";
  if (["rejected", "cancelled", "refunded", "charged_back"].includes(status)) return "recusado";
  return "aguardando_pagamento";
}

async function applyPaymentStatus(itemId, status, paymentId) {
  const statusPagamento = mapMercadoPagoStatus(status);
  const updates = {
    statusPagamento,
    plano: statusPagamento === "aprovado" ? "Prioritario" : undefined,
    status: statusPagamento === "aprovado" ? "Em analise" : undefined,
    valorPago: statusPagamento === "aprovado" ? 9.99 : statusPagamento === "recusado" ? 0 : undefined
  };
  await pool.query(
    `update solicitacoes
     set status_pagamento = $1,
         mercado_pago_payment_id = coalesce($2, mercado_pago_payment_id),
         plano = coalesce($3, plano),
         status = coalesce($4, status),
         valor_pago = coalesce($5, valor_pago)
     where id = $6`,
    [updates.statusPagamento, paymentId ? String(paymentId) : null, updates.plano || null, updates.status || null, updates.valorPago ?? null, itemId]
  );
}

async function fetchMercadoPagoPayment(paymentId) {
  return mercadoPagoRequest(`/v1/payments/${paymentId}`, {}, "consulta pagamento", "GET");
}

async function initDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL nao configurada. Configure a connection string do Supabase.");
  }
  const schema = fs.readFileSync(path.join(__dirname, "..", "sql", "schema.sql"), "utf8");
  await pool.query(schema);
  const admin = await pool.query("select id from administradores where email = $1", ["victorjuniorlanadasilva@gmail.com"]);
  if (!admin.rows.length) {
    await pool.query(
      "insert into administradores (id, nome, email, senha_hash) values ($1, $2, $3, $4)",
      [crypto.randomUUID(), "Victor Junior", "victorjuniorlanadasilva@gmail.com", DEFAULT_ADMIN_HASH]
    );
  }
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/solicitacoes", asyncHandler(async (req, res) => {
  const clientId = String(req.query.clientId || "").trim();
  if (!clientId) return res.status(400).json({ error: "clientId obrigatorio" });
  const result = await pool.query("select * from solicitacoes where client_id = $1 order by data_criacao desc", [clientId]);
  return res.json(result.rows.map(toClient));
}));

app.post("/api/solicitacoes/recuperar", asyncHandler(async (req, res) => {
  const result = await pool.query("select * from solicitacoes where protocolo = $1", [String(req.body.protocolo || "").trim()]);
  const item = result.rows.map(toClient).find((row) => contactMatches(row, req.body.contato));
  if (!item) return res.status(404).json({ error: "Solicitacao nao encontrada para esse protocolo e contato." });
  if (req.body.clientId) {
    await pool.query("update solicitacoes set client_id = $1 where id = $2", [String(req.body.clientId).trim(), item.id]);
    item.clientId = String(req.body.clientId).trim();
  }
  return res.json(item);
}));

app.get("/api/solicitacoes/:protocolo", asyncHandler(async (req, res) => {
  const clientId = String(req.query.clientId || "").trim();
  const result = await pool.query("select * from solicitacoes where protocolo = $1 and client_id = $2", [req.params.protocolo, clientId]);
  const item = toClient(result.rows[0]);
  return item ? res.json(item) : res.status(404).json({ error: "Protocolo nao encontrado" });
}));

app.post("/api/solicitacoes", asyncHandler(async (req, res) => {
  const plan = normalizePlan(req.body.plano);
  const item = {
    id: crypto.randomUUID(),
    clientId: String(req.body.clientId || "").trim(),
    protocolo: await protocol(),
    nome: String(req.body.nome || "").trim(),
    cidade: String(req.body.cidade || "").trim(),
    whatsapp: String(req.body.whatsapp || "").trim(),
    email: String(req.body.email || "").trim(),
    contato: String(req.body.whatsapp || req.body.email || "").trim(),
    categoria: String(req.body.categoria || "Outros").trim(),
    problema: String(req.body.problema || "").slice(0, 1000),
    plano: plan,
    canalResposta: String(req.body.canalResposta || "Pelo aplicativo"),
    status: "Em analise",
    statusPagamento: plan === "Prioritario" ? "aguardando_pagamento" : "aprovado",
    respostaAdmin: "",
    valorPago: plan === "Prioritario" ? 9.99 : 0
  };
  if (!item.clientId || !item.problema || !item.nome || !item.cidade) return res.status(400).json({ error: "Dados obrigatorios ausentes" });
  await pool.query(
    `insert into solicitacoes
     (id, client_id, protocolo, nome, cidade, whatsapp, email, contato, categoria, problema, plano, canal_resposta, status, status_pagamento, resposta_admin, valor_pago)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [item.id, item.clientId, item.protocolo, item.nome, item.cidade, item.whatsapp, item.email, item.contato, item.categoria, item.problema, item.plano, item.canalResposta, item.status, item.statusPagamento, item.respostaAdmin, item.valorPago]
  );
  return res.status(201).json(item);
}));

app.patch("/api/solicitacoes/:id", asyncHandler(async (req, res) => {
  const current = await pool.query("select * from solicitacoes where id = $1", [req.params.id]);
  const item = toClient(current.rows[0]);
  if (!item) return res.status(404).json({ error: "Solicitacao nao encontrada" });
  if (item.clientId && item.clientId !== String(req.body.clientId || "").trim()) return res.status(403).json({ error: "Acesso negado" });
  const nome = String(req.body.nome || item.nome).trim();
  const cidade = String(req.body.cidade || item.cidade).trim();
  const whatsapp = String(req.body.whatsapp || item.whatsapp || "").trim();
  const email = String(req.body.email || item.email || "").trim();
  const contato = whatsapp || email || "";
  const canalResposta = String(req.body.canalResposta || item.canalResposta).trim();
  await pool.query(
    "update solicitacoes set nome=$1,cidade=$2,whatsapp=$3,email=$4,contato=$5,canal_resposta=$6 where id=$7",
    [nome, cidade, whatsapp, email, contato, canalResposta, item.id]
  );
  const updated = await pool.query("select * from solicitacoes where id = $1", [item.id]);
  return res.json(toClient(updated.rows[0]));
}));

async function loadPriorityPaymentRequest(req) {
  logMercadoPago("rota pagamento recebida", {
    receivedPaymentMethod: req.body.paymentMethod || "",
    solicitacaoId: req.body.solicitacaoId || "",
    clientIdPresent: Boolean(req.body.clientId),
    env: mercadoPagoEnvSnapshot()
  });
  const result = await pool.query("select * from solicitacoes where id = $1", [req.body.solicitacaoId]);
  const item = toClient(result.rows[0]);
  if (!item || item.plano !== "Prioritario") throw httpError(404, "Solicitacao prioritaria nao encontrada");
  if (item.clientId && item.clientId !== String(req.body.clientId || "").trim()) throw httpError(403, "Acesso negado");
  return item;
}

app.post("/api/payments/mercadopago/preference", asyncHandler(async (req, res) => {
  const item = await loadPriorityPaymentRequest(req);
  try {
    logMercadoPago("criando checkout", {
      solicitacaoId: item.id,
      protocolo: item.protocolo,
      env: mercadoPagoEnvSnapshot()
    });
    const preference = await createMercadoPagoPreference(item);
    const initPoint = preference.init_point || preference.sandbox_init_point || "";
    logMercadoPago("checkout criado", {
      solicitacaoId: item.id,
      protocolo: item.protocolo,
      preferenceId: preference.id || "",
      initPointPresent: Boolean(initPoint),
      sandboxInitPointPresent: Boolean(preference.sandbox_init_point),
      mercadoPagoResponse: preference
    });
    await pool.query("update solicitacoes set mercado_pago_preference_id=$1,status_pagamento='aguardando_pagamento' where id=$2", [preference.id || "", item.id]);
    return res.json({ init_point: initPoint, preference_id: preference.id || "" });
  } catch (err) {
    console.error("[MERCADO_PAGO] erro ao gerar pagamento", {
      solicitacaoId: item.id,
      protocolo: item.protocolo,
      accessTokenPresent: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN),
      publicKeyPresent: Boolean(process.env.MERCADOPAGO_PUBLIC_KEY),
      message: err.message,
      status: err.status || 500,
      mercadoPagoError: err.details || err.message
    });
    return res.status(err.status || 500).json({
      error: true,
      message: "Nao foi possivel gerar o pagamento agora. Tente novamente.",
      details: err.details || err.message
    });
  }
}));

app.post("/api/payments/mercadopago", asyncHandler(async (req, res) => {
  const item = await loadPriorityPaymentRequest(req);
  const preference = await createMercadoPagoPreference(item);
  await pool.query("update solicitacoes set mercado_pago_preference_id=$1,status_pagamento='aguardando_pagamento' where id=$2", [preference.id || "", item.id]);
  const updated = await pool.query("select * from solicitacoes where id=$1", [item.id]);
  return res.json({ solicitacao: toClient(updated.rows[0]), preference });
}));

app.post("/api/payments/demo-approve", asyncHandler(async (req, res) => {
  if (process.env.MERCADOPAGO_ACCESS_TOKEN) return res.status(403).json({ error: "Aprovacao demonstrativa desativada com Mercado Pago configurado." });
  const result = await pool.query("select * from solicitacoes where id = $1", [req.body.solicitacaoId]);
  const item = toClient(result.rows[0]);
  if (!item) return res.status(404).json({ error: "Solicitacao nao encontrada" });
  if (item.clientId && item.clientId !== String(req.body.clientId || "").trim()) return res.status(403).json({ error: "Acesso negado" });
  await applyPaymentStatus(item.id, "approved", "demo");
  const updated = await pool.query("select * from solicitacoes where id=$1", [item.id]);
  return res.json(toClient(updated.rows[0]));
}));

app.post("/api/webhooks/mercadopago", asyncHandler(async (req, res) => {
  const event = req.body || {};
  const paymentId = event.data?.id || event.id || event.resource;
  if (paymentId && (event.type === "payment" || event.topic === "payment" || String(paymentId).match(/^\d+$/))) {
    const payment = await fetchMercadoPagoPayment(paymentId);
    const result = await pool.query("select * from solicitacoes where id = $1 or mercado_pago_payment_id = $2", [payment.external_reference, String(payment.id)]);
    if (result.rows[0]) await applyPaymentStatus(result.rows[0].id, payment.status, payment.id);
  }
  return res.json({ ok: true });
}));

app.post("/api/admin/login", asyncHandler(async (req, res) => {
  const result = await pool.query("select * from administradores where lower(email)=lower($1)", [String(req.body.email || "")]);
  const admin = result.rows[0];
  if (!admin || !verifyPassword(String(req.body.senha || ""), admin.senha_hash)) return res.status(401).json({ error: "Login invalido" });
  await pool.query("update administradores set ultimo_login=now() where id=$1", [admin.id]);
  await createSession(res, admin.id);
  return res.json({ nome: admin.nome, email: admin.email });
}));

app.post("/api/admin/logout", asyncHandler(async (_req, res) => {
  res.clearCookie("resolveai_session", { path: "/" });
  return res.json({ ok: true });
}));

app.use("/api/admin", asyncHandler(async (req, res, next) => {
  const admin = await getAdmin(req);
  if (!admin) return res.status(401).json({ error: "Nao autenticado" });
  req.admin = admin;
  next();
}));

app.get("/api/admin/me", (req, res) => res.json({ nome: req.admin.nome, email: req.admin.email }));

app.post("/api/admin/password", asyncHandler(async (req, res) => {
  const result = await pool.query("select * from administradores where id=$1", [req.admin.id]);
  const target = result.rows[0];
  if (!verifyPassword(String(req.body.senhaAtual || ""), target.senha_hash)) return res.status(400).json({ error: "Senha atual incorreta" });
  if (String(req.body.novaSenha || "").length < 8) return res.status(400).json({ error: "A nova senha deve ter ao menos 8 caracteres" });
  await pool.query("update administradores set senha_hash=$1 where id=$2", [hashPassword(String(req.body.novaSenha)), req.admin.id]);
  return res.json({ ok: true });
}));

app.get("/api/admin/solicitacoes", asyncHandler(async (_req, res) => {
  const result = await pool.query("select * from solicitacoes order by case when plano='Prioritario' then 0 else 1 end, data_criacao desc");
  return res.json(result.rows.map(toClient));
}));

app.patch("/api/admin/solicitacoes/:id", asyncHandler(async (req, res) => {
  const current = await pool.query("select * from solicitacoes where id=$1", [req.params.id]);
  if (!current.rows[0]) return res.status(404).json({ error: "Solicitacao nao encontrada" });
  const respostaAdmin = typeof req.body.respostaAdmin === "string" ? req.body.respostaAdmin : current.rows[0].resposta_admin;
  const status = typeof req.body.status === "string" ? req.body.status : current.rows[0].status;
  await pool.query(
    "update solicitacoes set resposta_admin=$1,status=$2,data_resposta=case when $2='Respondido' and data_resposta is null then now() else data_resposta end where id=$3",
    [respostaAdmin, status, req.params.id]
  );
  const updated = await pool.query("select * from solicitacoes where id=$1", [req.params.id]);
  return res.json(toClient(updated.rows[0]));
}));

app.use((err, _req, res, _next) => {
  console.error("[API]", err);
  return res.status(err.status || 500).json({ error: true, message: err.message || "Erro interno" });
});

initDb()
  .then(() => app.listen(PORT, () => console.log(`ResolveAi API rodando na porta ${PORT}`)))
  .catch((err) => {
    console.error("Falha ao iniciar API", err);
    process.exit(1);
  });
