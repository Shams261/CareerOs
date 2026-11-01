/**
 * Local HTTP stand-in for OpenRouter (WI-031), for browser checks only. The app accepts the
 * OPENROUTER_API_URL override only for loopback URLs.
 *
 *   pnpm openrouter:fake   (PORT, default 4466)
 *
 * It serves the two public lists the provider check reads and answers chat completions with
 * a fixed, generic five-rung ladder about the topic it was sent, or a Listen script built from
 * the passages it was sent. An Ask Rumi request (one with tools, WI-040) gets a tool call
 * picked from the question's words, then a short answer that names what the tools returned.
 * It prints request counts
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
  supported_parameters: [
    'max_tokens',
    'response_format',
    'structured_outputs',
    'tools',
    'tool_choice',
  ],
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

/**
 * A Listen script (WI-037) from the passages it was sent: one line per passage, taken from
 * the passage itself so the cross-check keeps it, and one unsupported line it must drop.
 */
function listenScript(content: string) {
  let passages: { id: string; text: string }[] = [];
  try {
    passages = JSON.parse(content).passages ?? [];
  } catch {
    passages = [];
  }
  const lines = passages.slice(0, 8).map((p) => ({
    text: p.text.split(/(?<=[.!?])\s/)[0].slice(0, 300),
    sources: [p.id],
  }));
  lines.push({
    text: 'Quantum annealing guarantees zero downtime for every rollout.',
    sources: [passages[0]?.id ?? 'P1'],
  });
  return { lines };
}

