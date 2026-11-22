/* Apokolips J.A.R.V.I.S — progressive enhancement; no desktop access from browser */
(() => {
  'use strict';
  if (window.__APO_JARVIS_LOADED__) return;
  window.__APO_JARVIS_LOADED__ = true;

  const API_URL = window.APOKOLIPS_JARVIS_API || '';
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;
  let sessionId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'apo-' + Date.now();
  let lastTranscript = '';

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

  function init() {
    if (document.getElementById('apo-jarvis-root')) return;
    const root = make('div', { id: 'apo-jarvis-root' });
    const launch = make('button', { id: 'apo-jarvis-launch', type: 'button', 'aria-label': 'Open J.A.R.V.I.S assistant', 'aria-expanded': 'false' });
    const orb = make('span', { className: 'j-orb', 'aria-hidden': 'true' });
    launch.append(orb, document.createTextNode('J.A.R.V.I.S'));

    const panel = make('section', { id: 'apo-jarvis-panel', role: 'dialog', 'aria-label': 'J.A.R.V.I.S assistant', 'aria-modal': 'false' });
    const head = make('header', { className: 'j-head' });
    const brand = make('div', { className: 'j-brand' });
    brand.append(make('span', { className: 'j-brand-orb', 'aria-hidden': 'true' }, '◈'));
    const brandText = make('div');
    brandText.append(make('strong', {}, 'J.A.R.V.I.S'), make('small', {}, 'APOKOLIPS INTELLIGENCE'));
    brand.append(brandText);
    const close = make('button', { className: 'j-close', type: 'button', 'aria-label': 'Hide J.A.R.V.I.S' }, '×');
    head.append(brand, close);

    const status = make('div', { className: 'j-status' });
    const statusDot = make('span', { className: 'j-status-dot' });
    const statusText = make('span', {}, 'STANDBY · VOICE ACTIVATION AVAILABLE');
    status.append(statusDot, statusText);

    const body = make('div', { className: 'j-body', 'aria-live': 'polite' });
    const welcome = make('div', { className: 'j-welcome' });
    welcome.append(make('h2', {}, 'At your service.'), make('p', {}, 'I am ready when you are. Start voice listening and say “Hey Jarvis”, or type a message below.'));
    body.append(welcome);

    const compose = make('form', { className: 'j-compose' });
    const input = make('input', { type: 'text', placeholder: 'Message J.A.R.V.I.S…', autocomplete: 'off', 'aria-label': 'Message J.A.R.V.I.S' });
    const send = make('button', { type: 'submit' }, 'SEND');
    compose.append(input, send);

    const tools = make('div', { className: 'j-tools' });
    const listen = make('button', { className: 'j-listen', type: 'button' }, '● Start listening');
    const stop = make('button', { type: 'button' }, 'Stop voice');
    const hide = make('button', { type: 'button' }, 'Go back');
    tools.append(listen, stop, hide);
    const note = make('div', { className: 'j-note' }, 'Microphone access is used only after you press “Start listening”. Browser voice recognition availability varies by device. AI replies require the secure Apokolips assistant service to be connected.');
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
      panel.classList.remove('j-open');
      launch.setAttribute('aria-expanded', 'false');
      if (keepWakeListening && listening) setStatus('HIDDEN · SAY “HEY JARVIS” TO RETURN', true);
    }
    function addMessage(message, who) {
      const item = make('div', { className: 'j-message ' + (who === 'user' ? 'j-user' : 'j-ai') }, message);
      body.append(item);
      body.scrollTop = body.scrollHeight;
      return item;
    }
    function speak(message) {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'en-US';
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
    }
    async function sendMessage(message) {
      const clean = message.trim();
      if (!clean) return;
      addMessage(clean, 'user');
      input.value = '';
      if (!API_URL) {
        const reply = 'My interface is online, but the Apokolips AI service has not been connected yet. I cannot generate a real AI answer until the secure backend is deployed.';
        addMessage(reply, 'ai');
        setStatus('INTERFACE ONLINE · AI SERVICE NOT CONNECTED');
        return;
      }
      const pending = addMessage('Thinking…', 'ai');
      setStatus('PROCESSING REQUEST…', true);
      try {
        const response = await fetch(API_URL.replace(/\/$/, '') + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: clean, sessionId })
        });
        if (!response.ok) throw new Error('Assistant service returned ' + response.status);
        const data = await response.json();
        const reply = typeof data.reply === 'string' ? data.reply : 'The assistant service returned an unsupported response.';
        pending.textContent = reply;
        setStatus('CONNECTED · READY', true);
        speak(reply);
      } catch (error) {
        pending.textContent = 'I could not reach the Apokolips AI service. Please try again later.';
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
        setStatus('LISTENING · SAY “HEY JARVIS”', true);
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
          const wake = lower.match(/\b(?:hey\s+)?jarvis\b/);
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
    if (new URLSearchParams(location.search).get('assistant') === 'jarvis') {
      open();
      // Keep the requested /jarvis/ URL while rendering the main homepage.
      history.replaceState({}, '', '/jarvis/');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
