# Chat IA dos dashboards Power BI

## Fluxo e dados

`DashboardSelector.currentDashboard.id` → `dashboards.id` →
`dashboards.dataset_id` + `workspace_id` + `report_id` → `ai_manifest` →
seleção determinística de medidas, dimensões e exemplos → plano JSON →
guarda DAX → REST Execute Queries → explicação conferida.

O navegador envia somente `dashboardId`, `conversationId` e `message`. O
servidor consulta o perfil e usa exatamente a regra da página de dashboards em
`src/lib/permissions.ts`. A conversa pertence a um usuário e a um dashboard.
Trocar de relatório remonta o Chat e cancela a requisição em andamento. O Chat
não lê slicers do iframe Publish to web: filtros devem estar na pergunta.

O Power BI é a fonte dos números. O Supabase guarda manifesto, mensagens e
metadados de consultas; não replica fatos nem persiste linhas de resultados.

Quando a pergunta deixa indicador ou período em aberto, o Chat pede um
esclarecimento antes de executar DAX. A resposta pode ser escolhida em opções
curtas ou escrita livremente. O servidor combina o esclarecimento com a pergunta
original e revalida o acesso ao mesmo dashboard; um token cifrado de 30 minutos
liga essa continuação ao usuário e à conversa. O planejador também pode pedir
um esclarecimento para ambiguidades de negócio que o catálogo não resolve. Há
limite de duas rodadas; sem dados suficientes, o Chat informa a limitação em vez
de escolher silenciosamente uma métrica ou um recorte.

### Escopo semântico e consultas certificadas

O manifesto pode declarar `certifiedQueries`: receitas de consulta tipadas para
perguntas cujo escopo de negócio precisa ser exato. Cada receita informa termos
de ativação, medida oficial ou soma de coluna numérica revisada, filtro de
dimensão, campo de ano e, quando necessário, um cálculo derivado. O servidor
confere todos esses objetos no manifesto e compila DAX agregado; não aceita
DAX livre vindo do navegador. A resposta dessas receitas é formatada a partir
das células retornadas pelo Power BI, sem nova geração numérica pela IA.

No BI Operações, há receitas para resultado mensal, composição OP/Marca/Repasse/
Outros, Fundo de Marketing e provisão por operação. A receita de Fundo separa a provisão gerencial
descontada das operações do resultado próprio do departamento, calculado como
receita própria mais despesa própria já negativa. O resultado geral das seis
operações não é usado como substituto. A consulta por operação exclui a linha
em branco da dimensão para preservar as seis operações. Se um recorte nomeado ainda não tiver
consulta validada, o Chat informa a limitação.

Perguntas comuns podem ter também `queryExamples` com DAX revisado. Quando a
pergunta corresponde exatamente a um exemplo, o servidor valida e executa esse
DAX. Nas demais perguntas, o planejador recebe nomes do catálogo completo,
detalhes dos objetos relevantes e regras de negócio; só pode usar medidas e
dimensões autorizadas e a consulta passa pela guarda DAX antes de executar.
O manifesto preserva `whenToUse` e `whenNotToUse` das medidas para distinguir
um componente de uma métrica do próprio assunto perguntado.

