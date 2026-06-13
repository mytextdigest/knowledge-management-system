require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function backfill() {
  const chunks = await prisma.$queryRaw`
    SELECT id, embedding FROM "Chunk"
    WHERE embedding IS NOT NULL
      AND "embedding_vec" IS NULL
  `;

  console.log(`Found ${chunks.length} chunks to backfill`);

  let done = 0;
  let skipped = 0;

  for (const chunk of chunks) {
    const embArr = typeof chunk.embedding === 'string'
      ? JSON.parse(chunk.embedding)
      : chunk.embedding;

    if (!Array.isArray(embArr) || embArr.length === 0) {
      console.warn(`Skipping chunk ${chunk.id}: invalid embedding`);
      skipped++;
      continue;
    }

    const embStr = JSON.stringify(embArr);
    await prisma.$executeRaw`
      UPDATE "Chunk" SET "embedding_vec" = ${embStr}::vector WHERE id = ${chunk.id}
    `;

    done++;
    if (done % 100 === 0) {
      console.log(`Backfilled ${done}/${chunks.length}`);
    }
  }

  console.log(`Done. Backfilled: ${done}, Skipped: ${skipped}`);
}

backfill()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
