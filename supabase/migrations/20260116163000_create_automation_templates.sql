-- Create automation_templates table
CREATE TABLE IF NOT EXISTS public.automation_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add default_template_id to automation_definitions
ALTER TABLE public.automation_definitions
ADD COLUMN IF NOT EXISTS default_template_id UUID REFERENCES public.automation_templates(id);

-- Add template_id to automation_schedules (override)
ALTER TABLE public.automation_schedules
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.automation_templates(id);

-- Enable RLS
ALTER TABLE public.automation_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Adm only)
CREATE POLICY "Enable read access for signed in users" ON public.automation_templates
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all access for admins" ON public.automation_templates
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid() AND profiles.is_admin = true
        )
    );
