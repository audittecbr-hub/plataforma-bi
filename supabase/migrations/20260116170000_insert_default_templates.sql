-- Insert default templates
INSERT INTO automation_templates (name, content) VALUES
(
    'Ranking Diário (Padrão)',
    '📊 Acompanhamento Metas Caixa Grupo Studio

Dados consolidados até {data} (D-1).

🎯 Acompanhe o progresso:

https://bi.grupostudio.tec.br/'
),
(
    'Boas Vindas (Orientação)',
    'Olá, {nome}! Tudo bem?

Sou a assistente virtual de Metas do Grupo Studio. 🤖

A partir de agora, enviarei diariamente o relatório de atingimento de metas atualizado para você acompanhar os resultados da sua unidade e do grupo.

Qualquer dúvida, estou à disposição!'
);
