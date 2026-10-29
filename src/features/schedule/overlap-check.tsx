'use client';
import { useFormResult } from '@/components/action-form';

/**
 * "Allow this overlap" shows only after Save refused an overlap (WI-070), under that message,
 * so the form stays short and the box is in view exactly when the refusal names it.
 */
export function OverlapCheck() {
  const result = useFormResult();
  if (!result?.message.startsWith('Overlap:')) return null;
  return (
    <label className="check">
      <input type="checkbox" name="allowOverlap" /> Allow this overlap
    </label>
  );
}
