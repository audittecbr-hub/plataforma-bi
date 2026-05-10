-- Create mirror tables for Nexus DataLake entities
-- These tables store a local copy of the remote data, updated via Webhooks.

-- 1. Unidades (Dimension)
create table if not exists nexus_unidades (
    id bigint primary key, -- 'codigo' from Nexus
    nome text,
    cidade text,
    uf text,
    raw_data jsonb not null default '{}'::jsonb,
    updated_at timestamptz default now()
);

-- 2. Participantes (Dimension - Consultores, Gerentes)
create table if not exists nexus_participantes (
    id bigint primary key,
    nome text,
    email text,
    ativo boolean,
    raw_data jsonb not null default '{}'::jsonb,
    updated_at timestamptz default now()
);

-- 3. Modelos (Fact - Contratos/Vendas)
create table if not exists nexus_modelos (
    id bigint primary key, -- 'id' from Nexus
    unidade_id bigint references nexus_unidades(id),
    consultor_id bigint, -- references nexus_participantes(id) (Optional, FK might break if sync is out of order)
    data_contrato date,
    valor numeric,
    status text, -- 'Ativo', 'Cancelado'
    raw_data jsonb not null default '{}'::jsonb,
    updated_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_nexus_modelos_date on nexus_modelos(data_contrato);
create index if not exists idx_nexus_modelos_unidade on nexus_modelos(unidade_id);

-- RLS
alter table nexus_unidades enable row level security;
alter table nexus_participantes enable row level security;
alter table nexus_modelos enable row level security;

-- Policies (Service Role Access)
create policy "Service Role Full Access Unidades" on nexus_unidades for all using (true) with check (true);
create policy "Service Role Full Access Participantes" on nexus_participantes for all using (true) with check (true);
create policy "Service Role Full Access Modelos" on nexus_modelos for all using (true) with check (true);

-- Public Read (Optional, for Reports)
create policy "Public Read Unidades" on nexus_unidades for select using (true);
create policy "Public Read Participantes" on nexus_participantes for select using (true);
create policy "Public Read Modelos" on nexus_modelos for select using (true);
