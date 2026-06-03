create table if not exists solicitacoes (
  id uuid primary key,
  client_id text not null,
  protocolo text unique not null,
  nome text not null,
  cidade text not null,
  whatsapp text default '',
  email text default '',
  contato text default '',
  categoria text not null,
  problema text not null,
  plano text not null,
  canal_resposta text not null,
  status text not null,
  status_pagamento text not null,
  resposta_admin text default '',
  valor_pago numeric(10,2) default 0,
  mercado_pago_payment_id text default '',
  mercado_pago_preference_id text default '',
  data_criacao timestamptz not null default now(),
  data_resposta timestamptz
);

create table if not exists administradores (
  id uuid primary key,
  nome text not null,
  email text unique not null,
  senha_hash text not null,
  ultimo_login timestamptz,
  data_criacao timestamptz not null default now()
);

create table if not exists sessoes (
  id uuid primary key,
  admin_id uuid not null references administradores(id) on delete cascade,
  data_criacao timestamptz not null default now()
);
