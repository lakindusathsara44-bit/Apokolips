(() => {
  "use strict";
  const COUNTRIES = [
    ["LK","Sri Lanka"],["US","United States"],["GB","United Kingdom"],["IN","India"],["AU","Australia"],["CA","Canada"],["NZ","New Zealand"],["SG","Singapore"],["MY","Malaysia"],["PH","Philippines"],["ID","Indonesia"],["JP","Japan"],["KR","South Korea"],["TH","Thailand"],["AE","United Arab Emirates"],["SA","Saudi Arabia"],["FR","France"],["DE","Germany"],["IT","Italy"],["ES","Spain"],["BR","Brazil"],["ZA","South Africa"],["IE","Ireland"],["PK","Pakistan"],["BD","Bangladesh"],["NP","Nepal"],["MV","Maldives"]
  ];
  const TZ_COUNTRY = {
    "Asia/Colombo":"LK","Asia/Kolkata":"IN","Asia/Dhaka":"BD","Asia/Kathmandu":"NP",
    "Asia/Karachi":"PK","Asia/Male":"MV","Asia/Singapore":"SG","Asia/Kuala_Lumpur":"MY",
    "Asia/Manila":"PH","Asia/Jakarta":"ID","Asia/Tokyo":"JP","Asia/Seoul":"KR",
    "Asia/Bangkok":"TH","Asia/Dubai":"AE","Asia/Riyadh":"SA","Europe/London":"GB",
    "Europe/Dublin":"IE","Europe/Paris":"FR","Europe/Berlin":"DE","Europe/Rome":"IT",
    "Europe/Madrid":"ES","America/New_York":"US","America/Los_Angeles":"US",
    "America/Toronto":"CA","Australia/Sydney":"AU","Pacific/Auckland":"NZ",
    "Africa/Johannesburg":"ZA","America/Sao_Paulo":"BR"
  };
  const LK_EVENTS = {
    2026: [
      ["2026-01-03","Duruthu Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2026-02-01","Navam Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2026-03-02","Medin Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2026-03-21","Eid-ul-Fitr (Ramazan Festival Day)","Islamic","Islamic holiday; date may be adjusted after moon sighting."],
      ["2026-04-01","Bak Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2026-04-03","Good Friday","Christian","Christian commemoration of the Passion of Jesus Christ."],
      ["2026-05-01","Vesak Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2026-05-02","Day following Vesak Full Moon Poya Day","Poya","Public holiday following Vesak."],
      ["2026-05-28","Eid-ul-Adha (Hadji Festival Day)","Islamic","Islamic holiday; date may be adjusted after moon sighting."],
      ["2026-05-30","Adhi Poson Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2026-06-29","Poson Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2026-07-29","Esala Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2026-08-26","Milad-un-Nabi (Prophet's Birthday)","Islamic","Islamic observance; date may be adjusted after moon sighting."],
      ["2026-08-27","Nikini Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2026-09-26","Binara Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2026-10-25","Vap Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2026-11-24","Il Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2026-12-23","Unduvap Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2026-12-25","Christmas Day","Christian","Celebration of the Nativity of Jesus Christ."]
    ],
    2027: [
      ["2027-01-22","Duruthu Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2027-02-20","Navam Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2027-03-10","Eid-ul-Fitr (Ramazan Festival Day)","Islamic","Islamic holiday; date may be adjusted after moon sighting."],
      ["2027-03-22","Medin Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2027-03-26","Good Friday","Christian","Christian commemoration of the Passion of Jesus Christ."],
      ["2027-04-20","Bak Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2027-05-17","Eid-ul-Adha (Hadji Festival Day)","Islamic","Islamic holiday; date may be adjusted after moon sighting."],
      ["2027-05-19","Vesak Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2027-05-20","Day following Vesak Full Moon Poya Day","Poya","Public holiday following Vesak."],
      ["2027-06-18","Poson Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2027-07-18","Esala Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2027-08-15","Milad-un-Nabi (Prophet's Birthday)","Islamic","Islamic observance; date may be adjusted after moon sighting."],
      ["2027-08-16","Nikini Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2027-09-15","Binara Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2027-10-15","Vap Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2027-11-13","Il Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2027-12-13","Unduvap Full Moon Poya Day","Poya","Buddhist full-moon public holiday."],
      ["2027-12-25","Christmas Day","Christian","Celebration of the Nativity of Jesus Christ."]
    ]
  };
  const pad = n => String(n).padStart(2,"0");
  const iso = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
  const fromISO = s => { const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); };
  const easter = year => {
    const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
    return new Date(year,month-1,day);
  };
  const shift = (date,days) => { const d=new Date(date); d.setDate(d.getDate()+days); return d; };
  const catholicEvents = year => {
    const e=easter(year), fixed=[
      [year+"-01-01","Mary, Mother of God","Catholic feast"],
      [year+"-03-19","Saint Joseph, Spouse of the Blessed Virgin Mary","Catholic solemnity"],
      [year+"-03-25","Annunciation of the Lord","Catholic solemnity"],
      [year+"-06-24","Nativity of Saint John the Baptist","Catholic solemnity"],
      [year+"-06-29","Saints Peter and Paul, Apostles","Catholic solemnity"],
      [year+"-08-15","Assumption of the Blessed Virgin Mary","Catholic solemnity"],
      [year+"-11-01","All Saints' Day","Catholic solemnity"],
      [year+"-12-08","Immaculate Conception of the Blessed Virgin Mary","Catholic solemnity"],
      [year+"-12-25","The Nativity of the Lord (Christmas)","Catholic solemnity"]
    ].map(x=>({date:x[0],name:x[1],type:x[2],description:"Catholic liturgical celebration. Displayed during the requested local time window."}));
    const movable=[
      [shift(e,-46),"Ash Wednesday","Catholic liturgical day"],
      [shift(e,-7),"Palm Sunday","Catholic Sunday"],
      [shift(e,-3),"Holy Thursday","Catholic liturgical day"],
      [shift(e,-2),"Good Friday","Catholic liturgical day"],
      [e,"Easter Sunday","Catholic solemnity"],
      [shift(e,39),"Ascension of the Lord","Catholic solemnity"],
      [shift(e,49),"Pentecost Sunday","Catholic solemnity"],
      [shift(e,56),"The Most Holy Trinity","Catholic solemnity"],
      [shift(e,60),"The Most Holy Body and Blood of Christ (Corpus Christi)","Catholic solemnity"],
      [shift(e,68),"The Most Sacred Heart of Jesus","Catholic solemnity"]
    ].map(x=>({date:iso(x[0]),name:x[1],type:x[2],description:"Catholic liturgical celebration. Displayed during the requested local time window."}));
    return [...fixed,...movable];
  };
  const el=(tag,attrs={},textValue="")=>{const n=document.createElement(tag);Object.entries(attrs).forEach(([k,v])=>{if(k==="class")n.className=v;else if(k==="text")n.textContent=v;else n.setAttribute(k,v)});if(textValue)n.textContent=textValue;return n;};
  function mount(){
    if(document.getElementById("apokolips-calendar"))return true;
    const footer=document.querySelector("#root .footer, #root footer, footer.footer");
    if(!footer)return false;
    const section=el("section",{id:"apokolips-calendar",class:"ap-calendar","aria-labelledby":"ap-calendar-title"});
    section.innerHTML = '<div class="ap-calendar-top"><div><p class="ap-calendar-kicker">PLAN AHEAD · STAY IN SYNC</p><h2 id="ap-calendar-title">Global Calendar</h2><p class="ap-calendar-intro">Explore public holidays, cultural observances and Catholic feast days in your country.</p></div><div class="ap-calendar-country"><label for="ap-calendar-country">YOUR COUNTRY</label><select id="ap-calendar-country" aria-label="Choose your country"></select><span id="ap-calendar-country-note">Detecting your region…</span></div></div><div class="ap-calendar-toolbar"><div class="ap-calendar-month"><button type="button" id="ap-calendar-prev" aria-label="Previous month">‹</button><h3 id="ap-calendar-month" aria-live="polite"></h3><button type="button" id="ap-calendar-next" aria-label="Next month">›</button></div><button type="button" id="ap-calendar-today" class="ap-calendar-today">Today</button></div><div class="ap-calendar-layout"><div class="ap-calendar-grid-wrap"><div class="ap-calendar-weekdays" aria-hidden="true"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div id="ap-calendar-days" class="ap-calendar-days" role="group" aria-label="Calendar dates"></div><div class="ap-calendar-legend"><span><i class="poya"></i> Public / cultural</span><span><i class="catholic"></i> Catholic</span><span><i class="islamic"></i> Islamic</span></div></div><aside class="ap-calendar-agenda" aria-live="polite"><p class="ap-calendar-agenda-kicker">DATE DETAILS</p><h3 id="ap-calendar-selected-date">Select a date</h3><div id="ap-calendar-events"><p class="ap-calendar-empty">Choose a highlighted date to see its events.</p></div></aside></div><p class="ap-calendar-source" id="ap-calendar-source">Holiday dates are provided for general planning. Religious dates may change following official announcements or moon sightings.</p><script type="application/ld+json" id="ap-calendar-jsonld">{"@context":"https://schema.org","@type":"ItemList","name":"Apokolips global holiday calendar","itemListElement":[]}</script>';
    footer.parentNode.insertBefore(section,footer);
    init(section);
    return true;
  }
  let activeCountry="",activeYear=0,events=[],monthDate=new Date(),selectedDate=iso(new Date());
  function init(root){
    const select=root.querySelector("#ap-calendar-country");
    COUNTRIES.forEach(([code,name])=>select.add(new Option(name,code)));
    let detected=TZ_COUNTRY[Intl.DateTimeFormat().resolvedOptions().timeZone]||"LK";
    try{const saved=localStorage.getItem("apokolips-calendar-country");if(saved&&COUNTRIES.some(x=>x[0]===saved))detected=saved;}catch{}
    select.value=detected;
    select.addEventListener("change",()=>{activeCountry=select.value;try{localStorage.setItem("apokolips-calendar-country",activeCountry)}catch{};loadEvents();});
    root.querySelector("#ap-calendar-prev").addEventListener("click",()=>{monthDate=new Date(monthDate.getFullYear(),monthDate.getMonth()-1,1);render();});
    root.querySelector("#ap-calendar-next").addEventListener("click",()=>{monthDate=new Date(monthDate.getFullYear(),monthDate.getMonth()+1,1);render();});
    root.querySelector("#ap-calendar-today").addEventListener("click",()=>{monthDate=new Date();selectedDate=iso(new Date());render();});
    activeCountry=detected;loadEvents();
  }
  async function loadEvents(){
    const select=document.getElementById("ap-calendar-country"),note=document.getElementById("ap-calendar-country-note");
    const year=monthDate.getFullYear();activeYear=year;
    note.textContent="Calendar region: "+(COUNTRIES.find(x=>x[0]===activeCountry)?.[1]||activeCountry);
    events=catholicEvents(year);
    if(activeCountry==="LK"){
      (LK_EVENTS[year]||[]).forEach(([date,name,type,description])=>events.push({date,name,type,description}));
      document.getElementById("ap-calendar-source").textContent=LK_EVENTS[year]?"Sri Lanka dates: Ministry of Public Administration / Central Bank holiday calendars. Islamic dates are subject to moon-sighting confirmation.":"Sri Lanka official holiday dates for this year are not yet included. Catholic dates are shown; please check the latest Government Gazette for local holidays.";
    }else{
      document.getElementById("ap-calendar-source").textContent="Public holidays are retrieved from the Nager.Date public-holiday dataset where available. Catholic observances are calculated from the Gregorian liturgical calendar.";
      try{
        const response=await fetch("https://date.nager.at/api/v3/PublicHolidays/"+year+"/"+activeCountry,{headers:{Accept:"application/json"}});
        if(response.ok){const data=await response.json();data.forEach(h=>events.push({date:h.date,name:h.localName||h.name,type:"Public holiday",description:h.name+(h.global?" · National holiday":" · Regional holiday")}));}
      }catch(error){console.warn("Apokolips calendar holiday lookup unavailable",error);}
    }
    events.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
    render();
  }
  function render(){
    const title=document.getElementById("ap-calendar-month"),days=document.getElementById("ap-calendar-days");
    if(!title||!days)return;
    const y=monthDate.getFullYear(),m=monthDate.getMonth();
    title.textContent=new Intl.DateTimeFormat(undefined,{month:"long",year:"numeric"}).format(monthDate);
    days.replaceChildren();
    const first=new Date(y,m,1).getDay(),count=new Date(y,m+1,0).getDate();
    for(let i=0;i<first;i++)days.append(el("span",{class:"ap-calendar-blank","aria-hidden":"true"}));
    for(let d=1;d<=count;d++){
      const date=iso(new Date(y,m,d)),items=events.filter(e=>e.date===date);
      const button=el("button",{type:"button",class:"ap-calendar-day"+(items.length?" has-event":"")+(date===selectedDate?" is-selected":"")+(date===iso(new Date())?" is-today":""),"aria-label":new Intl.DateTimeFormat(undefined,{dateStyle:"full"}).format(new Date(y,m,d))+(items.length?", "+items.map(e=>e.name).join(", "):""),"aria-pressed":date===selectedDate?"true":"false"});
      button.append(el("span",{class:"ap-calendar-day-number",text:String(d)}));
      if(items.length){const dots=el("span",{class:"ap-calendar-dots","aria-hidden":"true"});items.slice(0,3).forEach(e=>dots.append(el("i",{class:categoryClass(e.type)})));button.append(dots);}
      button.addEventListener("click",()=>{selectedDate=date;render();});
      days.append(button);
    }
    renderAgenda();
    updateStructuredData();
  }
  function categoryClass(type){return /catholic/i.test(type)?"catholic":/islam|eid|ramazan/i.test(type)?"islamic":"poya";}
  function renderAgenda(){
    const date=fromISO(selectedDate),heading=document.getElementById("ap-calendar-selected-date"),container=document.getElementById("ap-calendar-events");
    heading.textContent=new Intl.DateTimeFormat(undefined,{dateStyle:"full"}).format(date);
    container.replaceChildren();
    const items=events.filter(e=>e.date===selectedDate);
    if(!items.length){container.append(el("p",{class:"ap-calendar-empty",text:"No listed observances for this date. Select another highlighted day to explore its events."}));return;}
    items.forEach(event=>{
      const card=el("article",{class:"ap-calendar-event "+categoryClass(event.type)});
      card.append(el("span",{class:"ap-calendar-event-type",text:event.type}));
      card.append(el("h4",{text:event.name}));
      card.append(el("p",{text:event.description||"Calendar observance."}));
      if(/catholic/i.test(event.type))card.append(el("p",{class:"ap-calendar-time",text:"12:01 AM – 12:00 PM (local time)"}));
      container.append(card);
    });
  }
  function updateStructuredData(){
    const json=document.getElementById("ap-calendar-jsonld");if(!json)return;
    const list=events.map(e=>({ "@type":"Event","name":e.name,"description":e.description||e.type,"startDate":e.date+( /catholic/i.test(e.type)?"T00:01":"T00:00"),"endDate":e.date+( /catholic/i.test(e.type)?"T12:00":"T23:59"),"eventStatus":"https://schema.org/EventScheduled","location":{"@type":"Place","name":COUNTRIES.find(c=>c[0]===activeCountry)?.[1]||activeCountry}}));
    json.textContent=JSON.stringify({"@context":"https://schema.org","@type":"ItemList","name":"Apokolips holiday and observance calendar","description":"Country-aware public holidays and Catholic feast days.","itemListElement":list.map((item,index)=>({"@type":"ListItem","position":index+1,"item":item}))});
  }
  if(!mount()){
    const observer=new MutationObserver(()=>{if(mount())observer.disconnect();});
    observer.observe(document.getElementById("root")||document.body,{childList:true,subtree:true});
    window.setTimeout(()=>observer.disconnect(),12000);
  }
})();