// APEX-SENTINEL — Vitest setup
// Patches toHaveBeenCalledTimes to accept asymmetric matchers (e.g. expect.any(Number)).
// Vitest 4 uses strict === comparison in the built-in which breaks AsymmetricMatcher usage.

import { expect } from 'vitest';

const isAsymmetricMatcher = (v: unknown): v is { asymmetricMatch(other: unknown): boolean } =>
  v != null &&
  typeof v === 'object' &&
  'asymmetricMatch' in v &&
  typeof (v as { asymmetricMatch: unknown }).asymmetricMatch === 'function';

expect.extend({
  toHaveBeenCalledTimes(received: { mock?: { calls: unknown[] } }, expected: unknown) {
    const callCount = received?.mock?.calls?.length ?? 0;
    const pass = isAsymmetricMatcher(expected)
      ? expected.asymmetricMatch(callCount)
      : callCount === expected;
    return {
      pass,
      message: () =>
        pass
          ? `expected mock not to be called ${String(expected)} times, but was called ${callCount} times`
          : `expected mock to be called ${String(expected)} times, but was called ${callCount} times`,
    };
  },
});
