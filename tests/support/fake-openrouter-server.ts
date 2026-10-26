/**
 * Local HTTP stand-in for OpenRouter (WI-031), for browser checks only. The app accepts the
 * OPENROUTER_API_URL override only for loopback URLs.
 *
 *   pnpm openrouter:fake   (PORT, default 4466)
 *
 * It serves the two public lists the provider check reads and answers chat completions with
 * a fixed, generic five-rung ladder about the topic it was sent. It prints request counts
 * only, never what was sent. FAKE_OPENROUTER_MODE=invalid answers with a broken ladder;
 * FAKE_OPENROUTER_MODE=no-zdr leaves the pinned endpoint off the ZDR list.
 */
import { createServer, type IncomingMessage } from 'node:http';
import { ENDPOINT, MODEL } from '../../src/features/ai/domain';

const port = Number(process.env.PORT ?? 4466);
const mode = process.env.FAKE_OPENROUTER_MODE ?? 'ok';
let chats = 0;

async function read(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}
const endpoint = {
  tag: ENDPOINT,
  provider_name: 'Google',
  supported_parameters: ['max_tokens', 'response_format', 'structured_outputs'],
  pricing: { prompt: '0.0000001', completion: '0.0000005' },
};
function ladder(topic: string) {
  const t = topic || 'this topic';
  const rungs = [
    [
      'Starting point',
      `Explain ${t} as you would to an interviewer in two minutes.`,
    ],
    ['Scale', `What changes in ${t} when traffic grows tenfold?`],
    ['Failure', `A dependency of ${t} goes down. What do you do?`],
    ['New requirement', `Add a per-customer limit to ${t}. What moves?`],
    ['Trade-off', `Where would you trade accuracy for speed in ${t}?`],
  ];
  return {
    rungs: rungs.map(([change, question]) => ({
      question,
      change,
      points: [
        'States the goal and the constraint first',
        'Names one concrete mechanism and its cost',
        'Says how to test or observe it',
      ],
    })),
  };
}

/** Five plain hints, a nudge first and the shape of the approach last (WI-032). */
function hintSet() {
  return {
    hints: [
      ['Reading', 'Say in one sentence what the answer must contain.'],
      ['Pattern', 'Ask which earlier value would complete the current one.'],
      [
        'Structure',
        'A lookup from value to position answers that in one step.',
      ],
      [
        'Key insight',
        'Check for the partner before you record the current value.',
      ],
      ['Approach', 'One pass: look up the partner, then remember this value.'],
    ].map(([focus, hint]) => ({ focus, hint })),
  };
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  const json = (status: number, data: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  if (req.method === 'GET' && url.pathname === '/api/v1/endpoints/zdr')
    return json(200, {
      data: mode === 'no-zdr' ? [] : [{ model_id: MODEL, tag: ENDPOINT }],
    });
  if (
    req.method === 'GET' &&
    url.pathname === `/api/v1/models/${MODEL}/endpoints`
  )
    return json(200, { data: { id: MODEL, endpoints: [endpoint] } });
  if (req.method === 'POST' && url.pathname === '/api/v1/chat/completions') {
    chats++;
    const body = JSON.parse(await read(req)) as {
      messages: { role: string; content: string }[];
      response_format?: { json_schema?: { name?: string } };
    };
    const wantsHints = body.response_format?.json_schema?.name === 'hints';
    let topic = '';
    try {
      topic = JSON.parse(body.messages[1]?.content ?? '{}').topic ?? '';
    } catch {
      topic = '';
    }
    console.info(`[fake-openrouter] chat ${chats}`);
    await new Promise((r) => setTimeout(r, 600));
    return json(200, {
      provider: 'Google',
      usage: { prompt_tokens: 420, completion_tokens: 610, cost: 0.000347 },
      choices: [
        {
          message: {
            content:
              mode === 'invalid'
                ? '{"rungs":[]}'
                : JSON.stringify(wantsHints ? hintSet() : ladder(topic)),
          },
        },
      ],
    });
  }
  json(404, { error: 'not found' });
}).listen(port, '127.0.0.1', () =>
  console.info(
    `[fake-openrouter] listening on http://127.0.0.1:${port}/api/v1`,
  ),
);
