import { createHash } from '../platform/index.js';

/** SHA-256 text digest used for bodies that are not stored verbatim. */
export type Hash = (text: string) => string;

/** Default digest: lowercase hex SHA-256. */
export const sha256: Hash = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
