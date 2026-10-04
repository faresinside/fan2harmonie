import { describe, expect, it, vi } from 'vitest';
import { envoyerFormulaire, lienMailto, SUJET_MESSAGE } from '../../src/lib/contact';

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
    await envoyerFormulaire('https://formspree.io/f/abc', d, envoi);
    expect(envoi).toHaveBeenCalledOnce();
    const [url, options] = envoi.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://formspree.io/f/abc');
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
