// robots.txt from the launch rules: only the checked production build is indexable.
import type { APIRoute } from 'astro';
import { indexable } from '../transparencia/datos';
import { textoRobots } from '../lanzamiento';

export const GET: APIRoute = () => new Response(textoRobots(indexable), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
