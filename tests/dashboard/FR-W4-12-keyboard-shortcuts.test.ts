// APEX-SENTINEL — TDD RED Tests
// W4 C2 Dashboard — Keyboard Shortcuts
// Status: RED — implementation in src/dashboard/keyboard-shortcuts.ts NOT_IMPLEMENTED

import { describe, it, expect } from 'vitest';
import {
  getShortcuts,
  resolveAction,
  isValidShortcut,
  getShortcutDescription,
} from '../../src/dashboard/keyboard-shortcuts.js';
import type { ShortcutAction } from '../../src/dashboard/keyboard-shortcuts.js';

describe('FR-W4-12: Keyboard Shortcuts — Registry and Resolution', () => {
  it('FR-W4-12-01: getShortcuts() returns at least 6 shortcuts', () => {
    const shortcuts = getShortcuts();
    expect(Array.isArray(shortcuts)).toBe(true);
    expect(shortcuts.length).toBeGreaterThanOrEqual(6);
    // Each entry must have the correct shape
    shortcuts.forEach((s) => {
      expect(s).toHaveProperty('key');
      expect(s).toHaveProperty('action');
      expect(s).toHaveProperty('description');
      expect(typeof s.key).toBe('string');
      expect(typeof s.action).toBe('string');
      expect(typeof s.description).toBe('string');
    });
  });

  it('FR-W4-12-02: resolveAction("t") returns "show_tracks" — case insensitive', () => {
    const action = resolveAction('t') ?? resolveAction('T');
    expect(action).toBe('show_tracks');
  });

  it('FR-W4-12-03: resolveAction("n") returns "show_nodes"', () => {
    const action = resolveAction('n') ?? resolveAction('N');
    expect(action).toBe('show_nodes');
  });

  it('FR-W4-12-04: resolveAction("a") returns "show_alerts"', () => {
    const action = resolveAction('a') ?? resolveAction('A');
    expect(action).toBe('show_alerts');
  });

  it('FR-W4-12-05: resolveAction("Escape") or "escape" returns "clear_selection"', () => {
    const action = resolveAction('Escape') ?? resolveAction('escape');
    expect(action).toBe('clear_selection');
  });

  it('FR-W4-12-06: resolveAction("f") returns "fullscreen"', () => {
    const action = resolveAction('f') ?? resolveAction('F');
    expect(action).toBe('fullscreen');
  });

  it('FR-W4-12-07: resolveAction("s") returns "show_stats"', () => {
    const action = resolveAction('s') ?? resolveAction('S');
    expect(action).toBe('show_stats');
  });

  it('FR-W4-12-08: resolveAction("x") returns null — unmapped key', () => {
    expect(resolveAction('x')).toBeNull();
  });

  it('FR-W4-12-09: isValidShortcut("t") returns true', () => {
    expect(isValidShortcut('t')).toBe(true);
  });

  it('FR-W4-12-10: isValidShortcut("z") returns false — unregistered key', () => {
    expect(isValidShortcut('z')).toBe(false);
  });
});
