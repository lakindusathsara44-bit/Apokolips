import React, { useEffect, useMemo, useState } from 'react';

const skills = [
  { name: 'Web Development', group: 'Development', level: 'Learning & building', icon: '⌘' },
  { name: 'JavaScript & React', group: 'Development', level: 'Learning & building', icon: 'JS' },
  { name: 'Programming', group: 'Development', level: 'Exploring', icon: '{ }' },
  { name: 'Artificial Intelligence', group: 'Technology', level: 'Exploring', icon: '✳' },
  { name: 'Education Technology', group: 'Technology', level: 'Interested', icon: '▤' },
  { name: 'Electronics & Arduino', group: 'Technology', level: 'Hands-on projects', icon: '⌁' }
];

const contactDetails = [
  { label: 'PERSONAL WEBSITE', value: 'www.apokolips.xyz', href: 'https://www.apokolips.xyz', icon: '◎', copy: 'https://www.apokolips.xyz' },
  { label: 'EMAIL', value: 'lakindusathsara65@gmail.com', href: 'mailto:lakindusathsara65@gmail.com', icon: '✉', copy: 'lakindusathsara65@gmail.com' },
  { label: 'WHATSAPP', value: '+94 70 380 9347', href: 'https://wa.me/94703809347', icon: '◉', copy: '+94703809347' }
];

