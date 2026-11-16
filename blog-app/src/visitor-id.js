export const VISITOR_STORAGE_KEY = 'apokolips-blog-visitor-id-v2';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createSecureUuid(cryptoProvider) {
  if (typeof cryptoProvider?.randomUUID === 'function') {
    return cryptoProvider.randomUUID();
  }

  if (typeof cryptoProvider?.getRandomValues === 'function') {
    const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0'));
    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10, 16).join('')
    ].join('-');
  }

  throw new Error('Secure random number generation is unavailable in this browser.');
}

export function getOrCreateVisitorId(storage, cryptoProvider) {
  let existing = null;
  try {
    existing = storage?.getItem(VISITOR_STORAGE_KEY) || null;
  } catch (_) {
    // Private browsing may deny storage; this page load can still use a fresh ID.
  }

  if (typeof existing === 'string' && UUID_V4.test(existing)) return existing;

  const visitorId = createSecureUuid(cryptoProvider);
  try {
    storage?.setItem(VISITOR_STORAGE_KEY, visitorId);
  } catch (_) {
    // Reactions/comments still work for this page session without persistence.
  }
  return visitorId;
}
