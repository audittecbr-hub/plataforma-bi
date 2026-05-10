-- Adiciona automation_definitions para os relatórios de Unidades (Diário e Semanal)

INSERT INTO public.automation_definitions (name, key, description)
SELECT
    'Relatório de Unidades Diário',
    'unidades_diarias',
    'Envia o relatório de novas unidades e mortalidade referente ao dia anterior (D-1).'
WHERE NOT EXISTS (
    SELECT 1 FROM public.automation_definitions WHERE key = 'unidades_diarias'
);

INSERT INTO public.automation_definitions (name, key, description)
SELECT
    'Relatório de Unidades Semanal',
    'unidades_semanais',
    'Envia o relatório de novas unidades e mortalidade consolidado da semana anterior.'
WHERE NOT EXISTS (
    SELECT 1 FROM public.automation_definitions WHERE key = 'unidades_semanais'
);

-- Templates padrão para os relatórios de Unidades

INSERT INTO public.automation_templates (name, content)
SELECT
    'Relatório Unidades Diário (Padrão)',
    '{saudacao}, {nome}!

📋 Segue o *Relatório de Unidades* referente a *{data}* (D-1).

Acompanhe as novas unidades ativadas e a mortalidade do período.

Abraço e bom trabalho!'
WHERE NOT EXISTS (
    SELECT 1 FROM public.automation_templates WHERE name = 'Relatório Unidades Diário (Padrão)'
);

INSERT INTO public.automation_templates (name, content)
SELECT
    'Relatório Unidades Semanal (Padrão)',
    '{saudacao}, {nome}!

📋 Segue o *Relatório de Unidades Semanal* referente ao período de *{data_inicio}* a *{data}*.

Acompanhe as novas unidades ativadas e a mortalidade do período.

Abraço e bom trabalho!'
WHERE NOT EXISTS (
    SELECT 1 FROM public.automation_templates WHERE name = 'Relatório Unidades Semanal (Padrão)'
);
