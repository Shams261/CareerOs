import { sentRows, type StudyPayload } from './domain';

/**
 * What will be sent, as a readable list (WI-038) instead of raw JSON: exactly the fields in
 * the payload, then (unless the panel already says so) a row saying the owner's note never
 * leaves.
 */
export function SentFields({
  payload,
  noteRow = true,
}: {
  payload: StudyPayload;
  noteRow?: boolean;
}) {
  return (
    <dl className="sent-fields" aria-label="The fields sent">
      {sentRows(payload).map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      {noteRow && (
        <div className="is-muted">
          <dt>Your note</dt>
          <dd>Never sent</dd>
        </div>
      )}
    </dl>
  );
}
