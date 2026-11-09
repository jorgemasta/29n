// robots.txt from the launch rules: only the checked production build is indexable.
import type { APIRoute } from 'astro';
import { indexable } from '../transparency/data';
import { robotsText } from '../launch';

export const GET: APIRoute = () => new Response(robotsText(indexable), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
