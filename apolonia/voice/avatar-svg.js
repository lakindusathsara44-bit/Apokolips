(() => {
  'use strict';
  const host = document.getElementById('avatarMount');
  if (!host) return;
  const assetUrl = './apolonia-humanoid.svg?v=20261125-original-artwork';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let svg, motion, raf = 0, last = 0;
  const state = { mode: 'idle', angle: 0, target: 0 };
  function onState(event) {
    state.mode = event.detail?.state || 'idle';
    state.target = state.mode === 'thinking' ? 1.25 : state.mode === 'listening' ? -.35 : 0;
  }
  function onTurn(event) {
    state.target = event.detail?.direction === 'left' ? -1.5 : event.detail?.direction === 'right' ? 1.5 : 0;
  }
  function frame(now) {
    if (!svg || document.hidden) return;
    const dt = Math.min(.05, last ? (now - last) / 1000 : .016);
    last = now;
    const t = now / 1000;
    const extra = state.mode === 'idle' ? Math.sin(t * .65) * .45 : state.mode === 'speaking' ? Math.sin(t * 3.2) * .28 : 0;
    const target = reduceMotion ? 0 : state.target + extra;
    state.angle += (target - state.angle) * (1 - Math.exp(-4.5 * dt));
    const bob = reduceMotion ? 0 : Math.sin(t * (state.mode === 'speaking' ? 3.2 : 1.15)) * (state.mode === 'speaking' ? 1.15 : .7);
    motion.setAttribute('transform', 'translate(175 ' + (175 + bob).toFixed(2) + ') rotate(' + state.angle.toFixed(2) + ') translate(-175 -175)');
    raf = requestAnimationFrame(frame);
  }
  function onVisibility() {
    if (document.hidden) cancelAnimationFrame(raf);
    else { last = 0; raf = requestAnimationFrame(frame); }
  }
  fetch(assetUrl, { cache: 'no-cache' })
    .then(response => { if (!response.ok) throw new Error('SVG asset returned ' + response.status); return response.text(); })
    .then(markup => {
      const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
      if (parsed.querySelector('parsererror')) throw new Error('Invalid APOLONIA SVG artwork.');
      const root = parsed.documentElement;
      motion = root.querySelector('#avatarMotion');
      if (!motion || !root.querySelector('#originalArtwork')) throw new Error('Original APOLONIA artwork is incomplete.');
      root.classList.add('apolonia-svg');
      root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      host.replaceChildren(document.importNode(root, true));
      svg = host.querySelector('svg');
      motion = svg.querySelector('#avatarMotion');
      window.addEventListener('apolonia:state', onState);
      window.addEventListener('apolonia:turn', onTurn);
      document.addEventListener('visibilitychange', onVisibility);
      onState({ detail: { state: host.parentElement?.dataset.state || 'idle' } });
      raf = requestAnimationFrame(frame);
      host.dataset.ready = 'true';
    })
    .catch(error => {
      console.error('APOLONIA original SVG avatar failed:', error);
      host.dataset.avatarError = 'true';
      const status = document.getElementById('statusLine');
      if (status) status.textContent = 'Avatar artwork could not load. Please refresh the page.';
    });
})();
