import {
  ImageIcon,
  Keyboard,
  Quote,
  Sun,
  ALargeSmall,
  UserRound,
} from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { ShortcutsToggle } from '@/components/shortcuts-toggle';
import { DailyLineToggle } from '@/features/today/daily-line-card';
import { SettingRow } from '../rows';
import { dayPrintAction } from '@/features/day-print/actions';
import { ThemeSwitch } from '../theme-switch';
import { TextSizeSwitch } from '../text-size-switch';
import { textSizeLabel } from '@/lib/theme';
import type { SettingsView } from '../page-data';

/** Appearance: theme, text size, shortcuts, name, the daily line and the day print. */
export function AppearanceGroup({ v }: { v: SettingsView }) {
  const { user, theme, size } = v;
  return (
    <section
      id="appearance"
      className="settings-group"
      aria-labelledby="theme-heading"
    >
      <div className="agenda-head">
        <h2 id="theme-heading" className="agenda-heading">
          Appearance
        </h2>
      </div>
      <ul className="plain-list attention-list">
        <SettingRow
          source="practice"
          icon={<Sun size={22} />}
          label="Theme"
          title={theme === 'dark' ? 'Dark' : 'Light'}
          context="Light is the default; Dark is saved for this browser"
          control={<ThemeSwitch theme={theme} />}
        />
        <SettingRow
          source="practice"
          icon={<ALargeSmall size={22} />}
          label="Text size"
          title={textSizeLabel(size)}
          context="Larger steps the whole app up on screens wider than a phone; kept for this browser"
          control={<TextSizeSwitch size={size} />}
        />
        <SettingRow
          source="practice"
          icon={<Keyboard size={22} />}
          label="Keyboard shortcuts"
          title="Single-key shortcuts on this device"
          context="N, S, J, K, D, C; ? always lists them"
          control={<ShortcutsToggle label="On" className="check" />}
        />
        <SettingRow
          source="practice"
          icon={<UserRound size={22} />}
          label="Name"
          title={user.name}
          context="What Silsila calls you on Today"
          panel="name"
        />
        <SettingRow
          source="practice"
          icon={<Quote size={22} />}
          label="Daily line"
          title="A greeting and a quotation on Today"
          context="Changes with the part of the day; kept for this browser"
          control={<DailyLineToggle label="On" className="check" />}
        />
        <SettingRow
          source="weekly"
          icon={<ImageIcon size={22} />}
          label="Day print"
          title="A print of each closed day"
          context={
            user.dayPrint === false
              ? 'Off'
              : user.dayPrint
                ? 'On'
                : 'On (default)'
          }
          control={
            <ActionForm action={dayPrintAction} label="Day print">
              <Button
                className="secondary small"
                name="choice"
                value={user.dayPrint === false ? 'on' : 'off'}
              >
                {user.dayPrint === false ? 'Turn on' : 'Turn off'}
              </Button>
            </ActionForm>
          }
        />
      </ul>
    </section>
  );
}
