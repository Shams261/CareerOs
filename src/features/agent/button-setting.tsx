'use client';
import { useEffect, useState } from 'react';
import {
  BUTTON_EVENT,
  buttonContext,
  saveButtonPref,
  type ButtonPref,
  type Side,
} from './button-pref';

/**
 * Settings → Rumi button (WI-115): shown or not, and which corner, for this browser. Saves on
 * choice like the theme; the button on the page follows at once.
 */
/** The button's choice as it changes on this page, from the switch, the × or a drag. */
function useButtonPref(initial: ButtonPref) {
  const [pref, setPref] = useState(initial);
  useEffect(() => {
    const onPref = (e: Event) => setPref((e as CustomEvent<ButtonPref>).detail);
    window.addEventListener(BUTTON_EVENT, onPref);
    return () => window.removeEventListener(BUTTON_EVENT, onPref);
  }, []);
  return pref;
}
/** The row's line, kept in step with the switch. */
export function RumiButtonContext({ initial }: { initial: ButtonPref }) {
  return <>{buttonContext(useButtonPref(initial))}</>;
}

export function RumiButtonSetting({ initial }: { initial: ButtonPref }) {
  const pref = useButtonPref(initial);
  return (
    <span className="rumi-button-setting">
      <label className="check">
        <input
          type="checkbox"
          checked={pref.shown}
          onChange={(e) => saveButtonPref({ ...pref, shown: e.target.checked })}
        />
        On
      </label>
      <select
        aria-label="Corner of the Rumi button"
        value={pref.side}
        disabled={!pref.shown}
        onChange={(e) =>
          saveButtonPref({ ...pref, side: e.target.value as Side })
        }
      >
        <option value="right">Right corner</option>
        <option value="left">Left corner</option>
      </select>
    </span>
  );
}
