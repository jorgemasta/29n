// Display labels shared by the client app and the static pages (no DOM code here).
import type { SourceType } from '../dataset/schema';

export const SOURCE_LABEL: Record<SourceType, string> = {
  'manifesto-29n': 'Programa 29N',
  'manifesto-2023': 'Programa de 2023',
  'party-document': 'Documento del partido',
  statements: 'Declaraciones públicas',
};
