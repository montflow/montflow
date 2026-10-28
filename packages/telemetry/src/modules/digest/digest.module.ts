// oxlint-disable-next-line montflow/no-node-platform-imports -- hashing is a pure builtin call at the plugin composition root; the event module takes it as a seam, so its tests and reuse stay runtime-free.
import { createHash } from 'node:crypto';

/** SHA-256 text digest used for bodies that are not stored verbatim. */
export type Hash = (text: string) => string;

/** Default digest: lowercase hex SHA-256. */
export const sha256: Hash = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
