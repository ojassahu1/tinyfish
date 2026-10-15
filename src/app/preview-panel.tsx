"use client";

import { useState } from "react";

type Period = "7 days" | "30 days";
type Filter = "All changes" | "Pricing" | "Product";

const changes = [
  { category: "PRICING", company: "Company A", title: "Growth plan price changed", detail: "$42 / seat · displayed monthly", kind: "price" },
  { category: "PRODUCT", company: "Company B", title: "New team workspace announced", detail: "Source: public product page", kind: "product" },
  { category: "FEATURES", company: "Company C", title: "Usage limit updated", detail: "Previous and current values linked", kind: "feature" },
];

export default function PreviewPanel() {
  const [period, setPeriod] = useState<Period>("7 days");
  const [filter, setFilter] = useState<Filter>("All changes");
  const visibleChanges = changes.filter((change) => filter === "All changes" || (filter === "Pricing" ? change.category === "PRICING" : change.category !== "PRICING"));

  return <div className="product-window">
    <div className="window-chrome"><div className="window-dots" aria-hidden="true"><i /><i /><i /></div><span>app.competitoriq / overview</span><span className="window-avatar">D</span></div>
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar"><div className="dashboard-brand"><span className="mini-mark">c.</span> competitoriq</div><span className="workspace-label">WORKSPACE</span><div className="workspace-name"><i /> Demo workspace <span>⌄</span></div><nav aria-label="Demo dashboard sections"><a className="nav-active" href="#demo">▦ &nbsp; Overview</a><a href="#platform">◉ &nbsp; Competitors <b>6</b></a><a href="#platform">⇄ &nbsp; Compare</a><a href="#platform">⌁ &nbsp; Change feed <b className="nav-count">3</b></a><a href="#platform">⌇ &nbsp; Pricing</a></nav><div className="sidebar-status"><i /> Demo data only</div></aside>
      <div className="dashboard-main">
        <div className="dashboard-topline"><span>OVERVIEW <i>/</i> THIS WEEK</span><span><i /> Sample workspace</span></div>
        <div className="dashboard-title-row"><div><h2>Market overview</h2><p>Signals across your monitored market.</p></div><span className="date-button">Last 7 days &nbsp;⌄</span></div>
        <div className="metric-grid">{[["COMPETITORS", "06"], ["PAGES TRACKED", "18"], ["CHANGES FOUND", "12"], ["PRICE MOVES", "03"]].map(([label, value]) => <div className="metric-card" key={label}><span>{label}</span><strong>{value}</strong><small>● &nbsp; Illustrative</small></div>)}</div>
        <div className="dashboard-content-grid">
          <section className="activity-chart"><div className="panel-heading"><div><h3>Market activity</h3><p>Illustrative changes detected</p></div><div className="period-switch" role="group" aria-label="Chart period">{(["7 days", "30 days"] as Period[]).map((option) => <button key={option} type="button" aria-pressed={period === option} onClick={() => setPeriod(option)}>{option}</button>)}</div></div><div className="chart-legend"><span><i /> Product</span><span><i /> Pricing</span></div><svg className="activity-svg" viewBox="0 0 500 130" role="img" aria-label={`Illustrative market activity over ${period}`}><line x1="35" y1="18" x2="490" y2="18" /><line x1="35" y1="55" x2="490" y2="55" /><line x1="35" y1="92" x2="490" y2="92" /><text x="0" y="22">8</text><text x="0" y="59">4</text><text x="5" y="96">0</text>{period === "7 days" ? <><polyline className="chart-product" points="36,78 110,59 184,69 258,34 332,48 406,26 485,38" /><polyline className="chart-pricing" points="36,87 110,81 184,89 258,71 332,78 406,60 485,67" /></> : <><polyline className="chart-product" points="36,82 85,66 135,74 184,49 234,61 283,37 332,50 382,28 432,44 485,24" /><polyline className="chart-pricing" points="36,91 85,84 135,88 184,72 234,79 283,66 332,73 382,57 432,67 485,51" /></>}<text x="35" y="119">MON</text><text x="145" y="119">WED</text><text x="255" y="119">FRI</text><text x="365" y="119">SUN</text></svg></section>
          <section className="change-feed"><div className="feed-heading"><div><h3>Latest signals</h3><p>Source-linked demo items</p></div><span aria-hidden="true">↗</span></div><div className="feed-filter" role="group" aria-label="Filter demo signals">{(["All changes", "Pricing", "Product"] as Filter[]).map((option) => <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)}>{option}</button>)}</div><div className="feed-items" aria-live="polite">{visibleChanges.map((change) => <article className="feed-item" key={change.title}><i className={`feed-indicator ${change.kind}`} /><div><div className="feed-meta"><span>{change.category}</span><span>DEMO</span></div><h4>{change.title}</h4><p>{change.company} · {change.detail}</p></div></article>)}</div></section>
        </div>
        <p className="demo-disclaimer">ⓘ &nbsp; All dashboard figures and findings are illustrative demo content.</p>
      </div>
    </div>
  </div>;
}