O Portal usa a identidade de serviço já autorizada no workspace. Para cada
dashboard, busca a [definição pública do modelo semântico](https://learn.microsoft.com/en-us/rest/api/fabric/semanticmodel/items/get-semantic-model-definition)
e do [relatório](https://learn.microsoft.com/en-us/rest/api/fabric/report/items/get-report-definition)
diretamente no Fabric, com cache de 10 minutos por processo. A integração foi
verificada com Operações: 14 tabelas, 37 medidas, 89 colunas, seis relações,
sete páginas e 75 visuais no modelo publicado. O servidor extrai nomes,
relações, fórmulas DAX curtas e referências dos visuais; não envia partições,
M queries, strings de conexão ou recursos do relatório ao modelo de IA. Os
objetos autorizados continuam definidos pelo manifesto para preservar as
restrições de acesso. Se o modelo publicado perder uma medida ou coluna usada
no contexto, o Chat recusa a resposta. No registro, o Portal grava no
manifesto o hash da definição publicada; se o modelo mudar depois, o Chat
interrompe respostas até uma nova verificação e registro. A leitura da definição
exige que a identidade de serviço tenha permissão de leitura **e escrita** no
item segundo a API do Fabric; nenhuma rota do Chat altera o modelo.

Os números vêm do Power BI REST Execute Queries sobre esse mesmo modelo
publicado. O [Fabric IQ MCP](https://learn.microsoft.com/en-us/fabric/iq/connectors/fabric-iq-mcp)
também oferece ferramentas de esquema, busca de valores e DAX, mas exige OAuth
delegado de cada usuário e não aceita service principal; ele não pode usar a
sessão Microsoft pessoal do administrador para todos os usuários do Portal.
Esta arquitetura fornece leitura direta do projeto no workspace com a conta de
serviço, sem depender de login Microsoft por usuário.

## Instalação

1. Aplique `supabase/migrations/20260928_bi_ai_context.sql` no SQL Editor do
   projeto Supabase do portal. A migration é aditiva e repetível. Ela amplia o
   vínculo já existente `dashboards.dataset_id` com `workspace_id`, `report_id`,
   `ai_enabled`, `ai_manifest`, `ai_manifest_version`, `ai_manifest_hash` e
   `ai_manifest_synced_at`.
   Aplique também `supabase/migrations/20260928_ia_admin_settings.sql` para
   habilitar a aba Administração → IA.
2. A migration reaproveita a estrutura local `gs_chat_log` e cria, quando
   necessário, `gs_bi_conversations`, `gs_bi_query_logs` e
   `gs_bi_rate_buckets`. O RPC `gs_bi_take_rate_limit` limita atomicamente a
   10 perguntas por usuário por minuto. As tabelas privadas usam RLS sem
   políticas para o browser; o servidor usa `service_role`.
3. Configure `PORTAL_AI_REGISTRATION_SECRET` no servidor e nos scripts PBIP.
   Não use variável `NEXT_PUBLIC_*` para esse secret nem para chaves de IA.
4. A tabela já existente `gs_config_ia` seleciona provedor, modelo, ativação,
   nível de raciocínio e limites de tokens. Configure a chave correspondente no
   ambiente do portal ou pela aba Administração → IA. Para salvar uma chave na
   interface, configure `BI_AI_ENCRYPTION_KEY` no servidor com 32 bytes
   aleatórios codificados em Base64 (por exemplo, gere com
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`).
   A chave mestra não fica no Supabase nem no browser. As chaves de provedores
   são cifradas com AES-256-GCM em `gs_ia_provider_config`; a interface mostra
   apenas o estado de configuração e permite troca/remoção. Guarde a chave
   mestra para não perder acesso às chaves cifradas após um redeploy.
   A configuração atual do banco
   tem precedência sobre `BI_AI_PROVIDER`/`BI_AI_MODEL` e sobre as variáveis
   legadas `LLM_PROVEDOR`/`LLM_MODELO`. Para usar endpoint HTTP compatível com
   Chat Completions, configure `BI_AI_BASE_URL` (HTTPS), `BI_AI_API_KEY`,
   `BI_AI_MODEL` e escolha `Endpoint compatível` na aba IA. A URL do endpoint
   compatível deve continuar em ambiente do servidor.
   As integrações locais anteriores com OpenCode Go, DeepSeek, Anthropic e
   OpenAI continuam disponíveis em `src/lib/llm.ts`.

Na aba IA, o administrador pode ativar/desativar o Chat globalmente, cada
provedor, modelos descobertos pela API e dashboards com manifesto válido;
selecionar o modelo exato, testar a conexão, ajustar nível de raciocínio onde
o adaptador suporta e limites de tokens de planejamento e resposta. Para
OpenCode Go, o nível fica no padrão do modelo; DeepSeek aceita
`none/low/medium/high/max`; OpenAI e Anthropic expõem níveis apenas para
famílias de modelos suportadas. O teste de conexão faz uma chamada pequena ao
provedor e pode consumir tokens da conta configurada.
No OpenCode Go, o Portal escolhe Chat Completions, Messages ou Responses de
acordo com a família do modelo, conforme a [tabela de endpoints do Go](https://dev.opencode.ai/docs/go/#endpoints).
O catálogo do provedor pode mudar; execute o teste de conexão antes de ativar
um novo modelo.
O modelo padrão para novas instalações é `longcat-2.5-preview-free`. A lista ao vivo
mostra todos os modelos retornados pelo OpenCode Go, seus protocolos e um selo
para os modelos `-free`. Os dois gratuitos presentes na conta em 28/09/2026,
`space-bunny-free` e `longcat-2.5-preview-free`, responderam a testes pequenos
no endpoint Chat Completions. A disponibilidade gratuita é temporária segundo
a [documentação do Go](https://dev.opencode.ai/docs/go/).
Em um smoke test com o manifesto de Operações e consultas reais ao Power BI,
`longcat-2.5-preview-free` respondeu a uma pergunta de total e a uma pergunta
por operação, com todos os números conferidos. `space-bunny-free` passou no
total, mas falhou ao gerar JSON válido para a pergunta por operação; por isso
o padrão de teste passou a ser LongCat.
Na verificação de 28/09/2026, a chave antiga da cópia de configuração local
autenticou nos endpoints Messages e Responses do OpenCode Go, mas ambos
retornaram `GoUsageLimitError` (HTTP 429). A resposta completa desses dois
formatos permanece sem teste real nesta conta até a renovação da cota. O
DeepSeek direto e os demais provedores não dependem do OpenCode Go.
O [OpenCode Go](https://dev.opencode.ai/docs/go/) descreve seu serviço como
voltado principalmente a agentes de código; confirme com o operador se ele é
adequado para perguntas de BI antes de escolhê-lo como provedor global.

O estado inicial de `gs_config_ia.enabled` após a migration é `false`: o
administrador ativa o Chat quando as chaves e manifestos estiverem prontos.
5. No tenant Power BI, habilite **Dataset Execute Queries REST API** e o uso de
   APIs por service principals. A conta de serviço precisa acessar cada
   workspace e ter Read/Build no modelo. O Chat usa
   `POWERBI_TENANT`, `POWERBI_CLIENT_ID` e `POWERBI_CLIENT_SECRET` existentes;
   `POWERBI_WORKSPACE_ID` continua apenas para refresh legado.

O endpoint JSON Execute Queries suporta DAX e uma consulta por chamada.
Service principal pode ser incompatível com modelos que usam RLS ou SSO;
consulte a [documentação da Microsoft](https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/execute-queries-in-group).

## Contrato do manifesto

Formatos 1.x e 2.x. `identity` e `source` podem repetir IDs, desde que sejam iguais.
`reportId` é opcional para projetos apenas de modelo semântico. Os nomes DAX
de tabelas, colunas e medidas precisam ser exatos. O parser aceita listas ou
objetos indexados por nome em `model.tables`/`model.measures`.

```json
{
  "schemaVersion": "1.0",
  "identity": {
    "dashboardId": "UUID-do-dashboard-no-portal",
    "workspaceId": "UUID-do-workspace",
    "reportId": "UUID-do-relatorio-ou-omitir",
    "semanticModelId": "UUID-do-modelo"
  },
  "source": { "workspaceId": "UUID-do-workspace" },
  "capabilities": {},
  "business": {
    "summary": "Receita por unidade",
    "synonyms": { "receita": ["faturamento"], "unidade": ["filial"] }
  },
  "model": {
    "tables": [{
      "name": "Dim Unidade", "queryable": true,
      "columns": [{ "name": "Unidade", "synonyms": ["Filial"] }]
    }],
    "measures": [{
      "name": "Receita Líquida", "preferredMeasure": true,
      "description": "Medida oficial de receita", "format": "R$ #,##0.00"
    }]
  },
  "report": { "pages": [] },
  "queryPolicy": { "maxRows": 100, "maxQueries": 5 },
  "recommendedQuestions": ["Qual a receita por unidade?"],
  "queryExamples": [],
  "ambiguities": []
}
```

O exemplo usa marcadores em vez de UUIDs válidos: substitua todos antes de
registrar. Marque tabelas técnicas com `queryable: false`, medidas HTML/CSS com
`presentationOnly: true` e identificadores sensíveis com `restricted: true`.
O contrato 2.x também aceita `preferred`, `queryable`, `semanticRole`,
`queryPolicy.defaultMaxRows`, `report.pages[].mainVisuals` e ambiguidades
estruturadas. `source.registrationReady: false` bloqueia registro e uso do Chat
enquanto o modelo publicado divergir do PBIP local.
Campos restritos ficam bloqueados; um administrador só pode consultá-los se o
manifesto definir explicitamente `queryPolicy.allowRestrictedForAdmins: true`.
Agregação direta de coluna exige
`queryPolicy.allowDirectColumnAggregation: true` **e** `aggregatable: true` na
coluna. Medidas oficiais têm prioridade.

## Registro de um novo PBIP

O script do PBIP gera JSON até 1 MB e chama `POST /api/bi-ai/register` com o
header `x-portal-ai-registration-secret`. O corpo pode ser o manifesto direto
ou `{ "dashboardId": "...", "manifest": { ... } }`. O dashboard precisa já
existir com `dataset_id` correspondente, ou o script deve fornecer seu
`dashboardId` explícito. A associação usa somente IDs exatos; múltiplos
dashboards para o mesmo modelo exigem `dashboardId`. Nenhum nome similar é
associado automaticamente. Reenvio do mesmo manifesto retorna `unchanged: true`.
O servidor valida versão/UUIDs, grava SHA-256 e data de sincronização. A primeira
instalação habilita `ai_enabled`; atualizações respeitam uma desativação feita
pelo operador.

## APIs, limites e diagnóstico

| Rota | Uso |
| --- | --- |
| `POST /api/bi-ai/register` | Registro por secret de integração, sem sessão de usuário |
| `GET /api/bi-ai/context?dashboardId=...` | Estado da IA e sugestões do manifesto, após revalidar acesso |
| `POST /api/bi-ai/chat` | `{dashboardId, conversationId?, message}`; revalida acesso e executa o plano |
| `GET /api/bi-ai/history?dashboardId=...` | Conversas do usuário neste dashboard; `conversationId` opcional para mensagens |
| `GET /api/bi-ai/diagnostic?dashboardId=...` | Apenas admin; lista modelos e executa `EVALUATE ROW("ok", 1)` |

O Chat limita mensagem a 500 caracteres, contexto a 18 mil caracteres,
resultado comum a 100 linhas (até 500 se o manifesto permitir detalhamento),
três consultas normais ou cinco explicativas e resposta a 3.500 caracteres.
DAX só pode usar objetos selecionados e autorizados do manifesto; detalhamento
exige `TOPN` sobre `SUMMARIZECOLUMNS`. Números escritos pela IA são conferidos
contra as linhas do Power BI; se essa conferência falhar, o servidor apresenta
um resumo literal e curto do resultado.

O diagnóstico retorna códigos para credenciais Entra ausentes, token, acesso ao
workspace, modelo não visível, Read/Build, Execute Queries desabilitado,
incompatibilidade do modelo ou RLS/SSO, DAX e timeout. O detalhe da Microsoft
fica apenas no log do servidor. HTTP 403 genérico da Microsoft pode exigir
conferência manual das permissões Read/Build e da configuração do tenant.

**Publish to web é público no lado Power BI. O login do Supabase protege o
Portal e o Chat, mas não transforma a URL Publish to web em conteúdo privado.**

Antes de implantar, rode `npm test`, `npx tsc --noEmit`, `npm run lint` e
`npm run build`. Para testar o caminho completo, registre um manifesto de um
dashboard autorizado e faça uma pergunta que use uma medida oficial conhecida.
