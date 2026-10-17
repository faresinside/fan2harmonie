import { describe, expect, it } from 'vitest';
import { codeVerificationGoogle } from '../../src/lib/referencement';

describe('codeVerificationGoogle', () => {
  const code = 'abcdefghij_KLMNOP-1234567890';

  it('absent, vide ou blanc : aucune balise à écrire', () => {
    for (const v of [undefined, '', '   ']) expect(codeVerificationGoogle(v), String(v)).toBeUndefined();
  });

  it('un code valide est rendu tel quel, jamais une balise entière ni une valeur avec guillemets ou chevrons', () => {
    expect(codeVerificationGoogle(code)).toBe(code);
    for (const ko of [
      `<meta name="google-site-verification" content="${code}" />`,
      `"${code}"`,
      `${code}">`,
      'court',
    ]) {
      expect(codeVerificationGoogle(ko), ko).toBeUndefined();
    }
  });
});
