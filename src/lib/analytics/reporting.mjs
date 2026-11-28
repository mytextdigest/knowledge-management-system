import { createHash,randomBytes } from 'node:crypto';
export const hashKey=key=>createHash('sha256').update(key).digest('hex');
export const newKey=()=> 'kms_'+randomBytes(32).toString('hex');
export async function authenticateReporting(db,header){
 const match=/^Bearer (kms_[a-f0-9]{64})$/.exec(header||'');if(!match)return null;
 return db.reportingApiKey.findFirst({where:{keyHash:hashKey(match[1]),revokedAt:null},select:{id:true,orgId:true}});
}
export function pagination(p){const page=Number(p.get('page')||1),size=Number(p.get('pageSize')||100);if(!Number.isSafeInteger(page)||page<1||page>100000||!Number.isSafeInteger(size)||size<1||size>500)throw Error('Invalid pagination');return {skip:(page-1)*size,take:size,page};}
