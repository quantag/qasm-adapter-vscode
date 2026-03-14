// jobsPanel.ts
import * as vscode from "vscode";
import { log, readConfig } from "./tools";

type JobRow = {
  job_uid: string;
  status: string;
  backend?: string;
  mode?: string;
  shots?: number;
  submitted_at?: string;  // ISO
  qpu?: string;           // device name if present
  results?: any;
  error_msg?: string;
  input_b64?: string;
};

const API_BASE = "https://quantum.quantag-it.com/api";


async function getUserIdFromApiKey(apikey: string): Promise<string> {
  const url = `${API_BASE}/check_apikey`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey }),
  });

  let json: any = null;
  try {
    json = await resp.json();
  } catch {
    throw new Error(`Server returned non-JSON response (${resp.status})`);
  }

  if (!resp.ok || !json?.valid || !json?.user_id) {
    throw new Error(json?.error || "Invalid API key");
  }

  return String(json.user_id);
}


async function deleteJob(apikey: string, jobUid: string): Promise<void> {
  const url = `${API_BASE}/jobs/${encodeURIComponent(jobUid)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      "X-API-Key": apikey,
      "Accept": "application/json"
    }
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Delete failed: ${res.status} ${res.statusText} ${text}`);
  }
}

function statusToText(status: number): string {
  switch (status) {
    case 0: return "Submitted";
    case 1: return "Started";
    case 2: return "Failed to Start";
    case 3: return "Done";
    case 4: return "Failed";
    default: return "Unknown";
  }
}

