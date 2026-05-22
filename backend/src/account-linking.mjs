import { createHash } from 'node:crypto';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ALIAS_SK = 'ALIAS';
const USER_CONTENT_PREFIXES = ['EXERCISE#', 'TEMPLATE#', 'LOG#', 'FEEDBACK#'];

export function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

export function isVerifiedEmail(value) {
  return value === true || value === 'true';
}

export function providerAliasPk(providerSub) {
  return `AUTH#${providerSub}`;
}

export function emailAliasPk(email) {
  return `EMAIL#${createHash('sha256').update(normalizeEmail(email)).digest('hex')}`;
}

async function getAlias(db, tableName, PK) {
  if (!tableName || !PK) return undefined;
  const result = await db.send(new GetCommand({
    TableName: tableName,
    Key: { PK, SK: ALIAS_SK },
  }));
  return result.Item;
}

async function putAlias(db, tableName, item) {
  if (!tableName) return;
  await db.send(new PutCommand({
    TableName: tableName,
    Item: {
      SK: ALIAS_SK,
      ...item,
    },
  }));
}

async function putAliasRef(db, tableName, { accountSub, aliasPK, aliasSK, kind }) {
  if (!tableName) return;
  await db.send(new PutCommand({
    TableName: tableName,
    Item: {
      PK: `USER#${accountSub}`,
      SK: `${kind}#${aliasPK.slice(kind.length + 1)}`,
      aliasPK,
      aliasSK,
    },
  }));
}

async function accountHasContent(db, tableName, accountSub) {
  if (!tableName || !accountSub) return false;
  const PK = `USER#${accountSub}`;
  const settings = await db.send(new GetCommand({
    TableName: tableName,
    Key: { PK, SK: 'SETTINGS' },
  }));
  if (settings.Item) return true;

  for (const prefix of USER_CONTENT_PREFIXES) {
    const result = await db.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': PK,
        ':prefix': prefix,
      },
      Limit: 1,
    }));
    if ((result.Items ?? []).length > 0) return true;
  }
  return false;
}

function fallbackProfile(user, fallback) {
  return {
    name: user.name || fallback?.name || '',
    email: user.email || fallback?.email || '',
    picture: user.picture || fallback?.picture || '',
  };
}

export async function resolveAccountUser({ db, tableName, user, requestedAccount }) {
  const providerSub = user.providerSub || user.sub;
  const providerAlias = await getAlias(db, tableName, providerAliasPk(providerSub));
  const providerAccountHasContent = await accountHasContent(db, tableName, providerSub);
  const normalizedEmail = user.emailVerified ? normalizeEmail(user.email) : '';
  const emailAlias = normalizedEmail
    ? await getAlias(db, tableName, emailAliasPk(normalizedEmail))
    : undefined;
  const fallback = requestedAccount || providerAlias || emailAlias;
  const linkedAccountSub = requestedAccount?.sub || providerAlias?.accountSub || emailAlias?.accountSub;
  const shouldProtectProviderData = !requestedAccount
    && providerAccountHasContent
    && linkedAccountSub
    && linkedAccountSub !== providerSub
    && providerAlias?.linkType !== 'explicit';
  const accountSub = shouldProtectProviderData ? providerSub : (linkedAccountSub || providerSub);
  const profile = fallbackProfile(user, fallback);
  const now = new Date().toISOString();

  const authAliasPK = providerAliasPk(providerSub);
  await putAlias(db, tableName, {
    PK: authAliasPK,
    accountSub,
    provider: user.provider,
    providerSub,
    name: profile.name,
    email: profile.email,
    picture: profile.picture,
    updatedAt: now,
    createdAt: providerAlias?.createdAt || now,
    ...(requestedAccount || providerAlias?.linkType
      ? { linkType: requestedAccount ? 'explicit' : providerAlias.linkType }
      : {}),
  });
  await putAliasRef(db, tableName, {
    accountSub,
    aliasPK: authAliasPK,
    aliasSK: ALIAS_SK,
    kind: 'AUTH',
  });

  if (normalizedEmail && (!emailAlias || emailAlias.accountSub === accountSub)) {
    const emailAliasPK = emailAliasPk(normalizedEmail);
    await putAlias(db, tableName, {
      PK: emailAliasPK,
      accountSub,
      email: normalizedEmail,
      updatedAt: now,
      createdAt: emailAlias?.createdAt || now,
    });
    await putAliasRef(db, tableName, {
      accountSub,
      aliasPK: emailAliasPK,
      aliasSK: ALIAS_SK,
      kind: 'EMAIL',
    });
  }

  return {
    sub: accountSub,
    provider: user.provider,
    ...profile,
  };
}
