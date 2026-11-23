/* Apokolips APOLONIA AI — progressive enhancement; no desktop access from browser */
(() => {
  'use strict';
  if (window.__APO_APOLONIA_LOADED__) return;
  window.__APO_APOLONIA_LOADED__ = true;

  const API_URL = window.APOKOLIPS_APOLONIA_API || window.APOKOLIPS_JARVIS_API || '';
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;
  let sessionId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'apo-' + Date.now();
  let lastTranscript = '';
  const chatHistory = [];

  const make = (tag, attrs = {}, text = '') => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'className') el.className = value;
      else if (key === 'type') el.type = value;
      else if (key.startsWith('aria-')) el.setAttribute(key, value);
      else el[key] = value;
    });
    if (text) el.textContent = text;
    return el;
  };


  // Render model Markdown as safe DOM nodes (no raw HTML injection).
  function renderInline(parent, source) {
    const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*]+)\*|_([^_]+)_|`([^`]+)`/g;
    let last = 0, match;
    while ((match = pattern.exec(source))) {
      if (match.index > last) parent.append(document.createTextNode(source.slice(last, match.index)));
      let node;
      if (match[1] !== undefined) {
        node = document.createElement('a');
        node.href = match[2];
        node.target = '_blank';
        node.rel = 'noopener noreferrer';
        node.textContent = match[1];
      } else if (match[3] !== undefined || match[4] !== undefined) {
        node = document.createElement('strong'); node.textContent = match[3] ?? match[4];
      } else if (match[5] !== undefined) {
        node = document.createElement('del'); node.textContent = match[5];
      } else if (match[6] !== undefined || match[7] !== undefined) {
        node = document.createElement('em'); node.textContent = match[6] ?? match[7];
      } else {
        node = document.createElement('code'); node.textContent = match[8];
      }
      parent.append(node);
      last = pattern.lastIndex;
    }
    if (last < source.length) parent.append(document.createTextNode(source.slice(last)));
  }

  function renderMarkdown(container, markdown) {
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    container.replaceChildren();
    container.classList.add('j-markdown');
    const isTableDivider = line => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
    const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (/^\s*```/.test(line)) {
        const language = line.trim().slice(3).trim();
        const code = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
        if (i < lines.length) i++;
        const pre = document.createElement('pre'), codeEl = document.createElement('code');
        if (language) codeEl.dataset.language = language;
        codeEl.textContent = code.join('\n'); pre.append(codeEl); container.append(pre);
        continue;
      }
      if (i + 1 < lines.length && line.includes('|') && isTableDivider(lines[i + 1])) {
        const headers = cells(line); i += 2;
        const table = document.createElement('table'), thead = document.createElement('thead'), tr = document.createElement('tr');
        headers.forEach(value => { const th = document.createElement('th'); renderInline(th, value); tr.append(th); });
        thead.append(tr); table.append(thead);
        const tbody = document.createElement('tbody');
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
          const values = cells(lines[i++]), row = document.createElement('tr');
          headers.forEach((_, index) => { const td = document.createElement('td'); renderInline(td, values[index] || ''); row.append(td); });
          tbody.append(row);
        }
        table.append(tbody); container.append(table); continue;
      }
      const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
      if (heading) {
        const el = document.createElement('h' + heading[1].length); renderInline(el, heading[2]); container.append(el); i++; continue;
      }
      if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) { container.append(document.createElement('hr')); i++; continue; }
      if (/^\s*>/.test(line)) {
        const quote = document.createElement('blockquote');
        while (i < lines.length && /^\s*>/.test(lines[i])) { const p = document.createElement('p'); renderInline(p, lines[i++].replace(/^\s*>\s?/, '')); quote.append(p); }
        container.append(quote); continue;
      }
      const listMatch = line.match(/^\s*([-*+] |\d+\. )(.*)$/);
      if (listMatch) {
        const ordered = /^\s*\d+\./.test(line), list = document.createElement(ordered ? 'ol' : 'ul');
        while (i < lines.length) {
          const item = lines[i].match(/^\s*(?:[-*+] |\d+\. )(.*)$/);
          if (!item) break;
          const li = document.createElement('li'); renderInline(li, item[1]); list.append(li); i++;
        }
        container.append(list); continue;
      }
      const paragraph = [];
      while (i < lines.length && lines[i].trim() &&
        !/^\s*(#{1,6}\s|>|\`\`\`|---+\s*$|___+\s*$|\*\*\*+\s*$|[-*+] |\d+\. )/.test(lines[i]) &&
        !(i + 1 < lines.length && lines[i].includes('|') && isTableDivider(lines[i + 1]))) {
        paragraph.push(lines[i++].trim());
      }
      const p = document.createElement('p'); renderInline(p, paragraph.join(' ')); container.append(p);
    }
  }

  function plainText(markdown) {
    return String(markdown || '')
      .replace(/```[\s\S]*?```/g, ' code block ')
      .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, '$1')
      .replace(/[*_~#>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function init() {
    if (document.getElementById('apo-jarvis-root')) return;
    const root = make('div', { id: 'apo-jarvis-root' });
    const launch = make('button', { id: 'apo-jarvis-launch', type: 'button', 'aria-label': 'Open APOLONIA AI assistant', 'aria-expanded': 'false' });
    const orb = make('span', { className: 'j-orb', 'aria-hidden': 'true' });
    launch.append(orb, document.createTextNode('APOLONIA AI'));

    const panel = make('section', { id: 'apo-jarvis-panel', role: 'dialog', 'aria-label': 'APOLONIA AI assistant', 'aria-modal': 'false' });
    const head = make('header', { className: 'j-head' });
    const brand = make('div', { className: 'j-brand' });
    brand.append(make('span', { className: 'j-brand-orb', 'aria-hidden': 'true' }, '◈'));
    const brandText = make('div');
    brandText.append(make('strong', {}, 'APOLONIA AI'), make('small', {}, 'APOKOLIPS INTELLIGENCE'));
    brand.append(brandText);
    const close = make('button', { className: 'j-close', type: 'button', 'aria-label': 'Hide APOLONIA AI' }, '×');
    const voiceMode = make('a', { className: 'j-voice-mode', href: '/apolonia/voice/', 'aria-label': 'Open APOLONIA Voice' }, 'VOICE');
    head.append(brand, voiceMode, close);

    const status = make('div', { className: 'j-status' });
    const statusDot = make('span', { className: 'j-status-dot' });
    const statusText = make('span', {}, 'STANDBY · VOICE ACTIVATION AVAILABLE');
    status.append(statusDot, statusText);

    const body = make('div', { className: 'j-body', 'aria-live': 'polite' });
    const welcome = make('div', { className: 'j-welcome' });
    welcome.append(make('h2', {}, 'At your service.'), make('p', {}, 'I am ready when you are. Start voice listening and say “Hey Apolonia”, or type a message below.'));
    body.append(welcome);

    const compose = make('form', { className: 'j-compose' });
    const input = make('input', { type: 'text', placeholder: 'Message APOLONIA AI…', autocomplete: 'off', 'aria-label': 'Message APOLONIA AI' });
    const send = make('button', { type: 'submit' }, 'SEND');
    compose.append(input, send);

    const tools = make('div', { className: 'j-tools' });
    const listen = make('button', { className: 'j-listen', type: 'button' }, '● Start listening');
    const stop = make('button', { type: 'button' }, 'Stop voice');
    const hide = make('button', { type: 'button' }, 'Go back');
    tools.append(listen, stop, hide);
    const note = make('div', { className: 'j-note' }, 'Microphone access is used only after you press “Start listening”. Browser voice recognition availability varies by device. AI replies require the secure APOLONIA AI backend.');
    panel.append(head, status, body, compose, tools, note);
    root.append(launch, panel);
    document.body.append(root);

    function setStatus(message, ready = false) {
      statusText.textContent = message;
      status.classList.toggle('j-ready', ready);
    }
    function open() {
      panel.classList.add('j-open');
      launch.setAttribute('aria-expanded', 'true');
      input.focus({ preventScroll: true });
    }
    function stopListening() {
      listening = false;
      if (recognition) {
        try { recognition.stop(); } catch (_) {}
      }
      listen.textContent = '● Start listening';
      listen.classList.remove('j-listen');
      setStatus('STANDBY · VOICE LISTENING OFF');
    }
    function hidePanel(keepWakeListening = false) {
      if (!keepWakeListening) stopListening();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      resetSpeechButton();
      panel.classList.remove('j-open');
      launch.setAttribute('aria-expanded', 'false');
      if (keepWakeListening && listening) setStatus('HIDDEN · SAY “HEY APOLONIA” TO RETURN', true);
    }
    function addMessage(message, who) {
      const item = make('div', { className: 'j-message ' + (who === 'user' ? 'j-user' : 'j-ai') }, message);
      body.append(item);
      body.scrollTop = body.scrollHeight;
      return item;
    }
    let activeSpeechButton = null;
    function resetSpeechButton() {
      if (activeSpeechButton) {
        activeSpeechButton.textContent = '🔊 Read aloud';
        activeSpeechButton.setAttribute('aria-label', 'Read this response aloud');
        activeSpeechButton.classList.remove('j-speaking');
        activeSpeechButton = null;
      }
    }
    function speak(message) {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
      window.speechSynthesis.cancel();
      resetSpeechButton();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'en-US';
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
    }
    function addSpeakerControl(item, message) {
      const button = make('button', {
        className: 'j-speak-btn',
        type: 'button',
        'aria-label': 'Read this response aloud'
      }, '🔊 Read aloud');
      button.addEventListener('click', () => {
        if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
          button.textContent = 'Voice unavailable';
          return;
        }
        if (activeSpeechButton === button) {
          window.speechSynthesis.cancel();
          resetSpeechButton();
          return;
        }
        window.speechSynthesis.cancel();
        resetSpeechButton();
        const utterance = new SpeechSynthesisUtterance(plainText(message));
        utterance.lang = 'en-US';
        utterance.rate = 1;
        activeSpeechButton = button;
        button.textContent = '■ Stop reading';
        button.setAttribute('aria-label', 'Stop reading this response');
        button.classList.add('j-speaking');
        utterance.onend = resetSpeechButton;
        utterance.onerror = resetSpeechButton;
        window.speechSynthesis.speak(utterance);
      });
      item.append(button);
    }
    async function sendMessage(message) {
      const clean = message.trim();
      if (!clean) return;
      addMessage(clean, 'user');
      chatHistory.push({ role: 'user', content: clean });
      input.value = '';
      if (!API_URL) {
        const reply = 'My interface is online, but the APOLONIA AI backend is not connected yet. I cannot generate a real AI answer until the secure backend is deployed.';
        const offlineReply = addMessage(reply, 'ai');
        addSpeakerControl(offlineReply, reply);
        setStatus('INTERFACE ONLINE · AI SERVICE NOT CONNECTED');
        return;
      }
      const pending = addMessage('Thinking…', 'ai');
      setStatus('PROCESSING REQUEST…', true);
      try {
        const payload = { message: clean, sessionId, history: [] };
        const encoder = new TextEncoder();
        // Netlify rejects request bodies above 20 KB. Keep recent context within 18 KB,
        // accounting for UTF-8 Sinhala and other multibyte text.
        for (const entry of chatHistory.slice(-16).reverse()) {
          const compactEntry = {
            role: entry.role,
            content: entry.content.slice(0, 1200)
          };
          const candidate = { ...payload, history: [compactEntry, ...payload.history] };
          if (encoder.encode(JSON.stringify(candidate)).length > 18000) break;
          payload.history.unshift(compactEntry);
        }
        const response = await fetch(API_URL.replace(/\/$/, '') + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          if (response.status === 413) {
            throw new Error('This conversation is too large. Please start a new chat to continue.');
          }
          throw new Error('Assistant service returned ' + response.status);
        }
        const data = await response.json();
        const reply = typeof data.reply === 'string' ? data.reply : 'The assistant service returned an unsupported response.';
        renderMarkdown(pending, reply);
        chatHistory.push({ role: 'assistant', content: reply });
        addSpeakerControl(pending, reply);
        setStatus('CONNECTED · READY', true);
      } catch (error) {
        pending.textContent = 'I could not reach the APOLONIA AI service. Please try again later.';
        setStatus('CONNECTION ERROR');
      }
      body.scrollTop = body.scrollHeight;
    }
    function beginListening() {
      if (!SpeechRecognition) {
        setStatus('VOICE RECOGNITION NOT SUPPORTED');
        addMessage('This browser does not provide speech recognition. Try a supported Chromium-based browser, or use the text box.', 'ai');
        return;
      }
      if (listening) return;
      recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onstart = () => {
        listening = true;
        listen.textContent = '● Listening…';
        listen.classList.add('j-listen');
        setStatus('LISTENING · SAY “HEY APOLONIA”', true);
      };
      recognition.onresult = event => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (!event.results[i].isFinal) continue;
          const transcript = event.results[i][0].transcript.trim();
          if (!transcript || transcript === lastTranscript) continue;
          lastTranscript = transcript;
          const lower = transcript.toLowerCase().replace(/[.,!?]/g, '').trim();
          const dismissCommand = /^(go back|hide yourself|leave|goodbye|close|dismiss)$/;
          if (panel.classList.contains('j-open') && dismissCommand.test(lower)) {
            speak('Certainly. I will stand by.');
            hidePanel(true);
            continue;
          }
          const wake = lower.match(/\b(?:hey\s+)?(?:apolonia(?:\s+ai)?|jarvis)\b/);
          if (wake) {
            open();
            const command = lower.slice(wake.index + wake[0].length).replace(/^[\s,]+/, '').trim();
            if (dismissCommand.test(command)) {
              speak('Certainly. I will stand by.');
              hidePanel(true);
            } else if (command) {
              sendMessage(transcript.slice(wake.index + wake[0].length).replace(/^[\s,]+/, ''));
            } else {
              setStatus('AWAKE · HOW CAN I HELP?', true);
              speak('Yes? I am listening.');
            }
          } else if (panel.classList.contains('j-open')) {
            sendMessage(transcript);
          }
        }
      };
      recognition.onerror = event => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setStatus('MICROPHONE PERMISSION DENIED');
        else if (event.error !== 'no-speech') setStatus('VOICE ERROR · ' + event.error.toUpperCase());
      };
      recognition.onend = () => {
        if (listening) {
          listening = false;
          listen.textContent = '● Start listening';
          listen.classList.remove('j-listen');
          setStatus('VOICE SESSION ENDED');
        }
      };
      try { recognition.start(); } catch (_) { setStatus('VOICE COULD NOT START'); }
    }

    launch.addEventListener('click', open);
    close.addEventListener('click', hidePanel);
    hide.addEventListener('click', hidePanel);
    stop.addEventListener('click', stopListening);
    listen.addEventListener('click', beginListening);
    compose.addEventListener('submit', event => {
      event.preventDefault();
      sendMessage(input.value);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && panel.classList.contains('j-open')) hidePanel();
    });
    const assistantRoute = new URLSearchParams(location.search).get('assistant');
    if (assistantRoute === 'apolonia' || assistantRoute === 'jarvis') {
      open();
      // Keep the new canonical route while rendering the main homepage.
      history.replaceState({}, '', '/apolonia/');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
