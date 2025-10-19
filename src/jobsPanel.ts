// jobsPanel.ts
import * as vscode from "vscode";

type JobRow = {
  job_uid: string;
  status: string;
  backend?: string;
  mode?: string;
  shots?: number;
  submitted_at?: string;  // ISO
  qpu?: string;           // device name if present
  error_msg?: string;
};

async function readConfig(): Promise<any> {
  // Replace with your real reader if you already have one
  // Must provide: apikey
  // Optional: jobs_url (default below)
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) throw new Error("Open a workspace to use this command.");
  const file = vscode.Uri.joinPath(ws.uri, "config.json");
  const buf = await vscode.workspace.fs.readFile(file);
  return JSON.parse(Buffer.from(buf).toString("utf8"));
}


async function getUserIdFromApiKey(apikey: string): Promise<string> {
  const url = "https://quantum.quantag-it.com/api5/check_apikey";
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey })
  });
  const json = await resp.json();
  if (!resp.ok || !json?.valid) {
    throw new Error("Invalid API key");
  }
  return String(json.user_id);
}

async function fetchJobs(apikey: string, userId: string): Promise<JobRow[]> {
  const url = `https://quantum.quantag-it.com/api5/users/${encodeURIComponent(userId)}/jobs`;
  const res = await fetch(url, { method: "GET", headers: { "Accept": "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Jobs request failed: ${res.status} ${res.statusText} ${text}`);

  const rows = text ? JSON.parse(text) : [];
  // rows are DB-shaped with fields like: uid, status_str, qpu, instance, submitted_at, end_time, results, etc.
  // Map them to the UI model
  return rows.map((r: any) => ({
    job_uid: r.uid,
    status: r.status_str,
    backend: r.qpu,
    mode: r.mode || "",          // if you store it
    shots: r.shots || undefined, // if you store it
    submitted_at: r.submitted_at,
    qpu: r.qpu,
    error_msg: r.results?.error || undefined
  }));
}


export async function openJobsPanel(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    "quantagJobs",
    "Quantag Jobs",
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  const cfg = await readConfig();
  const apikey = String(cfg.apikey || "");
  const dashboardUrl = String(cfg.jobs_dashboard || "https://cloud.quantag-it.com/jobs");

  panel.webview.html = getWebviewHtml(dashboardUrl);

  // resolve user_id once
  let userId: string;
  try {
    // if your config already has user_id, you can skip the call
    userId = String(cfg.user_id || await getUserIdFromApiKey(apikey));
  } catch (e: any) {
    panel.webview.postMessage({ type: "error", error: e?.message || String(e) });
    return;
  }

  async function refresh() {
    try {
      const data = await fetchJobs(apikey, userId);
      panel.webview.postMessage({ type: "jobs", data });
    } catch (e: any) {
      panel.webview.postMessage({ type: "error", error: e?.message || String(e) });
    }
  }

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg?.type === "refresh") {
      await refresh();
    } else if (msg?.type === "openDashboard") {
      vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
    } else if (msg?.type === "copy") {
      await vscode.env.clipboard.writeText(String(msg.value || ""));
      vscode.window.showInformationMessage("Copied to clipboard.");
    }
  });

  // initial load
  await refresh();
}


function getWebviewHtml(dashboardUrl: string): string {
  // CSS is inline for simplicity
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>Quantag Jobs</title>
<style>
  body { font-family: sans-serif; margin: 0; padding: 0; }
  .toolbar { display: flex; gap: 8px; padding: 8px; border-bottom: 1px solid #ddd; }
  button { padding: 6px 10px; }
  input[type="search"] { flex: 1; padding: 6px 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 8px; border-bottom: 1px solid #eee; text-align: left; font-size: 12px; }
  th { background: #fafafa; position: sticky; top: 0; z-index: 1; }
  .status-DONE { color: #0a0; }
  .status-ERROR { color: #a00; }
  .status-QUEUED, .status-RUNNING { color: #a60; }
  .muted { color: #777; }
  .wrap { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px; }
  .table-wrap { height: calc(100vh - 48px); overflow: auto; }
</style>
</head>
<body>
  <div class="toolbar">
    <button id="refreshBtn">Refresh</button>
    <button id="openDashboardBtn">Open Dashboard</button>
    <input id="filterBox" type="search" placeholder="Filter by status, backend, UID..." />
  </div>
  <div class="table-wrap">
    <table id="jobsTable">
      <thead>
        <tr>
          <th>UID</th>
          <th>Status</th>
          <th>Backend</th>
          <th>QPU</th>
          <th>Mode</th>
          <th>Shots</th>
          <th>Submitted</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="jobsBody">
        <tr><td colspan="8" class="muted">Loading...</td></tr>
      </tbody>
    </table>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  const jobsBody = document.getElementById("jobsBody");
  const filterBox = document.getElementById("filterBox");
  const refreshBtn = document.getElementById("refreshBtn");
  const openDashboardBtn = document.getElementById("openDashboardBtn");

  let jobs = [];

  function fmtDate(s) {
    if (!s) return "";
    try {
      const d = new Date(s);
      if (isNaN(d.getTime())) return String(s);
      return d.toISOString().replace("T"," ").replace("Z","");
    } catch { return String(s); }
  }

  function render() {
    const q = (filterBox.value || "").toLowerCase().trim();
    const rows = (q ? jobs.filter(j => {
      const hay = [
        j.job_uid, j.status, j.backend, j.qpu, j.mode, String(j.shots||""),
        j.submitted_at || ""
      ].join(" ").toLowerCase();
      return hay.includes(q);
    }) : jobs);

    if (!rows.length) {
      jobsBody.innerHTML = '<tr><td colspan="8" class="muted">No jobs</td></tr>';
      return;
    }

    jobsBody.innerHTML = rows.map(j => {
      const stClass = "status-" + (j.status || "").toUpperCase();
      const uid = j.job_uid || "";
      const backend = j.backend || "";
      const qpu = j.qpu || "";
      const mode = j.mode || "";
      const shots = j.shots != null ? j.shots : "";
      const submitted = fmtDate(j.submitted_at);

      return \`
        <tr>
          <td class="wrap" title="\${uid}">\${uid}</td>
          <td class="\${stClass}">\${j.status || ""}</td>
          <td>\${backend}</td>
          <td>\${qpu}</td>
          <td>\${mode}</td>
          <td>\${shots}</td>
          <td>\${submitted}</td>
          <td>
            <button data-act="copy" data-val="\${uid}">Copy UID</button>
          </td>
        </tr>\`;
    }).join("");
  }

  window.addEventListener("message", (event) => {
    const msg = event.data || {};
    if (msg.type === "jobs") {
      jobs = Array.isArray(msg.data) ? msg.data : [];
      render();
    } else if (msg.type === "error") {
      jobsBody.innerHTML = '<tr><td colspan="8" class="muted">Error: ' + (msg.error || 'unknown') + '</td></tr>';
    }
  });

  refreshBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "refresh" });
  });

  openDashboardBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "openDashboard" });
  });

  filterBox.addEventListener("input", () => render());

  jobsBody.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.dataset && t.dataset.act === "copy") {
      vscode.postMessage({ type: "copy", value: t.dataset.val });
    }
  });
</script>
</body>
</html>
`;
}
