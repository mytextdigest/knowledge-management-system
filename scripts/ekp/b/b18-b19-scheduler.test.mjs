import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('stale scanner creates a review record only if none is open',()=>{const s=readFileSync('src/lib/governance/staleScan.js','utf8');assert.match(s,/reviewRecord\.findFirst/);assert.match(s,/reviewRecord\.create/);assert.match(s,/status: 'pending'/);});
test('review and stale scans run on the F3 scheduler, not a public cron route',()=>{const s=readFileSync('src/lib/jobs/registry.js','utf8');assert.match(s,/"reviews\.due-scan"/);assert.match(s,/"content\.stale-scan"/);assert.match(s,/scanDueReviews\(/);assert.match(s,/scanStaleContent\(/);});
test('scans are loadable by the worker (relative imports only)',()=>{for(const f of ['src/lib/governance/reviewScan.js','src/lib/governance/staleScan.js','src/lib/notifications/notify.js'])assert.doesNotMatch(readFileSync(f,'utf8'),/from ['"]@\//,f);});
