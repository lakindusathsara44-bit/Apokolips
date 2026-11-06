(() => {
  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav');
  if (menuButton && nav) menuButton.addEventListener('click', () => nav.classList.toggle('open'));
  document.querySelectorAll('#year').forEach(el => el.textContent = new Date().getFullYear());

  // Subtle falling-rain particles: each drop falls a short distance, then starts again.
  const canvas = document.getElementById('rain');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width = 0, height = 0, drops = [];
  const count = Math.min(150, Math.max(65, Math.floor(window.innerWidth / 7)));

  function makeDrop(randomY = true) {
    return {
      x: Math.random() * width,
      y: randomY ? Math.random() * height : -Math.random() * 80,
      length: 4 + Math.random() * 7,
      speed: 1.1 + Math.random() * 2.0,
      drift: -0.12 + Math.random() * 0.24,
      alpha: 0.32 + Math.random() * 0.42,
      distance: 100 + Math.random() * 260,
      travelled: 0
    };
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drops = Array.from({ length: count }, () => makeDrop());
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < drops.length; i++) {
      const p = drops[i];
      p.y += p.speed;
      p.x += p.drift;
      p.travelled += p.speed;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.drift * 1.5, p.y + p.length);
      ctx.strokeStyle = 'rgba(175,210,255,' + p.alpha + ')';
      ctx.lineWidth = 1.25;
      ctx.stroke();

      if (p.travelled >= p.distance || p.y > height + 8) {
        drops[i] = makeDrop(false);
      }
    }
    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  draw();
})();
