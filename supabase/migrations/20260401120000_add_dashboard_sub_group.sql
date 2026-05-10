-- Adiciona coluna sub_group para identificar dashboards de "Metas Líderes"
-- e definir sua sub-categoria (ex: 'Franchising', 'Tecnologia', 'Performance')
-- Quando preenchido, o dashboard pertence exclusivamente à aba "Metas Líderes"
-- e não aparece em outros departamentos (Comercial, Operacional, etc.)

ALTER TABLE public.dashboards
ADD COLUMN IF NOT EXISTS sub_group TEXT DEFAULT NULL;
