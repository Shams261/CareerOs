'use client';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes } from 'react';
export function Button({
  className,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button
      className={cn('button', className)}
      disabled={disabled || pending}
      aria-busy={pending}
      {...props}
    />
  );
}
