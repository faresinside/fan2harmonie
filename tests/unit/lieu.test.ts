import { describe, expect, it } from 'vitest';
import { resoudreLieu } from '../../src/lib/lieu';

describe('resoudreLieu', () => {
  it('lieu absent, vide ou fait d’espaces : le lieu habituel', () => {
    expect(resoudreLieu(undefined, 'A')).toBe('A');
    expect(resoudreLieu('', 'A')).toBe('A');
    expect(resoudreLieu('  ', 'A')).toBe('A');
  });

  it('autre lieu : conservé tel quel', () => {
    expect(resoudreLieu('B', 'A')).toBe('B');
  });
});
