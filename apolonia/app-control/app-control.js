/* APOLONIA App Control — shared, permission-aware app launcher.
 * This browser layer opens native app composers with prefilled content.
 * It never sends messages silently. Native Android bridge can be added later.
 */
(() => {
  'use strict';
  if (window.ApoloniaAppControl) return;

  const STORAGE_KEY = 'apolonia.trustedContacts.v1';
  const APPS = new Set(['sms', 'whatsapp', 'telegram', 'gmail']);

  function readContacts() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value.filter(x => x && typeof x.name === 'string') : [];
    } catch (_) { return []; }
  }

  function normalizePhone(value) {
    return String(value || '').replace(/[^+\d]/g, '').replace(/^00/, '+');
  }

  function saveTrustedContact(contact) {
    if (!contact || !String(contact.name || '').trim()) throw new Error('Contact name is required.');
    const channels = {};
    ['sms', 'whatsapp', 'telegram'].forEach(app => {
      const number = normalizePhone(contact[app] || '');
      if (number) channels[app] = number;
    });
    const email = String(contact.gmail || contact.email || '').trim();
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
      channels.gmail = email;
    }
    if (!Object.keys(channels).length) throw new Error('Add at least one phone number or email address.');
    const contacts = readContacts();
    const id = String(contact.id || (globalThis.crypto?.randomUUID?.() || 'contact-' + Date.now()));
    const entry = {
      id,
      name: String(contact.name).trim().slice(0, 80),
      channels,
      trustedAt: new Date().toISOString()
    };
    const next = contacts.filter(x => x.id !== id && x.name.toLowerCase() !== entry.name.toLowerCase());
    next.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return entry;
  }

  function removeTrustedContact(id) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readContacts().filter(x => x.id !== id)));
  }

  function listTrustedContacts() {
    return readContacts().map(({id, name, channels, trustedAt}) => ({id, name, channels, trustedAt}));
  }

  function findTrustedContact(name, app) {
    const key = String(name || '').trim().toLowerCase();
    if (!key || !APPS.has(app)) return null;
    return readContacts().find(c => c.name.toLowerCase() === key && c.channels && c.channels[app]) || null;
  }

  function buildComposerUrl(app, address, message, options = {}) {
    const body = String(message || '').trim();
    const subject = String(options.subject || '').trim();
    const encoded = encodeURIComponent(body);
    if (app === 'sms') return 'sms:' + encodeURIComponent(address) + '?body=' + encoded;
    if (app === 'whatsapp') return 'https://wa.me/' + encodeURIComponent(address.replace(/\D/g, '')) + '?text=' + encoded;
    if (app === 'telegram') return 'tg://resolve?phone=' + encodeURIComponent(address.replace(/\D/g, '')) + '&text=' + encoded;
    if (app === 'gmail') return 'mailto:' + encodeURIComponent(address) + '?subject=' + encodeURIComponent(subject) + '&body=' + encoded;
    throw new Error('Unsupported app.');
  }

  async function openComposer({app, contactName, message, subject = ''}) {
    if (!APPS.has(app)) throw new Error('Unsupported app.');
    const contact = findTrustedContact(contactName, app);
    if (!contact) throw new Error('This person is not saved as a trusted contact for ' + app + '. Add or authorize the contact first.');
    if (!String(message || '').trim()) throw new Error('Message content is empty.');

    const request = { app, contactName: contact.name, address: contact.channels[app], message: String(message).trim(), subject };
    // A future signed native wrapper can implement this bridge with Android intents.
    if (window.ApoloniaNativeBridge && typeof window.ApoloniaNativeBridge.openComposer === 'function') {
      return window.ApoloniaNativeBridge.openComposer(request);
    }
    const url = buildComposerUrl(app, request.address, request.message, {subject});
    const opened = window.open(url, '_blank', 'noopener');
    if (!opened && app !== 'sms') window.location.href = url;
    return {opened: true, app, contactName: contact.name, requiresUserSend: true};
  }

  function parseCommand(text) {
    const value = String(text || '').trim();
    // Explicit, unambiguous command format works in either Text or Voice:
    // "send WhatsApp to Mano: I'll be 10 minutes late"
    const english = value.match(/^(?:send|message)\\s+(sms|whatsapp|telegram|gmail|email)\\s+(?:message\\s+)?to\\s+([^:]{1,80})\\s*:\\s*([\\s\\S]+)$/i);
    const sinhala = value.match(/^(sms|whatsapp|telegram|gmail|email)\\s+එකෙන්\\s+(.{1,80}?)ට\\s+(?:පණිවිඩයක්|email එකක්)\\s+යවන්න\\s*:\\s*([\\s\\S]+)$/i);
    const match = english || sinhala;
    if (!match) return null;
    const app = match[1].toLowerCase() === 'email' ? 'gmail' : match[1].toLowerCase();
    return {app, contactName: match[2].trim(), message: match[3].trim()};
  }

  function manageTrustedContacts() {
    const name = window.prompt('Trusted contact name:');
    if (!name || !name.trim()) return;
    const sms = window.prompt('Authorize SMS for this contact? Enter number with country code, or leave blank:', '');
    const whatsapp = window.prompt('Authorize WhatsApp for this contact? Enter number with country code, or leave blank:', '');
    const telegram = window.prompt('Authorize Telegram for this contact? Enter number with country code, or leave blank:', '');
    const gmail = window.prompt('Authorize Gmail for this contact? Enter email address, or leave blank:', '');
    const entry = saveTrustedContact({name, sms, whatsapp, telegram, gmail});
    window.alert('Saved ' + entry.name + ' on this device. Only the channels you filled in are authorized.');
    return entry;
  }

  window.ApoloniaAppControl = Object.freeze({
    version: '0.1.0',
    apps: Object.freeze(['sms', 'whatsapp', 'telegram', 'gmail']),
    listTrustedContacts,
    saveTrustedContact,
    removeTrustedContact,
    findTrustedContact,
    buildComposerUrl,
    openComposer,
    manageTrustedContacts
  });
})();
