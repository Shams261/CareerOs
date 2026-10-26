'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Saves the print as a PNG drawn from its SVG on this device (no upload): shared through the
 * system sheet where the browser offers it, downloaded otherwise.
 */
export function SavePrint({
  svgId,
  fileName,
}: {
  svgId: string;
  fileName: string;
}) {
  const [error, setError] = useState('');
  const save = async () => {
    setError('');
    const svg = document.getElementById(svgId);
    if (!svg) return;
    try {
      const markup = new XMLSerializer().serializeToString(svg);
      const url = URL.createObjectURL(
        new Blob([markup], { type: 'image/svg+xml' }),
      );
      const img = new Image();
      await new Promise<void>((ok, fail) => {
        img.onload = () => ok();
        img.onerror = () => fail(new Error('image'));
        img.src = url;
      });
      const box = (svg as unknown as SVGSVGElement).viewBox.baseVal;
      const canvas = document.createElement('canvas');
      canvas.width = box.width * 2;
      canvas.height = box.height * 2;
      canvas
        .getContext('2d')!
        .drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const blob = await new Promise<Blob | null>((ok) =>
        canvas.toBlob(ok, 'image/png'),
      );
      if (!blob) throw new Error('png');
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] }).catch(() => undefined);
        return;
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch {
      setError('This browser could not save the print.');
    }
  };
  return (
    <>
      <Button type="button" className="secondary" onClick={save}>
        Save the print
      </Button>
      {error && (
        <span className="form-message" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
