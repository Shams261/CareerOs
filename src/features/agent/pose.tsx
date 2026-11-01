import { blinkDelay, POSES, poseSrc, type Lid, type Pose } from './mascot';

/** Two eyelids over a pose's open eyes; CSS closes them for a moment every few seconds. */
export function Lids({ lids, delay }: { lids: readonly Lid[]; delay: number }) {
  return (
    <>
      {lids.map((l, i) => (
        <span
          key={i}
          className="rumi-lid"
          style={{
            left: `${l.x}%`,
            top: `${l.y}%`,
            width: `${l.w}%`,
            height: `${l.h}%`,
            background: l.c,
            animationDelay: `${delay}s`,
          }}
        />
      ))}
    </>
  );
}

/**
 * One of Rumi's moments as a picture (WI-111): decoration, so the image has no name for
 * assistive technology; the text beside it says what the moment is. `size` is the width in
 * CSS pixels; the height follows the pose.
 */
export function RumiPose({
  pose,
  size = 120,
  className,
}: {
  pose: Pose;
  size?: number;
  className?: string;
}) {
  const info = POSES[pose];
  return (
    <span
      className={['rumi-pose', className].filter(Boolean).join(' ')}
      data-pose={pose}
      data-motion={info.motion}
      style={{ width: size }}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a small static webp, no loader */}
      <img
        src={poseSrc(pose)}
        width={info.w}
        height={info.h}
        alt=""
        decoding="async"
        loading="lazy"
        draggable={false}
      />
      <Lids lids={info.lids} delay={blinkDelay(pose)} />
      {info.motion === 'sleep' && (
        <span className="rumi-zzz">
          <i>z</i>
          <i>z</i>
          <i>Z</i>
        </span>
      )}
    </span>
  );
}
