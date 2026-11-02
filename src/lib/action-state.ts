/** What every server action answers with; `ActionForm` shows it beside the button. */
export type ActionState = {
  message: string;
  ok?: boolean;
  token?: string;
  preview?: string[];
  /** A one-click way back, shown beside the success message for a few seconds. */
  undo?: { kind: string; payload: unknown; label?: string };
  /** Where to go next, shown beside the success message ("Open application"). */
  link?: { href: string; label: string };
};
