import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkflowDraft, parseDocumentId } from '../../../src/lib/workflows/uiValidation.mjs';
test('valid workflow definition',()=>assert.equal(validateWorkflowDraft('Review',[{name:'Legal',approverUserId:'u1'}]),null));
test('rejects missing reviewer',()=>assert.match(validateWorkflowDraft('Review',[{name:'Legal',approverUserId:''}]),/reviewer/));
test('rejects empty stages',()=>assert.match(validateWorkflowDraft('Review',[]),/1–12/));
test('validates document id',()=>{assert.equal(parseDocumentId('abc_123'),'abc_123');assert.equal(parseDocumentId('../secret'),null)});
