(() => {
  'use strict';
  // Motion-state design reference: https://github.com/Jp-mainieri/procedural-bot-animations (MIT).
  // APOLONIA's SVG artwork and this articulated rig are custom implementations.
  const host = document.getElementById('avatarMount');
  if (!host) return;

  const assetUrl = './apolonia-humanoid.svg?v=20261125-articulated';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {
    mode: 'idle',
    headYaw: 0, headTarget: 0,
    headTilt: 0, headTiltTarget: 0,
    leftShoulder: 0, rightShoulder: 0,
    leftElbow: 0, rightElbow: 0,
    leftWrist: 0, rightWrist: 0,
    mouth: 0, mouthTarget: 0,
    blink: 0, nextBlink: 2.8,
    gestureTime: 0, gesture: 'none',
    gazeX: 0, gazeY: 0,
    last: 0
  };

  let svg, head, eyes, lids, mouth, mouthOpen, pupilLeft, pupilRight;
  let armLeft, armRight, elbowLeft, elbowRight, handLeft, handRight;
  let raf = 0;

  function setTransform(node, angle, x, y) {
    if (node) node.setAttribute('transform', 'rotate(' + angle.toFixed(2) + ' ' + x + ' ' + y + ')');
  }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function ease(current, target, speed, dt) {
    return current + (target - current) * (1 - Math.exp(-speed * dt));
  }

  function attach() {
    head = svg.querySelector('#headPivot');
    eyes = svg.querySelector('#eyes');
    lids = svg.querySelector('#eyelids');
    mouth = svg.querySelector('#mouth');
    mouthOpen = svg.querySelector('#mouthOpen');
    pupilLeft = svg.querySelector('#pupilLeft');
    pupilRight = svg.querySelector('#pupilRight');
    armLeft = svg.querySelector('#leftUpper');
    armRight = svg.querySelector('#rightUpper');
    elbowLeft = svg.querySelector('#leftForearm');
    elbowRight = svg.querySelector('#rightForearm');
    handLeft = svg.querySelector('#leftHand');
    handRight = svg.querySelector('#rightHand');

    svg.addEventListener('pointermove', (event) => {
      const rect = svg.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - .5) * 2;
      const y = ((event.clientY - rect.top) / rect.height - .5) * 2;
      state.gazeX = clamp(x, -.65, .65);
      state.gazeY = clamp(y, -.45, .45);
    }, { passive: true });
    svg.addEventListener('pointerleave', () => { state.gazeX = 0; state.gazeY = 0; });
    window.addEventListener('apolonia:state', onState);
    window.addEventListener('apolonia:turn', onTurn);
    window.addEventListener('apolonia:phoneme', onPhoneme);
    window.addEventListener('apolonia:mouth', onMouth);
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(frame);
  }

  function onState(event) {
    const next = event.detail && event.detail.state || 'idle';
    const previous = state.mode;
    state.mode = next;
    if (next === 'listening' && previous === 'idle') {
      state.gesture = 'welcome';
      state.gestureTime = 0;
      state.headTiltTarget = -.035;
      state.headTarget = 0;
    } else if (next === 'listening') {
      if (state.gesture !== 'turn') state.gesture = 'none';
      state.headTiltTarget = -.025;
    } else if (next === 'thinking') {
      state.gesture = 'think';
      state.gestureTime = 0;
      state.headTiltTarget = .14;
      state.headTarget = -.12;
    } else if (next === 'speaking') {
      state.gesture = 'explain';
      state.gestureTime = 0;
      state.headTiltTarget = 0;
    } else {
      state.gesture = 'none';
      state.headTiltTarget = 0;
      state.headTarget = 0;
      state.mouthTarget = 0;
    }
  }

  function onTurn(event) {
    const direction = event.detail && event.detail.direction;
    state.headTarget = direction === 'left' ? .52 : direction === 'right' ? -.52 : 0;
    state.headTiltTarget = 0;
    state.gesture = 'turn';
    state.gestureTime = 0;
  }

  function onPhoneme(event) {
    if (state.mode !== 'speaking') return;
    const intensity = clamp(Number(event.detail && event.detail.intensity) || .2, 0, 1);
    state.mouthTarget = .18 + intensity * .82;
  }

  function onMouth(event) {
    state.mouthTarget = clamp(Number(event.detail && event.detail.open) || 0, 0, 1);
  }

  function onVisibility() {
    if (document.hidden) cancelAnimationFrame(raf);
    else { state.last = 0; raf = requestAnimationFrame(frame); }
  }

  function frame(timestamp) {
    if (document.hidden || !svg) return;
    const dt = Math.min(.05, state.last ? (timestamp - state.last) / 1000 : .016);
    state.last = timestamp;
    const t = timestamp / 1000;

    const breathing = Math.sin(t * 1.35) * .012;
    const idleSway = state.mode === 'idle' ? Math.sin(t * .62) * .018 : 0;
    const listen = state.mode === 'listening';
    const thinking = state.mode === 'thinking';
    const speaking = state.mode === 'speaking';

    state.headYaw = ease(state.headYaw, state.headTarget + idleSway, 5, dt);
    state.headTilt = ease(state.headTilt, state.headTiltTarget + (thinking ? Math.sin(t * 1.2) * .025 : 0), 4, dt);
    head.style.transformOrigin = '320px 190px';
    head.style.transformBox = 'view-box';
    head.style.transform = 'translateX(' + (state.headYaw * 13).toFixed(2) + 'px) rotate(' + (state.headYaw * 57.2958).toFixed(2) + 'deg) rotate(' + (state.headTilt * 57.2958).toFixed(2) + 'deg)';
    head.style.transformBox = 'view-box';

    // Pupil gaze tracks the pointer slightly, without distracting from the conversation.
    const px = state.gazeX * 5.5, py = state.gazeY * 3.5;
    pupilLeft.setAttribute('transform', 'translate(' + px.toFixed(2) + ' ' + py.toFixed(2) + ')');
    pupilRight.setAttribute('transform', 'translate(' + px.toFixed(2) + ' ' + py.toFixed(2) + ')');

    if (timestamp / 1000 > state.nextBlink && state.blink <= 0) {
      state.blink = 1;
      state.nextBlink = t + 3.1 + Math.random() * 2.5;
    }
    if (state.blink > 0) state.blink = Math.max(0, state.blink - dt * 8);
    lids.setAttribute('opacity', state.blink > .68 ? '1' : '0');
    eyes.style.opacity = state.blink > .68 ? '.18' : '1';

    state.mouth = ease(state.mouth, speaking ? state.mouthTarget : 0, 17, dt);
    const open = state.mouth > .12;
    mouth.setAttribute('opacity', open ? '.12' : '1');
    mouthOpen.setAttribute('opacity', open ? String(clamp(state.mouth, 0, .98)) : '0');
    mouthOpen.style.transformOrigin = '320px 230px';
    mouthOpen.style.transformBox = 'view-box';
    mouthOpen.style.transform = 'scaleY(' + (0.45 + state.mouth * 1.15).toFixed(2) + ')';

    let leftS = 0, rightS = 0, leftE = 0, rightE = 0, leftW = 0, rightW = 0;
    if (listen) {
      leftS = -7 + Math.sin(t * 2) * 1.5;
      rightS = 7 - Math.sin(t * 2) * 1.5;
      leftE = -8; rightE = 8;
    } else if (thinking) {
      // Right hand rises towards the lower face: a clear thinking gesture.
      rightS = -35;
      rightE = -100;
      rightW = -12;
      leftS = 3;
    } else if (speaking) {
      const wave = Math.sin(t * 3.1);
      leftS = -10 + wave * 7;
      rightS = 10 - wave * 7;
      leftE = -10 + Math.sin(t * 3.1 + 1) * 9;
      rightE = 10 - Math.sin(t * 3.1 + 1) * 9;
      leftW = Math.sin(t * 3.5) * 8;
      rightW = -Math.sin(t * 3.5 + 1) * 8;
    } else if (state.gesture === 'welcome' && state.gestureTime < 1.25) {
      leftS = -22 * Math.sin(Math.min(1, state.gestureTime / .55) * Math.PI / 2);
      leftE = -12;
      leftW = 8;
    }
    if (state.gesture === 'welcome' || state.gesture === 'turn') state.gestureTime += dt;

    state.leftShoulder = ease(state.leftShoulder, leftS, 8, dt);
    state.rightShoulder = ease(state.rightShoulder, rightS, 8, dt);
    state.leftElbow = ease(state.leftElbow, leftE, 7, dt);
    state.rightElbow = ease(state.rightElbow, rightE, 7, dt);
    state.leftWrist = ease(state.leftWrist, leftW, 8, dt);
    state.rightWrist = ease(state.rightWrist, rightW, 8, dt);

    setTransform(armLeft, state.leftShoulder, 220, 360);
    setTransform(armRight, state.rightShoulder, 420, 360);
    setTransform(elbowLeft, state.leftElbow, 127, 464);
    setTransform(elbowRight, state.rightElbow, 513, 464);
    setTransform(handLeft, state.leftWrist, 85, 613);
    setTransform(handRight, state.rightWrist, 555, 613);

    const torso = svg.querySelector('#torso');
    torso.setAttribute('transform', 'translate(0 ' + (breathing * 45).toFixed(2) + ')');
    if (!reduceMotion) {
      svg.style.filter = state.mode === 'listening' ? 'drop-shadow(0 0 13px rgba(89,222,255,.18))' : '';
    }
    raf = requestAnimationFrame(frame);
  }

  fetch(assetUrl, { cache: 'no-store' })
    .then(response => { if (!response.ok) throw new Error('SVG asset could not be loaded'); return response.text(); })
    .then(markup => {
      const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
      svg = parsed.documentElement;
      if (parsed.querySelector('parsererror') || svg.nodeName.toLowerCase() !== 'svg') throw new Error('Invalid APOLONIA SVG asset');
      svg.setAttribute('class', 'apolonia-svg');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      host.replaceChildren(document.importNode(svg, true));
      svg = host.querySelector('svg');
      attach();
      onState({ detail: { state: host.parentElement && host.parentElement.dataset.state || 'idle' } });
      host.dataset.ready = 'true';
    })
    .catch(error => {
      console.error('APOLONIA SVG avatar failed:', error);
      host.dataset.avatarError = 'true';
      const status = document.getElementById('statusLine');
      if (status) status.textContent = 'Avatar artwork could not load. Please refresh the page.';
    });
})();