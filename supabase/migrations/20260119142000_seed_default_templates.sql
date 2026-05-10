-- Inserir templates padrão se não existirem (Safe Insert)

-- Boas Vindas
INSERT INTO "public"."automation_templates" ("name", "content")
SELECT 'Boas Vindas (Orientação)', '👋 Olá, {nome}! Seja muito bem-vindo(a) ao Grupo Studio.

Eu sou o *Assistente Virtual de BI* e, a partir de hoje, você receberá diariamente por aqui os relatórios atualizados com as metas e rankings do seu departamento.

📊 *O que você vai receber?*
- Atualizações de performance
- Rankings do setor
- Resumo de metas

Qualquer dúvida sobre os números, consulte seu gestor.

Bom trabalho! 🚀'
WHERE NOT EXISTS (
    SELECT 1 FROM "public"."automation_templates" WHERE "name" = 'Boas Vindas (Orientação)'
);

-- Ranking Diário (Padrão)
INSERT INTO "public"."automation_templates" ("name", "content")
SELECT 'Ranking Diário (Padrão)', '{saudacao}, {nome}!

📅 Segue o relatório consolidado de *{data}* (D-1).

Confira os destaques do dia e o desempenho do setor no painel completo:
👉 https://bi.grupostudio.tec.br/

Abraço e bom trabalho!'
WHERE NOT EXISTS (
    SELECT 1 FROM "public"."automation_templates" WHERE "name" = 'Ranking Diário (Padrão)'
);

-- Relatório Unidades (Padrão)
INSERT INTO "public"."automation_templates" ("name", "content")
SELECT 'Relatório Unidades (Padrão)', '📊 {titulo}

Olá, {nome}! Segue resumo atualizado.'
WHERE NOT EXISTS (
    SELECT 1 FROM "public"."automation_templates" WHERE "name" = 'Relatório Unidades (Padrão)'
);
