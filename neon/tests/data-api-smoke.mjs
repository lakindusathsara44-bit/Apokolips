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

console.log('Neon smoke: requesting anonymous JWT');
const jwt = await getAnonymousJwt();
console.log('Neon smoke: anonymous JWT acquired');
const payload = jwt.split('.')[1];
const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
const claims = JSON.parse(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)));
if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('Anonymous JWT has no subject claim.');

for (const table of ['apokolips_blog_comments', 'apokolips_blog_reactions']) {
  console.log('Neon smoke: checking public read for ' + table);
  const { data, error } = await client.from(table).select('id').limit(1);
  if (error) throw new Error(`Neon Data API read failed for ${table}: ${error.message}`);
}

console.log('Neon smoke: checking notification RPC');
const { error: notificationError } = await client.rpc('apokolips_blog_get_notifications', {
  p_visitor_id: '11111111-1111-4111-8111-111111111111'
});
if (notificationError) throw new Error(`Neon notification RPC check failed: ${notificationError.message}`);

console.log('Neon smoke: checking reaction identity RPC');
const { error: reactionIdentityError } = await client.rpc('apokolips_blog_get_my_reaction', {
  p_post_slug: 'smoke-test-post',
  p_visitor_id: '11111111-1111-4111-8111-111111111111'
});
if (reactionIdentityError) throw new Error(`Neon reaction identity RPC check failed: ${reactionIdentityError.message}`);

console.log('Neon anonymous JWT forwarding, public Blog reads, and visitor-scoped RPC checks passed.');
