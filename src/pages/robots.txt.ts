/** robots.txt, généré à la construction (sortie statique dist/robots.txt). */
import type { APIRoute } from 'astro';
import { site } from '../config/site';
import { robotsTxt } from '../lib/robots';

export const GET: APIRoute = () =>
  new Response(robotsTxt(site.url), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
