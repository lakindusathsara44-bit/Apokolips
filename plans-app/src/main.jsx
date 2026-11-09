import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './supabase.js';
import './styles.css';

const fallbackPlans = [
  { plan_code: 'go', name: 'Apokolips Go', subdomain_limit: 1, price_lkr: 150, display_order: 1 },
  { plan_code: 'plus', name: 'Apokolips Plus', subdomain_limit: 5, price_lkr: 750, display_order: 2 },
  { plan_code: 'pro', name: 'Apokolips Pro', subdomain_limit: 20, price_lkr: 3000, display_order: 3 },
  { plan_code: 'premium', name: 'Apokolips Premium', subdomain_limit: 40, price_lkr: 6000, display_order: 4 }
];

const planCopy = {
  go: { tier: '01 / STARTER', description: 'A simple starting point for one website, portfolio, or project.', features: ['1 custom subdomain', 'DNS connection guidance', 'Email application support'] },
  plus: { tier: '02 / CREATOR', description: 'A flexible package for several websites and growing ideas.', features: ['5 custom subdomains', 'Organise multiple projects', 'DNS connection guidance'] },
  pro: { tier: '03 / PROFESSIONAL', description: 'More room for a collection of services, products, and projects.', features: ['20 custom subdomains', 'For multiple brands or projects', 'DNS connection guidance'], popular: true },
  premium: { tier: '04 / ADVANCED', description: 'Our largest package for managing a wider digital presence.', features: ['40 custom subdomains', 'For larger project collections', 'DNS connection guidance'] }
};

