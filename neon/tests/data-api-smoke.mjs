import { createClient } from '@neondatabase/neon-js';

const AUTH_URL = 'https://ep-icy-shadow-b3q76our.neonauth.c-4.ap-southeast-1.aws.neon.tech/apokolips_blog/auth';
const DATA_API_URL = 'https://ep-icy-shadow-b3q76our.apirest.c-4.ap-southeast-1.aws.neon.tech/apokolips_blog/rest/v1';

let client;
let tokenPromise;
let cachedToken;

async function getAnonymousJwt() {
  if (cachedToken) {
    const payload = cachedToken.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)));
    if (typeof claims.exp === 'number' && claims.exp > Math.floor(Date.now() / 1000) + 60) return cachedToken;
    cachedToken = null;
  }

  if (!tokenPromise) {
    tokenPromise = client.auth.getAnonymousToken()
      .then(({ data, error }) => {
        if (error) throw new Error(`Neon anonymous auth failed: ${error.message || error}`);
        if (!data?.token) throw new Error('Neon anonymous auth returned no JWT.');
        cachedToken = data.token;
        return cachedToken;
      })
      .finally(() => { tokenPromise = null; });
  }
  return tokenPromise;
}

client = createClient({
  auth: { url: AUTH_URL, allowAnonymous: true },
  dataApi: {
    url: DATA_API_URL,
    // Match production: explicitly pass the Neon Auth anonymous JWT to Data API.
    getToken: getAnonymousJwt
  }
});

const jwt = await getAnonymousJwt();
const payload = jwt.split('.')[1];
const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
const claims = JSON.parse(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)));
if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('Anonymous JWT has no subject claim.');

const { data: databaseSubject, error: subjectError } = await client.rpc('apokolips_blog_current_user_id');
if (subjectError) throw new Error(`Neon RLS subject helper failed: ${subjectError.message}`);
if (databaseSubject !== claims.sub) {
  throw new Error(`Neon Data API JWT subject mismatch: expected ${claims.sub}, received ${databaseSubject}.`);
}

for (const table of ['apokolips_blog_comments', 'apokolips_blog_reactions']) {
  const { data, error } = await client.from(table).select('id').limit(1);
  if (error) throw new Error(`Neon Data API read failed for ${table}: ${error.message}`);
}

const { error: notificationError } = await client
  .from('apokolips_blog_notifications')
  .select('id')
  .eq('recipient_visitor_id', claims.sub)
  .limit(1);
if (notificationError) throw new Error(`Neon notification RLS check failed: ${notificationError.message}`);

console.log('Neon anonymous JWT forwarding, Data API reads, and RLS identity checks passed.');
