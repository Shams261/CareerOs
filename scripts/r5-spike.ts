/**
 * R5, the AI spike for the Rumi plan (`docs/product/rumi-plan.md`). It runs a few small calls
 * against the real pinned endpoint (ADR-022), so ADR-024 is written from facts:
 *
 *   A. tools with a free-text reply (two calls: the tool call, then the answer);
 *   B. tools together with a strict JSON response format;
 *   C. web search through the `web` plugin (Exa, Parallel), still pinned with ZDR.
 *
 * Every message is generic and fictional; nothing from Silsila's database is read or sent.
 * The key comes only from the environment and is never printed. Run from your own terminal:
 *
 *   read -rs "OPENROUTER_API_KEY?OpenRouter key: " && export OPENROUTER_API_KEY
 *   pnpm exec tsx scripts/r5-spike.ts
 *   unset OPENROUTER_API_KEY
 *
 * These calls go straight to OpenRouter, outside Silsila's ledger; together they cost about
 * US$0.02, within the key's own limit.
 */
import { ENDPOINT, MODEL, PROVIDER_NAME } from '../src/features/ai/domain';

const key = process.env.OPENROUTER_API_KEY;
if (!key || !key.startsWith('sk-or-')) {
  console.error('Set OPENROUTER_API_KEY first (see the comment at the top).');
  process.exit(1);
}
// A loopback override only, for a dry run against the local fake (`pnpm openrouter:fake`).
const override = process.env.OPENROUTER_API_URL ?? '';
const BASE = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(override)
  ? override.replace(/\/$/, '')
  : 'https://openrouter.ai/api/v1';
const provider = {
  order: [ENDPOINT],
  only: [ENDPOINT],
  allow_fallbacks: false,
  zdr: true,
  data_collection: 'deny',
  require_parameters: true,
};
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_activity',
      description:
        'Minutes of recorded study per subject for each of the last N days.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['days'],
        properties: { days: { type: 'integer', minimum: 1, maximum: 28 } },
      },
    },
  },
];
type Row = { test: string; result: string; cost: number };
const rows: Row[] = [];

async function call(test: string, body: Record<string, unknown>) {
  const started = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-Title': 'Silsila R5 spike',
    },
    body: JSON.stringify({
      model: MODEL,
      provider,
      usage: { include: true },
      max_tokens: 600,
      ...body,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const ms = Date.now() - started;
  const json = (await res.json().catch(() => ({}))) as {
    provider?: string;
    error?: { message?: string; code?: number };
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      cost?: number;
    };
    choices?: {
      finish_reason?: string;
      message?: {
        content?: string | null;
        tool_calls?: {
          id: string;
          function: { name: string; arguments: string };
        }[];
        annotations?: { type: string; url_citation?: { url?: string } }[];
      };
    }[];
  };
  const cost = json.usage?.cost ?? 0;
  if (!res.ok || json.error) {
    const result = `HTTP ${res.status}: ${(json.error?.message ?? 'no body').slice(0, 160)}`;
    rows.push({ test, result, cost });
    console.log(`\n[${test}] ${result} (${ms} ms)`);
    return null;
  }
  const choice = json.choices?.[0];
  const hosts = [
    ...new Set(
      (choice?.message?.annotations ?? [])
        .map((a) => a.url_citation?.url)
        .filter((u): u is string => !!u)
        .map((u) => new URL(u).hostname.replace(/^www\./, '')),
    ),
  ];
  const result = [
    `provider ${json.provider}${json.provider === PROVIDER_NAME ? ' (pinned)' : ' (NOT the pinned provider)'}`,
    `finish ${choice?.finish_reason}`,
    choice?.message?.tool_calls?.length
      ? `tool call ${choice.message.tool_calls.map((t) => `${t.function.name}(${t.function.arguments})`).join(', ')}`
      : null,
    hosts.length ? `${hosts.length} cited sites: ${hosts.join(', ')}` : null,
    `tokens ${json.usage?.prompt_tokens ?? '?'} in / ${json.usage?.completion_tokens ?? '?'} out`,
    `US$${cost.toFixed(5)}`,
    `${ms} ms`,
  ]
    .filter(Boolean)
    .join(' · ');
  rows.push({ test, result, cost });
  console.log(`\n[${test}] ${result}`);
  if (choice?.message?.content)
    console.log(
      `  reply: ${choice.message.content.replace(/\s+/g, ' ').slice(0, 300)}`,
    );
  return choice;
}

const system = {
  role: 'system',
  content:
    'You are a study assistant. Use the tools to read the owner’s records before answering. Be brief.',
};
const ask = {
  role: 'user',
  content: 'What did I study least in the last 7 days?',
};

// A. Tools, then a free-text answer from a (fictional) tool result.
const first = await call('A1 tools: does it call the tool?', {
  messages: [system, ask],
  tools,
  tool_choice: 'auto',
});
const toolCall = first?.message?.tool_calls?.[0];
if (toolCall)
  await call('A2 tools: free-text answer from the result', {
    messages: [
      system,
      ask,
      {
        role: 'assistant',
        content: null,
        tool_calls: first!.message!.tool_calls,
      },
      {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({
          days: 7,
          minutes: { Backend: 380, DSA: 120, 'System design': 0 },
        }),
      },
    ],
    tools,
  });
else
  rows.push({
    test: 'A2 tools: free-text answer from the result',
    result: 'skipped: no tool call in A1',
    cost: 0,
  });

// B. Tools alongside a strict JSON schema.
await call('B tools + strict JSON format', {
  messages: [system, ask],
  tools,
  tool_choice: 'auto',
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'answer',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['answer'],
        properties: { answer: { type: 'string' } },
      },
    },
  },
});

// C. Web search with a query built by code, as the whole user message.
const query = 'Amazon SDE II software engineer interview loop format';
for (const engine of ['exa', 'parallel'] as const)
  await call(`C web search (${engine}) on a code-built query`, {
    messages: [
      {
        role: 'system',
        content:
          'Summarise what the search results say in two sentences, with no personal details.',
      },
      { role: 'user', content: query },
    ],
    plugins: [{ id: 'web', engine, max_results: 3 }],
  });

console.log('\n==== R5 summary (paste this back) ====');
for (const r of rows) console.log(`- ${r.test}: ${r.result}`);
console.log(
  `Total cost: US$${rows.reduce((n, r) => n + r.cost, 0).toFixed(4)} · model ${MODEL} · endpoint ${ENDPOINT}`,
);
