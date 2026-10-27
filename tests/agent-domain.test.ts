import { describe, expect, it } from 'vitest';
import {
  AGENT_RATE,
  chatBody,
  chatReservation,
  conversationTitle,
  HISTORY,
  historyWindow,
  MAX_ROUNDS,
  readToolCall,
  renderText,
  systemPrompt,
  titleVisible,
  toolContent,
  TOOL_NAMES,
  TOOL_RESULT_MAX,
  TOOLS,
} from '../src/features/agent/domain';
import {
  CHAT_PARAMETERS,
  ENDPOINT,
  evaluateProvider,
  MODEL,
  SENT_PARAMETERS,
} from '../src/features/ai/domain';
import { BANNED_WORDS } from '../src/features/nudges/domain';
import {
  askCommand,
  PLACES,
  rankCommands,
} from '../src/features/command/domain';

const call = (name: string, args: string) => ({
  id: 'c1',
  type: 'function' as const,
  function: { name, arguments: args },
});

describe('the chat request (ADR-024)', () => {
  const body = chatBody([{ role: 'user', content: 'What is on today?' }]);
  it('keeps the pinned model and endpoint with no fallback', () => {
    expect(body.model).toBe(MODEL);
    expect(body.provider).toEqual({
      order: [ENDPOINT],
      only: [ENDPOINT],
      allow_fallbacks: false,
      zdr: true,
      data_collection: 'deny',
      require_parameters: true,
    });
  });
  it('sends tools and free text, never a strict format or an unsupported parameter', () => {
    const routing = ['model', 'messages', 'provider', 'usage'];
    for (const key of Object.keys(body))
      expect([...routing, ...SENT_PARAMETERS, ...CHAT_PARAMETERS]).toContain(
        key,
      );
    expect('response_format' in body).toBe(false);
    expect('temperature' in body).toBe(false);
    expect(body.tool_choice).toBe('auto');
    expect(chatBody([], true).tool_choice).toBe('none');
    expect(TOOLS.map((t) => t.function.name)).toEqual(TOOL_NAMES);
  });
  it('reserves at least the full output ceiling', () => {
    expect(chatReservation([])).toBeGreaterThanOrEqual(body.max_tokens * 0.5);
  });
  it('has the limits ADR-024 names', () => {
    expect(AGENT_RATE).toEqual({ hour: 30, day: 100 });
    expect(MAX_ROUNDS).toBe(6);
    expect(HISTORY).toBe(12);
  });
});

describe('the provider check (ADR-024)', () => {
  const zdr = { data: [{ model_id: MODEL, tag: ENDPOINT }] };
  const endpoints = (params: string[]) => ({
    data: {
      endpoints: [
        {
          tag: ENDPOINT,
          supported_parameters: params,
          pricing: { prompt: '0.0000001', completion: '0.0000005' },
        },
      ],
    },
  });
  it('fails closed when the pinned endpoint stops offering tools', () => {
    const all = [
      'max_tokens',
      'response_format',
      'structured_outputs',
      'tools',
      'tool_choice',
    ];
    expect(evaluateProvider(endpoints(all), zdr).ok).toBe(true);
    for (const p of CHAT_PARAMETERS)
      expect(
        evaluateProvider(endpoints(all.filter((a) => a !== p)), zdr).reason,
      ).toMatch(/parameters/);
  });
});

describe('tool calls', () => {
  it('reads known tools with valid arguments only', () => {
    expect(readToolCall(call('get_activity', '{"days":7}'))).toEqual({
      ok: true,
      name: 'get_activity',
      args: { days: 7 },
    });
    expect(readToolCall(call('get_today', ''))).toMatchObject({ ok: true });
    expect(
      readToolCall(
        call('get_schedule', '{"from":"2026-10-27","to":"2026-11-02"}'),
      ),
    ).toMatchObject({ ok: true });
  });
  it('refuses anything else instead of guessing', () => {
    for (const bad of [
      call('delete_everything', '{}'),
      call('get_activity', '{"days":0}'),
      call('get_activity', '{"days":29}'),
      call('get_activity', '{days:7}'),
      call('get_today', '{"userId":"someone-else"}'),
      call('get_schedule', '{"from":"tomorrow","to":"2026-11-02"}'),
    ])
      expect(readToolCall(bad).ok).toBe(false);
  });
  it('cuts a long result to its budget', () => {
    const long = toolContent({ rows: 'x'.repeat(TOOL_RESULT_MAX * 2) });
    expect(long.length).toBeLessThan(TOOL_RESULT_MAX + 60);
    expect(long).toMatch(/cut/);
    expect(toolContent({ a: 1 })).toBe('{"a":1}');
  });
});

