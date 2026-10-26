import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { dayPrintAction } from './actions';
import { HEIGHT, PRINT, WIDTH, type DayPrintModel } from './domain';
import { SavePrint } from './save';

/** The print itself: an SVG with fixed colours, so a saved copy looks like the card. */
export function PrintSvg({ model, id }: { model: DayPrintModel; id: string }) {
  return (
    <svg
      id={id}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${model.dateLabel}: ${model.headline} ${model.detail}`}
      className="day-print-svg"
    >
      <rect width={WIDTH} height={HEIGHT} rx="22" fill={PRINT.paper} />
      {model.rings.length ? (
        model.rings.map((r, i) => (
          <circle
            key={i}
            cx={r.cx}
            cy={r.cy}
            r={r.r}
            fill="none"
            stroke={r.colour}
            strokeWidth={Math.max(5, r.r * 0.16)}
          />
        ))
      ) : (
        <circle
          cx={WIDTH / 2}
          cy={128}
          r={34}
          fill="none"
          stroke={PRINT.empty}
          strokeWidth="5"
          strokeDasharray="6 8"
        />
      )}
      <text
        x={WIDTH / 2}
        y={HEIGHT - 34}
        textAnchor="middle"
        fill={PRINT.meta}
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="15"
        letterSpacing="2.4"
      >
        {model.dateLabel.toUpperCase()} · SILSILA
      </text>
    </svg>
  );
}

/**
 * The Day Print card on a closed day (WI-033). Until the owner answers, it asks whether to
 * keep showing prints; Remove hides them (Settings brings them back).
 */
export function DayPrintCard({
  model,
  day,
  isToday,
  ask,
}: {
  model: DayPrintModel;
  day: string;
  isToday: boolean;
  ask: boolean;
}) {
  const id = `day-print-${day}`;
  return (
    <section className="day-print" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>
        {isToday ? 'Today is closed' : `${model.weekday} is closed`}
      </h2>
      <PrintSvg model={model} id={id} />
      <p className="day-print-headline">{model.headline}</p>
      <p className="muted">{model.detail}</p>
      {model.legend.length > 0 && (
        <ul className="day-print-legend" aria-label="Colours">
          {model.legend.map((l) => (
            <li key={l.group}>
              <span
                className="day-print-dot"
                style={{ background: l.colour }}
                aria-hidden="true"
              />
              {l.group}
            </li>
          ))}
        </ul>
      )}
      <div className="actions day-print-actions">
        <SavePrint svgId={id} fileName={`silsila-${day}.png`} />
      </div>
      {ask && (
        <ActionForm
          action={dayPrintAction}
          label="Keep showing day prints?"
          broadcast="day-print"
          className="day-print-ask"
        >
          <span>Keep a print like this after each closed day?</span>
          <Button className="secondary small" name="choice" value="keep">
            Keep
          </Button>
          <Button className="secondary small" name="choice" value="remove">
            Remove
          </Button>
        </ActionForm>
      )}
    </section>
  );
}
