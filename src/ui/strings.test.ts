import { describe, expect, it } from 'vitest';
import { t } from './strings';

describe('UI strings', () => {
  it('has non-empty Polish strings', () => {
    for (const value of Object.values(t)) expect(value.trim()).not.toBe('');
  });
});
