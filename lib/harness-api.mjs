/** @typedef {'auto' | 'chat-completions' | 'responses'} ApiFormatSetting */
/** @typedef {'chat-completions' | 'responses'} ResolvedApiFormat */

export const DEFAULT_SYSTEM_PROMPT =
  'You are a concise, thorough research assistant. Ground answers in attached files, project context, and live web browsing when enabled.';

export const PROVIDER_PRESETS = {
  openai: {
    label: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    apiFormat: 'chat-completions',
    model: 'gpt-4o-mini',
  },
  openrouter: {
    label: 'OpenRouter',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    apiFormat: 'chat-completions',
    model: 'anthropic/claude-3.5-sonnet',
  },
  vercel: {
    label: 'Vercel AI Gateway',
    apiUrl: 'https://ai-gateway.vercel.sh/v1/chat/completions',
    apiFormat: 'chat-completions',
    model: 'openai/gpt-4o-mini',
  },
  ollama: {
    label: 'Ollama (Local)',
    apiUrl: 'http://localhost:11434/v1/chat/completions',
    apiFormat: 'chat-completions',
    model: 'llama3.2',
  },
  meta: {
    label: 'Meta AI Responses',
    apiUrl: 'https://api.meta.ai/v1/responses',
    apiFormat: 'responses',
    model: 'muse-spark-1.3',
  },
  custom: {
    label: 'Custom Endpoint',
    apiUrl: '',
    apiFormat: 'auto',
    model: '',
  },
};

export const MODEL_SUGGESTIONS = [
  'gpt-4o-mini',
  'gpt-4o',
  'anthropic/claude-3.5-sonnet',
  'openai/gpt-4o-mini',
  'llama3.2',
  'muse-spark-1.3',
  'muse-spark-1.2',
];

/**
 * @param {string} apiUrl
 * @param {ApiFormatSetting} apiFormatSetting
 * @returns {ResolvedApiFormat}
 */
export function resolveApiFormat(apiUrl, apiFormatSetting) {
  if (apiFormatSetting === 'chat-completions') return 'chat-completions';
  if (apiFormatSetting === 'responses') return 'responses';
  try {
    const path = new URL(apiUrl).pathname;
    if (/\/responses\/?$/i.test(path) || path.includes('/responses')) return 'responses';
  } catch {
    /* invalid URL falls through */
  }
  return 'chat-completions';
}

/** @param {string} apiUrl */
export function isLocalEndpoint(apiUrl) {
  try {
    const host = new URL(apiUrl).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  } catch {
    return false;
  }
}

/** @param {string} apiUrl @param {string} apiKey */
export function requiresApiKey(apiUrl, apiKey) {
  if (String(apiKey || '').trim()) return false;
  return !isLocalEndpoint(apiUrl);
}

/** @param {string} apiUrl @param {string} apiKey */
export function buildAuthHeaders(apiUrl, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (String(apiKey || '').trim()) {
    headers.Authorization = 'Bearer ' + String(apiKey).trim();
  }
  return headers;
}

/**
 * @param {Array<{role: string, text: string}>} turns — user/assistant (no pending placeholder)
 * @param {string[]} systemParts
 */
export function buildChatMessages(turns, systemParts) {
  /** @type {Array<{role: string, content: string}>} */
  const messages = [];
  if (systemParts.length) {
    messages.push({ role: 'system', content: systemParts.join('\n\n') });
  }
  for (const t of turns) {
    if (!t.text || t.text === '…') continue;
    const role = t.role === 'assistant' ? 'assistant' : t.role === 'system' ? 'system' : 'user';
    messages.push({ role, content: t.text });
  }
  return messages;
}

/**
 * @param {Array<{role: string, text: string}>} turns
 * @param {string[]} systemParts
 */
export function buildResponsesInput(turns, systemParts) {
  /** @type {Array<{role: string, content: Array<{type: string, text: string}>}>} */
  let input = turns
    .filter((m) => m.text && m.text !== '…')
    .map((m) => ({
      role: m.role,
      content: [
        {
          type: m.role === 'user' ? 'input_text' : 'output_text',
          text: m.text,
        },
      ],
    }));
  if (systemParts.length) {
    input = [
      { role: 'system', content: [{ type: 'input_text', text: systemParts.join('\n\n') }] },
      ...input,
    ];
  }
  return input;
}

