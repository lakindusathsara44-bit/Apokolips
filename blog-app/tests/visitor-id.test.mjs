import test from 'node:test';
import assert from 'node:assert/strict';
import { getOrCreateVisitorId, VISITOR_STORAGE_KEY } from '../src/visitor-id.js';

const UUID_A = '8f14e45f-ea1b-4b4a-8c2f-8a1b2c3d4e5f';
const UUID_B = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

function createStorage(initial = null) {
  let value = initial;
  return {
    getItem(key) {
      assert.equal(key, VISITOR_STORAGE_KEY);
      return value;
    },
    setItem(key, next) {
      assert.equal(key, VISITOR_STORAGE_KEY);
      value = next;
    },
    value: () => value
  };
}

test('reuses a valid visitor ID already saved on this browser', () => {
  const storage = createStorage(UUID_A);
  let generated = 0;
  const crypto = { randomUUID: () => { generated += 1; return UUID_B; } };

  assert.equal(getOrCreateVisitorId(storage, crypto), UUID_A);
  assert.equal(generated, 0);
});

test('creates and persists a unique visitor ID for a new browser', () => {
  const storage = createStorage();
  const crypto = { randomUUID: () => UUID_B };

  assert.equal(getOrCreateVisitorId(storage, crypto), UUID_B);
  assert.equal(storage.value(), UUID_B);
});

test('replaces an invalid old visitor value instead of reusing it', () => {
  const storage = createStorage('anonymous');
  const crypto = { randomUUID: () => UUID_A };

  assert.equal(getOrCreateVisitorId(storage, crypto), UUID_A);
  assert.equal(storage.value(), UUID_A);
});

test('continues with a page-session visitor ID when storage is blocked', () => {
  const storage = {
    getItem() { throw new Error('Storage blocked'); },
    setItem() { throw new Error('Storage blocked'); }
  };
  const crypto = { randomUUID: () => UUID_B };

  assert.equal(getOrCreateVisitorId(storage, crypto), UUID_B);
});

test('uses secure random bytes when randomUUID is unavailable', () => {
  const storage = createStorage();
  const crypto = {
    getRandomValues(bytes) {
      bytes.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
      return bytes;
    }
  };

  const visitorId = getOrCreateVisitorId(storage, crypto);
  assert.match(visitorId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(storage.value(), visitorId);
});

test('fails closed when secure randomness is unavailable', () => {
  assert.throws(
    () => getOrCreateVisitorId(createStorage(), {}),
    /Secure random number generation is unavailable/
  );
});