async function fetchJobs(apikey: string, userId: string): Promise<JobRow[]> {
  const url = `${API_BASE}/jobs?user_id=${encodeURIComponent(userId)}&limit=100`;

  const res = await fetch(url, { method: "GET", headers: { "Accept": "application/json" } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Jobs request failed: ${res.status} ${res.statusText} ${text}`);
  }

  log(text);

  const payload = text ? JSON.parse(text) : {};
  const rows = Array.isArray(payload?.jobs) ? payload.jobs : [];
  
  return rows.map((r: any) => ({
    job_uid: r.uid,
    status: statusToText(Number(r.status)),
    backend: r.node_uid,
    target: r.job_result?.target || "",        
    shots: r.shots,
    results: r.job_result?.result ?? null,
    input_b64: r.src ?? "",
    submitted_at: r.created_at,
    error_msg: r.job_error 
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
  const dashboardUrl = "https://cloud.quantag-it.com/jobs";

  panel.webview.html = getWebviewHtml(dashboardUrl);
  // check if API key is missing
  if (!apikey) {
    log("Please specify apikey in your configuration file.");
    panel.webview.postMessage({
      type: "error",
      error: "Missing API key. Please specify 'apikey' in config.json in workplace folder"
    });
    return;
  }

  // resolve user_id once
  let userId: string;
  try {
    // if your config already has user_id, you can skip the call
      userId = await getUserIdFromApiKey(apikey);
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
  try {
    if (msg?.type === "refresh") {
        await refresh();
    } else if (msg?.type === "openDashboard") {
        vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
    } else if (msg?.type === "copy") {
        await vscode.env.clipboard.writeText(String(msg.value || ""));
        vscode.window.showInformationMessage("Copied to clipboard.");
    } else if (msg?.type === "openNode") {
        const nodeUid = String(msg.nodeUid || "");
        if (!nodeUid) { throw new Error("Missing node UID"); }
        await vscode.commands.executeCommand("quantag.studio.viewNodes", nodeUid);
    } else if (msg?.type === "deleteJob") {
        const uid = String(msg.uid || "");
        if (!uid) { throw new Error("Missing job UID"); }
        const ok = await vscode.window.showWarningMessage(
            `Delete job ${uid}?`,
            { modal: true },
            "Delete"
        );
        if (ok === "Delete") {
          await deleteJob(apikey, uid);
          vscode.window.showInformationMessage(`Deleted job ${uid}`);
          await refresh();
        }
    }
  } catch (e: any) {
    panel.webview.postMessage({ type: "error", error: e?.message || String(e) });
  }
});


  // initial load
  await refresh();
}


function getWebviewHtml(dashboardUrl: string): string {
  return /* html */ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Quantag Jobs</title>
  <style>
    :root { --fg:#1e1e1e; --muted:#767676; --line:#e6e6e6; --bg:#ffffff; --ok:#0a0; --warn:#a60; --err:#a00; }
    @media (prefers-color-scheme: dark) {
      :root { --fg:#ddd; --muted:#aaa; --line:#333; --bg:#1e1e1e; --ok:#7ddc7d; --warn:#ffb86b; --err:#ff6b6b; }
    }
    html, body { height:100%; }
    body { color:var(--fg); background:var(--bg); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Liberation Sans", sans-serif; margin:0; }
    .toolbar { display:flex; gap:8px; padding:8px; border-bottom:1px solid var(--line); align-items:center; }
    .toolbar button { padding:6px 10px; cursor:pointer; }
    .toolbar input[type="search"] { flex:1; padding:6px 8px; border:1px solid var(--line); background:transparent; color:inherit; }
    .table-wrap { height: calc(100vh - 48px); overflow:auto; }
    table { width:100%; border-collapse: collapse; }
    th, td { padding:8px; border-bottom:1px solid var(--line); text-align:left; font-size:12px; }
    th { position: sticky; top: 0; background: var(--bg); z-index: 1; }
    .status-DONE { color: var(--ok); font-weight: 600; }
    .status-RUNNING, .status-QUEUED { color: var(--warn); font-weight: 600; }
    .status-ERROR { color: var(--err); font-weight: 600; }
    .muted { color: var(--muted); }
    .wrap { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px; }
    .actions button { padding:4px 8px; margin-right:4px; }
    .right { margin-left:auto; }
    .badge { padding:2px 6px; border:1px solid var(--line); border-radius:999px; font-size:11px; }
  </style>
</head>
<body>
  <div class="toolbar">
    <button id="refreshBtn" title="Refresh now">Refresh</button>
    <button id="openDashboardBtn" title="Open web dashboard">Open Dashboard</button>
    <input id="filterBox" type="search" placeholder="Filter by status, backend, UID..." />
    <span id="countBadge" class="badge right">0</span>
  </div>

  <div class="table-wrap">
    <table id="jobsTable" aria-label="Jobs">
      <thead>
        <tr>
          <th style="width:26%">UID</th>
          <th style="width:10%">Status</th>
          <th style="width:12%">Node UID</th>
          <th style="width:10%">Target</th>
          <th style="width:8%">Shots</th>
          <th style="width:16%">Results</th>
          <th style="width:12%">Submitted</th>
          <th style="width:20%">Actions</th>
        </tr>
      </thead>
      <tbody id="jobsBody">
        <tr><td colspan="8" class="muted">Loading...</td></tr>
      </tbody>
    </table>
  </div>

  <script>
    // VS Code webview bridge
    const vscode = acquireVsCodeApi();

    // DOM refs
    const jobsBody = document.getElementById("jobsBody");
    const filterBox = document.getElementById("filterBox");
    const refreshBtn = document.getElementById("refreshBtn");
    const openDashboardBtn = document.getElementById("openDashboardBtn");
    const countBadge = document.getElementById("countBadge");

    // In-memory data
    let jobs = [];
    function base64ToText(b64) {
      try {
        return atob(b64);
      } catch {
        return b64;
      }
    }

    function fmtDate(s) {
      if (!s) return "";
      try {
        const d = new Date(s);
        if (isNaN(d.getTime())) return String(s);
        // Local-like readable without timezone suffix
        const iso = d.toISOString().replace("T", " ").replace("Z", "");
        return iso.slice(0, 19);
      } catch { return String(s); }
    }

    function render() {
      const q = (filterBox.value || "").toLowerCase().trim();
      const rows = q
        ? jobs.filter(j => {
            const hay = [
              j.job_uid, j.status, j.backend, j.qpu, j.mode,
              j.shots != null ? String(j.shots) : "",
              j.submitted_at || ""
            ].join(" ").toLowerCase();
            return hay.includes(q);
          })
        : jobs;

      countBadge.textContent = String(rows.length);

      if (!rows.length) {
        jobsBody.innerHTML = '<tr><td colspan="8" class="muted">No jobs</td></tr>';
        return;
      }

      jobsBody.innerHTML = rows.map(j => {
        const st = (j.status || "").toUpperCase();
        const stClass = "status-" + st;
        const uid = j.job_uid || "";
        const backend = j.backend || "";
        const target = j.target;
        const shots = (j.shots != null && j.shots !== "") ? j.shots : "";
        const submitted = fmtDate(j.submitted_at);
        const results = j.results ? JSON.stringify(j.results) : "";

        return \`
          <tr>
            <td class="wrap" title="\${uid}">\${uid}</td>
            <td class="\${stClass}">\${st || ""}</td>
            <td class="wrap" title="\${backend}">
              <a href="#" data-act="openNode" data-node-uid="\${backend}">\${backend}</a>
            </td>
            <td class="wrap" title="\${target}">\${target}</td>
            <td>\${shots}</td>
            <td class="wrap" title="\${results}">
                  <button data-act="copyResults" data-val='\${results}'>Copy</button>
            </td>
            <td>\${submitted}</td>
            <td class="actions">
              <button data-act="copy" data-val="\${uid}" title="Copy UID">Copy UID</button>
              <button data-act="copyInput" data-val="\${j.input_b64}" title="Copy input QASM">Copy Input</button>
              <button data-act="delete" data-uid="\${uid}" title="Delete job">Delete</button>
            </td>
          </tr>\`;
      }).join("");
    }

    // Receive data from extension
    window.addEventListener("message", (event) => {
      const msg = event.data || {};
      if (msg.type === "jobs") {
        jobs = Array.isArray(msg.data) ? msg.data : [];
        render();
      } else if (msg.type === "error") {
        jobsBody.innerHTML = '<tr><td colspan="8" class="muted">Error: ' + (msg.error || 'unknown') + '</td></tr>';
        countBadge.textContent = "0";
      }
    });

    // Toolbar events
    refreshBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "refresh" });
    });

    openDashboardBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "openDashboard" });
    });

    filterBox.addEventListener("input", () => render());

    // Row action events
    jobsBody.addEventListener("click", (e) => {
      const t = e.target;
      if (!t || !t.dataset) return;

      if (t.dataset.act === "copy") {
        vscode.postMessage({ type: "copy", value: t.dataset.val });

      } else if (t.dataset.act === "copyInput") {
        const decoded = base64ToText(t.dataset.val);
        vscode.postMessage({
          type: "copy",
          value: decoded
        });

      } else if (t.dataset.act === "delete") {
        vscode.postMessage({ type: "deleteJob", uid: t.dataset.uid });

      } else if (t.dataset.act === "copyResults") {
        vscode.postMessage({
          type: "copy",
          value: t.dataset.val
        });

      } else if (t.dataset.act === "openNode") {
        e.preventDefault();
        vscode.postMessage({
          type: "openNode",
          nodeUid: t.dataset.nodeUid
        });
      }
    });

  </script>
</body>
</html>
  `;
}
