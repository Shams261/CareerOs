/**
 * A streamed answer (WI-119): OpenRouter's server-sent events, read line by line into the same
 * answer the non-streaming call returns, so every check after the call is unchanged. Text is
 * handed on only once a chunk names the pinned provider; if the round turns out to call tools
 * after some text, a reset is handed on so the page drops that text. Pure; covered by
 * tests/ai-stream.test.ts.
 */
export type StreamEvent = { text: string } | { reset: true };
type ToolDelta = {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};
type Chunk = {
  provider?: string;
  usage?: unknown;
  choices?: {
    delta?: { content?: string | null; tool_calls?: ToolDelta[] };
    finish_reason?: string | null;
  }[];
};

export function streamReader(
  provider: string,
  onEvent: (e: StreamEvent) => void,
) {
  let content = '';
  let seenProvider: string | undefined;
  let usage: unknown;
  let finish: string | null = null;
  let sent = 0;
  const calls: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[] = [];
  /** Hands on the text not yet sent, once the provider is the pinned one and no tool came. */
  const flush = () => {
    if (seenProvider !== provider || calls.length || sent >= content.length)
      return;
    onEvent({ text: content.slice(sent) });
    sent = content.length;
  };
  return {
    /** One line of the event stream: "data: {...}", "data: [DONE]", a comment or a blank. */
    line(raw: string) {
      const line = raw.trim();
      if (!line.startsWith('data:')) return;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') return;
      let chunk: Chunk;
      try {
        chunk = JSON.parse(data);
      } catch {
        return;
      }
      if (chunk.provider) seenProvider = chunk.provider;
      if (chunk.usage) usage = chunk.usage;
      const choice = chunk.choices?.[0];
      if (choice?.finish_reason) finish = choice.finish_reason;
      const delta = choice?.delta;
      if (typeof delta?.content === 'string') content += delta.content;
      for (const t of delta?.tool_calls ?? []) {
        const i = t.index ?? calls.length;
        if (!calls[i]) {
          // The round calls tools: whatever text the page showed was not the answer.
          if (!calls.length && sent) onEvent({ reset: true });
          calls[i] = {
            id: t.id ?? `call_${i}`,
            type: 'function',
            function: { name: '', arguments: '' },
          };
        }
        if (t.id) calls[i].id = t.id;
        if (t.function?.name) calls[i].function.name += t.function.name;
        if (t.function?.arguments)
          calls[i].function.arguments += t.function.arguments;
      }
      flush();
    },
    /** The whole answer, shaped as the non-streaming call returns it. */
    answer() {
      return {
        provider: seenProvider,
        usage,
        choices: [
          {
            message: {
              content: content || null,
              ...(calls.length ? { tool_calls: calls.filter(Boolean) } : {}),
            },
            finish_reason: finish,
          },
        ],
      };
    },
  };
}
