import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

// Interactive transactions ($transaction(async (tx) => ...)) run their queries
// one round-trip at a time; against the hosted database a workflow decision
// (about a dozen queries, Serializable) can take longer than Prisma's 5 s
// default and fail with P2028 "Transaction not found". Calls that pass their
// own maxWait/timeout keep them.
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ transactionOptions: { maxWait: 10_000, timeout: 20_000 } });

if (process.env.NODE_ENV !== "production")
  globalForPrisma.prisma = prisma;
