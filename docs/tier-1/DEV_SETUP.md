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

The app lives at `/home/ubuntu/kms-dev` on the box, checked out on the `dev` branch, running under pm2 as `kms-dev-worker`.

Update and restart the worker after merging to dev:

```bash
cd /home/ubuntu/kms-dev
git pull origin dev
npm install --production
npx prisma generate
pm2 restart kms-dev-worker
pm2 save
pm2 logs kms-dev-worker
```

---

## 8. Scheduled jobs on the EC2 worker box

The worker (`worker/index.js`) only consumes SQS jobs — it has no built-in scheduler. Any time-based
maintenance job (like stale-document detection) runs from the OS crontab on the same EC2 instance instead,
independent of the worker process.

### Stale-document detection

`scripts/task-8/flag-stale-documents.mjs` flags published documents that haven't been cited in chat for
180+ days (`KMS_STALE_DAYS` env var to change the threshold). It's a standalone script (own Prisma client),
so it doesn't need the worker or SQS running to work.

Installed as a crontab entry (as the `ubuntu` user) to run daily at 3am UTC — the box's system timezone is
already UTC, so no `CRON_TZ` conversion is needed:

```bash
crontab -l
# 0 3 * * * cd /home/ubuntu/kms-dev && /usr/bin/node scripts/task-8/flag-stale-documents.mjs >> /home/ubuntu/kms-dev/logs/stale-docs.log 2>&1
```

To re-add it (e.g. after a box rebuild/replacement, since crontab entries aren't version-controlled):

```bash
CRON_LINE='0 3 * * * cd /home/ubuntu/kms-dev && /usr/bin/node scripts/task-8/flag-stale-documents.mjs >> /home/ubuntu/kms-dev/logs/stale-docs.log 2>&1'
(crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
crontab -l   # verify
```

Check it's running: `tail -f /home/ubuntu/kms-dev/logs/stale-docs.log` after 3am UTC, or run the script
manually to test immediately: `cd /home/ubuntu/kms-dev && node scripts/task-8/flag-stale-documents.mjs`.

### Verifying the worker + cron survive a reboot

Two independent things need to be true for a cold start (reboot / stop-start) to fully recover:

1. **The worker process itself.** `pm2 save` snapshots the process list; a systemd unit (from `pm2 startup`)
   resurrects it on boot. Check both:
   ```bash
   systemctl is-enabled pm2-ubuntu   # should print "enabled"
   systemctl is-active pm2-ubuntu    # should print "active"
   ```
   If `pm2 startup` was never run, `pm2 save` alone is not enough — the process won't come back after a
   reboot. Fix with `pm2 startup` (run the `sudo ...` command it prints), then `pm2 save` again.

2. **The crontab entry.** Cron is a systemd-enabled service independent of pm2/Node, so a plain user
   crontab survives reboots and stop/start on its own:
   ```bash
   systemctl is-enabled cron   # should print "enabled"
   systemctl is-active cron    # should print "active"
   ```
   It does **not** survive an instance *replacement* (new AMI, autoscaling swap) since it isn't
   version-controlled — re-add it from this doc if that ever happens.

Both were confirmed enabled/active as of 2026-09-03. The only way to be fully certain the worker
resurrects correctly (rather than just confirming the systemd wiring exists) is an actual reboot test —
worth doing deliberately during a low-traffic window rather than discovering it during an unplanned one.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `prisma: command not found` | Run `npm install` first |
| `Region is missing` AWS error | Check `.env` has `AWS_REGION=us-east-2` |
| Stripe webhook 400 error | Make sure `stripe listen` is running and `STRIPE_WEBHOOK_SECRET` matches |
| DB connection error | Check `DATABASE_URL` in `.env` is correct |
