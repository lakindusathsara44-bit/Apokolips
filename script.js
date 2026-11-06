(() => {
  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav');
  if (menuButton && nav) menuButton.addEventListener('click', () => nav.classList.toggle('open'));
  document.querySelectorAll('#year').forEach(el => el.textContent = new Date().getFullYear());

  const canvas = document.getElementById('particles');
  if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  let width = 0, height = 0, dots = [];
  const count = Math.min(75, Math.floor(window.innerWidth / 17));
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = width * dpr; canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dots = Array.from({length:count}, () => ({x:Math.random()*width,y:Math.random()*height,r:.5+Math.random()*1.25,vx:(Math.random()-.5)*.32,vy:(Math.random()-.5)*.32,a:.18+Math.random()*.42}));
  }
  function draw() {
    ctx.clearRect(0,0,width,height);
    for (const p of dots) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < -5) p.x = width+5; if (p.x > width+5) p.x = -5;
      if (p.y < -5) p.y = height+5; if (p.y > height+5) p.y = -5;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle = 'rgba(155,195,255,'+p.a+')'; ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  resize(); window.addEventListener('resize', resize); draw();
})();