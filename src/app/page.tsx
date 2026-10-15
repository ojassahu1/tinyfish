import PreviewPanel from "./preview-panel";

const features = [
  { id: "01", title: "Pricing, without the guesswork", text: "Compare displayed prices, billing periods, and plan limits while keeping every figure tied to its source.", visual: "pricing-art" },
  { id: "02", title: "A clear record of what moved", text: "Compare successful page snapshots over time. An incomplete scan never counts as a feature removal.", visual: "snapshot-art" },
  { id: "03", title: "Interpretation with receipts", text: "Separate an observed change from a possible implication, with the original source excerpt close by.", visual: "evidence-art" },
  { id: "04", title: "Briefs your team can verify", text: "Bring a reporting period into focus with source references and clearly marked unknowns.", visual: "report-art" },
];

const questions = [
  ["What am I seeing in this preview?", "The dashboard figures and competitor examples are illustrative sample content. They are not fetched from real companies."],
  ["Is live monitoring connected here?", "No. This workspace currently contains a visual product preview only; there is no live monitoring or account backend connected."],
  ["What pages should a monitoring product check?", "Public pricing, product, feature, and changelog pages are useful sources. Pages behind authentication or access controls should not be monitored."],
  ["How should AI-generated analysis be treated?", "As interpretation, not fact. Factual claims should remain linked to source pages and supporting evidence."],
  ["What happens when a page scan fails?", "A failed or incomplete fetch should be recorded as a scan issue, never presented as evidence that a competitor removed something."],
  ["Can I use these sample prices in a report?", "No. They are visual demo content and do not represent actual competitor pricing."],
];

export default function Home() {
  return (
    <>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="CompetitorIQ home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>competitor<span className="brand-accent">iq</span></span></a>
        <nav className="main-nav" aria-label="Main navigation"><a href="#platform">Platform</a><a href="#workflow">How it works</a><a href="#faq">FAQ</a><a href="/app">Workspace</a></nav>
        <a className="header-cta" href="/app">Open workspace <span aria-hidden="true">↗</span></a>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-copy">
            <p className="eyebrow"><span className="status-dot" /> COMPETITIVE INTELLIGENCE, WITH EVIDENCE</p>
            <h1>Your competitors never stand still. <span>Neither should you.</span></h1>
            <p className="hero-description">Track the pages that matter. See what changed, when it changed, and the source behind every signal.</p>
            <div className="hero-actions"><a className="button button-primary" href="#demo">Explore the demo <span aria-hidden="true">↘</span></a><a className="text-link" href="#workflow">See how it works <span aria-hidden="true">→</span></a></div>
            <p className="hero-note"><span className="note-mark" aria-hidden="true">i</span> Preview data is illustrative, not live competitor monitoring.</p>
          </div>
          <div className="hero-product" id="demo"><div className="product-caption"><span>PRODUCT PREVIEW</span><span className="demo-pill">DEMO WORKSPACE</span></div><PreviewPanel /></div>
          <div className="hero-footnote"><span>01 / 04</span><span>One source of truth for your market</span><i /></div>
        </section>

        <section className="signal-strip"><p>Built for teams who need <strong>signal, not noise.</strong></p><div><span>VERIFIED SOURCES</span><span>CHANGE HISTORY</span><span>HUMAN JUDGMENT</span></div></section>

        <section className="platform-section section-wrap" id="platform">
          <div className="section-heading"><p className="eyebrow eyebrow-dark">A BETTER VIEW OF THE FIELD</p><h2>From scattered pages<br />to a sharper picture.</h2><p>Useful intelligence starts with what a competitor actually published. The rest should be clearly marked as interpretation.</p></div>
          <div className="feature-grid">{features.map((feature) => <article className="feature" key={feature.id}>
            <div className={`feature-art ${feature.visual}`} aria-hidden="true">
              {feature.visual === "pricing-art" && <div className="price-sheet"><div><b>Starter</b><span>$18 <small>/ seat</small></span></div><div><b>Growth</b><span>$42 <small>/ seat</small></span></div><footer><span>DISPLAYED PRICE</span><strong>+12%</strong></footer></div>}
              {feature.visual === "snapshot-art" && <div className="browser-sheet"><div className="browser-bar"><i /><i /><i /><span>company.example / product</span></div><div className="browser-content"><b>One workspace.<br />More room to build.</b><i /><i /><i /></div><span className="capture-tag">SNAPSHOT · 09:42</span></div>}
              {feature.visual === "evidence-art" && <div className="evidence-sheet"><span>SOURCE EXCERPT · VERIFIED</span><blockquote>“Unlimited projects are now included on every paid plan.”</blockquote><footer><i /> Feature limit changed</footer></div>}
              {feature.visual === "report-art" && <div className="report-sheet"><div><span>MARKET BRIEF</span><span>Q3 / 2026</span></div><b>Signals worth<br />a closer look.</b><section>{[42, 72, 58, 92, 52, 76, 61].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</section><small>4 sources · 2 open questions</small></div>}
            </div>
            <div className="feature-meta"><span>{feature.id}</span><span>COMPETITORIQ</span></div><h3>{feature.title}</h3><p>{feature.text}</p>
          </article>)}</div>
        </section>

        <section className="workflow-section" id="workflow"><div className="section-wrap workflow-inner">
          <div className="workflow-heading"><p className="eyebrow">A GROUNDED WORKFLOW</p><h2>Observe first.<br /><span>Interpret second.</span></h2><p>Every useful conclusion starts with a page, a timestamp, and a comparison you can inspect.</p></div>
          <ol className="workflow-list"><li><span>01</span><div><h3>Choose the pages</h3><p>Focus on public pricing, product, feature, or changelog pages.</p></div><i aria-hidden="true">↗</i></li><li><span>02</span><div><h3>Capture the evidence</h3><p>Compare timestamped snapshots only after a successful fetch.</p></div><i aria-hidden="true">⌁</i></li><li><span>03</span><div><h3>Decide what matters</h3><p>Review the observed fact, source, and any separate interpretation.</p></div><i aria-hidden="true">→</i></li></ol>
        </div></section>

        <section className="trust-section section-wrap"><div><p className="eyebrow eyebrow-dark">A NOTE ON TRUST</p><h2>Confidence should come from the evidence.</h2><p>Missing data should stay unknown. Speculation should stay labeled. A source should always be close enough to check.</p></div><ul><li><i>✓</i><span>Source references alongside findings</span><b>01</b></li><li><i>✓</i><span>Original prices and billing periods retained</span><b>02</b></li><li><i>✓</i><span>Failed scans never treated as product changes</span><b>03</b></li><li><i>✓</i><span>Unverified details remain explicitly unknown</span><b>04</b></li></ul></section>

        <section className="faq-section" id="faq"><div className="faq-inner"><p className="eyebrow">THE DETAILS</p><h2>Frequently asked questions.</h2><div className="faq-list">{questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div><p className="faq-note">This page is a product preview. It does not connect to live competitor data.</p></div></section>
      </main>

      <footer className="site-footer"><a className="brand" href="#top"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>competitor<span className="brand-accent">iq</span></span></a><p>Know what changed. Know what it means.</p><span>PRODUCT PREVIEW · MONITORING NOT CONNECTED</span></footer>
    </>
  );
}
