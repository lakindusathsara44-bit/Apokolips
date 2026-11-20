/* Lightweight reveal animation for Apokolips.Blog pages */
(() => {
  const nodes=[...document.querySelectorAll('main .panel,main .post,main .metric,main .charts,main .table-wrap,main .grid,main .toolbar')];
  if(!('IntersectionObserver' in window)){nodes.forEach(n=>n.classList.add('ap-visible'));return;}
  nodes.forEach(n=>n.classList.add('ap-reveal'));
  const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('ap-visible');io.unobserve(e.target)}}),{threshold:.08,rootMargin:'0px 0px -24px 0px'});
  nodes.forEach(n=>io.observe(n));
})();
