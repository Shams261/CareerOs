import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { PanelButton } from '@/components/side-panel';

/**
 * One setting as Today's row recipe (WI-025): a tile, the small label, the setting's name,
 * its current value as the context, and either a chevron that opens its panel, a link, or
 * a control on the right.
 */
export function SettingRow({
  source,
  icon,
  label,
  title,
  context,
  panel,
  focus,
  href,
  download,
  control,
}: {
  source: 'notification' | 'roadmap' | 'practice' | 'job' | 'weekly';
  icon: ReactNode;
  label: string;
  title: string;
  context: ReactNode;
  /** Opens this side panel on click. */
  panel?: string;
  focus?: string;
  /** Or follows this link. */
  href?: string;
  download?: boolean;
  /** Or shows a control on the right (the row itself is not clickable). */
  control?: ReactNode;
}) {
  const body = (
    <>
      <span className="attention-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="attention-main">
        <span className="attention-label">{label}</span>
        <span className="attention-title">{title}</span>
        <span className="attention-context">{context}</span>
      </span>
    </>
  );
  return (
    <li className="attention-row setting-row" data-source={source}>
      {panel ? (
        <PanelButton panel={panel} focus={focus} className="attention-link">
          {body}
          <ChevronRight
            size={18}
            aria-hidden="true"
            className="attention-chevron"
          />
        </PanelButton>
      ) : href ? (
        <a className="attention-link" href={href} download={download}>
          {body}
          <ChevronRight
            size={18}
            aria-hidden="true"
            className="attention-chevron"
          />
        </a>
      ) : (
        <span className="attention-link is-static">
          {body}
          {control && <span className="setting-control">{control}</span>}
        </span>
      )}
    </li>
  );
}
