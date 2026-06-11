const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const plans = [
    {
      name: "Starter Monthly",
      description: "Starter plan billed monthly",
      storageLimitGb: 5,
      priceCents: 300,
      stripePriceId: "price_1SoWHFJH2j6vucQnTIixfrD6",
      billingInterval: "month",
    },
    {
      name: "Starter Yearly",
      description: "Starter plan billed yearly",
      storageLimitGb: 5,
      priceCents: 2900,
      stripePriceId: "price_1T4VizJH2j6vucQni8gHl0Ft",
      billingInterval: "year",
    },
    {
      name: "Pro Monthly",
      description: "Pro plan billed monthly",
      storageLimitGb: 20,
      priceCents: 500,
      stripePriceId: "price_1SpPLUJH2j6vucQnGr03sJ94",
      billingInterval: "month",
    },
    {
      name: "Pro Yearly",
      description: "Pro plan billed yearly",
      storageLimitGb: 20,
      priceCents: 4800,
      stripePriceId: "price_1T4Vf1JH2j6vucQnYY4D6ikU",
      billingInterval: "year",
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { stripePriceId: plan.stripePriceId },
      update: plan,
      create: plan,
    });
    console.log(`Upserted: ${plan.name}`);
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
