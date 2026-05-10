-- Fix Realtime and Permissions for automation_queue

-- 1. Enable RLS on the table (if not already)
alter table automation_queue enable row level security;

-- 2. Add Policies
-- Allow "authenticated" users (logged in via Portal) to View queues
create policy "Enable read access for authenticated users"
on automation_queue for select
to authenticated
using (true);

-- Allow "service_role" (Admin Client / Backend Scheduler) full access
create policy "Enable full access for service_role"
on automation_queue for all
to service_role
using (true);

-- 3. Enable Realtime Replication for this table
-- This is CRITICAL for the useRealtimeQueue hook to receive events
alter publication supabase_realtime add table automation_queue;
