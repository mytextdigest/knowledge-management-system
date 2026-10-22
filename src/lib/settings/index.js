import { prisma } from '../prisma.mjs';
import { SETTINGS_REGISTRY, validateSetting } from './registry.mjs';
import { logAudit } from '../auditLog.js';
import { AUDIT_EVENTS } from '../audit/events.js';
const cache = new Map();
const TTL_MS = 60_000;
export async function getSetting(orgId, key) {
 const def=SETTINGS_REGISTRY[key];
 if (!def) throw new Error(`Unknown governance setting: ${key}`);
 const cacheKey=`${orgId}:${key}`;
 const cached=cache.get(cacheKey);
 if (cached && cached.expires > Date.now()) return structuredClone(cached.value);
 const row=await prisma.orgSetting.findUnique({where:{orgId_key:{orgId,key}}});
 const value=row ? row.value : def.default;
 cache.set(cacheKey,{value,expires:Date.now()+TTL_MS});
 return structuredClone(value);
}
export async function setSetting({orgId,key,value,actorUserId}) {
 validateSetting(key,value);
 if (!actorUserId) throw new Error('actorUserId is required');
 const previous=await prisma.orgSetting.findUnique({where:{orgId_key:{orgId,key}}});
 const saved=await prisma.orgSetting.upsert({
  where:{orgId_key:{orgId,key}},
  create:{orgId,key,value,updatedBy:actorUserId},
  update:{value,updatedBy:actorUserId},
 });
 cache.delete(`${orgId}:${key}`);
 await logAudit({orgId,actorUserId,action:AUDIT_EVENTS.CONFIG_CHANGED,entityType:'setting',entityId:saved.id,before:{key,value:previous?.value ?? SETTINGS_REGISTRY[key].default},after:{key,value}});
 return saved.value;
}
