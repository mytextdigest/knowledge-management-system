import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { processKnowledgeContext } from '../../worker/knowledgeContext.js';
const prisma=new PrismaClient();
const orgArg=process.argv.find(a=>a.startsWith('--org='));
const orgId=orgArg?.split('=')[1];
if(!orgId) throw new Error('Usage: npm run task9:rebuild -- --org=<ORG_ID>');
const docs=await prisma.document.findMany({where:{orgId,scope:'repository',lifecycle:'published'},select:{id:true}});
for(const [i,doc] of docs.entries()){ await processKnowledgeContext(doc.id); console.log(`[${i+1}/${docs.length}] ${doc.id}`); }
console.log(`Knowledge context rebuilt for ${docs.length} document(s).`);
await prisma.$disconnect();
