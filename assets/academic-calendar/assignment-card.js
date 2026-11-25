(() => {
  'use strict';
  function addCard() {
    const shell = document.querySelector('#info-root .info-shell');
    if (!shell || shell.querySelector('#assignments-card')) return false;
    const section = document.createElement('section');
    section.className = 'panel idea-panel info-assignments-card info-reveal';
    section.id = 'assignments-card';
    section.setAttribute('aria-labelledby', 'assignments-card-title');
    section.innerHTML = '<div class="info-assignments-orb" aria-hidden="true"></div><div class="small-label">SLIATE / HNDIT</div><h2 id="assignments-card-title">Assignments.</h2><p class="muted-text">View assignment announcements, subject details and upcoming academic tasks in one place.</p><a class="info-assignments-link" href="./assignment.html">Open Assignments <span aria-hidden="true">↗</span></a>';
    const calendar = shell.querySelector('#academic-calendar-card');
    const footer = shell.querySelector('.info-footer') || shell.querySelector('footer');
    if (calendar) calendar.insertAdjacentElement('afterend', section);
    else if (footer) shell.insertBefore(section, footer);
    else shell.append(section);
    return true;
  }
  if (!addCard()) {
    const root = document.getElementById('info-root') || document.body;
    const observer = new MutationObserver(() => { if (addCard()) observer.disconnect(); });
    observer.observe(root, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 15000);
  }
})();