type ChatIn = {
  role: string;
  content: string | null;
  tool_call_id?: string;
};
/** The tool a question asks for, by its words, as the model would choose it. */
function pickTool(question: string, system: string) {
  const q = question.toLowerCase();
  const today = /Today is \w+ (\d{4}-\d{2}-\d{2})/.exec(system)?.[1];
  const last = /from \d{4}-\d{2}-\d{2} to (\d{4}-\d{2}-\d{2})/.exec(
    system,
  )?.[1];
  // WI-118: "I applied to Litware as a platform engineer" makes an application card.
  if (/applied to|add (an )?application/.test(q))
    return [
      'add_application',
      { company: 'Litware', role: 'Platform engineer' },
    ] as const;
  if (/plan|kal|tomorrow/.test(q) && today) {
    const next = new Date(`${today}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const tomorrow = next.toISOString().slice(0, 10);
    const day = last && tomorrow > last ? today : tomorrow;
    return [
      'propose_blocks',
      {
        day,
        blocks: [
          {
            title: 'Graphs: BFS practice',
            kind: 'DSA',
            start: '06:30',
            end: '08:00',
            reason: 'Your recorded study is strongest early',
          },
          {
            title: 'System design: caching',
            kind: 'Technical',
            start: '20:00',
            end: '21:00',
            reason: 'Technical: 0 min in the last 7 days',
          },
        ],
      },
    ] as const;
  }
  // WI-103: "move …" reads today first; the move card follows once the read is back.
  if (/\bmove\b|shift/.test(q)) return ['get_today', {}] as const;
  // WI-102: "note …" or "yaad rakh …" becomes a note in the owner's words.
  if (/note|yaad rakh/.test(q))
    return [
      'add_note',
      {
        body: (q.match(/(?:note|yaad rakh)\s*:?\s*(.+)/)?.[1] ?? q).slice(
          0,
          200,
        ),
      },
    ] as const;
  if (/today|aaj|now|start/.test(q)) return ['get_today', {}] as const;
  if (/roadmap|revision|revise/.test(q)) return ['get_roadmaps', {}] as const;
  if (/job|interview|prep|company/.test(q)) return ['get_jobs', {}] as const;
  if (/practice|problem|dsa/.test(q)) return ['get_practice', {}] as const;
  return ['get_activity', { days: 7 }] as const;
}
/** Rumi's notes (WI-100): one line when the owner states a habit or a rest day, else none. */
function memoriesFrom(content: string) {
  let texts: string[] = [];
  try {
    texts = (JSON.parse(content).ownerMessages ?? []) as string[];
  } catch {
    texts = [];
  }
  const last = (texts.at(-1) ?? '').toLowerCase();
  if (/rest day/.test(last))
    return {
      memories: [
        { kind: 'HABIT', text: 'Rest day is Saturday', expiresInDays: null },
      ],
    };
  if (/usually|prefer|best/.test(last))
    return {
      memories: [
        {
          kind: 'PREFERENCE',
          text: 'Studies best before 09:00',
          expiresInDays: null,
        },
      ],
    };
  return { memories: [] };
}
/** Rumi's line (WI-101): one plain sentence per part, with no number the checks could reject. */
function lineFrom(content: string) {
  let part = 'morning';
  try {
    part = JSON.parse(content).part ?? 'morning';
  } catch {
    part = 'morning';
  }
  // WI-110: the week's summary, two sentences without a number.
  if (part === 'week')
    return {
      line: 'A steady week with study on most evenings. Next week, keep the same evening start.',
    };
  return {
    line:
      part === 'midday'
        ? 'A study block is still ahead this afternoon; the first ten minutes are the whole start.'
        : part === 'evening'
          ? 'Today is recorded as it was; tomorrow starts with the first block on your plan.'
          : 'Your plan for today is set; begin with the first block when you are ready.',
  };
}
/** Ask Rumi: a tool call first; once a tool answered, a short reply naming its fields. */
function agentAnswer(messages: ChatIn[], final: boolean) {
  const lastUser = messages.map((m) => m.role).lastIndexOf('user');
  const results = messages.slice(lastUser + 1).filter((m) => m.role === 'tool');
  // WI-103: after reading today, a move card for the first block with an id, to tomorrow
  // morning (on a Sunday, late tonight, as the plan stops at Sunday).
  const question = (messages[lastUser]?.content ?? '').toLowerCase();
  if (results.length === 1 && !final && /\bmove\b|shift/.test(question)) {
    let first: string | undefined;
    try {
      const blocks = JSON.parse(results[0].content ?? '{}').blocks as {
        id?: string;
        title?: string;
      }[];
      // The block the question names by its first word, else the first one with an id.
      first = (
        blocks.find(
          (b) =>
            b.id &&
            b.title &&
            question.includes(b.title.split(/[:\s]/)[0].toLowerCase()),
        ) ?? blocks.find((b) => b.id)
      )?.id;
    } catch {
      first = undefined;
    }
    const system = messages[0]?.content ?? '';
    const today = /Today is \w+ (\d{4}-\d{2}-\d{2})/.exec(system)?.[1];
    if (first && today) {
      const sunday = /Today is Sunday/.test(system);
      const next = new Date(`${today}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const args = sunday
        ? { blockId: first, day: today, start: '23:40', end: '23:55' }
        : {
            blockId: first,
            day: next.toISOString().slice(0, 10),
            start: '06:00',
            end: '06:30',
          };
      return {
        message: {
          content: null,
          tool_calls: [
            {
              id: `call_${chats}`,
              type: 'function',
              function: { name: 'move_block', arguments: JSON.stringify(args) },
            },
          ],
        },
        finish_reason: 'tool_calls',
      };
    }
  }
  if (!results.length && !final) {
    const [name, args] = pickTool(
      messages[lastUser]?.content ?? '',
      messages[0]?.content ?? '',
    );
    return {
      message: {
        content: null,
        tool_calls: [
          {
            id: `call_${chats}`,
            type: 'function',
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      },
      finish_reason: 'tool_calls',
    };
  }
  let keys: string[] = [];
  try {
    keys = Object.keys(JSON.parse(results[0]?.content ?? '{}'));
  } catch {
    keys = [];
  }
  return {
    message: {
      content: [
        `**From your records:** I read ${keys.slice(0, 4).join(', ') || 'nothing useful'}.`,
        '',
        '- This is the local stand-in, so the numbers are not read out.',
        '- Ask about today, your roadmap, practice or jobs to try another tool.',
      ].join('\n'),
    },
    finish_reason: 'stop',
  };
}

/** A prep doc (WI-042) from what it was sent: every point cites the first sources. */
function prepDoc(content: string) {
  let input: {
    sources?: { id: string }[];
    roadmap?: { id: string }[];
    problems?: { id: string }[];
  } = {};
  try {
    input = JSON.parse(content);
  } catch {
    input = {};
  }
  const s = (input.sources ?? []).map((x) => x.id);
  const r = (input.roadmap ?? []).map((x) => x.id);
  const p = (input.problems ?? []).map((x) => x.id);
  return {
    process: [
      {
        text: 'A recruiter screen, then a coding round, then a system design round.',
        sources: s.slice(0, 2),
      },
      {
        text: 'Expect about four weeks from first call to decision.',
        sources: ['S99'],
      },
    ],
    rounds: [
      {
        name: 'Coding',
        tests: ['Arrays and graphs', 'Talking through trade-offs'],
        sources: s.slice(1, 2),
      },
      {
        name: 'System design',
        tests: ['Caching and queues', 'Scaling reads'],
        sources: s.slice(0, 1),
      },
    ],
    topics: [
      {
        name: 'Graphs',
        why: 'Coding rounds often use BFS and DFS.',
        sources: s.slice(0, 1),
        links: [...r.slice(0, 1), ...p.slice(0, 1), 'R999'],
      },
      {
        name: 'Caching',
        why: 'System design asks about read-heavy services.',
        sources: s.slice(1, 3),
        links: r.slice(1, 2),
      },
    ],
    plan: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
      day,
      focus: day % 2 ? 'Graphs practice' : 'System design: caching',
      links: day % 2 ? p.slice(0, 1) : r.slice(1, 2),
    })),
    questions: [
      'How is the team’s on-call shared?',
      'What does a strong first year look like?',
    ],
    // WI-105: what the round asks, and the study order.
    asks: [
      { text: 'Graph traversal under time pressure.', sources: s.slice(0, 1) },
    ],
    order: [
      {
        name: 'Graphs',
        why: 'Asked in the coding round.',
        sources: s.slice(0, 1),
        links: p.slice(0, 1),
      },
      {
        name: 'Caching',
        why: 'The design round leans on it.',
        sources: s.slice(1, 2),
        links: r.slice(0, 1),
      },
    ],
  };
}
/** An invite (WI-105): one coding round on a fixed future day, and graphs as its topic. */
function inviteFrom() {
  const d = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  return {
    rounds: [
      {
        type: 'CODING',
        date: d,
        start: '10:00',
        minutes: 60,
        aiPolicy: 'NOT_ALLOWED',
      },
    ],
    topics: ['graphs'],
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
      tools?: unknown[];
      tool_choice?: string;
    };
    const plugins = (body as { plugins?: { id: string }[] }).plugins;
    if (plugins?.some((p) => p.id === 'web')) {
      // A search (WI-042): a short summary citing three generic pages, one on the company's site.
      console.info(`[fake-openrouter] chat ${chats}`);
      await new Promise((r) => setTimeout(r, 300));
      const query = body.messages[1]?.content ?? '';
      const company = query.split(' ')[0]?.toLowerCase() || 'company';
      const n = chats;
      return json(200, {
        provider: 'Google',
        usage: { prompt_tokens: 1200, completion_tokens: 180, cost: 0.0072 },
        choices: [
          {
            message: {
              content: `- The loop has a recruiter screen, a coding round and a system design round.\n- Interviewers look for clear trade-offs.`,
              annotations: [
                `https://${company}.jobs/interview-process-${n % 3}`,
                `https://interview-guides.example.org/${company}-${n}`,
                `https://engineering-blog.example.com/loops-${n % 2}`,
              ].map((url, i) => ({
                type: 'url_citation',
                url_citation: {
                  url,
                  title: `Result ${i + 1} for ${query.slice(0, 40)}`,
                },
              })),
            },
            finish_reason: 'stop',
          },
        ],
      });
    }
    // WI-107: the week draft, two days of next week in the evening.
    if (
      body.tools &&
      /Draft the owner's study blocks for next week/.test(
        body.messages[0]?.content ?? '',
      )
    ) {
      let days: string[] = [];
      try {
        days = (
          JSON.parse(body.messages[1]?.content ?? '{}').days as {
            day: string;
          }[]
        ).map((d) => d.day);
      } catch {
        days = [];
      }
      const call = (day: string, title: string, i: number) => ({
        id: `call_draft_${i}`,
        type: 'function',
        function: {
          name: 'propose_blocks',
          arguments: JSON.stringify({
            day,
            blocks: [
              {
                title,
                kind: 'DSA',
                start: '21:00',
                end: '21:45',
                reason: 'Weekly mix: DSA problems',
              },
            ],
          }),
        },
      });
      return json(200, {
        provider: 'Google',
        usage: { prompt_tokens: 2500, completion_tokens: 300, cost: 0.0004 },
        choices: [
          {
            message: {
              content: 'A steady week: short DSA blocks in the evening.',
              tool_calls: [
                call(days[0], 'Graphs: BFS', 0),
                call(days[2], 'Heaps: top k', 1),
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      });
    }
    if (body.tools) {
      console.info(`[fake-openrouter] chat ${chats}`);
      await new Promise((r) => setTimeout(r, 400));
      return json(200, {
        provider: 'Google',
        usage: { prompt_tokens: 900, completion_tokens: 120, cost: 0.00015 },
        choices: [agentAnswer(body.messages, body.tool_choice === 'none')],
      });
    }
    // WI-108: feedback on a mock interview answer, one paragraph, never a score.
    if (/running a mock interview/.test(body.messages[0]?.content ?? '')) {
      return json(200, {
        provider: 'Google',
        usage: { prompt_tokens: 1200, completion_tokens: 120, cost: 0.0002 },
        choices: [
          {
            message: {
              content:
                'You named the right pattern and kept it short. Say the time and space cost out loud, and how you would test it. A likely follow-up: what changes if the input does not fit in memory?',
            },
            finish_reason: 'stop',
          },
        ],
      });
    }
    const format = body.response_format?.json_schema?.name;
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
                : JSON.stringify(
                    format === 'listen'
                      ? listenScript(body.messages[1]?.content ?? '{}')
                      : format === 'prep_doc'
                        ? prepDoc(body.messages[1]?.content ?? '{}')
                        : format === 'memories'
                          ? memoriesFrom(body.messages[1]?.content ?? '{}')
                          : format === 'line'
                            ? lineFrom(body.messages[1]?.content ?? '{}')
                            : format === 'invite'
                              ? inviteFrom()
                              : ladder(topic),
                  ),
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
