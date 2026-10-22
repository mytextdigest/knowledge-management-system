import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeGovernanceCron } from '../../../src/lib/governance/cronAuth.mjs';
import { readFileSync } from 'node:fs';
test('cron requires a sufficiently long secret',()=>{assert.equal(authorizeGovernanceCron('Bearer short','short'),false);assert.equal(authorizeGovernanceCron(null,'x'.repeat(32)),false);});
test('cron accepts matching bearer only',()=>{const key='x'.repeat(32);assert.equal(authorizeGovernanceCron(`Bearer ${key}`,key),true);assert.equal(authorizeGovernanceCron(`Bearer ${'y'.repeat(32)}`,key),false);});
test('stale scanner creates a review record only if none is open',()=>{const s=readFileSync('src/lib/governance/staleScan.js','utf8');assert.match(s,/reviewRecord\.findFirst/);assert.match(s,/reviewRecord\.create/);assert.match(s,/status: 'pending'/);});
test('daily scheduler is secret protected',()=>{const s=readFileSync('src/app/api/cron/governance/route.js','utf8');assert.match(s,/authorizeGovernanceCron/);assert.match(s,/scanDueReviews/);assert.match(s,/scanStaleContent/);});
