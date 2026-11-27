import test from 'node:test';
import assert from 'node:assert/strict';
import { planSourceTagMappings } from '../../../src/lib/taxonomy/import/sourceTagMapping.mjs';
const terms=[{id:'a',label:'Energy',status:'active',parentId:null,termStoreGuid:'ABC'}, {id:'b',label:'Safety',status:'active',parentId:'a'}, {id:'c',label:'Safety',status:'active',parentId:null}, {id:'d',label:'Old',status:'deprecated',parentId:null}];
test('GUID takes precedence over ambiguous label',()=> assert.equal(planSourceTagMappings({tags:[{label:'Safety',termGuid:'abc'}],terms}).mapped[0].termId,'a'));
test('ambiguous leaf labels are not guessed',()=> assert.equal(planSourceTagMappings({tags:[{label:'Safety'}],terms}).ambiguous.length,1));
test('full label path resolves hierarchy',()=> assert.equal(planSourceTagMappings({tags:[{label:'Energy > Safety'}],terms}).mapped[0].termId,'b'));
test('deprecated terms are excluded',()=> assert.equal(planSourceTagMappings({tags:[{label:'Old'}],terms}).unmatched.length,1));
test('mismatched term set is not mapped',()=>assert.equal(planSourceTagMappings({tags:[{label:'Energy',termSetGuid:'different'}],terms,termSetGuid:'expected'}).unmatched[0].reason,'different-term-set'));
