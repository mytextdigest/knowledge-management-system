import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCompleteness, validMetadataRules } from '../../../src/lib/governance/completeness.mjs';
test('requires owner and category', () => {
 const c = evaluateCompleteness({ ownerId: null, category: 'policy' }, [{field:'ownerId'},{field:'category'}]);
 assert.deepEqual(c.missing,['ownerId']); assert.equal(c.completed,1);
});
test('department-scoped rules', () => {
 const c = evaluateCompleteness({departmentId:'dept-2',ownerId:null},[{field:'ownerId',departmentIds:['dept-1']}]);
 assert.equal(c.complete,true);
});
test('approved summary gate', () => {
 const c = evaluateCompleteness({},[],{requireSummaryApproval:true,summaryStatus:'pending'});
 assert.deepEqual(c.missing,['approvedSummary']);
});
test('rejects unknown fields', () => assert.equal(validMetadataRules([{field:'password'}]),false));
test('accepts category-scoped rules', () => assert.equal(validMetadataRules([{field:'ownerId',categories:['policy']}]),true));
