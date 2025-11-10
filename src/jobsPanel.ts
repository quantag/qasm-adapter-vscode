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
  error_msg?: string;
};



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

async function getJobDetails(apikey: string, jobUid: string): Promise<any> {
  const url = `https://quantum.quantag-it.com/api5/qvm/job/${encodeURIComponent(jobUid)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "X-API-Key": apikey, "Accept": "application/json" }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Job read failed: ${res.status} ${res.statusText} ${text}`);
  return text ? JSON.parse(text) : {};
}

function decodeMaybeBase64ToText(s: string): string {
  try {
    // If it already looks like text QASM, return as-is
    if (s.startsWith("OPENQASM")) return s;
    // Try base64 decode
    const buf = Buffer.from(s, "base64");
    const asText = buf.toString("utf8");
    // Heuristic: if it now looks like QASM, accept
    if (asText.startsWith("OPENQASM")) return asText;
    // Otherwise return original
    return s;
  } catch {
    return s;
  }
}

async function saveTextToFile(defaultName: string, content: string, panel: vscode.WebviewPanel) {
  const uri = await vscode.window.showSaveDialog(
    { 
      defaultUri: vscode.Uri.file(defaultName) 
    }
  );
  if (!uri) return;
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
  vscode.window.showInformationMessage("Saved: " + uri.fsPath);
}

async function saveJsonToFile(defaultName: string, obj: any) {
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(defaultName),
      filters: {
        "JSON files": ["json"],
      },
    });
  if (!uri) return;
  const pretty = JSON.stringify(obj, null, 2);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(pretty, "utf8"));
  vscode.window.showInformationMessage("Saved: " + uri.fsPath);
}


async function deleteJob(apikey: string, jobUid: string): Promise<void> {
  const url = `https://quantum.quantag-it.com/api5/qvm/job/${encodeURIComponent(jobUid)}`;
  const res = await fetch(url, { method: "DELETE", headers: { "X-API-Key": apikey } });
  if (!res.ok && res.status !== 204) {
    const t = await res.text();
    throw new Error(`Delete failed: ${res.status} ${res.statusText} ${t}`);
  }
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
    } else if (msg?.type === "downloadResults") {
      const uid = String(msg.uid || "");
      if (!uid) {throw new Error("Missing job UID");}

      const details = await getJobDetails(apikey, uid);
      // Try common shapes: {results: ...} or just the result object
      const results = details?.results ?? details?.data ?? details;
      await saveJsonToFile(`${uid}_results.json`, results);
    } else if (msg?.type === "downloadInput") {
        const uid = String(msg.uid || "");
        if (!uid) throw new Error("Missing job UID");
        const details = await getJobDetails(apikey, uid);
        // Try common keys: "input" (text), "qasm_b64" (base64), or nested
        const rawInput =
          details?.input ??
          details?.qasm_b64 ??
          details?.data?.input ??
          "";
        if (!rawInput) throw new Error("Input not found on job");
        const text = decodeMaybeBase64ToText(String(rawInput));
        await saveTextToFile(`${uid}.qasm`, text, panel);
    } else if (msg?.type === "deleteJob") {
      const uid = String(msg.uid || "");
      if (!uid) throw new Error("Missing job UID");
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
          <th style="width:12%">Backend</th>
          <th style="width:12%">QPU</th>
          <th style="width:10%">Mode</th>
          <th style="width:8%">Shots</th>
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
        const qpu = j.qpu || "";
        const mode = j.mode || "";
        const shots = (j.shots != null && j.shots !== "") ? j.shots : "";
        const submitted = fmtDate(j.submitted_at);

        return \`
          <tr>
            <td class="wrap" title="\${uid}">\${uid}</td>
            <td class="\${stClass}">\${st || ""}</td>
            <td>\${backend}</td>
            <td>\${qpu}</td>
            <td>\${mode}</td>
            <td>\${shots}</td>
            <td>\${submitted}</td>
            <td class="actions">
              <button data-act="copy" data-val="\${uid}" title="Copy UID">Copy UID</button>
              <button data-act="dlResults" data-uid="\${uid}" title="Download results JSON">Download Results</button>
              <button data-act="dlInput" data-uid="\${uid}" title="Download input QASM">Download Input</button>
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
      } else if (t.dataset.act === "dlResults") {
        vscode.postMessage({ type: "downloadResults", uid: t.dataset.uid });
      } else if (t.dataset.act === "dlInput") {
        vscode.postMessage({ type: "downloadInput", uid: t.dataset.uid });
      } else if (t.dataset.act === "delete") {
        vscode.postMessage({ type: "deleteJob", uid: t.dataset.uid });
      }
    });
  </script>
</body>
</html>
  `;
}
