create table if not exists automation_queue (
  id uuid default gen_random_uuid() primary key,
  schedule_id uuid references automation_schedules(id) on delete set null,
  payload jsonb not null,
  status text not null default 'pending', -- pending, processing, completed, failed
  logs text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Index for fast polling
create index if not exists idx_automation_queue_status on automation_queue(status);
