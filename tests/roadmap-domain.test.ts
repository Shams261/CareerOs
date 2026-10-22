import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCENARIOS,
  daysUntil,
  nextItem,
  nextStatus,
  parseBulkLines,
  parseReferenceLines,
  parseScenarioLines,
  referenceLines,
  renderPrompt,
  revisionQueue,
  revisionState,
  roadmapProgress,
  scenarioLines,
  scheduleRevision,
  sectionSummary,
  targetLabel,
} from '../src/features/roadmap/domain';

describe('parseBulkLines', () => {
  it('turns an outline into items and marks questions', () => {
    expect(
      parseBulkLines(
        '- Consistent hashing\n* ? Design a URL shortener\n\n1. CAP theorem\n2) How does a load balancer work?\n   ',
      ),
    ).toEqual([
      { title: 'Consistent hashing', kind: 'CONCEPT' },
      { title: 'Design a URL shortener', kind: 'QUESTION' },
      { title: 'CAP theorem', kind: 'CONCEPT' },
      { title: 'How does a load balancer work?', kind: 'QUESTION' },
    ]);
  });
  it('ignores empty input', () => {
    expect(parseBulkLines('\n  \n')).toEqual([]);
  });
});

describe('nextStatus', () => {
  it('moves forward and back without skipping done', () => {
    expect(nextStatus('start', 'NOT_STARTED')).toBe('IN_PROGRESS');
    expect(nextStatus('start', 'DONE')).toBe('DONE');
    expect(nextStatus('done', 'NOT_STARTED')).toBe('DONE');
    expect(nextStatus('reopen', 'DONE')).toBe('IN_PROGRESS');
    expect(nextStatus('asked', 'IN_PROGRESS')).toBe('IN_PROGRESS');
  });
});

describe('roadmapProgress and target labels', () => {
  it('counts without scoring', () => {
    expect(
      roadmapProgress([
        { status: 'DONE', askedInInterview: true },
        { status: 'IN_PROGRESS', askedInInterview: false },
        { status: 'NOT_STARTED', askedInInterview: true },
      ]),
    ).toEqual({ total: 3, done: 1, inProgress: 1, asked: 2 });
  });
  it("describes a target date in the owner's words", () => {
    expect(daysUntil('2026-11-01', '2026-10-21')).toBe(11);
    expect(targetLabel('2026-11-01', '2026-10-21')).toBe('11 days left');
    expect(targetLabel('2027-01-15', '2026-10-21')).toBe('12 weeks left');
    expect(targetLabel('2026-10-21', '2026-10-21')).toBe('Target is today');
    expect(targetLabel('2026-10-20', '2026-10-21')).toBe(
      'Target passed 1 day ago',
    );
    expect(targetLabel(null, '2026-10-21')).toBe('No target date');
  });
});

