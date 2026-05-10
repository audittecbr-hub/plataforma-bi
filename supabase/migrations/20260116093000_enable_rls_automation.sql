-- Enable RLS for Automation Tables
-- This protects the configuration from anonymous access

-- 1. Automation Definitions
ALTER TABLE automation_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow Service Role (Full Access)" 
ON automation_definitions
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 2. Automation Schedules
ALTER TABLE automation_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow Service Role (Full Access)" 
ON automation_schedules
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 3. Automation Contacts
ALTER TABLE automation_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow Service Role (Full Access)" 
ON automation_contacts
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 4. Automation Recipients
ALTER TABLE automation_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow Service Role (Full Access)" 
ON automation_recipients
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 5. Automation Logs (if exists/future proof)
CREATE TABLE IF NOT EXISTS automation_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    contact_id UUID REFERENCES automation_contacts(id),
    event_type TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow Service Role (Full Access)" 
ON automation_logs
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Optional: Allow Authenticated Users (Admins) to Read/Write?
-- If users log in via Auth and have 'is_admin' claim/table.
-- For now, the Portal uses Server Actions with Service Key (admin.ts), so we don't need policies for 'authenticated' role yet.
-- This keeps it VERY locked down. only Service Key (Backend + Portal Actions) can touch it.
