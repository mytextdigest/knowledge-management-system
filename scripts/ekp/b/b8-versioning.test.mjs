import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotVersion } from '../../../src/lib/lifecycle/versioning.mjs';

test('snapshot retains previous binary and metadata', () => {
 const snap = snapshotVersion({ id: 'd', filePath: 'old-key', filename: 'old.pdf', content: 'old', summary: 'old summary', status: 'ready' }, 2, 'u');
 assert.equal(snap.filePath, 'old-key');
 assert.equal(snap.versionNumber, 2);
 assert.equal(snap.createdById, 'u');
});
test('snapshot validates version numbers', () => {
 assert.throws(() => snapshotVersion({ id: 'd' }, 0, 'u'));
 assert.throws(() => snapshotVersion(null, 1, 'u'));
});
