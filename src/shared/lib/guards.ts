// Socket payloads are untrusted `unknown` values. These guards narrow them before use.

export type UnknownRecord = Readonly<Record<string, unknown>>;

export const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isString = (value: unknown): value is string => typeof value === 'string';

/** `value` when it is a string, otherwise `undefined`. */
export const optionalString = (value: unknown): string | undefined => (isString(value) ? value : undefined);

/** The record's string field `key`, or `undefined`. */
export const stringField = (value: unknown, key: string): string | undefined =>
  isRecord(value) ? optionalString(value[key]) : undefined;

/** `value` when it is an array, otherwise an empty array. */
export const arrayOrEmpty = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
