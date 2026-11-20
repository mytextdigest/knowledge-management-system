import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNotificationInput } from '../../../src/lib/notifications/types.mjs';
const valid = { orgId: 'org1', userIds: ['u1'], type: 'ownership.assigned', title: 'Assigned', link: '/org/abc' };
test('accepts known in-app event', () => assert.equal(validateNotificationInput(valid), null));
test('rejects cross-origin links', () => assert.match(validateNotificationInput({ ...valid, link: '//evil.example' }), /link/));
test('rejects unknown type', () => assert.match(validateNotificationInput({ ...valid, type: 'unknown' }), /type/));
test('rejects too many recipients', () => assert.match(validateNotificationInput({ ...valid, userIds: Array(101).fill('x') }), /recipients/));
