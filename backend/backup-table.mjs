/**
 * Export the whole DynamoDB table to a timestamped JSON file.
 *
 * Local:
 *   npm run backup
 *
 * AWS:
 *   USE_AWS=true AWS_REGION=us-east-1 TABLE_NAME=workout-planner npm run backup
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const USE_AWS = process.env.USE_AWS === 'true';
const TABLE = process.env.TABLE_NAME || 'workout-planner';
const region = process.env.AWS_REGION || 'us-east-1';

const clientConfig = USE_AWS
  ? { region }
  : {
      endpoint: process.env.AWS_ENDPOINT_URL_DYNAMODB || 'http://localhost:8000',
      region,
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    };

const db = DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig));

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

const backupDir = process.env.BACKUP_DIR || join(process.cwd(), '..', 'backups');
await mkdir(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const path = join(backupDir, `${TABLE}-${timestamp}.json`);
await writeFile(path, JSON.stringify({
  table: TABLE,
  exportedAt: new Date().toISOString(),
  itemCount: items.length,
  items,
}, null, 2));

console.log(`Wrote ${items.length} items to ${path}`);
