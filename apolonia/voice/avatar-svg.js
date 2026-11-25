(() => {
  'use strict';
  const host = document.getElementById('avatarMount');
  if (!host) return;

  const assetUrl = './apolonia-humanoid.svg?v=20261125-components-rig';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {
    mode: 'idle',
    head: 0,
    headTarget: 0,
    leftArm: 0,
    rightArm: 0,
    leftHand: 0,
    rightHand: 0,
    mouth: 0,
    mouthTarget: 0,
    blink: 0,
    nextBlink: 3.1,
    gesture: 'none',
    gestureTime: 0,
    gazeX: 0,
    gazeY: 0,
    last: 0
  };

  let svg;
  let headPivot, eyes, lids, mouthLine, mouthOpen, pupilLeft, pupilRight;
  let leftArm, rightArm, leftHand, rightHand, torso;
  let raf = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const ease = (current, target, speed, dt) => current + (target - current) * (1 - Math.exp(-speed * dt));
  const rotate = (node, angle, x, y) => {
    if (node) node.setAttribute('transform', 'rotate(' + angle.toFixed(2) + ' ' + x + ' ' + y + ')');
  };

  function attach() {
    headPivot = svg.querySelector('#headPivot');
    eyes = svg.querySelector('#eyes');
    lids = svg.querySelector('#eyelids');
    mouthLine = svg.querySelector('#mouthLine');
    mouthOpen = svg.querySelector('#mouthOpen');
    pupilLeft = svg.querySelector('#pupilLeft');
    pupilRight = svg.querySelector('#pupilRight');
    leftArm = svg.querySelector('#leftArm');
    rightArm = svg.querySelector('#rightArm');
    leftHand = svg.querySelector('#leftHand');
    rightHand = svg.querySelector('#rightHand');
    torso = svg.querySelector('#torso');

    const required = [headPivot, eyes, lids, mouthLine, mouthOpen, pupilLeft, pupilRight, leftArm, rightArm, leftHand, rightHand, torso];
    if (required.some(node => !node)) throw new Error('APOLONIA avatar is missing an animation part.');

    svg.addEventListener('pointermove', event => {
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      state.gazeX = clamp(((event.clientX - rect.left) / rect.width - .5) * 2, -.55, .55);
      state.gazeY = clamp(((event.clientY - rect.top) / rect.height - .5) * 2, -.4, .4);
    }, { passive: true });
    svg.addEventListener('pointerleave', () => {
      state.gazeX = 0;
      state.gazeY = 0;
    });

    window.addEventListener('apolonia:state', onState);
    window.addEventListener('apolonia:turn', onTurn);
    window.addEventListener('apolonia:phoneme', onPhoneme);
    window.addEventListener('apolonia:mouth', onMouth);
    document.addEventListener('visibilitychange', onVisibility);
    onState({ detail: { state: host.parentElement?.dataset.state || 'idle' } });
    raf = requestAnimationFrame(frame);
  }

  function onState(event) {
    const next = event.detail?.state || 'idle';
    const previous = state.mode;
    state.mode = next;
    state.gestureTime = 0;

    if (next === 'listening') {
      state.gesture = previous === 'idle' ? 'welcome' : 'attentive';
      state.headTarget = 0;
    } else if (next === 'thinking') {
      state.gesture = 'think';
      state.headTarget = 7;
    } else if (next === 'speaking') {
      state.gesture = 'explain';
      state.headTarget = 0;
    } else {
      state.gesture = 'none';
      state.headTarget = 0;
      state.mouthTarget = 0;
    }
  }

  function onTurn(event) {
    const direction = event.detail?.direction;
    state.headTarget = direction === 'left' ? -15 : direction === 'right' ? 15 : 0;
    state.gesture = 'turn';
    state.gestureTime = 0;
  }

  function onPhoneme(event) {
    if (state.mode !== 'speaking') return;
    const intensity = clamp(Number(event.detail?.intensity) || .2, 0, 1);
    state.mouthTarget = .16 + intensity * .84;
  }

  function onMouth(event) {
    state.mouthTarget = clamp(Number(event.detail?.open) || 0, 0, 1);
  }

  function onVisibility() {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else {
      state.last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  function frame(timestamp) {
    if (document.hidden || !svg) return;
    const dt = Math.min(.05, state.last ? (timestamp - state.last) / 1000 : .016);
    state.last = timestamp;
    const t = timestamp / 1000;

    const idleSway = state.mode === 'idle' ? Math.sin(t * .7) * 2.2 : 0;
    const thinkingTilt = state.mode === 'thinking' ? Math.sin(t * 1.3) * 1.5 : 0;
    state.head = ease(state.head, state.headTarget + idleSway + thinkingTilt, 5.5, dt);
    rotate(headPivot, state.head, 100, 88);

    const gazeX = state.gazeX * 2.7;
    const gazeY = state.gazeY * 1.8;
    pupilLeft.setAttribute('transform', 'translate(' + gazeX.toFixed(2) + ' ' + gazeY.toFixed(2) + ')');
    pupilRight.setAttribute('transform', 'translate(' + gazeX.toFixed(2) + ' ' + gazeY.toFixed(2) + ')');

    if (t > state.nextBlink && state.blink <= 0) {
      state.blink = 1;
      state.nextBlink = t + 3.2 + Math.random() * 2.8;
    }
    if (state.blink > 0) state.blink = Math.max(0, state.blink - dt * 8.5);
    lids.setAttribute('opacity', state.blink > .68 ? '1' : '0');
    eyes.style.opacity = state.blink > .68 ? '.16' : '1';

    state.mouth = ease(state.mouth, state.mode === 'speaking' ? state.mouthTarget : 0, 17, dt);
    const open = state.mouth > .1;
    mouthLine.setAttribute('opacity', open ? '.12' : '1');
    mouthOpen.setAttribute('opacity', open ? String(clamp(state.mouth, 0, .98)) : '0');
    const mouthScale = (0.55 + state.mouth * .85).toFixed(2);
    mouthOpen.setAttribute('transform', 'translate(0 113) scale(1 ' + mouthScale + ') translate(0 -113)');

    let leftTarget = 0;
    let rightTarget = 0;
    let leftHandTarget = 0;
    let rightHandTarget = 0;

    if (state.gesture === 'welcome' && state.gestureTime < 1.25) {
      leftTarget = -17 * Math.sin(Math.min(1, state.gestureTime / .5) * Math.PI / 2);
      leftHandTarget = 10 + Math.sin(t * 9) * 4;
    } else if (state.mode === 'listening') {
      leftTarget = -3;
      rightTarget = 3;
      leftHandTarget = Math.sin(t * 1.4) * 2;
      rightHandTarget = -Math.sin(t * 1.4) * 2;
    } else if (state.mode === 'thinking') {
      rightTarget = -27;
      rightHandTarget = -9;
      leftTarget = 2;
    } else if (state.mode === 'speaking') {
      leftTarget = -5 + Math.sin(t * 2.8) * 3.5;
      rightTarget = 5 - Math.sin(t * 2.8) * 3.5;
      leftHandTarget = Math.sin(t * 3.2) * 5;
      rightHandTarget = -Math.sin(t * 3.2 + .8) * 5;
    }
    state.gestureTime += dt;

    state.leftArm = ease(state.leftArm, leftTarget, 7.5, dt);
    state.rightArm = ease(state.rightArm, rightTarget, 7.5, dt);
    state.leftHand = ease(state.leftHand, leftHandTarget, 8, dt);
    state.rightHand = ease(state.rightHand, rightHandTarget, 8, dt);

    // Each complete arm stays nested in its shoulder group; only its wrist/finger cluster moves independently.
    rotate(leftArm, state.leftArm, 76, 144);
    rotate(rightArm, state.rightArm, 124, 144);
    rotate(leftHand, state.leftHand, 68, 184);
    rotate(rightHand, state.rightHand, 132, 184);

    const breathe = reduceMotion ? 0 : Math.sin(t * 1.25) * 1.1;
    torso.setAttribute('transform', 'translate(0 ' + breathe.toFixed(2) + ')');
    if (!reduceMotion) svg.style.filter = state.mode === 'listening' ? 'drop-shadow(0 0 12px rgba(89,222,255,.22))' : '';

    raf = requestAnimationFrame(frame);
  }

  fetch(assetUrl, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error('SVG asset could not be loaded');
      return response.text();
    })
    .then(markup => {
      const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
      const root = parsed.documentElement;
      if (parsed.querySelector('parsererror') || root.nodeName.toLowerCase() !== 'svg') {
        throw new Error('Invalid APOLONIA SVG asset');
      }
      root.setAttribute('class', 'apolonia-svg');
      root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      host.replaceChildren(document.importNode(root, true));
      svg = host.querySelector('svg');
      attach();
      host.dataset.ready = 'true';
    })
    .catch(error => {
      console.error('APOLONIA SVG avatar failed:', error);
      host.dataset.avatarError = 'true';
      const status = document.getElementById('statusLine');
      if (status) status.textContent = 'Avatar artwork could not load. Please refresh the page.';
    });
})();
