import { NOTES } from "./notes-data.js";
(() => {
  "use strict";
  const search=document.querySelector("#notes-search"),nav=document.querySelector("#topic-nav"),list=document.querySelector("#notes-list"),status=document.querySelector("#search-status");
  const params=new URLSearchParams(location.search),targetQuestion=params.get("question"),targetTopic=params.get("topic");
  const esc=(v)=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const matches=(n,t)=>!t||[n.title,n.subtitle,n.summary,n.difficulty,n.source,...n.questions,...n.explanation.flat(),...n.definitions.flat(),...n.keyPoints,...n.examples].join(" ").toLowerCase().includes(t);
  function renderNav(term=""){
    nav.replaceChildren();
    NOTES.filter(n=>matches(n,term)).forEach(n=>{
      const a=document.createElement("a");a.className="topic-link";a.href="#"+n.id;a.textContent=n.title.replace(/^\d+\. /,"");
      a.addEventListener("click",()=>{const card=document.getElementById(n.id);if(card)card.open=true;});nav.append(a);
    });
  }
  function renderNotes(term=""){
    list.replaceChildren();const found=NOTES.filter(n=>matches(n,term));
    status.textContent=term?found.length+" topic"+(found.length===1?"":"s")+" match your search.":NOTES.length+" learning topics available.";
    if(!found.length){const empty=document.createElement("div");empty.className="empty-state";empty.textContent="No matching notes found. Try another keyword or question number.";list.append(empty);return;}
    found.forEach(n=>{
      const d=document.createElement("details");d.className="note-card";d.id=n.id;d.open=Boolean((targetQuestion&&n.questions.includes(targetQuestion))||targetTopic===n.id);
      const summary=document.createElement("summary"),head=document.createElement("span");
      head.innerHTML='<span class="note-title">'+esc(n.title)+'</span><span class="note-subtitle">'+esc(n.subtitle)+'</span><span class="note-summary">'+esc(n.summary)+'</span><span class="note-meta"><span class="meta-chip">'+esc(n.difficulty)+'</span><span class="meta-chip">'+n.questions.length+' RELATED QUESTIONS</span></span>';
      const arrow=document.createElement("span");arrow.className="chevron";arrow.setAttribute("aria-hidden","true");arrow.textContent="⌄";summary.append(head,arrow);d.append(summary);
      const content=document.createElement("div");content.className="note-content";
      const addTitle=(text)=>{const h=document.createElement("h3");h.textContent=text;content.append(h);};
      addTitle("Detailed explanation");const expl=document.createElement("div");expl.className="explanation";
      n.explanation.forEach(([title,body])=>{const s=document.createElement("section"),h=document.createElement("h4"),p=document.createElement("p");h.textContent=title;p.textContent=body;s.append(h,p);expl.append(s);});content.append(expl);
      addTitle("Important definitions");const defs=document.createElement("div");defs.className="definition-list";
      n.definitions.forEach(([term,meaning])=>{const item=document.createElement("div");item.className="definition";const b=document.createElement("strong"),span=document.createElement("span");b.textContent=term;span.textContent=meaning;item.append(b,span);defs.append(item);});content.append(defs);
      addTitle("Key points to remember");const keys=document.createElement("ul");keys.className="key-list";n.keyPoints.forEach(v=>{const li=document.createElement("li");li.textContent=v;keys.append(li);});content.append(keys);
      addTitle("Examples");const examples=document.createElement("ul");examples.className="example-list";n.examples.forEach(v=>{const li=document.createElement("li");li.textContent=v;examples.append(li);});content.append(examples);
      addTitle("Related assignment questions");const refs=document.createElement("div");refs.className="question-refs";n.questions.forEach(id=>{const a=document.createElement("a");a.className="question-ref";a.href="./assignment.html?question="+encodeURIComponent(id);a.textContent=id;a.title="Return to "+id+" in the assignment";refs.append(a);});content.append(refs);
      const source=document.createElement("p");source.className="note-subtitle";source.style.marginTop="16px";source.textContent="Source basis: "+n.source;content.append(source);
      d.append(content);list.append(d);
    });
    if(targetQuestion&&!term){const n=NOTES.find(x=>x.questions.includes(targetQuestion));if(n)requestAnimationFrame(()=>document.getElementById(n.id)?.scrollIntoView({behavior:"smooth",block:"start"}));}
  }
  function update(){const term=search.value.trim().toLowerCase();renderNav(term);renderNotes(term);}
  search.addEventListener("input",update);search.addEventListener("keydown",e=>{if(e.key==="Escape"){search.value="";update();}});
  document.addEventListener("keydown",e=>{if(e.key==="/"&&!["INPUT","TEXTAREA"].includes(document.activeElement?.tagName)){e.preventDefault();search.focus();}});
  renderNav();renderNotes();
  if(targetQuestion&&!NOTES.some(n=>n.questions.includes(targetQuestion)))status.textContent="Showing all notes. No topic mapping was found for "+targetQuestion+".";
  if(targetTopic&&!NOTES.some(n=>n.id===targetTopic))status.textContent="Showing all notes. The requested topic was not found.";
})();