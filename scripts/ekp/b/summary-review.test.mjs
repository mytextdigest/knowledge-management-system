import test from 'node:test';
import assert from 'node:assert/strict';
import { summaryHash, effectiveSummaryStatus, validateSummaryEdit } from '../../../src/lib/governance/summaryReview.mjs';
test('new summary is pending', () => assert.equal(effectiveSummaryStatus('Hello', null), 'pending'));
test('approval applies only to exact summary', () => {
 const review = { status: 'approved', summaryHash: summaryHash('Hello') };
 assert.equal(effectiveSummaryStatus('Hello', review), 'approved');
 assert.equal(effectiveSummaryStatus('Hello changed', review), 'pending');
});
test('empty summary unavailable', () => assert.equal(effectiveSummaryStatus('', null), 'unavailable'));
test('rejects empty and oversized edits', () => { assert.equal(validateSummaryEdit(' '), false); assert.equal(validateSummaryEdit('a'.repeat(30001)), false); });
