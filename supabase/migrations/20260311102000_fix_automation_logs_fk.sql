-- Remove current constraint on automation_logs
ALTER TABLE automation_logs
DROP CONSTRAINT IF EXISTS automation_logs_contact_id_fkey;

-- Add updated constraint with ON DELETE CASCADE
ALTER TABLE automation_logs
ADD CONSTRAINT automation_logs_contact_id_fkey
FOREIGN KEY (contact_id)
REFERENCES automation_contacts(id)
ON DELETE CASCADE;
