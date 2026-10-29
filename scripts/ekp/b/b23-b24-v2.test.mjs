import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSetting } from '../../../src/lib/settings/registry.mjs';
import { requiresSummaryApproval } from '../../../src/lib/governance/summaryApprovalRules.mjs';
import { calculatePurgeAfter } from '../../../src/lib/lifecycle/softDelete.mjs';
import { isEligibleForPurge } from '../../../src/lib/lifecycle/purgePolicy.mjs';
test('B23 rules validate and resolve by department and category',()=>{
 const rules=[{required:false},{departmentIds:['power'],required:true},{departmentIds:['power'],categories:['critical'],required:true}];
 assert.deepEqual(validateSetting('summary.requireApproval',rules),rules);
 assert.equal(requiresSummaryApproval(rules,{departmentId:'power',category:'critical'}),true);
 assert.equal(requiresSummaryApproval(rules,{departmentId:'other',category:'other'}),false);
 assert.equal(requiresSummaryApproval(true,{}),true);
 assert.throws(()=>validateSetting('summary.requireApproval',[{required:'yes'}]));
});
test('B24 null retention never creates purge deadline',()=>{
 const now=new Date('2026-10-22T00:00:00Z');
 assert.equal(validateSetting('retention.deletedDays',null),null);
 assert.equal(calculatePurgeAfter(now,null),null);
 assert.equal(isEligibleForPurge({id:'x',orgId:'org',deletedAt:now,purgeAfter:null},new Date('2030-01-01')),false);
 assert.ok(calculatePurgeAfter(now,30)>now);
 assert.throws(()=>validateSetting('retention.deletedDays',-1));
});
