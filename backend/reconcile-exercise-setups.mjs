/**
 * Explicit, account-scoped equipment-variant consolidation.
 * Defaults to dry run. --apply requires --backup-dir on durable storage.
 * node reconcile-exercise-setups.mjs --gym-id <owned-gym-id> [--apply --backup-dir <dir>]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { EXERCISE_FAMILIES, planFamily } from './src/exercise-consolidation.mjs';
import { validateExercise, validateLog, validateTemplate, validateProgram } from './src/validation.mjs';

const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
if (!args.includes('--gym-id')) throw new Error('Provide --gym-id to identify one account.');
const apply = args.includes('--apply');
if (apply && !args.includes('--backup-dir')) throw new Error('--apply requires --backup-dir on durable storage.');
const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1', endpoint: process.env.AWS_ENDPOINT_URL_DYNAMODB }));
const TableName = process.env.TABLE_NAME;
if (!TableName) throw new Error('TABLE_NAME is required.');
let matches = [], cursor;
do {
  const page = await db.send(new ScanCommand({ TableName, FilterExpression: 'SK = :sk', ExpressionAttributeValues: { ':sk': 'GYM#' + value('--gym-id') }, ExclusiveStartKey: cursor }));
  matches.push(...page.Items); cursor = page.LastEvaluatedKey;
} while (cursor);
if (matches.length !== 1) throw new Error('Gym must identify exactly one account.');
const PK = matches[0].PK;
async function readAccount() {
  let items = [], cursor;
  do {
    const page = await db.send(new QueryCommand({ TableName, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': PK }, ConsistentRead: true, ExclusiveStartKey: cursor }));
    items.push(...page.Items); cursor = page.LastEvaluatedKey;
  } while (cursor);
  return items;
}
const initial = await readAccount();
if (apply) {
  const directory = value('--backup-dir');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'exercise-setups-' + new Date().toISOString().replaceAll(':', '-') + '.json');
  await writeFile(path, JSON.stringify({ TableName, PK, items: initial }, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ backup: path }));
}
function condition(item) {
  const names = { '#pk': 'PK' }, values = {};
  const parts = ['attribute_exists(#pk)'];
  // Guard every original attribute, not just the revision: legacy writers may
  // omit revision metadata. Abort the entire family on any concurrent change.
  Object.entries(item).forEach(([key, entry], index) => {
    names['#a' + index] = key; values[':a' + index] = entry;
    parts.push('#a' + index + ' = :a' + index);
  });
  for (const key of ['revision', 'updatedAt']) {
    if (item[key] === undefined) { names['#missing' + key] = key; parts.push('attribute_not_exists(#missing' + key + ')'); }
  }
  return { ConditionExpression: parts.join(' AND '), ExpressionAttributeNames: names, ExpressionAttributeValues: values };
}
function validate(item) {
  const { PK: _pk, SK, ...body } = item;
  const validators = { EXERCISE: validateExercise, LOG: validateLog, TEMPLATE: validateTemplate, PROGRAM: validateProgram };
  validators[SK.split('#')[0]](body, body.id);
}
let simulated = initial;
let totalRemoved = 0;
for (const family of EXERCISE_FAMILIES) {
  const items = apply ? await readAccount() : simulated;
  const plan = planFamily(items, family);
  if (!plan) continue;
  plan.changed.forEach(change => validate(change.after));
  const transactions = [
    ...plan.changed.map(({ before, after }) => ({ Put: { TableName, Item: after, ...condition(before) } })),
    ...plan.removed.map(before => ({ Delete: { TableName, Key: { PK, SK: before.SK }, ...condition(before) } })),
    ...plan.archives.map(Item => ({ Put: { TableName, Item, ConditionExpression: 'attribute_not_exists(PK)' } })),
  ];
  if (transactions.length > 100 || Buffer.byteLength(JSON.stringify(transactions)) > 3_500_000) throw new Error('Family exceeds safe transaction size: ' + family.name);
  console.log(JSON.stringify({ family: plan.name, sources: plan.sourceNames, removed: plan.removed.length, updatedRecords: plan.changed.length, apply }));
  if (apply) await db.send(new TransactWriteCommand({ TransactItems: transactions }));
  else simulated = items.filter(item => !plan.removed.some(source => source.SK === item.SK)).map(item => plan.changed.find(change => change.before.SK === item.SK)?.after || item);
  totalRemoved += plan.removed.length;
}
const finalItems = apply ? await readAccount() : simulated;
const ids = new Set(finalItems.filter(item => item.SK.startsWith('EXERCISE#')).map(item => item.id));
const missing = new Set();
function check(value) {
  if (!value || typeof value !== 'object') return;
  if (value.exerciseId && !ids.has(value.exerciseId)) missing.add(value.exerciseId);
  for (const entry of Object.values(value)) check(entry);
}
finalItems.filter(item => /^(LOG|TEMPLATE|PROGRAM)#/.test(item.SK)).forEach(check);
if (missing.size) throw new Error('Dangling exercise references detected: ' + missing.size);
console.log(JSON.stringify({ removed: totalRemoved, exercises: ids.size, danglingReferences: missing.size, apply }));
