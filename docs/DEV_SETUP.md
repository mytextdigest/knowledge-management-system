# KMS — Local Development Setup

## Prerequisites
- Node.js v20+ ([download](https://nodejs.org))
- Git
- Access to the private GitHub repo

---

## 1. Clone & Install

```bash
git clone https://github.com/mytextdigest/knowledge-management-system.git kms
cd kms
npm install
```

---

## 2. Environment

Place the `.env` file (from the setup email) in the project root.

```bash
# Verify it's in the right place
ls .env
```

---

## 3. Database

```bash
npx prisma generate
npx prisma db push
```

---

## 4. Run the App

```bash
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000)

---

## 5. Stripe Webhooks (only needed for billing/subscription testing)

Install the Stripe CLI: https://stripe.com/docs/stripe-cli

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the `whsec_...` secret it prints and temporarily set it in your `.env`:
```
STRIPE_WEBHOOK_SECRET="whsec_..."
```

---

## 6. Worker (only needed for document processing testing)

The production worker runs on EC2. To run it locally:

```bash
node worker/index.js
```

> The worker polls SQS, so it shares the same queue as production. Coordinate with the team before running locally to avoid double-processing jobs.

---

## 7. SSH into the EC2 Worker (deployments only)

```bash
chmod 400 kms-bg-worker-key.pem
ssh -i kms-bg-worker-key.pem ubuntu@YOUR_EC2_IP
```

Update and restart the worker after merging to main:

```bash
cd ~/kms
git pull origin main
npm install --production
npx prisma generate
pm2 restart kms-worker
pm2 save
pm2 logs kms-worker
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `prisma: command not found` | Run `npm install` first |
| `Region is missing` AWS error | Check `.env` has `AWS_REGION=us-east-2` |
| Stripe webhook 400 error | Make sure `stripe listen` is running and `STRIPE_WEBHOOK_SECRET` matches |
| DB connection error | Check `DATABASE_URL` in `.env` is correct |
