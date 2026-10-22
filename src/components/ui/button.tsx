'use client';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'destructive' | 'link';
const classes: Record<Variant, string> = {
  primary: 'button',
  secondary: 'button secondary',
  destructive: 'button destructive',
  link: 'link-button',
};

/**
 * The one button. `variant` picks the look; `className` adds size or tone classes
 * (`small`, `danger`, `mt-3`). Inside an `ActionForm` the fieldset owns the pending state.
 */
export function Button({
  className,
  disabled,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const { pending } = useFormStatus();
  return (
    <button
      className={cn(classes[variant], className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    />
  );
}
