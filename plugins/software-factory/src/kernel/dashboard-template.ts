/**
 * The dashboard page. Liquid renders it with two inputs: `doc`, the status
 * document exactly as status.json stores it, and `summary`, the preformatted
 * view from dashboard.ts. Pico CSS and Chart.js are vendored beside the page
 * under `vendor/` and linked locally: no request leaves the disk.
 */
export const DASHBOARD_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="LiquidJS">
<title>{{ doc.goal | escape }} · Software Factory</title>
<link rel="stylesheet" href="vendor/pico.min.css">
<style>
:root {
  --good: #147a4b;
  --warn: #9a6200;
  --bad: #b3261e;
  --info: #0b6e99;
  --chip: var(--pico-code-background-color);
}
@media (prefers-color-scheme: dark) {
  :root {
    --good: #4cc38a;
    --warn: #e3b341;
    --bad: #ff7b72;
    --info: #63c5ea;
  }
}
.page { max-width: 1180px; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
h1 { margin: .15rem 0; font-size: 2rem; line-height: 1.15; letter-spacing: -.025em; }
h2 { margin: 0 0 1rem; font-size: 1.15rem; letter-spacing: -.01em; }
h3 { margin: 1.35rem 0 .55rem; font-size: .95rem; }
p { margin: .3rem 0; }
.muted { color: var(--pico-muted-color); }
.empty { color: var(--pico-muted-color); font-style: italic; margin: .25rem 0; }
.top {
  display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;
  gap: 1rem; padding-bottom: 1.1rem; border-bottom: 1px solid var(--pico-muted-border-color);
}
.eyebrow {
  margin: 0; color: var(--pico-muted-color); font-size: .72rem; font-weight: 650;
  letter-spacing: .12em; text-transform: uppercase;
}
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; color: var(--pico-muted-color); font-size: .85rem; }
.links { display: flex; flex-wrap: wrap; gap: .9rem; font-size: .85rem; font-weight: 550; }
.cards {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem; margin-top: 1.4rem;
}
.card {
  background: var(--pico-card-background-color); border: 1px solid var(--pico-muted-border-color);
  border-radius: var(--pico-border-radius); padding: 1rem 1.1rem; box-shadow: var(--pico-card-box-shadow);
}
.card .label {
  display: block; color: var(--pico-muted-color); font-size: .7rem; font-weight: 650;
  letter-spacing: .09em; text-transform: uppercase;
}
.card .value { display: block; margin: .2rem 0 .15rem; font-size: 1.75rem; line-height: 1.2; letter-spacing: -.02em; }
.card p { color: var(--pico-muted-color); font-size: .82rem; }
.panel {
  margin-top: 1.4rem; padding: 1.25rem; background: var(--pico-card-background-color);
  border: 1px solid var(--pico-muted-border-color);
  border-radius: var(--pico-border-radius); box-shadow: var(--pico-card-box-shadow);
}
.count {
  display: inline-block; margin-left: .35rem; padding: 0 .45rem; border-radius: 999px;
  background: var(--chip); color: var(--pico-muted-color); font-size: .75rem; font-weight: 600;
}
.chart-box { position: relative; height: 240px; max-width: 420px; margin: 1rem auto; }
.badge {
  display: inline-flex; align-items: center; padding: .1rem .5rem; border-radius: 999px;
  color: var(--tone, var(--pico-muted-color));
  background: color-mix(in srgb, var(--tone, var(--pico-muted-color)) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--tone, var(--pico-muted-color)) 32%, transparent);
  font-size: .68rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
  white-space: nowrap;
}
.badge-pending, .badge-ready, .badge-running, .badge-open, .cal-architect, .kind-debt, .intent-not-built { --tone: var(--warn); }
.badge-merged, .goal-done, .cal-fyi, .intent-works { --tone: var(--good); }
.badge-finished, .kind-uncertainty { --tone: var(--info); }
.badge-parked, .goal-blocked, .cal-owner, .kind-risk, .intent-friction { --tone: var(--bad); }
.badge-cancelled { --tone: var(--pico-muted-color); }
.goal-active, .kind-choice { --tone: var(--pico-primary); }
.chips { display: flex; flex-wrap: wrap; gap: .4rem; padding: 0; margin: .35rem 0 0; list-style: none; }
.chip {
  display: inline-block; padding: .12rem .5rem; background: var(--chip);
  border: 1px solid var(--pico-muted-border-color); border-radius: 999px; color: var(--pico-color);
  font-size: .78rem;
}
a.chip:hover { border-color: var(--pico-primary); text-decoration: none; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: .88rem; }
th {
  padding: .5rem .6rem; border-bottom: 1px solid var(--pico-muted-border-color); color: var(--pico-muted-color);
  font-size: .68rem; font-weight: 700; letter-spacing: .07em; text-align: left;
  text-transform: uppercase; white-space: nowrap;
}
td { padding: .55rem .6rem; border-bottom: 1px solid var(--pico-muted-border-color); vertical-align: top; }
tbody tr:last-child td { border-bottom: 0; }
tbody tr:hover { background: color-mix(in srgb, var(--pico-primary) 5%, transparent); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.title { display: block; font-weight: 600; }
.slug { display: block; color: var(--pico-muted-color); font-size: .75rem; }
.record { font-family: var(--pico-font-family-monospace); font-size: .75rem; }
.commit, .evidence {
  font-size: .75rem; font-family: var(--pico-font-family-monospace); background: var(--chip);
  border-radius: 6px; padding: .08rem .3rem;
}
.evidence { display: block; width: fit-content; margin-top: .2rem; color: var(--pico-muted-color); }
.cause { color: var(--bad); font-size: .82rem; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: .8rem; }
.stats div { padding: .6rem .75rem; background: var(--chip); border-radius: 10px; }
.stats span {
  display: block; color: var(--pico-muted-color); font-size: .68rem; font-weight: 650;
  letter-spacing: .07em; text-transform: uppercase;
}
.stats strong { display: block; font-size: 1.15rem; font-variant-numeric: tabular-nums; }
footer { margin-top: 2rem; color: var(--pico-muted-color); font-size: .78rem; }
@media (max-width: 560px) {
  .page { padding: 1.25rem .8rem 2rem; }
  .panel { padding: 1rem; }
  .card { padding: .85rem .9rem; }
}
</style>
</head>
<body>
<main class="page">
<header class="top">
  <div>
    <p class="eyebrow">Software Factory · goal</p>
    <h1>{{ doc.goal | escape }}</h1>
    <p class="meta">
      <span class="badge goal-{{ doc.status | escape }}">{{ doc.status | escape }}</span>
      <span>iteration {{ doc.iteration }}</span>
      <span>updated <time datetime="{{ doc.updatedAt | escape }}">{{ doc.updatedAt | escape }}</time></span>
    </p>
  </div>
  <nav class="links" aria-label="Page sections">
    <a href="status.json">status.json</a>
    <a href="#intent">Intent</a>
    <a href="#tasks">Tasks</a>
    <a href="#distance">Distance</a>
    <a href="#concerns">Concerns</a>
    <a href="#cost">Cost</a>
    <a href="#work">Work</a>
  </nav>
</header>

<div class="cards">
  <article class="card">
    <span class="label">Intent status</span>
    {% if summary.intent.known %}
    <strong class="value">{{ summary.intent.total }}</strong>
    <p>intent sections · works {{ summary.intent.works }} · not built {{ summary.intent.notBuilt }} · friction {{ summary.intent.friction }}</p>
    <p>architect summary, iteration {{ summary.intent.iteration }}</p>
    {% else %}
    <strong class="value">unknown</strong>
    <p>No architect intent status yet</p>
    {% endif %}
  </article>
  <article class="card">
    <span class="label">Spend</span>
    <p><strong>{{ summary.spend.harnessCost }}</strong> harness-reported</p>
    <p><strong>{{ summary.spend.listCost }}</strong> list-price estimate</p>
    <p>{{ summary.spend.tokens }} tokens · {{ summary.spend.unpricedTurns }} unpriced turns</p>
  </article>
  <article class="card">
    <span class="label">Tasks</span>
    <strong class="value">{{ doc.tasks.merged.size }} merged</strong>
    <p>{{ doc.tasks.finished.size }} finished · {{ doc.tasks.open.size }} open · {{ doc.tasks.parked.size }} parked · {{ doc.tasks.cancelled.size }} cancelled</p>
  </article>
  <article class="card">
    <span class="label">Open debt</span>
    <strong class="value">{{ doc.distance.openDebt.size }}</strong>
    <p>{{ doc.concerns.size }} concerns recorded</p>
  </article>
</div>

<section id="intent" class="panel" aria-labelledby="intent-heading">
  <h2 id="intent-heading">Intent status {% if summary.intent.known %}<span class="count">{{ summary.intent.total }}</span>{% endif %}</h2>
  {% if summary.intent.known %}
  <p class="muted">Per intent section, from the architect's iteration {{ summary.intent.iteration }} summary.</p>
  <div class="stats">
    <div><span>Works</span><strong>{{ summary.intent.works }}</strong></div>
    <div><span>Not built</span><strong>{{ summary.intent.notBuilt }}</strong></div>
    <div><span>Friction</span><strong>{{ summary.intent.friction }}</strong></div>
  </div>
  <div class="chart-box"><canvas id="intent-chart" role="img" aria-label="Intent sections by status"></canvas></div>
  <div class="table-wrap">
  <table>
    <thead><tr><th scope="col">Intent section</th><th scope="col">Status</th><th scope="col">Note</th></tr></thead>
    <tbody>
    {% for row in summary.intent.rows %}
      <tr><td>{{ row.section | escape }}</td><td><span class="badge intent-{{ row.status | escape }}">{{ row.label | escape }}</span></td><td>{% if row.note %}{{ row.note | escape }}{% else %}<span class="muted">—</span>{% endif %}</td></tr>
    {% endfor %}
    </tbody>
  </table>
  </div>
  {% elsif summary.intent.hasArtifact %}
  <p class="empty">unknown — the architect's iteration {{ summary.intent.iteration }} summary lists no intent sections.</p>
  {% else %}
  <p class="empty">unknown — no architect intent-status artifact has been written yet. This section never falls back to task counts.</p>
  {% endif %}
</section>

<section id="tasks" class="panel" aria-labelledby="tasks-heading">
  <h2 id="tasks-heading">Tasks <span class="count">{{ summary.tasks.size }}</span></h2>
  {% if summary.tasks.size > 0 %}
  <div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th scope="col">Task</th>
        <th scope="col">Status</th>
        <th scope="col">Kind</th>
        <th scope="col">Epic</th>
        <th scope="col" class="num">Round</th>
        <th scope="col" class="num">Turns</th>
        <th scope="col">Record</th>
        <th scope="col">Commit</th>
        <th scope="col">Cause</th>
      </tr>
    </thead>
    <tbody>
    {% for task in summary.tasks %}
      <tr id="task-{{ task.slug | escape }}">
        <td><span class="title">{{ task.title | escape }}</span><code class="slug">{{ task.slug | escape }}</code></td>
        <td><span class="badge badge-{{ task.status | escape }}">{{ task.status | escape }}</span></td>
        <td>{{ task.kind | escape }}</td>
        <td>{% if task.epic %}{{ task.epic | escape }}{% else %}<span class="muted">—</span>{% endif %}</td>
        <td class="num">{{ task.round }}</td>
        <td class="num">{{ task.turns }}</td>
        <td>{% if task.record %}<a class="record" href="{{ task.record | escape }}/" title="{{ task.record | escape }}">{{ task.record | split: "/" | last | escape }}</a>{% else %}<span class="muted">—</span>{% endif %}</td>
        <td>{% if task.commit %}<code class="commit" title="{{ task.commit | escape }}">{{ task.commit | slice: 0, 8 | escape }}</code>{% else %}<span class="muted">—</span>{% endif %}</td>
        <td>{% if task.cause %}<span class="cause">{{ task.cause.kind | escape }}{% if task.cause.detail %}: {{ task.cause.detail | escape }}{% endif %}</span>{% else %}<span class="muted">—</span>{% endif %}</td>
      </tr>
    {% endfor %}
    </tbody>
  </table>
  </div>
  {% else %}
  <p class="empty">No tasks recorded yet.</p>
  {% endif %}
  {% if summary.epics.size > 0 %}
  <h3>Epics</h3>
  <ul class="chips">
    {% for epic in summary.epics %}
    <li><span class="chip">{{ epic.name | escape }} · {{ epic.tasks.size }} {% if epic.tasks.size == 1 %}task{% else %}tasks{% endif %}</span></li>
    {% endfor %}
  </ul>
  {% endif %}
</section>

<section id="distance" class="panel" aria-labelledby="distance-heading">
  <h2 id="distance-heading">Distance to done</h2>

  <h3>Pending <span class="count">{{ doc.distance.pending.size }}</span></h3>
  {% if doc.distance.pending.size > 0 %}
  <ul class="chips">
    {% for slug in doc.distance.pending %}<li><a class="chip" href="#task-{{ slug | escape }}">{{ slug | escape }}</a></li>{% endfor %}
  </ul>
  {% else %}
  <p class="empty">No task is waiting to start.</p>
  {% endif %}

  <h3>Parks <span class="count">{{ doc.tasks.parked.size }}</span></h3>
  {% if doc.tasks.parked.size > 0 %}
  <div class="table-wrap">
  <table>
    <thead><tr><th scope="col">Task</th><th scope="col">Cause</th><th scope="col">Record</th></tr></thead>
    <tbody>
    {% for task in doc.tasks.parked %}
      <tr>
        <td><a href="#task-{{ task.slug | escape }}">{{ task.title | escape }}</a> <code class="slug">{{ task.slug | escape }}</code></td>
        <td>{% if task.cause %}<span class="cause">{{ task.cause.kind | escape }}{% if task.cause.detail %}: {{ task.cause.detail | escape }}{% endif %}</span>{% else %}<span class="muted">—</span>{% endif %}</td>
        <td>{% if task.record %}<a class="record" href="{{ task.record | escape }}/" title="{{ task.record | escape }}">{{ task.record | split: "/" | last | escape }}</a>{% else %}<span class="muted">—</span>{% endif %}</td>
      </tr>
    {% endfor %}
    </tbody>
  </table>
  </div>
  {% else %}
  <p class="empty">No parked task.</p>
  {% endif %}

  <h3>Open debt <span class="count">{{ doc.distance.openDebt.size }}</span></h3>
  {% if doc.distance.openDebt.size > 0 %}
  <div class="table-wrap">
  <table>
    <thead><tr><th scope="col">Debt</th><th scope="col">Calibration</th><th scope="col">Source</th><th scope="col">Record</th></tr></thead>
    <tbody>
    {% for debt in doc.distance.openDebt %}
      <tr{% if debt.id %} title="{{ debt.id | escape }}"{% endif %}>
        <td>{{ debt.text | escape }}{% if debt.evidence %}<code class="evidence">{{ debt.evidence | escape }}</code>{% endif %}</td>
        <td><span class="badge cal-{{ debt.calibration | escape }}">{{ debt.calibration | escape }}</span></td>
        <td>{{ debt.source | escape }} <span class="muted">· i{{ debt.iteration }}</span></td>
        <td>{% if debt.record %}<a class="record" href="{{ debt.record | escape }}/" title="{{ debt.record | escape }}">{{ debt.record | split: "/" | last | escape }}</a>{% else %}<span class="muted">—</span>{% endif %}</td>
      </tr>
    {% endfor %}
    </tbody>
  </table>
  </div>
  {% else %}
  <p class="empty">No open debt.</p>
  {% endif %}
</section>

<section id="concerns" class="panel" aria-labelledby="concerns-heading">
  <h2 id="concerns-heading">Concerns <span class="count">{{ doc.concerns.size }}</span></h2>
  {% if doc.concerns.size > 0 %}
  <div class="table-wrap">
  <table>
    <thead><tr><th scope="col">Concern</th><th scope="col">Kind</th><th scope="col">Calibration</th><th scope="col">Source</th><th scope="col">Record</th></tr></thead>
    <tbody>
    {% for concern in doc.concerns %}
      <tr{% if concern.id %} title="{{ concern.id | escape }}"{% endif %}>
        <td>{{ concern.text | escape }}{% if concern.evidence %}<code class="evidence">{{ concern.evidence | escape }}</code>{% endif %}</td>
        <td><span class="badge kind-{{ concern.kind | escape }}">{{ concern.kind | escape }}</span></td>
        <td><span class="badge cal-{{ concern.calibration | escape }}">{{ concern.calibration | escape }}</span></td>
        <td>{% if concern.slug %}<code class="slug">{{ concern.slug | escape }}</code>{% endif %}{{ concern.step | escape }} r{{ concern.round }}</td>
        <td><a class="record" href="{{ concern.record | escape }}/" title="{{ concern.record | escape }}">{{ concern.record | split: "/" | last | escape }}</a></td>
      </tr>
    {% endfor %}
    </tbody>
  </table>
  </div>
  {% else %}
  <p class="empty">No concerns recorded.</p>
  {% endif %}
</section>

<section id="cost" class="panel" aria-labelledby="cost-heading">
  <h2 id="cost-heading">Cost</h2>
  <div class="stats">
    <div><span>Harness-reported total</span><strong>{{ summary.spend.harnessCost }}</strong></div>
    <div><span>List-price estimate total</span><strong>{{ summary.spend.listCost }}</strong></div>
    <div><span>Harness-reported per merged task</span><strong>{{ summary.spend.harnessPerMergedTask }}</strong></div>
    <div><span>List-price estimate per merged task</span><strong>{{ summary.spend.listPerMergedTask }}</strong></div>
    <div><span>Tokens</span><strong>{{ summary.spend.tokens }}</strong></div>
    <div><span>Unpriced turns</span><strong>{{ summary.spend.unpricedTurns }}</strong></div>
  </div>
  <h3>By role</h3>
  {% if summary.costRoles.size > 0 %}
  <div class="table-wrap">
  <table>
    <thead><tr><th scope="col">Role</th><th scope="col" class="num">Turns</th><th scope="col" class="num">Tokens</th><th scope="col" class="num">Harness-reported</th><th scope="col" class="num">List-price estimate</th><th scope="col" class="num">Unpriced</th></tr></thead>
    <tbody>
    {% for row in summary.costRoles %}
      <tr><td>{{ row.name | escape }}</td><td class="num">{{ row.turns }}</td><td class="num">{{ row.tokens }}</td><td class="num">{{ row.harnessCost }}</td><td class="num">{{ row.listCost }}</td><td class="num">{{ row.unpricedTurns }}</td></tr>
    {% endfor %}
    </tbody>
  </table>
  </div>
  {% else %}
  <p class="empty">No priced turns.</p>
  {% endif %}
  <h3>By model</h3>
  {% if summary.costModels.size > 0 %}
  <div class="table-wrap">
  <table>
    <thead><tr><th scope="col">Model</th><th scope="col" class="num">Turns</th><th scope="col" class="num">Tokens</th><th scope="col" class="num">Harness-reported</th><th scope="col" class="num">List-price estimate</th><th scope="col" class="num">Unpriced</th></tr></thead>
    <tbody>
    {% for row in summary.costModels %}
      <tr><td>{{ row.name | escape }}</td><td class="num">{{ row.turns }}</td><td class="num">{{ row.tokens }}</td><td class="num">{{ row.harnessCost }}</td><td class="num">{{ row.listCost }}</td><td class="num">{{ row.unpricedTurns }}</td></tr>
    {% endfor %}
    </tbody>
  </table>
  </div>
  {% else %}
  <p class="empty">No model usage recorded.</p>
  {% endif %}
</section>

<section id="work" class="panel" aria-labelledby="work-heading">
  <h2 id="work-heading">Work</h2>
  <div class="stats">
    <div><span>Turns</span><strong>{{ summary.work.turns }}</strong></div>
    <div><span>Edits</span><strong>{{ summary.work.edits }}</strong></div>
    <div><span>Lines added</span><strong>{{ summary.work.addedLines }}</strong></div>
    <div><span>Lines removed</span><strong>{{ summary.work.removedLines }}</strong></div>
    <div><span>Test runs</span><strong>{{ summary.work.testRuns }}</strong></div>
  </div>
  <h3>By role</h3>
  {% if summary.workRoles.size > 0 %}
  <div class="table-wrap">
  <table>
    <thead><tr><th scope="col">Role</th><th scope="col" class="num">Turns</th><th scope="col" class="num">Edits</th><th scope="col" class="num">Added</th><th scope="col" class="num">Removed</th><th scope="col" class="num">Test runs</th></tr></thead>
    <tbody>
    {% for row in summary.workRoles %}
      <tr><td>{{ row.name | escape }}</td><td class="num">{{ row.turns }}</td><td class="num">{{ row.edits }}</td><td class="num">{{ row.addedLines }}</td><td class="num">{{ row.removedLines }}</td><td class="num">{{ row.testRuns }}</td></tr>
    {% endfor %}
    </tbody>
  </table>
  </div>
  {% else %}
  <p class="empty">No role work recorded.</p>
  {% endif %}
  <h3>By model</h3>
  {% if summary.workModels.size > 0 %}
  <div class="table-wrap">
  <table>
    <thead><tr><th scope="col">Model</th><th scope="col" class="num">Turns</th><th scope="col" class="num">Edits</th><th scope="col" class="num">Added</th><th scope="col" class="num">Removed</th><th scope="col" class="num">Test runs</th></tr></thead>
    <tbody>
    {% for row in summary.workModels %}
      <tr><td>{{ row.name | escape }}</td><td class="num">{{ row.turns }}</td><td class="num">{{ row.edits }}</td><td class="num">{{ row.addedLines }}</td><td class="num">{{ row.removedLines }}</td><td class="num">{{ row.testRuns }}</td></tr>
    {% endfor %}
    </tbody>
  </table>
  </div>
  {% else %}
  <p class="empty">No model work recorded.</p>
  {% endif %}
</section>

<footer>
  <p>Rendered from <a href="status.json">status.json</a> and the latest <code>intent-status.json</code> at {{ doc.updatedAt | escape }}. Pico CSS and Chart.js are vendored in <code>vendor/</code> and loaded locally; the page needs no server and no network.</p>
  {% if doc.runLog %}
  <p>Latest launch log: <a href="{{ doc.runLog | escape }}"><code>{{ doc.runLog | escape }}</code></a> — every line the newest launch printed, timestamped.</p>
  {% endif %}
</footer>
</main>
{% if summary.intent.known %}
<script id="intent-chart-data" type="application/json">{{ summary.intent.chartJson | raw }}</script>
<script src="vendor/chart.umd.min.js"></script>
<script>
const data = JSON.parse(document.getElementById("intent-chart-data").textContent);
new Chart(document.getElementById("intent-chart"), {
  type: "doughnut",
  data: {
    labels: data.labels,
    datasets: [{
      data: data.counts,
      backgroundColor: ["#147a4b", "#9a6200", "#b3261e"],
      borderWidth: 0
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "bottom" } }
  }
});
</script>
{% endif %}
</body>
</html>
`;
