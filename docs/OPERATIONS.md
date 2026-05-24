# Forge Operations Runbook

## Friends-and-Family Release Checklist

Before inviting more testers:

1. Confirm GitHub secrets and vars:
   - `APP_SESSION_SECRET` is set and at least 32 random characters.
   - `IOS_API_BASE_URL` points at `https://workout-planner.jim-greco.com/api`.
   - `GOOGLE_CLIENT_IDS` includes web and iOS client IDs in the production backend environment.
   - `APPLE_CLIENT_IDS` includes `com.workoutplanner.ios`.
   - `ALLOWED_ORIGINS` includes only trusted web origins.
   - `ADMIN_SUPPORT_SECRET` is set to a 32+ character random value for support-only routes.
2. Run or confirm the `Deploy to EC2` workflow passed:
   - web lint, tests, build, and production audit
   - backend tests and production audit
   - live `/api/healthz` and `/api/version` smoke checks
3. Run or confirm the `TestFlight` workflow uploaded successfully and Apple accepted the build.
4. Run the recovery preflight and save the manifest path:
   - `cd backend && USE_AWS=true AWS_REGION="$AWS_REGION" TABLE_NAME="$TABLE_NAME" npm run recovery:check`
   - Confirm the output says point-in-time recovery is `ENABLED`.
   - Confirm the backup file and recovery-check manifest were written.
5. Smoke test:
   - web sign-in
   - iOS Google sign-in
   - iOS Apple sign-in
   - create/edit/delete exercise
   - create/start/finish workout
   - export data
   - send feedback

## Backup And Restore

The production data store must have daily recovery coverage before broader beta
use. Prefer DynamoDB point-in-time recovery if the table is in AWS DynamoDB.

Portable table export:

```bash
cd backend
npm run backup
```

For AWS-hosted DynamoDB:

```bash
cd backend
USE_AWS=true AWS_REGION="$AWS_REGION" TABLE_NAME="$TABLE_NAME" npm run backup
```

On EC2, run that command from cron at least daily if point-in-time recovery is
not available for the active datastore.

Recovery preflight:

```bash
cd backend
USE_AWS=true AWS_REGION="$AWS_REGION" TABLE_NAME="$TABLE_NAME" npm run recovery:check
```

The recovery preflight fails if DynamoDB point-in-time recovery is not enabled
for the AWS table. It also writes a portable backup plus a
`*-recovery-check-*.json` manifest under `BACKUP_DIR` or `../backups`.

DynamoDB point-in-time recovery check:

```bash
aws dynamodb describe-continuous-backups \
  --table-name "$TABLE_NAME" \
  --region "$AWS_REGION"
```

Enable point-in-time recovery:

```bash
aws dynamodb update-continuous-backups \
  --table-name "$TABLE_NAME" \
  --region "$AWS_REGION" \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
```

Restore drill:

```bash
RESTORE_TIME="2026-05-21T12:00:00Z"
RESTORE_TABLE="${TABLE_NAME}-restore-drill-$(date +%Y%m%d%H%M%S)"

aws dynamodb restore-table-to-point-in-time \
  --source-table-name "$TABLE_NAME" \
  --target-table-name "$RESTORE_TABLE" \
  --restore-date-time "$RESTORE_TIME" \
  --region "$AWS_REGION"

aws dynamodb describe-table \
  --table-name "$RESTORE_TABLE" \
  --region "$AWS_REGION"
```

After the drill, delete the restored table when it is no longer needed.

Record the drill in the next recovery preflight:

```bash
RESTORE_DRILL_RESULT="restored $RESTORE_TABLE and verified table status ACTIVE" \
RESTORE_DRILL_NOTES="deleted restored table after validation" \
USE_AWS=true AWS_REGION="$AWS_REGION" TABLE_NAME="$TABLE_NAME" npm run recovery:check
```

## Rollback

1. Identify the last known-good commit.
2. Re-run the deploy workflow for that commit or redeploy from EC2 using the
   matching checkout in `~/workout_planner`.
3. Smoke test `/api/healthz`, `/api/version`, web load, sign-in, and a read-only data load.
4. Keep the TestFlight build available unless the issue is native-only; otherwise
   expire the bad build in App Store Connect.

## EC2 Compose Contract

The deploy workflow expects EC2 to have a `~/deploy/docker-compose.yml` with
`workout` and `workout_api` services. The repo-owned reference is
`deploy/docker-compose.production.example.yml`; keep the remote compose service
names compatible with that file so the GitHub Actions override can inject
release metadata and production auth settings.

## Support Triage

When a tester reports "it won't load":

1. Ask whether it is web or iOS and what sign-in provider they used.
2. Check live health: `curl https://workout-planner.jim-greco.com/api/healthz`.
3. Check live version: `curl https://workout-planner.jim-greco.com/api/version`.
4. Ask for the Request ID shown in the app error, if one appears.
5. Check recent backend logs for that `requestId`, `handler_error`, or elevated `401`/`500`.
6. Ask them to send feedback from the account menu if they can open the app.
7. For iOS, ask for the version/build shown in the account menu.

Recent in-app feedback is available through the secret-protected support route:

```bash
curl -H "X-Admin-Support-Secret: $ADMIN_SUPPORT_SECRET" \
  "https://workout-planner.jim-greco.com/api/admin/feedback?limit=25"
```

The same support tools are available in the browser at:

```text
https://workout-planner.jim-greco.com/admin.html
```

The support response intentionally returns a short `userHash` instead of raw
provider IDs or email addresses. Use the hash only to group related feedback
while triaging an issue.

Do not ask testers for provider tokens, app session tokens, or screenshots that
show private workout notes unless they volunteer them.
