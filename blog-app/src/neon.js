import { getOrCreateVisitorId } from './visitor-id.js';

import { createClient } from '@neondatabase/neon-js';

export const BLOG_AUTH_URL = 'https://ep-icy-shadow-b3q76our.neonauth.c-4.ap-southeast-1.aws.neon.tech/apokolips_blog/auth';
export const BLOG_DATA_API_URL = 'https://ep-icy-shadow-b3q76our.apirest.c-4.ap-southeast-1.aws.neon.tech/apokolips_blog/rest/v1';

let neon;
let anonymousToken = null;
let anonymousTokenPromise = null;

function decodeJwtClaims(token) {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Neon Auth returned an invalid anonymous token.');
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return JSON.parse(decoded);
}

async function getAnonymousJwt() {
  if (anonymousToken) {
    try {
      const claims = decodeJwtClaims(anonymousToken);
      if (typeof claims.exp === 'number' && claims.exp > Math.floor(Date.now() / 1000) + 60) {
        return anonymousToken;
      }
    } catch (_) {
      anonymousToken = null;
    }
    anonymousToken = null;
  }

  if (!anonymousTokenPromise) {
    anonymousTokenPromise = neon.auth.getAnonymousToken()
      .then(({ data, error }) => {
        if (error) throw error;
        const token = data?.token;
        if (!token) throw new Error('Could not obtain a Neon anonymous access token.');
        decodeJwtClaims(token);
        anonymousToken = token;
        return token;
      })
      .catch(error => {
        anonymousToken = null;
        throw error;
      })
      .finally(() => {
        anonymousTokenPromise = null;
      });
  }
  return anonymousTokenPromise;
}

neon = createClient({
  auth: {
    url: BLOG_AUTH_URL,
    allowAnonymous: true
  },
  dataApi: {
    url: BLOG_DATA_API_URL,
    // Neon Auth authorizes the Data API. A separate random browser UUID is
    // used only by the narrow visitor-scoped Blog RPCs.
    getToken: getAnonymousJwt
  }
});

export let visitorId = null;

export async function initializeNeonBlog() {
  // Keep Neon Auth for Data API authorization, but do not use its shared
  // anonymous subject as the Blog visitor identity.
  await getAnonymousJwt();

  let storage = null;
  try { storage = window.localStorage; } catch (_) {}
  visitorId = getOrCreateVisitorId(storage, globalThis.crypto);
}

const channels = new Set();
export const blogClient = {
  from(table) {
    return neon.from(table);
  },
  rpc(functionName, args) {
    return neon.rpc(functionName, args);
  },
  channel(name) {
    const callbacks = [];
    const channel = {
      name,
      timer: null,
      on(_event, _filter, callback) {
        callbacks.push(callback);
        return channel;
      },
      subscribe() {
        channel.timer = window.setInterval(() => {
          callbacks.forEach(callback => {
            try {
              Promise.resolve(callback()).catch(error => console.warn('Blog live refresh failed:', error));
            } catch (error) {
              console.warn('Blog live refresh failed:', error);
            }
          });
        }, 10000);
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