function RainCanvas() {
  useEffect(() => {
    const canvas = document.getElementById('info-rain');
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let frame = 0;
    let drops = [];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drops = Array.from({ length: Math.max(28, Math.min(75, Math.floor(width / 12))) }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        length: 3 + Math.random() * 6,
        speed: 0.7 + Math.random() * 1.4,
        alpha: 0.15 + Math.random() * 0.32
      }));
    };

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      drops.forEach(drop => {
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - 0.5, drop.y + drop.length);
        ctx.strokeStyle = 'rgba(160, 205, 255, ' + drop.alpha + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
        drop.y += drop.speed;
        if (drop.y > height + 8) {
          drop.y = -12;
          drop.x = Math.random() * width;
        }
      });
      frame = requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    if (!reduceMotion) animate();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <canvas id="info-rain" className="info-rain" aria-hidden="true" />;
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [skillFilter, setSkillFilter] = useState('All');
  const [copied, setCopied] = useState('');
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);

  const visibleSkills = useMemo(
    () => skillFilter === 'All' ? skills : skills.filter(skill => skill.group === skillFilter),
    [skillFilter]
  );

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
      setShowTop(window.scrollY > 480);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const nodes = document.querySelectorAll('.info-reveal');
    if (!('IntersectionObserver' in window)) {
      nodes.forEach(node => node.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [skillFilter]);

  const copyText = async (label, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(current => current === label ? '' : current), 1800);
    } catch {
      setCopied('Copy unavailable');
    }
  };

  const downloadVCard = () => {
    const card = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Lakindu Sathsara',
      'TITLE:Student of SLIATE HNDIT',
      'EMAIL:lakindusathsara65@gmail.com',
      'TEL;TYPE=CELL,WHATSAPP:+94703809347',
      'URL:https://www.apokolips.xyz',
      'END:VCARD'
    ].join('\r\n');
    const blob = new Blob([card], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'Lakindu-Sathsara.vcf';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const shareProfile = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'About Lakindu Sathsara | Apokolips', text: 'Learn more about my interests and projects.', url });
      } else {
        await copyText('Profile link', url);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setCopied('Sharing unavailable');
    }
  };

  const navLinks = [
    ['Home', './index.html'],
    ['About Me', './info.html'],
    ['Community Gallery', './project.gallery.html'],
    ['My Projects', './My-project.html'],
  ];

  return <div className="info-app">
    <RainCanvas />
    <div className="info-scroll-progress" style={{ width: scrollProgress + '%' }} />
    <header className="topbar info-topbar">
      <a className="brand" href="./index.html" aria-label="Apokolips home">
        <span className="brand-mark"><img src="./file_00000000a7ec820890154ca6ed49b608.png" alt="" /></span>
        <span>APOKOLIPS</span>
      </a>
      <button className="menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>☰</button>
      <nav className={'nav ' + (menuOpen ? 'open' : '')} aria-label="Main navigation">
        {navLinks.map(([label, href]) => <a key={label} className={label === 'About Me' ? 'active' : ''} href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}
      </nav>
    </header>

    <main className="page-shell info-shell">
      <section className="info-hero info-reveal">
        <div className="eyebrow"><span className="status-dot" /> 01 / PERSONAL PROFILE</div>
        <h1 className="page-title">A little <span className="gradient-text">about me.</span></h1>
        <p className="page-lead">A curious mind with an interest in technology, learning, and turning ideas into useful projects.</p>
        <div className="info-hero-actions">
          <button className="info-action info-action-primary" type="button" onClick={downloadVCard}>↓ Save contact</button>
          <button className="info-action" type="button" onClick={shareProfile}>↗ Share profile</button>
          <a className="info-action" href="#contact">Contact me <span>↓</span></a>
        </div>
      </section>

      <section className="content-grid info-content-grid">
        <article className="panel profile-panel info-profile-card info-reveal">
          <div className="info-profile-top">
            <div className="avatar info-avatar">LS</div>
            <span className="info-availability"><i /> INDEPENDENT CREATOR</span>
          </div>
          <div className="small-label">PERSONAL DETAILS</div>
          <h2>Lakindu Sathsara</h2>
          <p className="muted-text">Student of SLIATE HNDIT · Technology Enthusiast · Project Creator</p>
          <div className="detail-list">
            <div><span>NAME</span><strong>Lakindu Sathsara</strong><button type="button" aria-label="Copy name" onClick={() => copyText('Name', 'Lakindu Sathsara')}>⧉</button></div>
            <div><span>EDUCATION</span><strong>Student of SLIATE HNDIT</strong></div>
            <div><span>HOMETOWN</span><strong>Rambukkana</strong></div>
            <div><span>COUNTRY</span><strong>Sri Lanka</strong></div>
            <div><span>INTERESTS</span><strong>IT, Web Development, AI &amp; Learning</strong></div>
          </div>
          <div className="info-card-footer"><span>PROFILE / 2026</span><span>APOKOLIPS</span></div>
        </article>

        <article className="panel info-contact-card info-reveal" id="contact">
          <div className="small-label">GET IN TOUCH</div>
          <h2>Let's connect.</h2>
          <p className="muted-text">For questions, collaboration, or project discussions, use the contact details below.</p>
          <div className="info-contact-list">
            {contactDetails.map(item => <div className="contact-item info-contact-item" key={item.label}>
              <span className="contact-symbol">{item.icon}</span>
              <div className="info-contact-copy"><span className="small-label">{item.label}</span><a href={item.href} target={item.href.startsWith('http') ? '_blank' : undefined} rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}>{item.value}</a></div>
              <button type="button" className="copy-button" onClick={() => copyText(item.label, item.copy)} aria-label={'Copy ' + item.label}>⧉</button>
            </div>)}
          </div>
          <p className="info-copy-feedback" aria-live="polite">{copied ? (copied === 'Copy unavailable' || copied === 'Sharing unavailable' ? copied : copied + ' copied') : 'Select a copy icon to copy a contact detail.'}</p>
          <button className="info-vcard-link" type="button" onClick={downloadVCard}>Download contact card <span>↗</span></button>
        </article>
      </section>

      <section className="panel idea-panel info-idea-panel info-reveal">
        <div className="small-label">MY IDEAS &amp; DIRECTION</div>
        <h2>Think. Explore. Build.</h2>
        <p>I enjoy exploring how technology can make learning, everyday tasks, and information more accessible. I am interested in building practical websites and applications, experimenting with AI-powered ideas, and continuously improving my technical skills.</p>
        <div className="tag-row"><span>Web Development</span><span>Artificial Intelligence</span><span>Education Technology</span><span>Creative Projects</span></div>
      </section>

      <section className="info-skills-section info-reveal">
        <div className="info-section-heading"><div><div className="small-label">AREAS I EXPLORE</div><h2>Curiosity in progress<span>.</span></h2></div><p>Interests and technologies I am learning, exploring, and applying through projects.</p></div>
        <div className="info-filter-row" role="group" aria-label="Filter interests">
          {['All', 'Development', 'Technology'].map(filter => <button key={filter} type="button" className={skillFilter === filter ? 'selected' : ''} onClick={() => setSkillFilter(filter)}>{filter}</button>)}
        </div>
        <div className="info-skill-grid">
          {visibleSkills.map((skill, index) => <article className="info-skill-card info-reveal" key={skill.name} style={{ '--reveal-delay': (index * 70) + 'ms' }}>
            <span className="info-skill-icon">{skill.icon}</span><div><h3>{skill.name}</h3><p>{skill.level}</p></div><span className="info-skill-arrow">↗</span>
          </article>)}
        </div>
      </section>

      <section className="panel idea-panel travel-portal info-travel-panel info-reveal">
        <div className="info-travel-orb" aria-hidden="true" />
        <div className="small-label">TRAVEL JOURNAL</div>
        <h2>Explore my journeys.</h2>
        <p className="muted-text">Photos, videos, and memories from the places I visit.</p>
        <a className="travel-button" href="./blog.html">✦ Open Travel Blog <span>↗</span></a>
      </section>
    </main>

    <footer className="footer info-footer"><span>© <span>{new Date().getFullYear()}</span> Lakindu Sathsara</span><span><a href="./index.html">BACK TO HOME ↑</a></span></footer>
    {showTop && <button className="info-back-top" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top">↑</button>}
  </div>;
}

export default App;
