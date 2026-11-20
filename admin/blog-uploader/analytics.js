import { createClient } from 'https://esm.sh/@neondatabase/neon-js';

const REPOSITORY = 'lakindusathsara44-bit/BlogUploader';
const RAW_BASE = 'https://raw.githubusercontent.com/' + REPOSITORY + '/main/';
const AUTH_URL = 'https://ep-icy-shadow-b3q76our.neonauth.c-4.ap-southeast-1.aws.neon.tech/apokolips_blog/auth';
const DATA_API_URL = 'https://ep-icy-shadow-b3q76our.apirest.c-4.ap-southeast-1.aws.neon.tech/apokolips_blog/rest/v1';

function decodeJwtClaims(token) {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Invalid anonymous access token.');
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)));
}

let client;
let cachedToken;
let tokenPromise;
async function getAnonymousJwt() {
  if (cachedToken) {
    try {
      const claims = decodeJwtClaims(cachedToken);
      if (typeof claims.exp === 'number' && claims.exp > Math.floor(Date.now() / 1000) + 60) return cachedToken;
    } catch (_) {}
    cachedToken = null;
  }
  if (!tokenPromise) {
    tokenPromise = client.auth.getAnonymousToken().then(({ data, error }) => {
      if (error) throw error;
      const token = data?.token;
      if (!token) throw new Error('Could not obtain anonymous access.');
      decodeJwtClaims(token);
      cachedToken = token;
      return token;
    }).finally(() => { tokenPromise = null; });
  }
  return tokenPromise;
}
client = createClient({
  auth: { url: AUTH_URL, allowAnonymous: true },
  dataApi: { url: DATA_API_URL, getToken: getAnonymousJwt }
});

export function getBlogClient() { return client; }

function parsePost(filename, source) {
  const textOnly = source.startsWith('[Text]');
  if (!textOnly && !source.startsWith('[Media]')) return null;
  const stem = filename.replace(/\.md$/i, '');
  const matchDate = stem.match(/(\d{4}-\d{2}-\d{2})/);
  const date = matchDate ? matchDate[1] : new Date().toISOString().slice(0, 10);
  let type = 'text';
  let mediaUrl = '';
  let description = source.replace(/^\[Text\]\s*/, '').trim();

  if (!textOnly) {
    const image = source.match(/!\[[^\]]*\]\(([^)]+)\)/);
    const video = source.match(/\[Watch video\]\(([^)]+)\)/);
    const media = image || video;
    if (!media) return null;
    const reference = media[1].trim();
    const mediaName = decodeURIComponent(reference.split('/').pop().split('?')[0]);
    type = /\.(mp4|webm|mov|m4v|ogv)$/i.test(mediaName) ? 'video' : 'image';
    mediaUrl = RAW_BASE + 'uploads/' + encodeURIComponent(mediaName);
    description = source.slice(media.index + media[0].length).replace(/^\s*\n\s*/, '').trim();
    if (!description) description = source.replace(/^\[Media\]\s*/, '').replace(media[0], '').trim();
  }
  const firstLine = description.split(/\r?\n/)[0].trim();
  const title = firstLine.split(/[.!?]/)[0].trim().slice(0, 80) || (type === 'text' ? 'A new text post' : 'A new media post');
  const id = 'uploaded-' + stem.replace(/[^a-zA-Z0-9_-]/g, '-');
  return { id, slug: id, filename, date, title, description, type, mediaUrl };
}

async function loadLegacyPosts() {
  const response = await fetch(RAW_BASE + 'posts/index.json?cache=' + Date.now());
  if (response.status === 404) return [];
  if (!response.ok) throw new Error('Unable to load the legacy post index (' + response.status + ').');
  const entries = await response.json();
  const names = (Array.isArray(entries) ? entries : [])
    .map(item => typeof item === 'string' ? item : item?.file)
    .filter(name => typeof name === 'string' && name.endsWith('.md'));
  const posts = await Promise.all(names.map(async filename => {
    try {
      const result = await fetch(RAW_BASE + 'posts/' + encodeURIComponent(filename));
      if (!result.ok) return null;
      return parsePost(filename, (await result.text()).trim());
    } catch (_) { return null; }
  }));
  return posts.filter(Boolean);
}

async function loadDatabasePosts() {
  const pageSize = 500;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from('bloguploader_posts')
      .select('id,slug,post_type,title,description,filename,media_url,created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows.map(row => ({
    id: row.slug,
    slug: row.slug,
    filename: row.filename || row.slug,
    date: String(row.created_at || '').slice(0, 10),
    title: row.title,
    description: row.description,
    type: row.post_type,
    mediaUrl: row.media_url || ''
  }));
}

export async function loadPosts() {
  const [database, legacy] = await Promise.allSettled([loadDatabasePosts(), loadLegacyPosts()]);
  if (database.status === 'rejected' && legacy.status === 'rejected') throw database.reason;
  const combined = [
    ...(database.status === 'fulfilled' ? database.value : []),
    ...(legacy.status === 'fulfilled' ? legacy.value : [])
  ];
  const unique = new Map();
  combined.forEach(post => unique.set(post.slug, post));
  return Array.from(unique.values())
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.filename).localeCompare(String(a.filename)));
}
async function readAllRows(table, columns) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from(table).select(columns)
      .order('created_at', { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export async function loadEngagement() {
  const [reactions, comments] = await Promise.all([
    readAllRows('apokolips_blog_reactions', 'post_slug,reaction,created_at'),
    readAllRows('apokolips_blog_comments', 'post_slug,created_at')
  ]);
  const byPost = {};
  const byDay = {};
  const byDayByPost = {};
  const ensure = slug => byPost[slug] || (byPost[slug] = { likes: 0, reactions: 0, comments: 0 });
  const ensurePostDay = (slug, day) => {
    byDayByPost[slug] ||= {};
    byDayByPost[slug][day] ||= { likes: 0, comments: 0 };
    return byDayByPost[slug][day];
  };
  reactions.forEach(row => {
    const item = ensure(row.post_slug);
    item.reactions += 1;
    if (row.reaction === 'like') item.likes += 1;
    const day = (row.created_at || '').slice(0, 10);
    if (day) {
      byDay[day] ||= { likes: 0, comments: 0 };
      if (row.reaction === 'like') {
        byDay[day].likes += 1;
        ensurePostDay(row.post_slug, day).likes += 1;
      }
    }
  });
  comments.forEach(row => {
    ensure(row.post_slug).comments += 1;
    const day = (row.created_at || '').slice(0, 10);
    if (day) {
      byDay[day] ||= { likes: 0, comments: 0 };
      byDay[day].comments += 1;
      ensurePostDay(row.post_slug, day).comments += 1;
    }
  });
  return { byPost, byDay, byDayByPost, totalLikes: reactions.filter(row => row.reaction === 'like').length, totalReactions: reactions.length, totalComments: comments.length };
}

export function formatDate(value) {
  const date = new Date(value + 'T00:00:00');
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
