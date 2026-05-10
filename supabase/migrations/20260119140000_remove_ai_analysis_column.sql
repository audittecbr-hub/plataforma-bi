-- Remove a coluna use_ai_analysis da tabela automation_schedules se ela existir
ALTER TABLE "public"."automation_schedules" DROP COLUMN IF EXISTS "use_ai_analysis";
