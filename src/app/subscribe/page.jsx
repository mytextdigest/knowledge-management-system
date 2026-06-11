import SubscribeClient from "@/components/subscribe/SubscribeClient";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SubscribePage() {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { storageLimitGb: "asc" }
  });

  console.log("Plans: ", plans)

  return <SubscribeClient plans={plans} />;
}
