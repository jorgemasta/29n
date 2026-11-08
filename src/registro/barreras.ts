// Plain-language description of the 13 verification barriers (V1–V13), published on the methodology
// page and used to label the verification reports. Keep in sync with src/pipeline.
import type { z } from 'zod';
import type { Barrera } from '../dataset/esquema';

type IdBarrera = z.infer<typeof Barrera>;

export interface DescripcionBarrera {
  nombre: string;
  descripcion: string;
  /** 'script': deterministic code, no AI. 'ia': an AI check. */
  tipo: 'script' | 'ia';
}

export const BARRERAS: Record<IdBarrera, DescripcionBarrera> = {
  V1: { tipo: 'script', nombre: 'La cita existe', descripcion: 'Cada cita literal aparece tal cual en el PDF (entre 40 y 600 caracteres). Si no aparece, la postura se descarta.' },
  V2: { tipo: 'script', nombre: 'Página correcta', descripcion: 'La página indicada es aquella en la que está la cita. Si no, se corrige automáticamente.' },
  V3: { tipo: 'script', nombre: 'Sin marcas del partido', descripcion: 'El texto reescrito no contiene el nombre, siglas, líderes ni lemas del partido. Si los tiene, se reescribe.' },
  V4: { tipo: 'script', nombre: 'Cifras con respaldo', descripcion: 'Toda cifra del texto reescrito aparece en la cita. Una cifra inventada obliga a reescribir.' },
  V5: { tipo: 'script', nombre: 'Longitud comparable', descripcion: 'El texto tiene entre 25 y 70 palabras y no se aleja más de un 25 % de la mediana del tema, para que la longitud no delate a nadie.' },
  V6: { tipo: 'script', nombre: 'Plantilla común', descripcion: 'El texto sigue la plantilla «qué / cómo / cifra» con todos sus campos rellenos.' },
  V7: { tipo: 'script', nombre: 'Fuente oficial', descripcion: 'El PDF se descarga por https desde un dominio oficial del partido. Si no, el programa entero se bloquea.' },
  V8: { tipo: 'script', nombre: 'Fuentes de la viabilidad', descripcion: 'Las fuentes de la nota de viabilidad son de dominios institucionales y responden al comprobarlas. Las demás se eliminan.' },
  V9: { tipo: 'script', nombre: 'Dataset válido', descripcion: 'El dataset cumple el esquema publicado: un único estado por partido y tema, y nada a medias.' },
  V10: { tipo: 'ia', nombre: 'Fidelidad', descripcion: 'Una IA independiente comprueba que el texto reescrito no añade, no omite y no cambia el sentido de las citas.' },
  V11: { tipo: 'ia', nombre: 'Reconocibilidad', descripcion: 'Una IA intenta adivinar de qué partido es cada texto del tema. Si acierta con facilidad, el texto se reescribe.' },
  V12: { tipo: 'ia', nombre: 'Confirmar ausencia', descripcion: 'Antes de decir que un partido no propone nada, se buscan palabras clave del tema en su programa y una IA lo revisa otra vez.' },
  V13: { tipo: 'ia', nombre: 'Viabilidad a ciegas', descripcion: 'Dos evaluaciones independientes de la viabilidad, sin saber de qué partido es la medida. Si no coinciden, se publica «sin consenso».' },
};
