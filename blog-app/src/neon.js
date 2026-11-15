const API_BASE = 'https://br-silent-frost-b3chnc64-blogapi.compute.c-4.ap-southeast-1.aws.neon.tech';
function request(path, options = {}) {
  return fetch(API_BASE + path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    credentials: 'omit'
  }).then(async response => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || 'Blog API request failed.');
      error.status = response.status;
      throw error;
    }
    return payload;
  });
}

class BlogQuery {
  constructor(table) {
    this.table = table;
    this.action = 'select';
    this.values = null;
    this.filters = [];
    this.sort = null;
    this.maxRows = null;
    this.single = false;
  }
  select(columns) { this.columns = columns; return this; }
  eq(column, value) { this.filters.push([column, value]); return this; }
  order(column, options = {}) { this.sort = [column, options.ascending !== false]; return this; }
  limit(value) { this.maxRows = value; return this; }
  maybeSingle() { this.single = true; return this; }
  insert(values) { this.action = 'insert'; this.values = values; return this; }
  upsert(values) { this.action = 'upsert'; this.values = values; return this; }
  update(values) { this.action = 'update'; this.values = values; return this; }
  delete() { this.action = 'delete'; return this; }
  async execute() {
    const filter = Object.fromEntries(this.filters);
    const visitorId = visitorIdForRequest();
    let payload;
    if (this.action === 'select') {
      const map = {
        apokolips_blog_comments: '/comments',
        apokolips_blog_reactions: '/reactions',
        apokolips_blog_notifications: '/notifications',
        apokolips_blog_push_subscriptions: '/subscriptions'
      };
      const endpoint = map[this.table];
      if (!endpoint) throw new Error('Unsupported blog data collection.');
      const params = new URLSearchParams();
      if (filter.post_slug) params.set('post_slug', filter.post_slug);
      if (filter.recipient_visitor_id || filter.visitor_id) params.set('visitor_id', filter.recipient_visitor_id || filter.visitor_id);
      if (filter.endpoint) params.set('endpoint', filter.endpoint);
      payload = await request(endpoint + '?' + params.toString());
      let data = payload.data;
      if (this.sort && Array.isArray(data)) {
        const [key, ascending] = this.sort;
        data = [...data].sort((a,b) => (new Date(a[key]).getTime() - new Date(b[key]).getTime()) * (ascending ? 1 : -1));
      }
      if (this.maxRows && Array.isArray(data)) data = data.slice(0, this.maxRows);
      if (this.single) data = Array.isArray(data) ? (data[0] || null) : data;
      return { data, error: null };
    }
    if (this.table === 'apokolips_blog_comments' && this.action === 'insert') {
      payload = await request('/comments', { method: 'POST', body: JSON.stringify(this.values) });
      return { data: payload.data || null, error: null };
    }
    if (this.table === 'apokolips_blog_reactions' && this.action === 'update') {
      payload = await request('/reactions', { method: 'POST', body: JSON.stringify({
        post_slug: filter.post_slug, visitor_id: filter.visitor_id, reaction: this.values.reaction
      }) });
      return { data: payload.data || [], error: null };
    }
    if (this.table === 'apokolips_blog_notifications' && this.action === 'update') {
      await request('/notifications', { method: 'PATCH', body: JSON.stringify({
        id: filter.id, visitor_id: visitorId, read_at: this.values.read_at
      }) });
      return { data: null, error: null };
    }
    if (this.table === 'apokolips_blog_push_subscriptions' && this.action === 'upsert') {
      payload = await request('/subscriptions', { method: 'POST', body: JSON.stringify(this.values) });
      return { data: payload.data || null, error: null };
    }
    throw new Error('Unsupported blog data operation.');
  }
  then(resolve, reject) {
    return this.execute().then(resolve, error => {
      const result = { data: null, error: { message: error.message, code: String(error.status || 'API_ERROR') } };
      return reject ? reject(error) : resolve(result);
    });
  }
}

function visitorIdForRequest() {
  try { return localStorage.getItem('apokolips-blog-visitor-v1') || ''; } catch (_) { return ''; }
}

export const visitorId = (() => {
  try {
    const saved = localStorage.getItem('apokolips-blog-visitor-v1');
    if (saved) return saved;
  } catch (_) {}
  const value = globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
  try { localStorage.setItem('apokolips-blog-visitor-v1', value); } catch (_) {}
  return value;
})();

export const SUPABASE_URL = API_BASE;
export const SUPABASE_PUBLISHABLE_KEY = '';

const channels = new Set();
export const supabaseClient = {
  from(table) { return new BlogQuery(table); },
  channel(name) {
    const handlers = [];
    const channel = {
      name,
      timer: null,
      on(_event, _filter, callback) { handlers.push(callback); return channel; },
      subscribe() {
        channel.timer = window.setInterval(() => handlers.forEach(callback => {
          try { Promise.resolve(callback()).catch(error => console.warn('Blog refresh failed:', error)); } catch (error) { console.warn(error); }
        }), 10000);
        channels.add(channel);
        return channel;
      }
    };
    return channel;
  },
  removeChannel(channel) {
    if (channel?.timer) window.clearInterval(channel.timer);
    channels.delete(channel);
    return Promise.resolve('ok');
  }
};
