// Writes the public JSON Schema of the dataset from the zod source of truth.
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { Dataset } from '../src/dataset/esquema';

const esquema = z.toJSONSchema(Dataset, { target: 'draft-2020-12', io: 'output' });
await writeFile('data/dataset.schema.json', JSON.stringify(esquema, null, 2) + '\n');
console.log('data/dataset.schema.json');
