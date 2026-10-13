import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { normalizeChatMarkdown } from '../src/lib/bi-ai/message-format'

test('stored answer formatting removes empty bullets and wrappers while preserving literal code', () => {
  const answer = '### 📊 Valores conferidos\n\n- **Total aprovado:** R$ 123,45\n\n-\n\n-\n-\n-\n'
  assert.equal(normalizeChatMarkdown(answer), '### 📊 Valores conferidos\n\n- **Total aprovado:** R$ 123,45')
  assert.equal(normalizeChatMarkdown('```markdown\n' + answer.trim() + '\n```'), normalizeChatMarkdown(answer))
  assert.equal(normalizeChatMarkdown(answer.replaceAll('\n', '\\n')), normalizeChatMarkdown(answer))
  assert.equal(normalizeChatMarkdown('```sql\nSELECT 1\n-\n```'), '```sql\nSELECT 1\n-\n```')
})

test('the actual chat component renders headings, values and expandable job records safely', () => {
  // Server tests use react-server; rendering this client component needs a separate normal React runtime.
  const script = `import {createElement} from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
    import {BiAiResponse} from './src/components/bi-ai-response.tsx';
    const answer = '### 📊 Valores conferidos\\n\\n- **Total aprovado:** R$ 123,45\\n\\n-\\n\\n### 📂 Cadastro Jobs\\n\\n- **Cliente:** Empresa teste\\n\\n### 📂 Etapas\\n\\n| Etapa | Valor |\\n| --- | --- |\\n| Aprovação | 123,45 |\\n\\n### 🧾 Fonte e filtros\\n\\n- Job: 12345-FTX\\n<script>alert(1)</script>';
    process.stdout.write(renderToStaticMarkup(createElement(BiAiResponse, {answer})));`
  const output = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '' } })
  assert.equal(output.status, 0, output.stderr)
  assert.match(output.stdout, /<h3[^>]*>📊 Valores conferidos<\/h3>/)
  assert.match(output.stdout, /<strong[^>]*>Total aprovado:<\/strong>/)
  assert.match(output.stdout, /<details[^>]*open=""/)
  assert.match(output.stdout, /<summary[^>]*>📂 Cadastro Jobs<\/summary>/)
  assert.match(output.stdout, /<table/)
  assert.match(output.stdout, /Ver fonte, filtros/)
  assert(!output.stdout.includes('###') && !output.stdout.includes('<script') && !/<li[^>]*>\s*<\/li>/.test(output.stdout))
})
