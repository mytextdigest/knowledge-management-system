// Shared, framework-independent registry: safe to import from workers.
const nonNegativeInt = (x) => Number.isInteger(x) && x >= 0;
const positiveInt = (x) => Number.isInteger(x) && x > 0;
const boolean = (x) => typeof x === 'boolean';
const stringArray = (x) => Array.isArray(x) && x.every(y => typeof y === 'string');
import { validMetadataRules } from '../governance/completeness.mjs';
const metadataRules = validMetadataRules;
import { validSummaryApprovalRules } from '../governance/summaryApprovalRules.mjs';
const staleRules = (x) => x && typeof x === 'object' && nonNegativeInt(x.noUpdateDays) && nonNegativeInt(x.noViewDays);
export const SETTINGS_REGISTRY = Object.freeze({
 'summary.requireApproval': { label:'Require summary approval', default:false, validate:validSummaryApprovalRules },
 'metadata.requiredFields': { label:'Required metadata rules', default:[], validate:metadataRules },
 'ownership.default': { label:'Default document owner', default:'uploader', validate:x => ['uploader','department_owner'].includes(x) },
 'retention.deletedDays': { label:'Deleted document retention (days)', default:30, validate:x => x === null || (positiveInt(x) && x <= 36500) },
 'stale.rules': { label:'Stale document rules', default:{noUpdateDays:365,noViewDays:180}, validate:staleRules },
 'classification.categoryThreshold': { label:'Category classification threshold', default:Number(process.env.CLASSIFICATION_CATEGORY_THRESHOLD || 0.72), validate:x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1 },
 'classification.departmentThreshold': { label:'Department classification threshold', default:Number(process.env.CLASSIFICATION_DEPARTMENT_THRESHOLD || 0.78), validate:x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1 },
 'duplicates.threshold': { label:'Duplicate similarity threshold', default:Number(process.env.CLASSIFICATION_DUPLICATE_THRESHOLD || 0.92), validate:x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1 },
 'sharepoint.storeOriginals': { label:'Store SharePoint originals', default:false, validate:boolean },
 'sharepoint.syncIntervalMinutes': { label:'SharePoint sync interval (minutes)', default:60, validate:positiveInt },
});
export function validateSetting(key, value) {
 const entry=SETTINGS_REGISTRY[key];
 if (!entry) throw new Error(`Unknown governance setting: ${key}`);
 if (!entry.validate(value)) throw new Error(`Invalid value for ${key}`);
 return value;
}
