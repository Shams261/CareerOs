/**
 * Drafts for in-place forms (WI-018). What the owner typed into an add form is kept in
 * this browser tab's sessionStorage under a key the page chooses, so Back, a refresh or a
 * closed disclosure never loses it. A draft is written while typing, applied once when the
 * form mounts, and cleared by a successful save or by Discard. Nothing leaves the device.
 */
const PREFIX = 'silsila-draft:';
export type DraftData = Record<string, string | boolean>;
const listeners = new Set<() => void>();
const notify = () => {
  for (const fn of listeners) fn();
};
export function subscribeDrafts(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function readDraft(name: string): DraftData | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + name);
    return raw ? (JSON.parse(raw) as DraftData) : null;
  } catch {
    return null;
  }
}
export function hasDraft(name: string) {
  try {
    return sessionStorage.getItem(PREFIX + name) !== null;
  } catch {
    return false;
  }
}
export function writeDraft(name: string, data: DraftData) {
  try {
    sessionStorage.setItem(PREFIX + name, JSON.stringify(data));
  } catch {
    /* storage unavailable: the form still works, nothing is kept */
  }
  notify();
}
export function clearDraft(name: string) {
  try {
    sessionStorage.removeItem(PREFIX + name);
  } catch {
    /* storage unavailable */
  }
  notify();
}

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'file', 'password']);
const SKIP_NAMES = new Set(['token', 'requestId', 'version', 'id']);
function fields(form: HTMLFormElement): Field[] {
  return [...form.elements].filter((el): el is Field => {
    const { name, type } = el as HTMLInputElement;
    if (typeof name !== 'string' || !name) return false;
    return !SKIP_TYPES.has(type) && !SKIP_NAMES.has(name);
  });
}
/** The form's current values and whether any differ from what the page rendered. */
export function serializeForm(form: HTMLFormElement) {
  const data: DraftData = {};
  let dirty = false;
  for (const el of fields(form)) {
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      data[`${el.name}=${el.value}`] = el.checked;
      if (el.checked !== el.defaultChecked) dirty = true;
    } else if (el instanceof HTMLInputElement && el.type === 'radio') {
      if (el.checked) data[el.name] = el.value;
      if (el.checked !== el.defaultChecked) dirty = true;
    } else if (el instanceof HTMLSelectElement) {
      data[el.name] = el.value;
      const initial =
        [...el.options].find((o) => o.defaultSelected)?.value ??
        el.options[0]?.value ??
        '';
      if (el.value !== initial) dirty = true;
    } else {
      data[el.name] = el.value;
      if (el.value !== el.defaultValue) dirty = true;
    }
  }
  return { data, dirty };
}
/** Puts a draft back into the form's fields; values the form no longer has are ignored. */
export function applyDraft(form: HTMLFormElement, data: DraftData) {
  for (const el of fields(form)) {
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      const v = data[`${el.name}=${el.value}`];
      if (typeof v === 'boolean') el.checked = v;
    } else if (el instanceof HTMLInputElement && el.type === 'radio') {
      if (data[el.name] !== undefined) el.checked = data[el.name] === el.value;
    } else {
      const v = data[el.name];
      if (typeof v === 'string') el.value = v;
    }
  }
}
