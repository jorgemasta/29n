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
  V3: { type: 'script', name: 'Sin marcas de partido', description: 'Ningún enfoque contiene el nombre, las siglas, los líderes ni los lemas de ningún partido. Si los tiene, se reescribe.' },
  V4: { type: 'script', name: 'Cifras redondeadas con respaldo', description: 'Las cifras de un enfoque van redondeadas («decenas de miles», «1,5 millones») y cada una queda a menos de 1,5 veces de alguna cifra de las citas de quien lo defiende. Una cifra sin respaldo o sin redondear obliga a reescribir.' },
  V5: { type: 'script', name: 'Longitud comparable', description: 'Cada enfoque no se aleja más de un 25 % de la longitud mediana de los 3 enfoques de su pregunta, para que la longitud no delate a nadie. Si se aleja, se reescribe.' },
  V6: { type: 'script', name: 'Plantilla común', description: 'Cada enfoque sigue la plantilla «qué / cómo / cifra», con «qué» y «cómo» rellenos (la cifra es opcional).' },
  V7: { type: 'script', name: 'Fuente oficial', description: 'El PDF se descarga por https desde un dominio oficial del partido. Si no, el programa entero se bloquea.' },
  V8: { type: 'script', name: 'Fuentes de la viabilidad', description: 'Las fuentes de la nota de viabilidad son de dominios institucionales y responden al comprobarlas. Las demás se eliminan. Una evaluación sin fuentes se repite hasta 2 veces; si sigue sin ellas, se publica marcada «Sin fuentes verificables».' },
  V9: { type: 'script', name: 'Dataset válido', description: 'El dataset cumple el esquema publicado: un único estado por partido y tema, y nada a medias.' },
  V10: { type: 'ai', name: 'Fidelidad', description: 'Una IA independiente comprueba que cada enfoque no añade, no omite y no cambia el sentido de las citas de los partidos que lo defienden de lleno.' },
  V11: { type: 'ai', name: 'Reconocibilidad frente al azar', description: 'Una IA recibe los 3 enfoques de la pregunta, anónimos y en órdenes distintos, con la lista de partidos, e intenta adivinar quién defiende cada uno, 4 veces. Si acierta tantas veces que por azar pasaría menos del 5 % de las veces, el enfoque delata a sus partidos y se reescribe (hasta 2 veces; si sigue, la pregunta no se publica).' },
  V12: { type: 'ai', name: 'Confirmar ausencia', description: 'Antes de decir que un partido no propone nada, se buscan palabras clave del tema en su programa y una IA lo revisa otra vez.' },
  V13: { type: 'ai', name: 'Viabilidad a ciegas', description: 'Dos evaluaciones independientes de la viabilidad, sin saber de qué partido es la medida. Si no coinciden, se publica «sin consenso».' },
};
