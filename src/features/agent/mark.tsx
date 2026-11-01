import { blinkDelay, HEAD_SRC, POSES } from './mascot';
import { Lids } from './pose';

/**
 * Rumi's icon (WI-111): the head of the owner's Rumi render, small. It blinks through two
 * eyelids over its open eyes (`Lids`), bobs and blinks faster while Rumi reads or writes
 * (`busy`), turns to the happy-eyed head when the pointer is on the round button, and carries
 * a small × badge while the drawer is open (`closed`). Decoration: hidden from assistive
 * technology; the button or heading beside it carries the name. Motion only without reduced
 * motion.
 */
export type RumiMarkState = 'idle' | 'busy';

const HEAD = POSES['head-open'];

export function RumiMark({
  size = 20,
  state = 'idle',
  closed = false,
  className,
}: {
  size?: number;
  state?: RumiMarkState;
  /** An × badge in the corner, for the round button while the drawer is open. */
  closed?: boolean;
  className?: string;
}) {
  return (
    <span
      className={['rumi-mark', className].filter(Boolean).join(' ')}
      data-state={state}
      style={{ height: size, width: Math.round((size * HEAD.w) / HEAD.h) }}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a small static webp, no loader */}
      <img
        className="rumi-mark-open"
        src={HEAD_SRC.open}
        alt=""
        width={HEAD.w}
        height={HEAD.h}
        decoding="async"
        draggable={false}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- a small static webp, no loader */}
      <img
        className="rumi-mark-happy"
        src={HEAD_SRC.happy}
        alt=""
        decoding="async"
        loading="lazy"
        draggable={false}
      />
      <Lids lids={HEAD.lids} delay={blinkDelay(`mark-${size}`)} />
      {closed && <span className="rumi-mark-badge">×</span>}
    </span>
  );
}
