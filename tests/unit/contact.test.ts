import { describe, expect, it, vi } from 'vitest';
import { champsEnErreur, envoyerFormulaire, envoyerFormulaireDetaille, lienMailto, SUJET_MESSAGE } from '../../src/lib/contact';

describe('lienMailto', () => {
  it('construit un lien mailto avec le sujet du site, encodé', () => {
    expect(lienMailto('stephanie@example.fr')).toBe(
      'mailto:stephanie@example.fr?subject=Message%20depuis%20le%20site%20Fan%202%20Harmonie',
    );
  });

  it('ignore les espaces autour de l’adresse', () => {
    expect(lienMailto('  a@b.fr ')).toMatch(/^mailto:a@b\.fr\?/);
  });

  it('le sujet est celui du champ caché du formulaire', () => {
    expect(SUJET_MESSAGE).toBe('Message depuis le site Fan 2 Harmonie');
  });
});

describe('envoyerFormulaire', () => {
  const donnees = () => {
    const d = new FormData();
    d.set('nom', 'Camille');
    return d;
  };

  it('POST en JSON vers l’adresse d’envoi, avec les données du formulaire', async () => {
    const envoi = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    const d = donnees();
    await envoyerFormulaire('/api/contact.php', d, envoi);
    expect(envoi).toHaveBeenCalledOnce();
    const [url, options] = envoi.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/contact.php');
    expect(options.method).toBe('POST');
    expect(options.body).toBe(d);
    expect(options.headers).toEqual({ Accept: 'application/json' });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('réponse 2xx : succès', async () => {
    expect(await envoyerFormulaire('/x', donnees(), async () => new Response('{}', { status: 200 }))).toBe('succes');
  });

  it.each([400, 404, 422, 500, 503])('réponse %i : erreur', async (status) => {
    expect(await envoyerFormulaire('/x', donnees(), async () => new Response('{}', { status }))).toBe('erreur');
  });

  const json = (corps: string) =>
    async () => new Response(corps, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

  it('200 + JSON { ok: true } : succès', async () => {
    expect(await envoyerFormulaire('/x', donnees(), json('{"ok":true}'))).toBe('succes');
  });

  it('200 + JSON { ok: false, errors: […] } : erreur', async () => {
    const corps = '{"ok":false,"errors":[{"message":"x"}]}';
    expect(await envoyerFormulaire('/x', donnees(), json(corps))).toBe('erreur');
  });

  it('200 + JSON { ok: false } : erreur', async () => {
    expect(await envoyerFormulaire('/x', donnees(), json('{"ok":false}'))).toBe('erreur');
  });

  it.each(['{"errors":[{"message":"x"}]}', '{"errors":{"email":"invalide"}}'])(
    '200 + JSON avec erreurs non vides (%s) : erreur',
    async (corps) => {
      expect(await envoyerFormulaire('/x', donnees(), json(corps))).toBe('erreur');
    },
  );

  it('200 + JSON avec liste d’erreurs vide : succès', async () => {
    expect(await envoyerFormulaire('/x', donnees(), json('{"ok":true,"errors":[]}'))).toBe('succes');
  });

  it('200 + JSON mal formé (en-tête JSON) : erreur', async () => {
    expect(await envoyerFormulaire('/x', donnees(), json('{ok: tru'))).toBe('erreur');
  });

  it('200 + corps vide, en-tête JSON : erreur', async () => {
    expect(await envoyerFormulaire('/x', donnees(), json(''))).toBe('erreur');
  });

  it('200 + corps non JSON ou vide (sans en-tête JSON) : succès', async () => {
    const html = async () => new Response('<p>Merci</p>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    expect(await envoyerFormulaire('/x', donnees(), html)).toBe('succes');
    expect(await envoyerFormulaire('/x', donnees(), async () => new Response(null, { status: 200 }))).toBe('succes');
  });

  it('erreur réseau (requête rejetée) : erreur, jamais d’exception', async () => {
    const envoi = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await envoyerFormulaire('/x', donnees(), envoi)).toBe('erreur');
  });

  it('service qui ne répond pas : erreur après le délai', async () => {
    const envoi = (_: string, options?: RequestInit) =>
      new Promise<Response>((_, rejeter) => {
        options?.signal?.addEventListener('abort', () => rejeter(new DOMException('délai', 'TimeoutError')));
      });
    expect(await envoyerFormulaire('/x', donnees(), envoi, 20)).toBe('erreur');
  });
});

describe('champs signalés par le script de contact (réponse 422)', () => {
  const json = (status: number, corps: string) =>
    async () => new Response(corps, { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  const d = () => new FormData();

  it('422 avec des erreurs par champ : erreur, champs du formulaire listés dans l’ordre reçu', async () => {
    const corps = JSON.stringify({
      ok: false,
      errors: [
        { field: 'email', message: 'Adresse e-mail invalide.' },
        { field: 'message', message: 'Écrivez votre message.' },
      ],
    });
    expect(await envoyerFormulaireDetaille('/x', d(), json(422, corps))).toEqual({ issue: 'erreur', champs: ['email', 'message'] });
    expect(await envoyerFormulaire('/x', d(), json(422, corps))).toBe('erreur');
  });

  it('succès, erreur sans champ, corps illisible ou non JSON : aucun champ', async () => {
    expect(await envoyerFormulaireDetaille('/x', d(), json(200, '{"ok":true}'))).toEqual({ issue: 'succes', champs: [] });
    expect(await envoyerFormulaireDetaille('/x', d(), json(429, '{"ok":false,"errors":[{"message":"x"}]}'))).toEqual({ issue: 'erreur', champs: [] });
    expect(await envoyerFormulaireDetaille('/x', d(), json(422, '{pas du json'))).toEqual({ issue: 'erreur', champs: [] });
    expect(
      await envoyerFormulaireDetaille('/x', d(), async () => new Response('<p>x</p>', { status: 422, headers: { 'Content-Type': 'text/html' } })),
    ).toEqual({ issue: 'erreur', champs: [] });
    expect(
      await envoyerFormulaireDetaille('/x', d(), async () => {
        throw new TypeError('réseau');
      }),
    ).toEqual({ issue: 'erreur', champs: [] });
  });

  it('champsEnErreur : seulement les noms des champs du formulaire, sans doublon', () => {
    expect(
      champsEnErreur({
        errors: [
          { field: 'nom' },
          { field: 'consentement' },
          { field: '_gotcha' },
          { field: 'nom' },
          { field: 42 },
          { field: 'contact-nom"]' },
          'texte',
          null,
        ],
      }),
    ).toEqual(['nom', 'consentement']);
    expect(champsEnErreur(null)).toEqual([]);
    expect(champsEnErreur({ errors: { email: 'x' } })).toEqual([]);
  });
});