describe('WI-012 tracker helpers', () => {
  const base = {
    priority: 2,
    ordering: 0,
    createdAt: new Date('2026-10-21T00:00:00Z'),
  };
  const items = [
    {
      id: 'a',
      title: 'Two Sum',
      section: 'Arrays',
      status: 'DONE' as const,
      ...base,
    },
    {
      id: 'b',
      title: '3Sum',
      section: 'Arrays',
      status: 'NOT_STARTED' as const,
      ...base,
      ordering: 1,
    },
    {
      id: 'c',
      title: 'Invert',
      section: 'Trees',
      status: 'IN_PROGRESS' as const,
      ...base,
      createdAt: new Date('2026-10-22T00:00:00Z'),
    },
  ];
  it('summarises sections in first-added order and picks the item to continue', () => {
    expect(sectionSummary(items)).toEqual([
      { name: 'Arrays', total: 2, done: 1 },
      { name: 'Trees', total: 1, done: 0 },
    ]);
    // In progress wins over not started even when it sits in a later section.
    expect(nextItem(items)?.id).toBe('c');
    expect(nextItem(items.filter((i) => i.id !== 'c'))?.id).toBe('b');
    expect(
      nextItem(items.map((i) => ({ ...i, status: 'DONE' as const }))),
    ).toBeNull();
  });
  it('parses and prints scenario and reference lines', () => {
    const scenarios = parseScenarioLines(
      'start | Start | Teach it\n\nDoubt Mode | Doubt | Explain | with a pipe',
    );
    expect(scenarios).toEqual([
      { id: 'start', name: 'Start', intro: 'Teach it' },
      { id: 'doubt-mode', name: 'Doubt', intro: 'Explain | with a pipe' },
    ]);
    expect(scenarioLines(scenarios).split('\n')).toHaveLength(2);
    expect(() => parseScenarioLines('only-id')).toThrow('Scenario line');
    const refs = parseReferenceLines(
      'MDN HTTP | https://developer.mozilla.org/docs/Web/HTTP | Official docs\nhttps://example.com/plain',
    );
    expect(refs).toEqual([
      {
        label: 'MDN HTTP',
        url: 'https://developer.mozilla.org/docs/Web/HTTP',
        kind: 'Official docs',
      },
      {
        label: 'https://example.com/plain',
        url: 'https://example.com/plain',
        kind: undefined,
      },
    ]);
    expect(referenceLines(refs)).toContain(
      'MDN HTTP | https://developer.mozilla.org/docs/Web/HTTP | Official docs',
    );
    expect(() => parseReferenceLines('No url here')).toThrow('Reference line');
  });
  it('renders the study prompt from the template, the item and the scenario', () => {
    const text = renderPrompt(
      'Week {{section}} — {{topic}} ({{priority}}, {{estimate}})\n{{scope}}\n{{checkpoint}}\n{{references}}\n{{notes}}\n{{scenario}}{{extra}}\n{{unknown}}',
      { title: 'Backend' },
      {
        title: 'HTTP semantics',
        section: 'Week 1',
        scope: 'Methods, status codes',
        checkpoint: 'Explain retry risks',
        priority: 1,
        estimateMinutes: 45,
        references: [
          { label: 'MDN', url: 'https://mdn.example', kind: 'docs' },
        ],
        notes: null,
        url: 'https://example.com/x',
      },
      { id: 'doubt', name: 'Doubt', intro: 'Reteach it' },
      'Why is PUT idempotent?',
    );
    expect(text).toBe(
      [
        'Week Week 1 — HTTP semantics (P0, 45 minutes)',
        'Methods, status codes',
        'Explain retry risks',
        '- MDN: https://mdn.example (docs)',
        '- Link: https://example.com/x',
        '- none yet',
        'Reteach it',
        'ADDITIONAL CONTEXT / DOUBT / LINK:',
        'Why is PUT idempotent?',
        '',
        '{{unknown}}',
      ].join('\n'),
    );
    // No template: the built-in one carries the scenario and defaults for empty fields.
    const fallback = renderPrompt(
      null,
      { title: 'DSA' },
      { title: 'Tries', section: 'Patterns' },
      DEFAULT_SCENARIOS[0],
    );
    expect(fallback).toContain('Topic: Tries');
    expect(fallback).toContain('Not written down; use the topic title.');
    expect(fallback).toContain(DEFAULT_SCENARIOS[0].intro);
    expect(fallback).not.toContain('{{');
  });
});

describe('roadmap revision', () => {
  it('schedules 7, 14, 30 then 60 days and caps the stage', () => {
    expect(scheduleRevision(0, '2026-10-21')).toEqual({
      revisionStage: 1,
      nextRevisionAt: new Date('2026-10-28'),
    });
    expect(scheduleRevision(1, '2026-10-28')).toEqual({
      revisionStage: 2,
      nextRevisionAt: new Date('2026-11-11'),
    });
    expect(scheduleRevision(2, '2026-11-11').nextRevisionAt).toEqual(
      new Date('2026-12-11'),
    );
    expect(scheduleRevision(3, '2026-12-11')).toEqual({
      revisionStage: 4,
      nextRevisionAt: new Date('2027-02-09'),
    });
    expect(scheduleRevision(9, '2026-12-11').revisionStage).toBe(4);
  });
  it('classifies due dates as labels and queues the most overdue first', () => {
    const at = (d: string) => new Date(d);
    const items = [
      { id: 'a', status: 'DONE' as const, nextRevisionAt: at('2026-10-21') },
      { id: 'b', status: 'DONE' as const, nextRevisionAt: at('2026-10-19') },
      { id: 'c', status: 'DONE' as const, nextRevisionAt: at('2026-10-25') },
      {
        id: 'd',
        status: 'IN_PROGRESS' as const,
        nextRevisionAt: at('2026-10-19'),
      },
      { id: 'e', status: 'DONE' as const, nextRevisionAt: null },
    ];
    expect(items.map((i) => revisionState(i, '2026-10-21'))).toEqual([
      'due',
      'overdue',
      'upcoming',
      'none',
      'none',
    ]);
    expect(revisionQueue(items, '2026-10-21').map((i) => i.id)).toEqual([
      'b',
      'a',
    ]);
  });
});
