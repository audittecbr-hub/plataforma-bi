-- Add use_ai_analysis column to automation_schedules table
-- This column allows users to toggle AI analysis for specific schedules

ALTER TABLE automation_schedules
ADD COLUMN IF NOT EXISTS use_ai_analysis BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN automation_schedules.use_ai_analysis IS 'Indicates if the schedule should include AI-generated analysis';
