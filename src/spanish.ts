// Small Spanish text helpers for voter-facing copy (result, share card, province notice).

/** "1 temática", "3 temáticas". */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "A", "A y B", "A, B y C". */
export const joinList = (l: readonly string[]): string => (l.length <= 1 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} y ${l.at(-1)}`);
