import test from 'node:test';import assert from 'node:assert/strict';
import {extractDocumentUrls,urlHash,checkLink,isSafePublicUrl} from '../../../src/lib/analytics/linkHealth.mjs';
import {summarizeContentHealth} from '../../../src/lib/analytics/contentHealth.mjs';
import {evaluate} from '../search-eval/run.mjs';
test('URL extraction deduplicates and strips punctuation',()=>assert.deepEqual(extractDocumentUrls('https://example.com/a, https://example.com/a'),['https://example.com/a']));
test('hash stable',()=>assert.equal(urlHash('x'),urlHash('x')));
test('private addresses rejected',async()=>{for(const u of ['http://127.0.0.1','http://10.0.0.1','http://[::1]','http://localhost'])assert.equal(await isSafePublicUrl(u),false)});
test('404 broken; 405 HEAD falls back GET',async()=>{const methods=[];const result=await checkLink('https://example.com',{safe:async()=>true,fetcher:async(_u,o)=>{methods.push(o.method);return {status:o.method==='HEAD'?405:404,ok:false}}});assert.deepEqual(methods,['HEAD','GET']);assert.equal(result.status,'broken')});
test('metrics and flags',()=>{const r=summarizeContentHealth([{id:'1',createdAt:'2026-01-01',filename:'a',links:[{status:'broken'}],lifecycleSuggestion:'archived',reviewRecords:[],duplicates:[]}],{now:new Date('2026-11-20')});assert.equal(r.counts.stale,1);assert.equal(r.counts.brokenLinks,1);assert.equal(r.counts.owned,0)});
test('offline evaluation',()=>{const r=evaluate([{id:'a',relevantIds:['1'],returnedIds:['2','1']}],2);assert.equal(r.mrr,0.5);assert.equal(r.recallAtK,1)});

test('age alone does not override Workstream B stale flag',()=>{const r=summarizeContentHealth([{id:'old',createdAt:'2025-01-01',reviewRecords:[],links:[]},{id:'flagged',createdAt:'2026-11-19',lifecycleSuggestion:'archived',reviewRecords:[],links:[]}],{now:new Date('2026-11-20')});assert.equal(r.counts.stale,1);assert.equal(r.documents[0].flags.stale,false);assert.equal(r.documents[1].flags.stale,true)});
