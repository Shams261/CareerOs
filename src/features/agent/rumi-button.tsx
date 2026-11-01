'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { publishToast } from '@/components/toast';
import { RumiMark } from './mark';
import { AGENT_NAME } from './domain';
import {
  DRAG_SLOP,
  saveButtonPref,
  sideFor,
  tucked,
  type ButtonPref,
} from './button-pref';

/** A press held this long on a touch screen shows the × (WI-115). */
const LONG_PRESS_MS = 550;

/**
 * The round Rumi button (WI-115): Rumi's head in a corner of every page. The owner can hide it
 * from its own ×, drag it to the other corner, or switch it in Settings; it folds small into
 * its corner while the page scrolls down or while one of Rumi's poses is in view, so one Rumi
 * shows at a time and less of any row stays covered. The happy head loads on first hover.
 */
export function RumiButton({
  open,
  onToggle,
  keyLabel,
  pref,
  buttonRef,
}: {
  open: boolean;
  onToggle: () => void;
  keyLabel: string;
  pref: ButtonPref;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  const path = usePathname();
  const [hovered, setHovered] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [isTucked, setTucked] = useState(false);
  const press = useRef<{
    x: number;
    y: number;
    moved: boolean;
    timer?: ReturnType<typeof setTimeout>;
  } | null>(null);
  const swallowClick = useRef(false);

  // Fold to the edge while scrolling down, or while a pose of Rumi is on screen.
  useEffect(() => {
    let lastY = window.scrollY;
    let down = false;
    const visible = new Set<Element>();
    const update = () =>
      setTucked(
        tucked({
          scrollingDown: down,
          scrollY: window.scrollY,
          poseInView: visible.size > 0,
        }),
      );
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) < 6) return;
      down = y > lastY;
      lastY = y;
      update();
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
        update();
      },
      { threshold: 0.35 },
    );
    const main = document.getElementById('main');
    const scan = () =>
      main?.querySelectorAll('.rumi-pose').forEach((el) => io.observe(el));
    let pending: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
      clearTimeout(pending);
      pending = setTimeout(scan, 300);
    };
    scan();
    const mo = new MutationObserver(later);
    if (main) mo.observe(main, { childList: true, subtree: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(pending);
      io.disconnect();
      mo.disconnect();
      window.removeEventListener('scroll', onScroll);
      visible.clear();
    };
  }, [path]);

  const hide = () => {
    saveButtonPref({ ...pref, shown: false });
    publishToast(
      `${AGENT_NAME} button hidden. The sidebar and ${keyLabel} still open ${AGENT_NAME}; Settings brings the button back.`,
      'info',
      { label: 'Undo', run: () => saveButtonPref({ ...pref, shown: true }) },
    );
  };

  return (
    <div
      className="rumi-fab-wrap"
      data-side={pref.side}
      data-tucked={!open && !drag && isTucked ? 'true' : undefined}
      data-reveal={reveal ? 'true' : undefined}
      data-dragging={drag ? 'true' : undefined}
      style={
        drag
          ? {
              left: drag.x - 30,
              top: drag.y - 30,
              right: 'auto',
              bottom: 'auto',
            }
          : undefined
      }
      onPointerEnter={() => setHovered(true)}
    >
      <button
        ref={buttonRef}
        type="button"
        className="rumi-fab"
        aria-label={open ? `Close ${AGENT_NAME}` : `Ask ${AGENT_NAME}`}
        aria-expanded={open}
        aria-controls="rumi-drawer"
        title={
          open
            ? `Close ${AGENT_NAME}`
            : `Ask ${AGENT_NAME} · ${keyLabel} · drag to move`
        }
        onFocus={() => setHovered(true)}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          press.current = { x: e.clientX, y: e.clientY, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
          if (e.pointerType === 'touch')
            press.current.timer = setTimeout(() => {
              setReveal(true);
              swallowClick.current = true;
              setTimeout(() => setReveal(false), 4000);
            }, LONG_PRESS_MS);
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (!p) return;
          if (
            !p.moved &&
            Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_SLOP
          ) {
            p.moved = true;
            clearTimeout(p.timer);
          }
          if (p.moved) setDrag({ x: e.clientX, y: e.clientY });
        }}
        onPointerUp={(e) => {
          const p = press.current;
          press.current = null;
          if (!p) return;
          clearTimeout(p.timer);
          if (p.moved) {
            swallowClick.current = true;
            setDrag(null);
            saveButtonPref({
              ...pref,
              side: sideFor(e.clientX, window.innerWidth),
            });
          }
        }}
        onPointerCancel={() => {
          clearTimeout(press.current?.timer);
          press.current = null;
          setDrag(null);
        }}
        onClick={() => {
          if (swallowClick.current) {
            swallowClick.current = false;
            return;
          }
          onToggle();
        }}
      >
        <RumiMark size={60} closed={open} happy={hovered} />
      </button>
      {!open && (
        <button
          type="button"
          className="rumi-fab-hide"
          aria-label={`Hide the ${AGENT_NAME} button`}
          title={`Hide the ${AGENT_NAME} button`}
          onClick={hide}
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
