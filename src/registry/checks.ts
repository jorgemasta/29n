// Plain-language description of the 13 verification checks (V1–V13), published on the methodology
// page and used to label the verification reports. Keep in sync with src/pipeline.
import type { z } from 'zod';
import type { Check } from '../dataset/schema';

type CheckId = z.infer<typeof Check>;

export interface CheckDescription {
  name: string;
  description: string;
  /** 'script': deterministic code, no AI. 'ia': an AI check. */
  type: 'script' | 'ai';
}

export const CHECKS: Record<CheckId, CheckDescription> = {
  V1: { type: 'script', name: 'La cita existe', description: 'Cada cita literal aparece tal cual en el PDF (entre 40 y 600 caracteres). Si no aparece, la postura se descarta.' },
  V2: { type: 'script', name: 'Página correcta', description: 'La página indicada es aquella en la que está la cita. Si no, se corrige automáticamente.' },
  V3: { type: 'script', name: 'Sin marcas del partido', description: 'El texto reescrito no contiene el nombre, siglas, líderes ni lemas del partido. Si los tiene, se reescribe.' },
  V4: { type: 'script', name: 'Cifras con respaldo', description: 'Toda cifra del texto reescrito aparece en la cita. Una cifra inventada obliga a reescribir.' },
  V5: { type: 'script', name: 'Longitud comparable', description: 'El texto tiene entre 25 y 70 palabras y no se aleja más de un 25 % de la mediana del tema (contando el texto nuevo), para que la longitud no delate a nadie. Si un texto ya publicado queda fuera al llegar otro, se anota en su informe.' },
  V6: { type: 'script', name: 'Plantilla común', description: 'El texto sigue la plantilla «qué / cómo / cifra» con todos sus campos rellenos.' },
  V7: { type: 'script', name: 'Fuente oficial', description: 'El PDF se descarga por https desde un dominio oficial del partido. Si no, el programa entero se bloquea.' },
  V8: { type: 'script', name: 'Fuentes de la viabilidad', description: 'Las fuentes de la nota de viabilidad son de dominios institucionales y responden al comprobarlas. Las demás se eliminan. Una evaluación sin fuentes se repite hasta 2 veces; si sigue sin ellas, se publica marcada «Sin fuentes verificables».' },
  V9: { type: 'script', name: 'Dataset válido', description: 'El dataset cumple el esquema publicado: un único estado por partido y tema, y nada a medias.' },
  V10: { type: 'ai', name: 'Fidelidad', description: 'Una IA independiente comprueba que el texto reescrito no añade, no omite y no cambia el sentido de las citas.' },
  V11: { type: 'ai', name: 'Reconocibilidad', description: 'Una IA recibe todos los textos del tema, anónimos, y la lista de partidos, e intenta adivinar de quién es cada uno, 3 veces con órdenes distintos. Si acierta las 3 con seguridad, el texto nuevo se reescribe; si es uno ya publicado, se anota en su informe y se corrige al volver a procesarlo. Nunca cambia el texto de otro partido sin dejar rastro.' },
  V12: { type: 'ai', name: 'Confirmar ausencia', description: 'Antes de decir que un partido no propone nada, se buscan palabras clave del tema en su programa y una IA lo revisa otra vez.' },
  V13: { type: 'ai', name: 'Viabilidad a ciegas', description: 'Dos evaluaciones independientes de la viabilidad, sin saber de qué partido es la medida. Si no coinciden, se publica «sin consenso».' },
};
