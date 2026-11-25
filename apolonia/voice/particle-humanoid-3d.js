import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

const canvas = document.getElementById('apoloniaAvatar');
const host = document.getElementById('globeWrap');

if (canvas && host) {
  try {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0.45, 7.35);
    camera.lookAt(0, 0.45, 0);

    scene.add(new THREE.HemisphereLight(0x9bdcff, 0x071326, 2.0));
    const keyLight = new THREE.DirectionalLight(0xc6eaff, 3.0);
    keyLight.position.set(-3.5, 5, 6);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x27bfff, 22, 9);
    rimLight.position.set(3, 1.7, -1.2);
    scene.add(rimLight);
    const fillLight = new THREE.PointLight(0x4e8dff, 12, 8);
    fillLight.position.set(-3, -1.5, 3);
    scene.add(fillLight);

    const avatar = new THREE.Group();
    scene.add(avatar);
    const body = new THREE.Group();
    avatar.add(body);

    const shell = new THREE.MeshPhysicalMaterial({
      color: 0x173b60,
      metalness: 0.72,
      roughness: 0.27,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2
    });
    const brightShell = new THREE.MeshPhysicalMaterial({
      color: 0x27618a,
      metalness: 0.62,
      roughness: 0.24,
      clearcoat: 1
    });
    const darkJoint = new THREE.MeshStandardMaterial({
      color: 0x071629,
      metalness: 0.8,
      roughness: 0.3
    });
    const cyan = new THREE.MeshStandardMaterial({
      color: 0x5eeaff,
      emissive: 0x16a9e8,
      emissiveIntensity: 1.6,
      metalness: 0.35,
      roughness: 0.25
    });

    function sphere(parent, position, scale, material, segments = 40) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, segments, Math.max(16, segments >> 1)),
        material
      );
      mesh.position.set(position[0], position[1], position[2]);
      mesh.scale.set(scale[0], scale[1], scale[2]);
      parent.add(mesh);
      return mesh;
    }

    function capsuleBetween(parent, start, end, radius, material) {
      const a = new THREE.Vector3(start[0], start[1], start[2]);
      const b = new THREE.Vector3(end[0], end[1], end[2]);
      const direction = new THREE.Vector3().subVectors(b, a);
      const length = direction.length();
      const mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(radius, Math.max(0.05, length - radius * 2), 8, 20),
        material
      );
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      parent.add(mesh);
      return mesh;
    }

    // Upper torso and collar: deliberately no pelvis or lower-body geometry.
    const torso = sphere(body, [0, -0.12, 0], [0.78, 0.98, 0.43], shell, 56);
    sphere(body, [0, 0.72, 0.015], [0.78, 0.31, 0.43], brightShell, 48);
    capsuleBetween(body, [0, 0.77, 0], [0, 1.12, 0], 0.19, darkJoint);
    const neck = sphere(body, [0, 1.12, 0], [0.23, 0.3, 0.23], brightShell, 36);

    // A restrained chest plate and illuminated core make the silhouette readable.
    sphere(body, [0, 0.1, 0.414], [0.43, 0.47, 0.045], darkJoint, 40);
    sphere(body, [0, 0.13, 0.46], [0.31, 0.34, 0.035], shell, 40);
    const core = sphere(body, [0, 0.14, 0.5], [0.075, 0.075, 0.025], cyan, 32);

    const shoulderPivots = [];
    const forearms = [];
    const hands = [];
    [-1, 1].forEach((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.68, 0.65, 0);
      body.add(shoulder);
      shoulderPivots.push({ group: shoulder, side });

      sphere(shoulder, [0, 0, 0], [0.29, 0.3, 0.31], brightShell, 40);
      capsuleBetween(shoulder, [0, -0.05, 0], [side * 0.17, -0.62, 0.015], 0.19, shell);
      sphere(shoulder, [side * 0.17, -0.62, 0.015], [0.205, 0.21, 0.21], darkJoint, 32);

      const forearm = new THREE.Group();
      forearm.position.set(side * 0.17, -0.62, 0.015);
      shoulder.add(forearm);
      capsuleBetween(forearm, [0, 0, 0], [side * 0.1, -0.55, 0.04], 0.145, brightShell);
      sphere(forearm, [side * 0.1, -0.55, 0.04], [0.16, 0.16, 0.17], darkJoint, 28);

      const palm = sphere(forearm, [side * 0.12, -0.72, 0.08], [0.19, 0.22, 0.105], shell, 32);
      // Four simple articulated fingers and a thumb, all kept inside the upper-body frame.
      for (let finger = 0; finger < 4; finger++) {
        const x = side * (0.015 + finger * 0.075);
        const fingerLength = 0.16 - Math.abs(1.5 - finger) * 0.018;
        capsuleBetween(forearm, [side * 0.12 + x, -0.83, 0.085], [side * 0.12 + x, -0.83 - fingerLength, 0.09], 0.027, brightShell);
      }
      capsuleBetween(forearm, [side * 0.0, -0.69, 0.08], [side * -0.1, -0.82, 0.1], 0.035, brightShell);
      forearms.push(forearm);
      hands.push(palm);
    });

    // Head pivots independently for natural listening and thinking gestures.
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.28, 0);
    body.add(headPivot);
    const head = sphere(headPivot, [0, 0.42, 0], [0.59, 0.72, 0.49], shell, 64);
    sphere(headPivot, [0, -0.12, 0.37], [0.34, 0.2, 0.16], brightShell, 40);

    // SVG facial features are rasterized by the browser at high resolution,
    // then mapped onto the 3D head as transparent Three.js textures.
    const eyesSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 180"><defs><linearGradient id="eye" x2="0" y2="1"><stop stop-color="#e7ffff"/><stop offset="1" stop-color="#59dfff"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#glow)" fill="url(#eye)"><path d="M55 88 Q128 18 201 88 Q128 158 55 88Z"/><path d="M311 88 Q384 18 457 88 Q384 158 311 88Z"/></g><g fill="#071a31"><ellipse cx="128" cy="88" rx="25" ry="34"/><ellipse cx="384" cy="88" rx="25" ry="34"/></g><g fill="#fff"><circle cx="137" cy="76" r="9"/><circle cx="393" cy="76" r="9"/></g></svg>';
    const mouthSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120"><defs><filter id="g"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="M22 26 Q120 72 218 26 Q205 105 120 108 Q35 105 22 26Z" fill="#071629" stroke="#73efff" stroke-width="7" stroke-linejoin="round" filter="url(#g)"/><path d="M48 39 Q120 70 192 39" fill="none" stroke="#d9ffff" stroke-width="8" stroke-linecap="round"/></svg>';

    function svgTexture(svg) {
      const texture = new THREE.TextureLoader().load(
        'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      return texture;
    }

    const faceMaterial = new THREE.MeshBasicMaterial({
      map: svgTexture(eyesSvg),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const eyes = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.275), faceMaterial);
    eyes.position.set(0, 0.48, 0.465);
    headPivot.add(eyes);

    const mouthMaterial = new THREE.MeshBasicMaterial({
      map: svgTexture(mouthSvg),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.135), mouthMaterial);
    mouth.position.set(0, 0.13, 0.505);
    headPivot.add(mouth);

    // Thin luminous collar arcs give the model a clean, engineered finish.
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.255, 0.018, 8, 64),
      cyan
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.91, 0.02);
    body.add(collar);

    let state = 'idle';
    let targetYaw = 0;
    let currentYaw = 0;
    let mouthEnergy = 0;
    let targetMouth = 0;
    let blink = 0;
    let nextBlink = 3.2;
    let lastTime = 0;
    const clock = new THREE.Clock();

    window.addEventListener('apolonia:state', (event) => {
      state = event.detail && event.detail.state ? event.detail.state : 'idle';
      if (state !== 'speaking') targetMouth = 0;
    });
    window.addEventListener('apolonia:phoneme', (event) => {
      const intensity = Number(event.detail && event.detail.intensity) || 0.2;
      mouthEnergy = Math.max(0.08, Math.min(1, intensity));
      if (state === 'speaking') targetMouth = 0.28 + mouthEnergy * 0.72;
    });
    window.addEventListener('apolonia:mouth', (event) => {
      targetMouth = Math.max(0, Math.min(1, Number(event.detail && event.detail.open) || 0));
    });
    window.addEventListener('apolonia:turn', (event) => {
      const direction = event.detail && event.detail.direction;
      targetYaw = direction === 'left' ? 0.48 : direction === 'right' ? -0.48 : 0;
    });

    function resize() {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    function animate() {
      requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      const delta = Math.min(0.05, elapsed - lastTime || 0.016);
      lastTime = elapsed;

      currentYaw += (targetYaw - currentYaw) * Math.min(1, delta * 3.5);
      avatar.rotation.y = currentYaw + Math.sin(elapsed * 0.34) * 0.025;

      const breathing = Math.sin(elapsed * 1.45) * 0.012;
      torso.scale.y = 0.98 + breathing;
      core.material.emissiveIntensity = state === 'listening' ? 2.8 : state === 'thinking' ? 1.1 : state === 'speaking' ? 3.4 : 1.6;
      core.scale.setScalar(1 + (state === 'speaking' ? Math.sin(elapsed * 10) * 0.13 : Math.sin(elapsed * 2) * 0.035));

      headPivot.rotation.y = Math.sin(elapsed * 0.68) * 0.035 + (state === 'thinking' ? -0.12 : 0);
      headPivot.rotation.x = Math.sin(elapsed * 0.52) * 0.018 + (state === 'listening' ? 0.045 : 0);
      headPivot.rotation.z = state === 'thinking' ? Math.sin(elapsed * 1.1) * 0.055 - 0.08 : Math.sin(elapsed * 0.42) * 0.012;

      shoulderPivots.forEach(({ group, side }) => {
        const gesture = state === 'speaking' ? Math.sin(elapsed * 3.2 + (side > 0 ? 0 : Math.PI)) * 0.11 : 0;
        const listenLift = state === 'listening' ? 0.035 : 0;
        group.rotation.z = side * (Math.sin(elapsed * 0.8) * 0.018 + gesture + listenLift);
        group.rotation.x = state === 'speaking' ? Math.sin(elapsed * 2.5 + side) * 0.045 : 0;
      });

      mouthEnergy += ((state === 'speaking' ? targetMouth : 0) - mouthEnergy) * Math.min(1, delta * 11);
      mouth.scale.y = 0.55 + mouthEnergy * 1.65;

      if (elapsed >= nextBlink) {
        blink = 1;
        nextBlink = elapsed + 3.2 + Math.random() * 2.4;
      }
      if (blink > 0) {
        blink = Math.max(0, blink - delta * 7);
        eyes.scale.y = Math.max(0.08, 1 - blink);
      } else {
        eyes.scale.y += (1 - eyes.scale.y) * Math.min(1, delta * 12);
      }

      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('pagehide', () => {
      resizeObserver.disconnect();
      renderer.dispose();
    }, { once: true });
  } catch (error) {
    console.error('APOLONIA 3D avatar failed to initialize:', error);
    host.dataset.avatarError = 'true';
    const status = document.getElementById('statusLine');
    if (status) status.textContent = '3D avatar unavailable in this browser. Voice controls remain available.';
  }
}
