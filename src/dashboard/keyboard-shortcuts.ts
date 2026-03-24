// APEX-SENTINEL — Keyboard Shortcuts
// W4 C2 Dashboard — FR-W4-12

export type ShortcutAction =
  | 'show_tracks'
  | 'show_nodes'
  | 'show_alerts'
  | 'clear_selection'
  | 'fullscreen'
  | 'show_stats';

export interface ShortcutEntry {
  key: string;
  action: ShortcutAction;
  description: string;
}

const SHORTCUT_REGISTRY: ShortcutEntry[] = [
  { key: 't', action: 'show_tracks', description: 'Show tracks panel' },
  { key: 'n', action: 'show_nodes', description: 'Show nodes panel' },
  { key: 'a', action: 'show_alerts', description: 'Show alerts panel' },
  { key: 'escape', action: 'clear_selection', description: 'Clear current selection' },
  { key: 'f', action: 'fullscreen', description: 'Toggle fullscreen mode' },
  { key: 's', action: 'show_stats', description: 'Show statistics panel' },
];

const ACTION_MAP: Map<string, ShortcutAction> = new Map(
  SHORTCUT_REGISTRY.map((e) => [e.key.toLowerCase(), e.action]),
);

function normaliseKey(key: string): string {
  return key.toLowerCase();
}

export function getShortcuts(): ShortcutEntry[] {
  return SHORTCUT_REGISTRY.slice();
}

export function resolveAction(key: string): ShortcutAction | null {
  return ACTION_MAP.get(normaliseKey(key)) ?? null;
}

export function isValidShortcut(key: string): boolean {
  return resolveAction(key) !== null;
}

export function getShortcutDescription(key: string): string | null {
  const normalised = normaliseKey(key);
  const entry = SHORTCUT_REGISTRY.find((e) => e.key === normalised);
  return entry?.description ?? null;
}
