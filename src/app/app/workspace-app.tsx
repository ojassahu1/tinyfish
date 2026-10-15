"use client";

import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";

type Workspace = { id: string; name: string; role: string };
type Competitor = { id: string; name: string; domain: string; category: string | null; created_at: string };
type Page = { id: string; competitor_id: string; url: string; page_type: string; frequency_hours: number; enabled: boolean };
type Change = { id: string; page_id: string; category: string; headline: string; old_value: string | null; new_value: string | null; confidence: number; verification_status: string; observed_at: string };
type Pricing = { id: string; page_id: string; snapshot_id: string; plan_name: string; displayed_price: string; amount: number; currency_symbol: string; billing_period: string; price_unit: string | null; evidence_excerpt: string; recorded_at: string };
type FeatureObservation = { id: string; page_id: string; snapshot_id: string; claim: string; classification: string; created_at: string };
type Integration = { tinyfish: string; llm: string; database: string; queue: string };
type Evidence = { id: string; snapshot_id: string; source_url: string; excerpt: string; created_at: string };
type View = "overview" | "competitors" | "pricing" | "features" | "research" | "changes" | "evidence" | "health" | "threats" | "settings";
type MonitoringHealth = { checked_at: string; pages_monitored: number; jobs_by_status: Record<string, number>; stale_pages: number; last_successful_scan: string | null; snapshot_coverage: string; provider: string; failure_semantics: Record<string, string> };
type ActivityResult = { competitor_id: string; competitor_name: string; activity_score: number; metric_type: string; observation_period_days: number; observed_change_count: number; factors: Record<string, { signal: number; weight: number; count: number }> };
type ActivityReport = { method: string; weights: Record<string, number>; results: ActivityResult[] };
type ResearchTask = { id: string; question: string; status: string; stage: string; sources_discovered: number; pages_inspected: number; verified_observations: number; unresolved_questions: number; analysis_status: string; report: { executive_summary?: string; observations?: { statement: string; source_urls: string[]; confidence: number }[]; interpretations?: string[]; suggested_actions?: string[]; limitations?: string[] }; error_code: string | null; created_at: string; finished_at: string | null };
type ResearchSource = { id: string; url: string; title: string; snippet: string; excerpt: string; fetch_status: string; created_at: string };

