import assert from 'node:assert/strict';
import test from 'node:test';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  emailAliasPk,
  providerAliasPk,
  resolveAccountUser,
} from './account-linking.mjs';

const TABLE = 'workout-planner-test';

function fakeDb(seed = []) {
  const items = new Map(seed.map((item) => [`${item.PK}|${item.SK}`, item]));
  return {
    items,
    async send(command) {
      if (command instanceof GetCommand) {
        const { PK, SK } = command.input.Key;
        return { Item: items.get(`${PK}|${SK}`) };
      }
      if (command instanceof PutCommand) {
        const item = command.input.Item;
        items.set(`${item.PK}|${item.SK}`, item);
        return {};
      }
      throw new Error(`Unexpected command ${command.constructor.name}`);
    },
  };
}

test('verified google email creates provider and email aliases without changing the google account id', async () => {
  const db = fakeDb();
  const user = {
    sub: 'google-sub-1',
    providerSub: 'google-sub-1',
    provider: 'google',
    name: 'Test User',
    email: 'Test@Example.com',
    emailVerified: true,
    picture: 'https://example.com/avatar.png',
  };

  const resolved = await resolveAccountUser({ db, tableName: TABLE, user });

  assert.equal(resolved.sub, 'google-sub-1');
  assert.equal(db.items.get(`${providerAliasPk('google-sub-1')}|ALIAS`).accountSub, 'google-sub-1');
  assert.equal(db.items.get(`${emailAliasPk('test@example.com')}|ALIAS`).accountSub, 'google-sub-1');
  assert.equal(db.items.get('USER#google-sub-1|AUTH#google-sub-1').aliasPK, providerAliasPk('google-sub-1'));
  assert.equal(db.items.get(`USER#google-sub-1|EMAIL#${emailAliasPk('test@example.com').slice(6)}`).aliasPK, emailAliasPk('test@example.com'));
});

test('apple sign-in with the same verified email resolves to the existing google account', async () => {
  const db = fakeDb([{
    PK: emailAliasPk('test@example.com'),
    SK: 'ALIAS',
    accountSub: 'google-sub-1',
    email: 'test@example.com',
  }]);
  const user = {
    sub: 'apple:apple-sub-1',
    providerSub: 'apple:apple-sub-1',
    provider: 'apple',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    picture: '',
  };

  const resolved = await resolveAccountUser({ db, tableName: TABLE, user });

  assert.equal(resolved.sub, 'google-sub-1');
  assert.equal(db.items.get(`${providerAliasPk('apple:apple-sub-1')}|ALIAS`).accountSub, 'google-sub-1');
  assert.equal(db.items.get('USER#google-sub-1|AUTH#apple:apple-sub-1').aliasPK, providerAliasPk('apple:apple-sub-1'));
});

test('apple sign-in still resolves through provider alias after Apple stops returning email', async () => {
  const db = fakeDb([{
    PK: providerAliasPk('apple:apple-sub-1'),
    SK: 'ALIAS',
    accountSub: 'google-sub-1',
    provider: 'apple',
    providerSub: 'apple:apple-sub-1',
    name: 'Test User',
    email: 'test@example.com',
    picture: '',
  }]);
  const user = {
    sub: 'apple:apple-sub-1',
    providerSub: 'apple:apple-sub-1',
    provider: 'apple',
    name: '',
    email: '',
    emailVerified: false,
    picture: '',
  };

  const resolved = await resolveAccountUser({ db, tableName: TABLE, user });

  assert.equal(resolved.sub, 'google-sub-1');
  assert.equal(resolved.email, 'test@example.com');
});

test('explicit link maps an Apple provider to the current account without an email', async () => {
  const db = fakeDb();
  const user = {
    sub: 'apple:apple-sub-1',
    providerSub: 'apple:apple-sub-1',
    provider: 'apple',
    name: '',
    email: '',
    emailVerified: false,
    picture: '',
  };

  const resolved = await resolveAccountUser({
    db,
    tableName: TABLE,
    user,
    requestedAccount: {
      sub: 'google-sub-1',
      provider: 'google',
      name: 'Test User',
      email: 'test@example.com',
      picture: 'https://example.com/avatar.png',
    },
  });

  assert.equal(resolved.sub, 'google-sub-1');
  assert.equal(resolved.email, 'test@example.com');
  assert.equal(db.items.get(`${providerAliasPk('apple:apple-sub-1')}|ALIAS`).accountSub, 'google-sub-1');
  assert.equal(db.items.get('USER#google-sub-1|AUTH#apple:apple-sub-1').aliasPK, providerAliasPk('apple:apple-sub-1'));
});
