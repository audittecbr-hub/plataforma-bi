-- Create table for storing automation report snapshots
create table if not exists automation_reports (
  id uuid default gen_random_uuid() primary key,
  type text not null, -- 'daily', 'weekly'
  date_ref date not null,
  data jsonb not null default '{}'::jsonb, -- The payload (new, cancelled, upsell)
  created_at timestamptz default now()
);

-- Enable RLS
alter table automation_reports enable row level security;

-- Policy: Allow Service Role (Backend) to INSERT
create policy "Service Role can insert reports"
  on automation_reports
  for insert
  with check (true); 

-- Policy: Allow Public (or Authenticated) to READ reports 
-- (Assuming we want these links to be accessible without login for now via the unique UUID, 
--  similar to how Google Docs 'Anyone with the link' works. Use with caution.)
create policy "Anyone can read reports"
  on automation_reports
  for select
  using (true);
