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

const { data: databaseSubject, error: subjectError } = await client.rpc('apokolips_blog_current_user_id');
if (subjectError) throw new Error(`Neon RLS subject helper failed: ${subjectError.message}`);
if (databaseSubject !== claims.sub) {
  throw new Error('The Neon Data API did not pass the anonymous JWT subject into PostgreSQL.');
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

console.log('Neon anonymous auth, Data API reads, and notification RLS smoke checks passed.');