/**
 * @param {object} opts
 * @param {ResolvedApiFormat} opts.format
 * @param {string} opts.model
 * @param {number} opts.temperature
 * @param {Array<{role: string, content: string}>} [opts.messages]
 * @param {Array<{role: string, content: Array<{type: string, text: string}>}>} [opts.input]
 */
export function buildRequestPayload({ format, model, temperature, messages, input }) {
  if (format === 'responses') {
    return { model, input, stream: false };
  }
  return { model, messages, temperature, stream: false };
}

/** @param {unknown} data */
export function parseAssistantResponse(data) {
  if (!data || typeof data !== 'object') {
    return { text: String(data), usage: null };
  }
  const d = /** @type {Record<string, unknown>} */ (data);
  try {
    if (typeof d.output_text === 'string' && d.output_text) {
      return { text: d.output_text, usage: normalizeUsage(d.usage) };
    }
    if (Array.isArray(d.output)) {
      const parts = [];
      for (const item of d.output) {
        const row = /** @type {Record<string, unknown>} */ (item);
        const c = row.content || row.contents || [];
        if (Array.isArray(c)) {
          for (const p of c) {
            const part = /** @type {Record<string, unknown>} */ (p);
            if (typeof part.text === 'string') parts.push(part.text);
            else if (part.type === 'output_text' && typeof part.text === 'string') parts.push(part.text);
          }
        }
        if (typeof row.text === 'string') parts.push(row.text);
      }
      if (parts.length) return { text: parts.join('\n\n'), usage: normalizeUsage(d.usage) };
    }
    const resp = d.response;
    if (resp && typeof resp === 'object' && typeof /** @type {Record<string, unknown>} */ (resp).output_text === 'string') {
      return {
        text: /** @type {Record<string, unknown>} */ (resp).output_text,
        usage: normalizeUsage(d.usage),
      };
    }
    const choices = d.choices;
    if (Array.isArray(choices) && choices[0]) {
      const msg = /** @type {Record<string, unknown>} */ (choices[0]).message;
      if (msg && typeof msg === 'object') {
        const cc = /** @type {Record<string, unknown>} */ (msg).content;
        const text = typeof cc === 'string' ? cc : JSON.stringify(cc);
        return { text, usage: normalizeUsage(d.usage) };
      }
    }
    if (typeof d.text === 'string') return { text: d.text, usage: normalizeUsage(d.usage) };
    return { text: JSON.stringify(data, null, 2), usage: normalizeUsage(d.usage) };
  } catch {
    return { text: JSON.stringify(data, null, 2), usage: null };
  }
}

/** @param {unknown} usage */
function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const u = /** @type {Record<string, number>} */ (usage);
  return {
    prompt_tokens: u.prompt_tokens ?? u.input_tokens,
    completion_tokens: u.completion_tokens ?? u.output_tokens,
    total_tokens: u.total_tokens,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.model
 * @param {number} [opts.latencyMs]
 * @param {ReturnType<typeof normalizeUsage>} [opts.usage]
 * @param {string} [opts.providerLabel]
 */
export function formatAssistantMeta({ model, latencyMs, usage, providerLabel }) {
  const parts = [];
  if (providerLabel) parts.push(providerLabel);
  parts.push(model);
  if (latencyMs != null) parts.push(`${Math.round(latencyMs)}ms`);
  if (usage) {
    const tok = [];
    if (usage.prompt_tokens != null) tok.push(`in ${usage.prompt_tokens}`);
    if (usage.completion_tokens != null) tok.push(`out ${usage.completion_tokens}`);
    else if (usage.total_tokens != null) tok.push(`${usage.total_tokens} tok`);
    if (tok.length) parts.push(tok.join(' · '));
  }
  return parts.join(' • ');
}

/** @param {string} apiUrl */
export function inferProviderLabel(apiUrl) {
  try {
    const host = new URL(apiUrl).hostname;
    if (host.includes('openai.com')) return 'OpenAI';
    if (host.includes('openrouter.ai')) return 'OpenRouter';
    if (host.includes('ai-gateway.vercel.sh')) return 'Vercel Gateway';
    if (host === 'localhost' || host === '127.0.0.1') return 'Local';
    if (host.includes('meta.ai')) return 'Meta AI';
    return host;
  } catch {
    return 'Custom';
  }
}

/** @param {string} text @param {number} [chunkSize] */
export function chunkText(text, chunkSize = 800) {
  const s = String(text || '');
  if (!s) return [];
  const chunks = [];
  for (let i = 0; i < s.length; i += chunkSize) chunks.push(s.slice(i, i + chunkSize));
  return chunks;
}