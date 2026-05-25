#!/usr/bin/env node
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const API_BASE_URL = 'https://api.appstoreconnect.apple.com/v1';
const AUDIENCE = 'appstoreconnect-v1';
const PROFILE_TYPE = 'IOS_APP_STORE';
const BUNDLE_PLATFORM = 'IOS';
const DISTRIBUTION_CERT_TYPES = new Set(['DISTRIBUTION', 'IOS_DISTRIBUTION']);

function usage() {
  console.error(`Usage: ${basename(process.argv[1])} --bundle-id <id> --profile-name <name> --certificate-der <path> --output <path>`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) {
      usage();
      process.exit(2);
    }
    args[key.slice(2)] = value;
  }
  for (const required of ['bundle-id', 'profile-name', 'certificate-der', 'output']) {
    if (!args[required]) {
      usage();
      process.exit(2);
    }
  }
  return args;
}

function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function makeToken() {
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
  const keyPath = process.env.APP_STORE_CONNECT_API_KEY_PATH;
  if (!keyId || !issuerId || !keyPath) {
    throw new Error('APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID, and APP_STORE_CONNECT_API_KEY_PATH are required.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iss: issuerId, aud: AUDIENCE, iat: now, exp: now + 20 * 60 }));
  const signingInput = `${header}.${payload}`;
  const privateKey = createPrivateKey(readFileSync(keyPath, 'utf8'));
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });

  return `${signingInput}.${base64url(signature)}`;
}

async function apiRequest(token, method, path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const details = payload?.errors
      ?.map((error) => `${error.status ?? response.status} ${error.code ?? 'ERROR'}: ${error.detail ?? error.title ?? 'Unknown error'}`)
      .join('\n');
    throw new Error(`App Store Connect ${method} ${path} failed:\n${details || text || response.statusText}`);
  }
  return payload;
}

async function pagedRequest(token, path) {
  const results = [];
  let nextPath = path;
  while (nextPath) {
    const response = await apiRequest(token, 'GET', nextPath);
    results.push(...(response.data ?? []));
    const nextUrl = response.links?.next;
    nextPath = nextUrl ? new URL(nextUrl).pathname + new URL(nextUrl).search : '';
  }
  return results;
}

async function ensureBundleId(token, identifier) {
  const existing = await apiRequest(
    token,
    'GET',
    `/bundleIds?filter[identifier]=${encodeURIComponent(identifier)}&filter[platform]=${BUNDLE_PLATFORM}&limit=1`,
  );
  if (existing.data?.[0]) {
    console.log(`Using existing bundle ID ${identifier}.`);
    return existing.data[0];
  }

  console.log(`Registering bundle ID ${identifier}.`);
  const created = await apiRequest(token, 'POST', '/bundleIds', {
    data: {
      type: 'bundleIds',
      attributes: {
        identifier,
        name: 'Forge Live Activity',
        platform: BUNDLE_PLATFORM,
      },
    },
  });
  return created.data;
}

async function findMatchingCertificate(token, certificateDerPath) {
  const localCertificateHash = createHash('sha256').update(readFileSync(certificateDerPath)).digest('hex');
  const certificates = await pagedRequest(
    token,
    '/certificates?fields[certificates]=name,certificateType,displayName,serialNumber,platform,expirationDate,certificateContent,activated&limit=200',
  );
  const distributionCertificates = certificates.filter((certificate) => {
    const type = certificate.attributes?.certificateType;
    return DISTRIBUTION_CERT_TYPES.has(type) && certificate.attributes?.activated !== false;
  });

  for (const certificate of distributionCertificates) {
    const content = certificate.attributes?.certificateContent;
    if (!content) continue;
    const remoteHash = createHash('sha256').update(Buffer.from(content, 'base64')).digest('hex');
    if (remoteHash === localCertificateHash) {
      console.log(`Matched distribution certificate ${certificate.attributes?.displayName ?? certificate.attributes?.name ?? certificate.id}.`);
      return certificate;
    }
  }

  const available = distributionCertificates
    .map((certificate) => {
      const attributes = certificate.attributes ?? {};
      return `- ${attributes.displayName ?? attributes.name ?? certificate.id} (${attributes.certificateType}, serial ${attributes.serialNumber ?? 'unknown'})`;
    })
    .join('\n');
  throw new Error(`Could not match IOS_DIST_CERT_P12 to an active App Store Connect distribution certificate.\nAvailable distribution certificates:\n${available || '- none'}`);
}

async function findExistingProfile(token, profileName, bundleIdId, certificateId) {
  const profiles = await pagedRequest(
    token,
    `/profiles?filter[name]=${encodeURIComponent(profileName)}&filter[profileType]=${PROFILE_TYPE}&filter[profileState]=ACTIVE&include=bundleId,certificates&fields[profiles]=name,profileType,profileState,profileContent,uuid,bundleId,certificates&limit=200`,
  );
  return profiles.find((profile) => {
    const profileBundleId = profile.relationships?.bundleId?.data?.id;
    const profileCertificates = profile.relationships?.certificates?.data ?? [];
    return profileBundleId === bundleIdId && profileCertificates.some((certificate) => certificate.id === certificateId);
  });
}

async function ensureProfile(token, profileName, bundleIdId, certificateId) {
  const existing = await findExistingProfile(token, profileName, bundleIdId, certificateId);
  if (existing) {
    console.log(`Using existing provisioning profile ${profileName}.`);
    return existing;
  }

  console.log(`Creating provisioning profile ${profileName}.`);
  const created = await apiRequest(token, 'POST', '/profiles', {
    data: {
      type: 'profiles',
      attributes: {
        name: profileName,
        profileType: PROFILE_TYPE,
      },
      relationships: {
        bundleId: {
          data: {
            type: 'bundleIds',
            id: bundleIdId,
          },
        },
        certificates: {
          data: [
            {
              type: 'certificates',
              id: certificateId,
            },
          ],
        },
      },
    },
  });
  return created.data;
}

async function profileContent(token, profile) {
  const content = profile.attributes?.profileContent;
  if (content) return content;

  const response = await apiRequest(token, 'GET', `/profiles/${profile.id}?fields[profiles]=name,uuid,profileContent`);
  if (!response.data?.attributes?.profileContent) {
    throw new Error(`App Store Connect did not return profileContent for profile ${profile.id}.`);
  }
  return response.data.attributes.profileContent;
}

async function main() {
  const args = parseArgs(process.argv);
  const token = makeToken();
  const bundleId = await ensureBundleId(token, args['bundle-id']);
  const certificate = await findMatchingCertificate(token, args['certificate-der']);
  const profile = await ensureProfile(token, args['profile-name'], bundleId.id, certificate.id);
  const content = await profileContent(token, profile);

  writeFileSync(args.output, Buffer.from(content, 'base64'));
  console.log(`Wrote provisioning profile to ${args.output}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
