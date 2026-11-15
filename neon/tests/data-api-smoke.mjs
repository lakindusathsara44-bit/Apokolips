import { createClient } from '@neondatabase/neon-js';

const client = createClient({
  auth: {
    url: 'https://ep-icy-shadow-b3q76our.neonauth.c-4.ap-southeast-1.aws.neon.tech/apokolips_blog/auth',
    allowAnonymous: true
  },
  dataApi: {
    url: 'https://ep-icy-shadow-b3q76our.apirest.c-4.ap-southeast-1.aws.neon.tech/apokolips_blog/rest/v1'
  }
});

const { data: authData, error: authError } = await client.auth.getAnonymousToken();
if (authError) throw new Error(`Neon anonymous auth failed: ${authError.message || authError}`);
if (!authData?.token) throw new Error('Neon anonymous auth returned no JWT.');

const payload = authData.token.split('.')[1];
const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
const claims = JSON.parse(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)));
if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('Anonymous JWT has no subject claim.');

// Neon has an open Data API issue where a small number of read requests can
// reach PostgreSQL without the JWT claims attached. This RPC is read-only, so
// retry only this identity probe with bounded backoff. Never retry mutations
// or treat a persistent identity mismatch as authorized.
const MAX_IDENTITY_ATTEMPTS = 6;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let matchedIdentity = false;
let lastIdentityOutcome = 'No response';

for (let attempt = 1; attempt <= MAX_IDENTITY_ATTEMPTS; attempt += 1) {
  const { data: databaseSubject, error: subjectError } = await client.rpc('apokolips_blog_current_user_id');

  if (subjectError) {
    const message = subjectError.message || String(subjectError);
    const isSchemaCacheMiss =
      subjectError.code === 'PGRST202' ||
      /could not find the function .*schema cache/i.test(message);

    if (!isSchemaCacheMiss) {
      throw new Error(`Neon RLS subject helper failed: ${message}`);
    }
    lastIdentityOutcome = 'Data API schema cache has not exposed the identity helper yet';
  } else if (databaseSubject === claims.sub) {
    matchedIdentity = true;
    if (attempt > 1) {
      console.warn(`Neon Data API identity probe recovered after ${attempt} read-only attempts.`);
    }
    break;
  } else {
    lastIdentityOutcome = 'PostgreSQL returned a missing or mismatched JWT subject';
  }

  if (attempt < MAX_IDENTITY_ATTEMPTS) {
    await delay(250 * (2 ** (attempt - 1)));
  }
}

if (!matchedIdentity) {
  throw new Error(
    `Neon Data API identity verification failed after ${MAX_IDENTITY_ATTEMPTS} read-only attempts: ${lastIdentityOutcome}. The request remains denied; check Neon Data API session context and schema cache.`
  );
}

for (const table of ['apokolips_blog_comments', 'apokolips_blog_reactions']) {
  const { error } = await client.from(table).select('id').limit(1);
  if (error) throw new Error(`Neon Data API read failed for ${table}: ${error.message}`);
}

const { error: notificationError } = await client
  .from('apokolips_blog_notifications')
  .select('id')
  .eq('recipient_visitor_id', claims.sub)
  .limit(1);
if (notificationError) throw new Error(`Neon notification RLS check failed: ${notificationError.message}`);

console.log('Neon anonymous auth, Data API identity, public reads, and notification RLS smoke checks passed.');
