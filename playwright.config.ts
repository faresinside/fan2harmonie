import { defineConfig, devices } from '@playwright/test';
import { JEUX } from './tests/fixtures/jeux';

/** Contenu réel : dist/ sur le port 4321. Chaque jeu de test : dist-fixture-<jeu>/ sur son port (tests/fixtures/jeux.ts). */
const serveur = (port: number, env: Record<string, string> = {}) => ({
  command: `npm run build && npm run preview -- --host 0.0.0.0 --port ${port}`,
  url: `http://localhost:${port}`,
  env,
  reuseExistingServer: false,
  timeout: 180_000,
});

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:4321' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    serveur(4321),
    ...Object.entries(JEUX).map(([jeu, port]) =>
      serveur(port, { CONTENT_FIXTURE: '1', CONTENT_FIXTURE_SET: jeu }),
    ),
  ],
});
