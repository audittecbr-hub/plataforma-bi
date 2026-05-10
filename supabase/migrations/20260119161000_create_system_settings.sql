create table if not exists system_settings (
    key text primary key,
    value jsonb not null,
    description text,
    updated_at timestamp with time zone default now()
);

-- Enable RLS (or not, since it's admin only basically, but good practice)
alter table system_settings enable row level security;

-- Policies
create policy "Enable read access for authenticated users"
on system_settings for select
to authenticated
using (true);

create policy "Enable read access for service_role"
on system_settings for all
to service_role
using (true);

-- Seed Data (Example - Replacing settings.json content)
-- NOTE: User will need to run this manually as I cannot read the full JSON content easily into a single string without escaping issues in one go.
-- I will provide a separate script or instructions.

grant all on system_settings to postgres;
grant all on system_settings to service_role;
grant select on system_settings to authenticated;