function App() {
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [databaseWarning, setDatabaseWarning] = useState('');
  const [withWww, setWithWww] = useState(false);
  const [chosenPlan, setChosenPlan] = useState(null);
  const [form, setForm] = useState({ customer_name: '', email: '', whatsapp: '', requested_subdomain: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadPlans() {
      const { data, error } = await supabase
        .from('apokolips_plans')
        .select('plan_code,name,subdomain_limit,price_lkr,billing_interval,display_order')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (!active) return;
      if (error) {
        setPlans(fallbackPlans);
        setDatabaseWarning('Live plan details are temporarily unavailable. Displaying the latest published prices.');
      } else if (data?.length) {
        setPlans(data);
      } else {
        setPlans(fallbackPlans);
        setDatabaseWarning('No active plans were returned. Displaying the latest published prices.');
      }
      setLoadingPlans(false);
    }
    loadPlans();
    return () => { active = false; };
  }, []);

  const pricing = useMemo(() => plans.map((plan) => ({
    ...plan,
    ...(planCopy[plan.plan_code] || {}),
    price: Number(plan.price_lkr) + (withWww ? Number(plan.subdomain_limit) * 50 : 0)
  })), [plans, withWww]);

  function choosePlan(plan) {
    setChosenPlan(plan);
    setFormMessage('');
    setFormError('');
    window.setTimeout(() => document.getElementById('application-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submitApplication(event) {
    event.preventDefault();
    if (!chosenPlan || submitting) return;

    const names = form.requested_subdomain.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
    const validName = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
    if (!names.length || names.length > Number(chosenPlan.subdomain_limit) || names.some((name) => !validName.test(name))) {
      setFormError('Enter between 1 and ' + chosenPlan.subdomain_limit + ' valid subdomain name(s). Use lowercase letters, numbers, and hyphens only.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    setFormMessage('');
    const requestNotes = [
      form.notes.trim(),
      'www support: ' + (withWww ? 'requested' : 'not requested'),
      'Package price at application: LKR ' + pricing.find((item) => item.plan_code === chosenPlan.plan_code)?.price?.toLocaleString('en-LK')
    ].filter(Boolean).join('\n');

    const { error } = await supabase.from('apokolips_orders').insert([{
      customer_name: form.customer_name.trim(),
      email: form.email.trim().toLowerCase(),
      whatsapp: form.whatsapp.trim() || null,
      plan_code: chosenPlan.plan_code,
      requested_subdomain: names.join(', '),
      notes: requestNotes || null
    }]);

    setSubmitting(false);
    if (error) {
      setFormError('We could not submit your application. Please check your details and try again. If the problem continues, contact apokolips.contact@gmail.com.');
      return;
    }

    setFormMessage('Your application has been submitted successfully. The Apokolips team will review it and contact you by email.');
    setForm({ customer_name: '', email: '', whatsapp: '', requested_subdomain: '', notes: '' });
    setChosenPlan(null);
  }

  return <div className="plans-app">
    <div className="plans-orb plans-orb-one" aria-hidden="true" />
    <div className="plans-orb plans-orb-two" aria-hidden="true" />
    <main className="plans-container">
      <div className="plans-kicker"><span className="live-dot" /> APOKOLIPS / SUBDOMAIN SERVICES</div>
      <section className="plans-hero">
        <div className="hero-copy">
          <p className="overline">YOUR IDEA. YOUR OWN ADDRESS.</p>
          <h1>Give your next idea<br /><span>a place to live.</span></h1>
          <p className="hero-description">A memorable Apokolips.xyz address for your website, business, portfolio, or next big project. Choose a package that fits the way you build.</p>
          <div className="hero-points"><span><i>✦</i> Custom subdomain</span><span><i>✦</i> Monthly packages</span><span><i>✦</i> Online application</span></div>
        </div>
        <div className="domain-preview" aria-label="Example subdomain address">
          <div className="preview-top"><span /><span /><span /><small>YOUR DIGITAL SPACE</small></div>
          <div className="preview-address"><b>yourname</b><span>.apokolips.xyz</span></div>
          <div className="preview-line" />
          <div className="preview-caption">A simple address. A world of possibilities.</div>
          <div className="preview-glow" />
        </div>
      </section>

      <section className="audience-section">
        <div><p className="section-label">BUILT FOR DIFFERENT IDEAS</p><h2>What will you create?</h2></div>
        <p className="audience-intro">From a first student project to a growing online business, bring your own hosting and give it a clear web address.</p>
        <div className="audience-grid">
          {['University projects','Small shops & businesses','Personal portfolios','Education websites','Class & course sites','Community projects','Blogs & information sites','Something new'].map((item, i) => <div className="audience-item" key={item}><span>{String(i + 1).padStart(2, '0')}</span>{item}</div>)}
        </div>
      </section>

      <section className="pricing-section" id="packages">
        <div className="pricing-heading">
          <div><p className="section-label">SIMPLE MONTHLY PACKAGES</p><h2>Choose your plan<span>.</span></h2><p className="pricing-subtitle">Every package gives you a set number of subdomains under apokolips.xyz.</p></div>
          <div className="www-control">
            <div className="www-copy"><b>Include www support</b><small>Also configure www.yourname.apokolips.xyz</small></div>
            <button type="button" className={'switch ' + (withWww ? 'switch-on' : '')} role="switch" aria-checked={withWww} aria-label="Include www support" onClick={() => setWithWww(!withWww)}><span /></button>
          </div>
        </div>
        <div className="price-note">{loadingPlans ? 'Loading live package details…' : 'Showing ' + (withWww ? 'packages with www support' : 'standard packages without www')} <span>·</span> www adds LKR 50 per subdomain / month</div>
        {databaseWarning && <p className="database-warning" role="status">{databaseWarning}</p>}
        <div className="plan-cards">
          {pricing.map((plan) => <article key={plan.plan_code} className={'plan-card ' + (plan.popular ? 'plan-popular' : '')}>
            {plan.popular && <div className="popular-label">POPULAR CHOICE</div>}
            <div className="plan-tier">{plan.tier}</div>
            <h3>{plan.name}</h3>
            <p className="plan-description">{plan.description}</p>
            <div className="plan-price"><span className="currency">LKR</span> {plan.price.toLocaleString('en-LK')}<small> / month</small></div>
            <div className="plan-count"><strong>{plan.subdomain_limit}</strong> subdomain{Number(plan.subdomain_limit) > 1 ? 's' : ''}</div>
            <div className="plan-divider" />
            <ul>{plan.features.map((feature) => <li key={feature}><span>✓</span>{feature}</li>)}</ul>
            <button className="choose-button" type="button" onClick={() => choosePlan(plan)}>Apply for this plan <span>↗</span></button>
          </article>)}
        </div>
        <p className="pricing-footnote">Prices are monthly package totals. www support is optional and adds LKR 50 per subdomain per month.</p>

        {chosenPlan && <section className="application-panel" id="application-form">
          <div className="application-heading"><p className="section-label">PLAN APPLICATION</p><h2>Apply for {chosenPlan.name}<span>.</span></h2><p>Selected package: {chosenPlan.subdomain_limit} subdomain(s) · LKR {pricing.find((item) => item.plan_code === chosenPlan.plan_code)?.price?.toLocaleString('en-LK')} / month</p></div>
          <form className="application-form" onSubmit={submitApplication}>
            <label>Full name<input name="customer_name" value={form.customer_name} onChange={updateForm} autoComplete="name" required maxLength="120" placeholder="Your full name" /></label>
            <label>Email address<input name="email" type="email" value={form.email} onChange={updateForm} autoComplete="email" required maxLength="254" placeholder="you@example.com" /></label>
            <label>Phone / WhatsApp <span className="optional-label">Optional</span><input name="whatsapp" type="tel" value={form.whatsapp} onChange={updateForm} autoComplete="tel" maxLength="30" placeholder="+94..." /></label>
            <label className="form-wide">Preferred subdomain name(s)<small>Enter one name per line or separate multiple names with commas. Maximum {chosenPlan.subdomain_limit}.</small><textarea name="requested_subdomain" value={form.requested_subdomain} onChange={updateForm} required rows="3" placeholder={'e.g. myportfolio' + (Number(chosenPlan.subdomain_limit) > 1 ? '\nmyproject' : '')} /></label>
            <label className="form-wide">Project details <span className="optional-label">Optional</span><textarea name="notes" value={form.notes} onChange={updateForm} rows="3" maxLength="1500" placeholder="Tell us briefly about your website or project." /></label>
            {formError && <p className="form-error form-wide" role="alert">{formError}</p>}
            <div className="form-actions form-wide"><button className="submit-application" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit application'} <span>↗</span></button><button className="cancel-application" type="button" onClick={() => { setChosenPlan(null); setFormError(''); }}>Cancel</button></div>
          </form>
        </section>}
        {formMessage && <p className="form-success" role="status">{formMessage}</p>}
      </section>

      <section className="how-section">
        <div className="how-heading"><p className="section-label">GET STARTED</p><h2>Three steps to get going.</h2></div>
        <div className="steps-grid">
          <div className="step"><span>01</span><h3>Choose a package</h3><p>Select the number of subdomains and decide whether you need www support.</p></div>
          <div className="step"><span>02</span><h3>Send your application</h3><p>Complete the online form with your contact details and preferred subdomain names.</p></div>
          <div className="step"><span>03</span><h3>We review your request</h3><p>The Apokolips team will contact you about availability, setup, and next steps.</p></div>
        </div>
      </section>

      <section className="examples-section">
        <div><p className="section-label">MAKE IT YOURS</p><h2>Ideas deserve good addresses.</h2><p>Request a name that suits your website, subject to availability.</p></div>
        <div className="domain-tags">{['yourname','myportfolio','mybusiness','shop','blog','project'].map((name) => <span key={name}>{name}<b>.apokolips.xyz</b></span>)}</div>
      </section>

      <section className="important-note">
        <div className="note-icon">i</div>
        <div><h3>Before you apply</h3><p>These packages provide <strong>subdomains only</strong>. Website hosting, storage, and website files are not included. You must arrange your own hosting provider that supports custom domains. DNS connection and HTTPS availability depend on your hosting provider.</p><p>Submitting an application does not automatically activate a subdomain or complete a payment. Subdomain names are subject to availability and review.</p></div>
      </section>
      <footer className="plans-footer"><span>© {new Date().getFullYear()} APOKOLIPS</span><a href="https://apokolips.xyz/">BACK TO APOKOLIPS ↗</a><span>IDEAS BECOME SOMETHING REAL.</span></footer>
    </main>
  </div>;
}

createRoot(document.getElementById('plans-react-root')).render(<App />);
