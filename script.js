(() => {
  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav');
  if (menuButton && nav) menuButton.addEventListener('click', () => nav.classList.toggle('open'));
  document.querySelectorAll('#year').forEach(el => el.textContent = new Date().getFullYear());

  // Public site-wide visitor counter (shared namespace across Apokolips pages).
  const footer = document.querySelector('.footer');
  if (footer && !footer.querySelector('.visitor-counter')) {
    const counter = document.createElement('div');
    counter.className = 'visitor-counter';
    counter.setAttribute('aria-label', 'Public Apokolips visitor counter');
    counter.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#aab4c3;font:10px "DM Mono",monospace;letter-spacing:.7px;';
    const label = document.createElement('span');
    label.textContent = 'TOTAL VISITORS';
    const value = document.createElement('span');
    value.className = 'counterapi';
    value.setAttribute('aria-live', 'polite');
    value.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;min-width:34px;min-height:22px;padding:2px 8px;border:1px solid rgba(112,169,255,.28);border-radius:5px;background:rgba(112,169,255,.07);color:#c7dcff;font-weight:700;letter-spacing:1px;';
    counter.append(label, value);
    footer.appendChild(counter);

    if (!document.querySelector('script[data-apokolips-counter]')) {
      const counterScript = document.createElement('script');
      counterScript.src = 'https://counterapi.com/c.js?ns=apokolips.xyz';
      counterScript.async = true;
      counterScript.dataset.apokolipsCounter = 'true';
      counterScript.onerror = () => {
        value.textContent = '—';
        value.title = 'Visitor count is temporarily unavailable';
      };
      document.body.appendChild(counterScript);
    }
  }

  const canvas = document.getElementById('rain');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, drops = [];
  let raf = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const amount = Math.max(45, Math.min(110, Math.floor(w / 8)));
    drops = Array.from({length: amount}, () => ({
      x: Math.random() * w, y: Math.random() * h,
      length: 3 + Math.random() * 5,
      speed: 0.8 + Math.random() * 1.7,
      opacity: 0.35 + Math.random() * 0.5,
      travel: 0, limit: 90 + Math.random() * 180
    }));
  }

  function animate() {
    ctx.clearRect(0, 0, w, h);
    for (const d of drops) {
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 0.5, d.y + d.length);
      ctx.strokeStyle = 'rgba(170,205,255,' + d.opacity + ')';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      d.y += d.speed;
      d.travel += d.speed;
      if (d.travel >= d.limit || d.y > h + 10) {
        d.x = Math.random() * w;
        d.y = -Math.random() * 35;
        d.travel = 0;
        d.limit = 90 + Math.random() * 180;
      }
    }
    raf = requestAnimationFrame(animate);
  }
  resize();
  window.addEventListener('resize', resize, {passive:true});
  if (raf) cancelAnimationFrame(raf);
  animate();
})();