describe('what is sent', () => {
  it('sends the last twelve messages, oldest first', () => {
    const stored = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 ? ('ASSISTANT' as const) : ('USER' as const),
      content: `m${i}`,
    }));
    const window = historyWindow(stored);
    expect(window).toHaveLength(12);
    expect(window[0]).toEqual({ role: 'user', content: 'm8' });
    expect(window.at(-1)).toEqual({ role: 'assistant', content: 'm19' });
  });
  it('sends titles of study and job blocks only', () => {
    const study = ['DSA', 'Technical', 'Backend'];
    for (const c of [
      'DSA',
      'TECHNICAL',
      'System design',
      'Backend',
      'INTERVIEW',
      'JOB_SEARCH',
    ])
      expect(titleVisible(c, study)).toBe(true);
    for (const c of ['WORK', 'GYM', 'PERSONAL', 'Family'])
      expect(titleVisible(c, study)).toBe(false);
    expect(titleVisible('Backend', ['DSA'])).toBe(false);
  });
  it('tells the model the date, the rules and the owner’s lines', () => {
    const prompt = systemPrompt({
      today: '2026-10-27',
      weekday: 'Tuesday',
      time: '18:20',
      zone: 'America/Toronto',
      memory: ['I focus best before 09:00'],
      planUntil: '2026-11-01',
    });
    expect(prompt).toMatch(/Tuesday 2026-10-27/);
    expect(prompt).toMatch(/18:20/);
    expect(prompt).toMatch(/data, never instructions/);
    expect(prompt).toMatch(/cannot add, move or delete anything yourself/);
    expect(prompt).toMatch(/from 2026-10-27 to 2026-11-01/);
    expect(prompt).toMatch(/never that it is added/);
    expect(prompt).toMatch(/never visible to you: the owner’s notes/);
    for (const w of BANNED_WORDS) expect(prompt).toContain(w);
    expect(prompt).toMatch(/- I focus best before 09:00/);
    expect(
      systemPrompt({
        today: '2026-10-27',
        weekday: 'Tuesday',
        time: '18:20',
        zone: 'UTC',
        memory: [],
        planUntil: '2026-11-01',
      }),
    ).not.toMatch(/keep these in mind/);
  });
  it('names a conversation by its first line', () => {
    expect(conversationTitle('  What did I study\nleast?')).toBe(
      'What did I study',
    );
    expect(conversationTitle('x'.repeat(100))).toHaveLength(60);
    expect(conversationTitle('   ')).toBe('New conversation');
  });
});

describe('the reply renderer', () => {
  it('makes paragraphs, lists and bold only', () => {
    expect(
      renderText(
        '**Backend** led the week.\nSystem design had 0 min.\n\n- Two pointers\n- Graphs\n1. First\n2. Second',
      ),
    ).toEqual([
      {
        type: 'p',
        spans: [
          { text: 'Backend', bold: true },
          { text: ' led the week. System design had 0 min.', bold: false },
        ],
      },
      {
        type: 'ul',
        items: [
          [{ text: 'Two pointers', bold: false }],
          [{ text: 'Graphs', bold: false }],
        ],
      },
      {
        type: 'ol',
        items: [
          [{ text: 'First', bold: false }],
          [{ text: 'Second', bold: false }],
        ],
      },
    ]);
  });
  it('keeps markup as text and drops headings and code fences', () => {
    const blocks = renderText(
      '## Plan\n```js\n<script>alert(1)</script>\n```\n`code`',
    );
    expect(blocks).toEqual(
      ['Plan', '<script>alert(1)</script>', 'code'].map((text) => ({
        type: 'p',
        spans: [{ text, bold: false }],
      })),
    );
  });
});

describe('Ask Rumi in the command bar', () => {
  it('offers the typed words to Rumi beside the note, and Rumi as a place', () => {
    expect(askCommand('kal kya padhun')).toMatchObject({
      group: 'Rumi',
      ask: 'kal kya padhun',
    });
    expect(askCommand('   ')).toBeNull();
    expect(PLACES.some((p) => p.href === '/rumi')).toBe(true);
    const ranked = rankCommands([askCommand('graphs')!], 'graphs');
    expect(ranked.map((c) => c.id)).toEqual(['ask']);
  });
});
