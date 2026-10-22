import { timingSafeEqual } from 'node:crypto';
export function authorizeGovernanceCron(header, secret) {
 if (typeof secret !== 'string' || secret.length < 24 || typeof header !== 'string') return false;
 const actual = Buffer.from(header);
 const expected = Buffer.from(`Bearer ${secret}`);
 return actual.length === expected.length && timingSafeEqual(actual, expected);
}
