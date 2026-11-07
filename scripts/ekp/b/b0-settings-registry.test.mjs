import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_REGISTRY, validateSetting } from '../../../src/lib/settings/registry.mjs';
test('all registered defaults validate',()=>{for(const [key,entry] of Object.entries(SETTINGS_REGISTRY)) assert.doesNotThrow(()=>validateSetting(key,entry.default),key)});
test('invalid governance rules are rejected',()=>{assert.throws(()=>validateSetting('metadata.requiredFields',[{field:3}]));assert.throws(()=>validateSetting('retention.deletedDays',-1));assert.throws(()=>validateSetting('unknown.key',true));});
