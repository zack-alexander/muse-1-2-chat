import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  resolveApiFormat,
  isLocalEndpoint,
  requiresApiKey,
  buildAuthHeaders,
  buildChatMessages,
  buildResponsesInput,
  buildRequestPayload,
  parseAssistantResponse,
  formatAssistantMeta,
  inferProviderLabel,
  chunkText,
} from '../lib/harness-api.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('resolveApiFormat', () => {
  it('auto-detects responses from URL', () => {
    assert.equal(resolveApiFormat('https://api.meta.ai/v1/responses', 'auto'), 'responses');
  });
  it('auto-detects chat-completions from OpenAI URL', () => {
    assert.equal(resolveApiFormat('https://api.openai.com/v1/chat/completions', 'auto'), 'chat-completions');
  });
  it('respects explicit override', () => {
    assert.equal(
      resolveApiFormat('https://api.openai.com/v1/chat/completions', 'responses'),
      'responses',
    );
  });
});

describe('localhost optional auth', () => {
  it('isLocalEndpoint', () => {
    assert.equal(isLocalEndpoint('http://localhost:11434/v1/chat/completions'), true);
    assert.equal(isLocalEndpoint('http://127.0.0.1:8080/v1/chat/completions'), true);
    assert.equal(isLocalEndpoint('https://api.openai.com/v1/chat/completions'), false);
  });
  it('requiresApiKey', () => {
    assert.equal(requiresApiKey('http://localhost:11434/v1/chat/completions', ''), false);
    assert.equal(requiresApiKey('https://api.openai.com/v1/chat/completions', ''), true);
    assert.equal(requiresApiKey('https://api.openai.com/v1/chat/completions', 'sk-x'), false);
  });
  it('buildAuthHeaders omits Authorization when key empty', () => {
    const h = buildAuthHeaders('http://localhost:11434/v1/chat/completions', '');
    assert.equal(h.Authorization, undefined);
    assert.equal(h['Content-Type'], 'application/json');
  });
  it('buildAuthHeaders includes Bearer when key set', () => {
    const h = buildAuthHeaders('https://api.openai.com/v1/chat/completions', 'secret');
    assert.equal(h.Authorization, 'Bearer secret');
  });
});

describe('buildRequestPayload', () => {
  const messages = [{ role: 'user', content: 'hi' }];
  const input = [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }];

  it('chat-completions shape', () => {
    const body = buildRequestPayload({
      format: 'chat-completions',
      model: 'gpt-4o-mini',
      temperature: 0.4,
      messages,
    });
    assert.deepEqual(body, {
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.4,
      stream: false,
    });
  });

  it('responses shape', () => {
    const body = buildRequestPayload({
      format: 'responses',
      model: 'muse-spark-1.3',
      temperature: 0.4,
      input,
    });
    assert.deepEqual(body, { model: 'muse-spark-1.3', input, stream: false });
    assert.equal(body.temperature, undefined);
  });
});

describe('buildChatMessages / buildResponsesInput', () => {
  const turns = [
    { role: 'user', text: 'hello' },
    { role: 'assistant', text: 'hi there' },
  ];
  const sys = ['You are helpful.'];

  it('chat messages with system', () => {
    const m = buildChatMessages(turns, sys);
    assert.equal(m[0].role, 'system');
    assert.equal(m[1].content, 'hello');
  });

  it('responses input types', () => {
    const input = buildResponsesInput(turns, sys);
    assert.equal(input[0].role, 'system');
    assert.equal(input[1].content[0].type, 'input_text');
    assert.equal(input[2].content[0].type, 'output_text');
  });
});

describe('parseAssistantResponse', () => {
  it('chat completions', () => {
    const { text, usage } = parseAssistantResponse({
      choices: [{ message: { content: 'Answer' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    assert.equal(text, 'Answer');
    assert.equal(usage.prompt_tokens, 10);
  });

  it('responses output_text', () => {
    const { text } = parseAssistantResponse({ output_text: 'Done', usage: { total_tokens: 3 } });
    assert.equal(text, 'Done');
  });

  it('responses output blocks', () => {
    const { text } = parseAssistantResponse({
      output: [{ content: [{ type: 'output_text', text: 'Block A' }] }],
    });
    assert.equal(text, 'Block A');
  });
});

describe('formatAssistantMeta', () => {
  it('includes latency and tokens', () => {
    const meta = formatAssistantMeta({
      model: 'gpt-4o-mini',
      latencyMs: 842,
      usage: { prompt_tokens: 100, completion_tokens: 20 },
      providerLabel: 'OpenAI',
    });
    assert.match(meta, /OpenAI/);
    assert.match(meta, /842ms/);
    assert.match(meta, /in 100/);
  });
});

describe('inferProviderLabel', () => {
  it('labels known hosts', () => {
    assert.equal(inferProviderLabel('https://openrouter.ai/api/v1/chat/completions'), 'OpenRouter');
    assert.equal(inferProviderLabel('http://localhost:11434/v1/chat/completions'), 'Local');
  });
});

describe('chunkText', () => {
  it('splits long text', () => {
    const c = chunkText('a'.repeat(2000), 800);
    assert.equal(c.length, 3);
    assert.equal(c[0].length, 800);
  });
});

describe('index.html', () => {
  it('inline module script passes node --check', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const match = html.match(/<script type="module">\n([\s\S]*?)\n<\/script>/);
    assert.ok(match, 'expected <script type="module"> block');
    const tmp = join(root, '.tmp-index-syntax-check.mjs');
    writeFileSync(tmp, match[1]);
    const r = spawnSync('node', ['--check', tmp], { cwd: root, encoding: 'utf8' });
    unlinkSync(tmp);
    assert.equal(r.status, 0, r.stderr || r.stdout);
  });
});