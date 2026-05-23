/**
 * Production recovery preflight.
 *
 * Local:
 *   npm run recovery:check
 *
 * AWS:
 *   USE_AWS=true AWS_REGION=us-east-1 TABLE_NAME=workout-planner npm run recovery:check
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DescribeContinuousBackupsCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const USE_AWS = process.env.USE_AWS === 'true';
const TABLE = process.env.TABLE_NAME || 'workout-planner';
const region = process.env.AWS_REGION || 'us-east-1';
const backupDir = process.env.BACKUP_DIR || join(process.cwd(), '..', 'backups');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const clientConfig = USE_AWS
  ? { region }
  : {
      endpoint: process.env.AWS_ENDPOINT_URL_DYNAMODB || 'http://localhost:8000',
      region,
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    };

const client = new DynamoDBClient(clientConfig);
const db = DynamoDBDocumentClient.from(client);

async function pitrStatus() {
  if (!USE_AWS) {
    return {
      checked: false,
      status: 'not-applicable-local',
      pointInTimeRecoveryStatus: 'not-applicable-local',
    };
  }

  const result = await client.send(new DescribeContinuousBackupsCommand({
    TableName: TABLE,
  }));
  const backups = result.ContinuousBackupsDescription;
  const pitr = backups?.PointInTimeRecoveryDescription;
  const status = {
    checked: true,
    status: backups?.ContinuousBackupsStatus || 'UNKNOWN',
    pointInTimeRecoveryStatus: pitr?.PointInTimeRecoveryStatus || 'UNKNOWN',
    earliestRestorableDateTime: pitr?.EarliestRestorableDateTime?.toISOString(),
    latestRestorableDateTime: pitr?.LatestRestorableDateTime?.toISOString(),
  };

  if (status.pointInTimeRecoveryStatus !== 'ENABLED') {
    throw new Error(`DynamoDB point-in-time recovery is ${status.pointInTimeRecoveryStatus}`);
  }

  return status;
}

async function exportBackup() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await db.send(new ScanCommand({
      TableName: TABLE,
      ExclusiveStartKey,
    }));
    items.push(...(result.Items ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  await mkdir(backupDir, { recursive: true });
  const path = join(backupDir, `${TABLE}-${timestamp}.json`);
  await writeFile(path, JSON.stringify({
    table: TABLE,
    exportedAt: new Date().toISOString(),
    itemCount: items.length,
    items,
  }, null, 2));

  return { path, itemCount: items.length };
}

const pitr = await pitrStatus();
const backup = await exportBackup();
const manifest = {
  checkedAt: new Date().toISOString(),
  table: TABLE,
  region,
  mode: USE_AWS ? 'aws' : 'local',
  pitr,
  backup,
  restoreDrill: {
    result: process.env.RESTORE_DRILL_RESULT || 'not-recorded',
    notes: process.env.RESTORE_DRILL_NOTES || '',
  },
};
const manifestPath = join(backupDir, `${TABLE}-recovery-check-${timestamp}.json`);
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

console.log(JSON.stringify({
  ok: true,
  table: TABLE,
  pitr: pitr.pointInTimeRecoveryStatus,
  backupPath: backup.path,
  itemCount: backup.itemCount,
  manifestPath,
}, null, 2));
