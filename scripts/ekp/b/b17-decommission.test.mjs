import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDecommissionTarget,requiresDecommissionApproval} from '../../../src/lib/workflows/engine.mjs';
test('published may archive or retire',()=>{assert.equal(validateDecommissionTarget('published','archived'),true);assert.equal(validateDecommissionTarget('published','retired'),true)});
test('archived may retire',()=>assert.equal(validateDecommissionTarget('archived','retired'),true));
test('invalid lifecycle transitions rejected',()=>{assert.equal(validateDecommissionTarget('draft','retired'),false);assert.equal(validateDecommissionTarget('retired','archived'),false)});
test('only decommission definitions gate',()=>{assert.equal(requiresDecommissionApproval('decommission','retired'),true);assert.equal(requiresDecommissionApproval('publish','retired'),false)});