const navigation: { id: View; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "▦" },
  { id: "competitors", label: "Competitors", icon: "◉" },
  { id: "pricing", label: "Price intelligence", icon: "⌁" },
  { id: "features", label: "Launch radar", icon: "✳" },
  { id: "research", label: "Research agent", icon: "⌕" },
  { id: "changes", label: "Change feed", icon: "↕" },
  { id: "evidence", label: "Evidence explorer", icon: "⌕" },
  { id: "threats", label: "Threat analysis", icon: "◒" },
  { id: "health", label: "Monitoring health", icon: "◷" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function WorkspaceApp() {
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [view, setView] = useState<View>("overview");
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [pricing, setPricing] = useState<Pricing[]>([]);
  const [features, setFeatures] = useState<FeatureObservation[]>([]);
  const [researchTasks, setResearchTasks] = useState<ResearchTask[]>([]);
  const [activeResearch, setActiveResearch] = useState<ResearchTask | null>(null);
  const [researchSources, setResearchSources] = useState<ResearchSource[]>([]);
  const [researchQuestion, setResearchQuestion] = useState("");
  const [researchCompetitors, setResearchCompetitors] = useState<string[]>([]);
  const [integrations, setIntegrations] = useState<Integration | null>(null);
    const [monitoringHealth, setMonitoringHealth] = useState<MonitoringHealth | null>(null);
    const [activityReport, setActivityReport] = useState<ActivityReport | null>(null);
  const [selectedChange, setSelectedChange] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [competitorName, setCompetitorName] = useState("");
  const [domain, setDomain] = useState("");
  const [category, setCategory] = useState("");
  const [activeCompetitor, setActiveCompetitor] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState("");
  const [pageType, setPageType] = useState("pricing");

  async function loadData(accessToken: string, workspaceId: string) {
    const [competitorRows, changeRows, pricingRows, featureRows, researchRows, integrationStatus, health, activity] = await Promise.all([
      apiRequest<Competitor[]>("competitors", { token: accessToken, workspaceId }),
      apiRequest<Change[]>("changes", { token: accessToken, workspaceId }),
      apiRequest<Pricing[]>("pricing", { token: accessToken, workspaceId }),
      apiRequest<FeatureObservation[]>("features/announcements", { token: accessToken, workspaceId }),
      apiRequest<ResearchTask[]>("research", { token: accessToken, workspaceId }),
      apiRequest<Integration>("integrations"),
      apiRequest<MonitoringHealth>("monitoring/health", { token: accessToken, workspaceId }),
      apiRequest<ActivityReport>("threat-analysis", { token: accessToken, workspaceId }),
    ]);
    setCompetitors(competitorRows);
    setChanges(changeRows);
    setPricing(pricingRows);
    setFeatures(featureRows);
    setResearchTasks(researchRows);
    setIntegrations(integrationStatus);
      setMonitoringHealth(health);
      setActivityReport(activity);
    if (activeCompetitor) {
      const rows = await apiRequest<Page[]>(`competitors/${activeCompetitor}/pages`, { token: accessToken, workspaceId });
      setPages(rows);
    }
  }

  async function restoreSession() {
    await apiRequest<{ id: string; email: string }>("auth/me");
    const workspaces = await apiRequest<Workspace[]>("workspaces");
    const first = workspaces[0];
    if (!first) throw new Error("No workspace is available for this account.");
    setToken("cookie-session");
    setWorkspace(first);
    await loadData("cookie-session", first.id);
  }

  const initializeSession = useEffectEvent(async () => {
    try {
      await restoreSession();
    } catch (reason) {
      if (reason instanceof Error && !reason.message.includes("authentication_required")) setError(reason.message);
    } finally {
      setMounted(true);
    }
  });

  useEffect(() => {
    queueMicrotask(() => void initializeSession());
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (authMode === "signup") {
        await apiRequest<{ authenticated: boolean }>("auth/signup", { method: "POST", body: { email, password, workspace_name: workspaceName } });
      } else {
        await apiRequest<{ authenticated: boolean }>("auth/login", { method: "POST", body: { email, password } });
      }
      await restoreSession();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!token || !workspace) return;
    await loadData(token, workspace.id);
  }

  async function addCompetitor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    setBusy(true);
    setError("");
    try {
      const created = await apiRequest<Competitor>("competitors", {
        token,
        workspaceId: workspace.id,
        method: "POST",
        body: { name: competitorName, domain, category: category || null },
      });
      setCompetitorName("");
      setDomain("");
      setCategory("");
      setNotice(`${created.name} added.`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Competitor could not be added.");
    } finally {
      setBusy(false);
    }
  }

  async function openCompetitor(competitorId: string) {
    if (!workspace) return;
    setActiveCompetitor(competitorId);
    setError("");
    try {
      setPages(await apiRequest<Page[]>(`competitors/${competitorId}/pages`, { token, workspaceId: workspace.id }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pages could not be loaded.");
    }
  }

  async function addPage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !activeCompetitor) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest<Page>(`competitors/${activeCompetitor}/pages`, {
        token,
        workspaceId: workspace.id,
        method: "POST",
        body: { url: pageUrl, page_type: pageType, frequency_hours: 24 },
      });
      setPageUrl("");
      await openCompetitor(activeCompetitor);
      await refresh();
      setNotice("Public page added.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Page could not be added.");
    } finally {
      setBusy(false);
    }
  }

  async function scanPage(page: Page) {
    if (!workspace) return;
    setBusy(true);
    setError("");
    try {
      const job = await apiRequest<{ id: string; status: string }>(`pages/${page.id}/scan`, { token, workspaceId: workspace.id, method: "POST" });
      setNotice(`Scan ${job.status}. Job ${job.id.slice(0, 8)}.`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Scan could not be queued.");
    } finally {
      setBusy(false);
    }
  }

  async function showEvidence(change: Change) {
    if (!workspace) return;
    setSelectedChange(change.id);
    setView("evidence");
    try {
      setEvidence(await apiRequest<Evidence[]>(`changes/${change.id}/evidence`, { token, workspaceId: workspace.id }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Evidence could not be loaded.");
    }
  }

  async function runResearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const task = await apiRequest<ResearchTask>("research", {
        token,
        workspaceId: workspace.id,
        method: "POST",
        body: { question: researchQuestion, competitor_ids: researchCompetitors },
      });
      setActiveResearch(task);
      setResearchSources([]);
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const updated = await apiRequest<ResearchTask>(`research/${task.id}`, { token, workspaceId: workspace.id });
        setActiveResearch(updated);
        if (["completed", "failed"].includes(updated.status)) {
          setResearchSources(await apiRequest<ResearchSource[]>(`research/${task.id}/sources`, { token, workspaceId: workspace.id }));
          setResearchTasks((previous) => [updated, ...previous.filter((item) => item.id !== updated.id)]);
          return;
        }
      }
      setNotice("Research is still running. You can revisit this task to check its latest progress.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Research could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function inspectResearch(task: ResearchTask) {
    if (!workspace) return;
    setView("research");
    setActiveResearch(task);
    setError("");
    try {
      setResearchSources(await apiRequest<ResearchSource[]>(`research/${task.id}/sources`, { token, workspaceId: workspace.id }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Research sources could not be loaded.");
    }
  }

  function signOut() {
    void apiRequest<void>("auth/logout", { method: "POST" });
    setToken(null);
    setWorkspace(null);
    setCompetitors([]);
    setChanges([]);
  }

  if (!mounted) return <main className="workspace-loading" aria-live="polite">Loading workspace…</main>;

  if (!token || !workspace) return <main className="auth-screen">
    <Link className="brand auth-brand" href="/"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>competitor<span className="brand-accent">iq</span></span></Link>
    <section className="auth-panel">
      <p className="eyebrow eyebrow-dark">YOUR MARKET, IN FOCUS</p>
      <h1>{authMode === "signup" ? "Create your workspace" : "Welcome back"}</h1>
      <p className="auth-intro">Access real competitor records and source-linked monitoring when the required services are configured.</p>
      {error && <p className="notice notice-error" role="alert">{error === "auth_not_configured" ? "Authentication is not configured. Set APP_SECRET_KEY on the API before creating accounts." : error}</p>}
      <form className="auth-form" onSubmit={submitAuth}>
        {authMode === "signup" && <label>Workspace name<input required minLength={2} maxLength={120} value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Acme market team" /></label>}
        <label>Work email<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></label>
        <label>Password<input type="password" required minLength={authMode === "signup" ? 12 : 1} maxLength={128} autoComplete={authMode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button className="button button-primary auth-submit" disabled={busy}>{busy ? "Working…" : authMode === "signup" ? "Create workspace" : "Sign in"}<span aria-hidden="true">→</span></button>
      </form>
      <button className="auth-toggle" type="button" onClick={() => { setAuthMode(authMode === "signup" ? "login" : "signup"); setError(""); }}>{authMode === "signup" ? "Already have an account? Sign in" : "New to CompetitorIQ? Create a workspace"}</button>
      <p className="auth-footnote">This workspace contains no seeded competitor data. Demo content remains separate from your account.</p>
    </section>
    <Link className="back-link" href="/">← Back to product preview</Link>
  </main>;

  const currentViewTitle = navigation.find((item) => item.id === view)?.label ?? "Overview";
  const selected = changes.find((change) => change.id === selectedChange);

  return <main className="workspace-shell">
    <aside className="workspace-sidebar">
      <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>competitor<span className="brand-accent">iq</span></span></Link>
      <div className="workspace-switcher"><small>WORKSPACE</small><strong><i />{workspace.name}</strong><span>{workspace.role} access</span></div>
      <nav className="workspace-nav" aria-label="Workspace navigation">{navigation.map((item) => <button key={item.id} type="button" className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => setView(item.id)}><span aria-hidden="true">{item.icon}</span>{item.label}{item.id === "changes" && changes.length > 0 && <b>{changes.length}</b>}</button>)}</nav>
      <div className="sidebar-integration"><span className={integrations?.tinyfish === "configured" ? "status-indicator ready" : "status-indicator"} />TinyFish {integrations?.tinyfish === "configured" ? "configured" : "not configured"}</div>
      <button className="sidebar-signout" type="button" onClick={signOut}>Sign out <span aria-hidden="true">↗</span></button>
    </aside>

    <section className="workspace-main">
      <header className="workspace-topbar"><div><span>COMPETITORIQ</span><i>/</i><strong>{currentViewTitle}</strong></div><div><span className="topbar-health"><i /> {integrations?.database ?? "Checking"}</span><span className="profile-chip">{email.slice(0, 1).toUpperCase()}</span></div></header>
      <div className="workspace-content">
        <div className="workspace-page-heading"><div><p className="eyebrow eyebrow-dark">{workspace.name.toUpperCase()}</p><h1>{view === "overview" ? "Market overview" : currentViewTitle}</h1><p>{view === "overview" ? "Changes and coverage from your stored monitoring data." : `Workspace records for ${workspace.name}.`}</p></div><button className="refresh-button" type="button" onClick={() => void refresh()} aria-label="Refresh workspace data" title="Refresh">↻</button></div>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        {notice && <p className="notice notice-success" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss">×</button></p>}

        {view === "overview" && <>
          <section className="metric-grid real-metrics" aria-label="Workspace metrics"><article><span>MONITORED COMPETITORS</span><strong>{competitors.length}</strong><small>Stored in this workspace</small></article><article><span>PRICE OBSERVATIONS</span><strong>{pricing.length}</strong><small>Original displayed values</small></article><article><span>DETECTED CHANGES</span><strong>{changes.length}</strong><small>Evidence-linked records</small></article><article><span>ANNOUNCEMENT PHRASES</span><strong>{features.length}</strong><small>Observed wording, not launch dates</small></article></section>
          <div className="workspace-columns"><section className="workspace-panel"><div className="panel-title"><div><h2>Recent changes</h2><p>Exact observations from completed scans</p></div><button type="button" onClick={() => setView("changes")}>View feed →</button></div>{changes.length === 0 ? <EmptyState title="No verified changes yet" text="Changes appear here after successful scans produce comparable snapshots." /> : <ChangeList changes={changes.slice(0, 5)} onEvidence={showEvidence} />}</section><section className="workspace-panel"><div className="panel-title"><div><h2>Monitoring status</h2><p>Service configuration</p></div></div><StatusRows integrations={integrations} /><Link className="panel-link" href="/">Review product preview →</Link></section></div>
        </>}

        {view === "competitors" && <div className="workspace-columns competitors-layout"><section className="workspace-panel"><div className="panel-title"><div><h2>Competitor list</h2><p>{competitors.length} stored competitor{competitors.length === 1 ? "" : "s"}</p></div></div>{competitors.length === 0 ? <EmptyState title="No competitors added" text="Add a competitor and approved public pages to begin building evidence history." /> : <div className="competitor-list">{competitors.map((competitor) => <button className={activeCompetitor === competitor.id ? "competitor-row selected" : "competitor-row"} key={competitor.id} type="button" onClick={() => void openCompetitor(competitor.id)}><span className="competitor-monogram">{competitor.name.slice(0, 1).toUpperCase()}</span><span><strong>{competitor.name}</strong><small>{competitor.domain}{competitor.category ? ` · ${competitor.category}` : ""}</small></span><b>›</b></button>)}</div>}</section><section className="workspace-panel"><div className="panel-title"><div><h2>Add competitor</h2><p>Only public pages should be monitored</p></div></div><form className="data-form" onSubmit={addCompetitor}><label>Company name<input required maxLength={160} value={competitorName} onChange={(event) => setCompetitorName(event.target.value)} placeholder="Competitor name" /></label><label>Website domain<input required maxLength={253} value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" /></label><label>Category <span className="optional-label">OPTIONAL</span><input maxLength={120} value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Product category" /></label><button className="button button-dark" disabled={busy}>Add competitor <span aria-hidden="true">+</span></button></form></section>{activeCompetitor && <section className="workspace-panel page-manager"><div className="panel-title"><div><h2>Approved pages</h2><p>Public HTTPS URLs only; scans require TinyFish and Redis.</p></div></div><form className="inline-form" onSubmit={addPage}><input type="url" required value={pageUrl} onChange={(event) => setPageUrl(event.target.value)} placeholder="https://example.com/pricing" aria-label="Public page URL" /><select value={pageType} onChange={(event) => setPageType(event.target.value)} aria-label="Page type"><option value="pricing">Pricing</option><option value="product">Product</option><option value="features">Features</option><option value="changelog">Changelog</option><option value="blog">Blog</option><option value="custom">Custom</option></select><button className="button button-dark" disabled={busy}>Add page</button></form>{pages.length === 0 ? <p className="empty-inline">No pages added for this competitor.</p> : <div className="page-records">{pages.map((page) => <div className="page-record" key={page.id}><span><strong>{page.page_type}</strong><small>{page.url}</small></span><button type="button" onClick={() => void scanPage(page)} disabled={busy}>Scan now ↗</button></div>)}</div>}</section>}</div>}

        {view === "pricing" && <section className="workspace-panel"><div className="panel-title"><div><h2>Displayed pricing history</h2><p>Prices retain original currency symbols and billing periods; unmatched periods are not normalized.</p></div></div>{pricing.length === 0 ? <EmptyState title="No pricing records" text="Pricing records are extracted only from successful TinyFish snapshots." /> : <div className="table-wrap"><table><thead><tr><th>PLAN</th><th>DISPLAYED PRICE</th><th>PERIOD</th><th>UNIT</th><th>CAPTURED</th><th>EVIDENCE</th></tr></thead><tbody>{pricing.map((record) => <tr key={record.id}><td>{record.plan_name}</td><td>{record.displayed_price} <span className="currency-note">{record.currency_symbol}</span></td><td>{record.billing_period}</td><td>{record.price_unit ?? "Unspecified"}</td><td>{formatDate(record.recorded_at)}</td><td><a href={record.evidence_excerpt ? `/api/pages/${record.page_id}/snapshots` : "#"} target="_blank" rel="noreferrer">Snapshot ↗</a></td></tr>)}</tbody></table></div>}</section>}

        {view === "features" && <section className="workspace-panel"><div className="panel-title"><div><h2>Public announcement wording</h2><p>Verbatim phrases marked as announcement observations, not feature launch dates.</p></div></div>{features.length === 0 ? <EmptyState title="No announcement wording observed" text="Explicit announcement phrases from successful scans appear here with their capture time." /> : <div className="observation-list">{features.map((feature) => <article key={feature.id}><div><span className="category-tag">ANNOUNCEMENT OBSERVED</span><time>{formatDate(feature.created_at)}</time></div><blockquote>{feature.claim}</blockquote><p>Page {feature.page_id.slice(0, 8)} · snapshot {feature.snapshot_id.slice(0, 8)}</p></article>)}</div>}</section>}

        {view === "research" && <div className="research-layout"><section className="workspace-panel"><div className="panel-title"><div><h2>Ask a market question</h2><p>Search approved public sources, inspect pages, then request grounded analysis.</p></div></div><form className="research-form" onSubmit={runResearch}><label>Research question<textarea required minLength={10} maxLength={1500} value={researchQuestion} onChange={(event) => setResearchQuestion(event.target.value)} placeholder="What changed in the AI coding tools market this month?" /></label><fieldset><legend>Competitor scope <span className="optional-label">OPTIONAL</span></legend>{competitors.length === 0 ? <p className="empty-inline">Add workspace competitors first, or search the broader market.</p> : <div className="research-checks">{competitors.map((competitor) => <label key={competitor.id}><input type="checkbox" checked={researchCompetitors.includes(competitor.id)} onChange={(event) => setResearchCompetitors((current) => event.target.checked ? [...current, competitor.id] : current.filter((id) => id !== competitor.id))} />{competitor.name}</label>)}</div>}</fieldset><button className="button button-dark" disabled={busy || integrations?.tinyfish !== "configured"}>{busy ? "Researching…" : "Start research"}<span aria-hidden="true">→</span></button>{integrations?.tinyfish !== "configured" && <p className="research-blocker">TinyFish is not configured. Add the API key to the backend environment to start live research.</p>}</form>{researchTasks.length > 0 && <div className="research-history"><h3>Recent research</h3>{researchTasks.map((task) => <button type="button" key={task.id} onClick={() => void inspectResearch(task)}><span><strong>{task.question}</strong><small>{task.status.replaceAll("_", " ")} · {formatDate(task.created_at)}</small></span><i>›</i></button>)}</div>}</section>
          <section className="workspace-panel research-results"><div className="panel-title"><div><h2>{activeResearch ? "Research progress and report" : "Evidence-first research"}</h2><p>{activeResearch ? `Task ${activeResearch.id.slice(0, 8)} · ${activeResearch.stage.replaceAll("_", " ")}` : "Sources and analysis appear here after a task runs."}</p></div></div>{activeResearch ? <><div className="research-progress"><div><span>Sources found</span><strong>{activeResearch.sources_discovered}</strong></div><div><span>Pages inspected</span><strong>{activeResearch.pages_inspected}</strong></div><div><span>Verified observations</span><strong>{activeResearch.verified_observations}</strong></div><div><span>Unresolved</span><strong>{activeResearch.unresolved_questions}</strong></div></div><span className={`research-status ${activeResearch.status}`}>{activeResearch.status.replaceAll("_", " ")} · analysis {activeResearch.analysis_status.replaceAll("_", " ")}</span>{activeResearch.report.executive_summary && <><h3 className="report-heading">Executive summary</h3><p className="report-summary">{activeResearch.report.executive_summary}</p></>}{(activeResearch.report.observations ?? []).length > 0 && <div className="report-items"><h3>Observed facts</h3>{activeResearch.report.observations?.map((observation, index) => <article key={`${index}-${observation.statement}`}><p>{observation.statement}</p><span>Confidence {Math.round(observation.confidence * 100)}%</span><div>{observation.source_urls.map((url) => <a href={url} target="_blank" rel="noreferrer" key={url}>{new URL(url).hostname} ↗</a>)}</div></article>)}</div>}{(activeResearch.report.interpretations ?? []).length > 0 && <div className="report-items"><h3>Interpretations</h3>{activeResearch.report.interpretations?.map((item, index) => <p className="report-note" key={`${index}-${item}`}>{item}</p>)}</div>}{(activeResearch.report.suggested_actions ?? []).length > 0 && <div className="report-items"><h3>Suggested actions</h3>{activeResearch.report.suggested_actions?.map((item, index) => <p className="report-note" key={`${index}-${item}`}>{item}</p>)}</div>}{(activeResearch.report.limitations ?? []).length > 0 && <div className="report-items"><h3>Limitations</h3>{activeResearch.report.limitations?.map((item, index) => <p className="report-note" key={`${index}-${item}`}>{item}</p>)}</div>}<div className="research-sources"><h3>Inspected sources</h3>{researchSources.length === 0 ? <p className="empty-inline">No source results are stored yet.</p> : researchSources.map((source) => <article key={source.id}><div><a href={source.url} target="_blank" rel="noreferrer">{source.title || new URL(source.url).hostname} ↗</a><span className={`source-state ${source.fetch_status}`}>{source.fetch_status}</span></div>{source.excerpt ? <p>{source.excerpt.slice(0, 900)}{source.excerpt.length > 900 ? "…" : ""}</p> : <p>{source.snippet || "Page content was not retrieved."}</p>}</article>)}</div></> : <EmptyState title="No research task selected" text="Start with a question. Research progress and source quality remain visible throughout." />}</section></div>}

        {view === "changes" && <section className="workspace-panel"><div className="panel-title"><div><h2>Chronological change feed</h2><p>Observed facts only; interpretations are not generated yet.</p></div></div>{changes.length === 0 ? <EmptyState title="No changes to review" text="A failed or incomplete scan never appears as a removal." /> : <ChangeList changes={changes} onEvidence={showEvidence} />}</section>}

  {view === "health" && <><section className="metric-grid real-metrics"><article><span>MONITORED PAGES</span><strong>{monitoringHealth?.pages_monitored ?? 0}</strong><small>Enabled public URLs</small></article><article><span>STALE PAGES</span><strong>{monitoringHealth?.stale_pages ?? 0}</strong><small>No success in the last 24 hours</small></article><article><span>FAILED JOBS</span><strong>{monitoringHealth?.jobs_by_status.failed ?? 0}</strong><small>Failures are not removals</small></article><article><span>SNAPSHOT COVERAGE</span><strong>{monitoringHealth?.snapshot_coverage === "available" ? "Yes" : "No"}</strong><small>Stored page snapshots</small></article></section><section className="workspace-panel"><div className="panel-title"><div><h2>Monitoring service health</h2><p>Checked {monitoringHealth ? formatDate(monitoringHealth.checked_at) : "not available"}</p></div></div><StatusRows integrations={integrations} /><div className="health-job-grid">{Object.entries(monitoringHealth?.jobs_by_status ?? {}).map(([status, count]) => <div key={status}><span>{status.replaceAll("_", " ")}</span><strong>{count}</strong></div>)}</div><p className="settings-hint">Last successful scan: {monitoringHealth?.last_successful_scan ? formatDate(monitoringHealth.last_successful_scan) : "none recorded"}</p><div className="health-semantics">{Object.entries(monitoringHealth?.failure_semantics ?? {}).map(([status, text]) => <p key={status}><strong>{status.replaceAll("_", " ")}:</strong> {text}</p>)}</div></section></>}

  {view === "threats" && <section className="workspace-panel"><div className="panel-title"><div><h2>Observed competitor activity</h2><p>Activity score is not a threat probability, market-share estimate, or failure forecast.</p></div></div><p className="score-method">{activityReport?.method}</p>{(activityReport?.results ?? []).length === 0 ? <EmptyState title="No comparable activity yet" text="Scores require verified stored changes in the selected observation period." /> : <div className="activity-score-list">{activityReport?.results.map((result) => <article key={result.competitor_id}><div className="activity-score-top"><div><strong>{result.competitor_name}</strong><small>{result.observed_change_count} verified observations · last {result.observation_period_days} days</small></div><b>{result.activity_score}<small>/100</small></b></div><div className="activity-score-bar" role="img" aria-label={`Observed activity score ${result.activity_score} out of 100`}><i style={{ width: `${result.activity_score}%` }} /></div><div className="activity-factors">{Object.entries(result.factors).map(([factor, detail]) => <span key={factor}>{factor} · {detail.count} signals · {Math.round(detail.weight * 100)}% weight</span>)}</div></article>)}</div>}</section>}

        {view === "evidence" && <section className="workspace-panel"><div className="panel-title"><div><h2>Source evidence</h2><p>Original excerpts are kept separate from interpretations.</p></div></div>{!selected ? <EmptyState title="Select a finding" text="Open evidence from the change feed to inspect its source excerpt." /> : <><div className="before-after"><div><span>PREVIOUS DISPLAY</span><p>{selected.old_value ?? "No previous value"}</p></div><div><span>CURRENT DISPLAY</span><p>{selected.new_value ?? "Not available"}</p></div></div>{evidence.map((item) => <article className="evidence-record" key={item.id}><a href={item.source_url} target="_blank" rel="noreferrer">{item.source_url} ↗</a><blockquote>{item.excerpt}</blockquote><small>Snapshot {item.snapshot_id.slice(0, 8)} · {formatDate(item.created_at)}</small></article>)}</>}</section>}

        {view === "settings" && <><section className="workspace-panel"><div className="panel-title"><div><h2>Integration status</h2><p>Configured status only; no secret values are exposed to the browser.</p></div></div><StatusRows integrations={integrations} /><p className="settings-hint">Set provider credentials in the API environment, never in frontend code. Restart the API after updating configuration.</p></section><section className="workspace-panel settings-limits"><h2>Current limits</h2><ul><li>Research summaries require an LLM provider and are not generated until configured.</li><li>Email delivery is disabled.</li><li>Monitoring targets must be public HTTPS pages and pass DNS checks.</li><li>Newly discovered companies are never added automatically.</li></ul></section></>}
      </div>
    </section>
  </main>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><span aria-hidden="true">⌁</span><h3>{title}</h3><p>{text}</p></div>;
}

function ChangeList({ changes, onEvidence }: { changes: Change[]; onEvidence: (change: Change) => void }) {
  return <div className="change-list">{changes.map((change) => <article key={change.id}><div className="change-list-meta"><span className="category-tag">{change.category.replaceAll("_", " ")}</span><time>{formatDate(change.observed_at)}</time></div><h3>{change.headline}</h3><div className="change-values"><span>{change.old_value ?? "No prior value"}</span><i aria-hidden="true">→</i><span>{change.new_value ?? "Not available"}</span></div><p>{change.verification_status.replaceAll("_", " ")} · evidence confidence {Math.round(change.confidence * 100)}%</p><button type="button" onClick={() => onEvidence(change)}>Inspect evidence →</button></article>)}</div>;
}

function StatusRows({ integrations }: { integrations: Integration | null }) {
  const rows = [
    ["TinyFish", integrations?.tinyfish ?? "checking"],
    ["LLM analysis", integrations?.llm ?? "checking"],
    ["Database", integrations?.database ?? "checking"],
    ["Background queue", integrations?.queue ?? "checking"],
  ];
  return <div className="status-rows">{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong className={value === "configured" || value === "ready" ? "configured" : "unconfigured"}>{value.replaceAll("_", " ")}</strong></div>)}</div>;
}