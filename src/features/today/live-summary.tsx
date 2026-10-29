'use client';
import { useEffect, useState } from 'react';
import { formatDuration, summaryLine } from './domain';

/**
 * The summary line, kept in step with the live timer: while a session runs, the recorded
 * minutes grow on the client (once a minute, no request). The extra minutes belong to one
 * server render (`renderedAt`); a new render or a stopped session starts from zero again,
 * and the first client render equals the server's, so there is nothing to patch at hydration.
 */
export function LiveSummary({
  completed,
  planned,
  plannedMinutes,
  recordedMinutes,
  running,
  renderedAt,
}: {
  completed: number;
  planned: number;
  plannedMinutes: number;
  recordedMinutes: number;
  running: boolean;
  renderedAt: string;
}) {
  const [tick, setTick] = useState({ at: renderedAt, extra: 0 });
  useEffect(() => {
    if (!running) return;
    const base = +new Date(renderedAt);
    const timer = setInterval(
      () =>
        setTick({
          at: renderedAt,
          extra: Math.max(0, Math.floor((Date.now() - base) / 60000)),
        }),
      30000,
    );
    return () => clearInterval(timer);
  }, [running, renderedAt]);
  const extra = running && tick.at === renderedAt ? tick.extra : 0;
  return (
    <>
      {summaryLine({
        completed,
        planned,
        plannedMinutes,
        recordedMinutes: recordedMinutes + extra,
      })}
    </>
  );
}

/** Today's focused minutes for the header chip (WI-065), growing like the summary line. */
export function LiveMinutes({
  minutes,
  running,
  renderedAt,
}: {
  minutes: number;
  running: boolean;
  renderedAt: string;
}) {
  const [tick, setTick] = useState({ at: renderedAt, extra: 0 });
  useEffect(() => {
    if (!running) return;
    const base = +new Date(renderedAt);
    const timer = setInterval(
      () =>
        setTick({
          at: renderedAt,
          extra: Math.max(0, Math.floor((Date.now() - base) / 60000)),
        }),
      30000,
    );
    return () => clearInterval(timer);
  }, [running, renderedAt]);
  const extra = running && tick.at === renderedAt ? tick.extra : 0;
  return <>{formatDuration(minutes + extra)}</>;
}
