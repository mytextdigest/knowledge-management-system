import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOwnerCandidate, validateStewards } from '../../../src/lib/governance/ownership.mjs';
const ok={orgId:'o',documentOrgId:'o',ownerIsMember:true,deletedAt:null};
test('valid org owner',()=>assert.equal(validateOwnerCandidate(ok),null));
test('rejects external owners and deleted docs',()=>{assert.match(validateOwnerCandidate({...ok,ownerIsMember:false}),/member/);assert.match(validateOwnerCandidate({...ok,deletedAt:new Date()}),/Deleted/);assert.match(validateOwnerCandidate({...ok,documentOrgId:'other'}),/organization/)});
test('steward ID validation',()=>{assert.equal(validateStewards(['a','b']),null);assert.match(validateStewards(['a','a']),/Duplicate/);assert.match(validateStewards(['']),/Invalid/)});
