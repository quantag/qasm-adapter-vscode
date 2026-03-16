// nodesPanel.ts
import * as vscode from "vscode";
import { log, readConfig } from "./tools";

type NodeRow = {
  uid: string;
  node_id?: string | null;
  provider_id?: string | null;
  status?: number;
  status_str?: string | null;
  gpu?: number;
  last_seen?: string | null;
  caps?: any;
};

const API_BASE = "https://quantum.quantag-it.com/api";

function statusToText(status?: number, statusStr?: string | null): string {
  if (statusStr && String(statusStr).trim().length > 0) {
    return String(statusStr);
  }

  switch (Number(status)) {
    case 1: return "running";
    case 0: return "offline";
    default: return "unknown";
  }
}

function parseCaps(caps: any): any {
  if (!caps) {
    return null;
  }

  if (typeof caps === "object") {
    return caps;
  }

  if (typeof caps === "string") {
    try {
      return JSON.parse(caps);
    } catch {
      return caps;
    }
  }

  return caps;
}

function getGpuModel(caps: any): string {
  const parsed = parseCaps(caps);
  if (parsed && typeof parsed === "object" && parsed.gpu) {
    return String(parsed.gpu.model || "");
  }
  return "";
}

function getCpuModel(caps: any): string {
  const parsed = parseCaps(caps);
  if (parsed && typeof parsed === "object" && parsed.cpu) {
    return String(parsed.cpu.model || "");
  }
  return "";
}

function getRamMb(caps: any): number | string {
  const parsed = parseCaps(caps);
  if (parsed && typeof parsed === "object" && parsed.ram && parsed.ram.total_mb != null) {
    return parsed.ram.total_mb;
  }
  return "";
}

async function fetchNodes(_apikey: string): Promise<NodeRow[]> {
  const url = `${API_BASE}/nodes`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Nodes request failed: ${res.status} ${res.statusText} ${text}`);
  }

  log(text);

  const rows = text ? JSON.parse(text) : [];
  if (!Array.isArray(rows)) {
    throw new Error("Server returned unexpected /nodes payload");
  }

  return rows.map((r: any) => ({
    uid: String(r.uid || ""),
    node_id: r.node_id ?? "",
    provider_id: r.provider_id ?? "",
    status: Number(r.status ?? -1),
    status_str: r.status_str ?? "",
    gpu: Number(r.gpu ?? 0),
    last_seen: r.last_seen ?? "",
    caps: parseCaps(r.caps)
  }));
}

export async function openNodesPanel(context: vscode.ExtensionContext, focusNodeUid?: string) {
  const panel = vscode.window.createWebviewPanel(
    "quantagNodes",
    "Quantag Nodes",
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  const cfg = await readConfig();
  const apikey = String(cfg.apikey || "");
  const dashboardUrl = "https://cloud.quantag-it.com/jobs";

  panel.webview.html = getWebviewHtml(dashboardUrl);

  if (!apikey) {
    log("Please specify apikey in your configuration file.");
    panel.webview.postMessage({
      type: "error",
      error: "Missing API key. Please specify 'apikey' in config.json in workplace folder"
    });
    return;
  }

  async function refresh() {
    try {
      const data = await fetchNodes(apikey);
      panel.webview.postMessage({ type: "nodes", data, focusNodeUid });
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
      }
    } catch (e: any) {
      panel.webview.postMessage({ type: "error", error: e?.message || String(e) });
    }
  });

  await refresh();
}

function getWebviewHtml(dashboardUrl: string): string {
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Quantag Nodes</title>
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
    th, td { padding:8px; border-bottom:1px solid var(--line); text-align:left; font-size:12px; vertical-align: top; }
    th { position: sticky; top: 0; background: var(--bg); z-index: 1; }
    .status-running { color: var(--ok); font-weight: 600; }
    .status-offline, .status-stopped { color: var(--err); font-weight: 600; }
    .status-unknown { color: var(--warn); font-weight: 600; }
    .muted { color: var(--muted); }
    .wrap { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px; }
    .actions button { padding:4px 8px; margin-right:4px; }
    .right { margin-left:auto; }
    .badge { padding:2px 6px; border:1px solid var(--line); border-radius:999px; font-size:11px; }
    .focused-row {
      outline: 2px solid var(--warn);
      outline-offset: -2px;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 11px;
      line-height: 1.35;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button id="refreshBtn" title="Refresh now">Refresh</button>
    <button id="openDashboardBtn" title="Open web dashboard">Open Dashboard</button>
    <input id="filterBox" type="search" placeholder="Filter by status, GPU, endpoint, UID..." />
    <span id="countBadge" class="badge right">0</span>
  </div>

  <div class="table-wrap">
    <table id="nodesTable" aria-label="Nodes">
      <thead>
        <tr>
          <th style="width:15%">UID</th>
          <th style="width:6%">Status</th>
          <th style="width:8%">GPU</th>
          <th style="width:8%">CPU</th>
          <th style="width:8%">RAM MB</th>
          <th style="width:8%">Last Seen</th>
          <th style="width:20%">Actions</th>
        </tr>
      </thead>
      <tbody id="nodesBody">
        <tr><td colspan="10" class="muted">Loading...</td></tr>
      </tbody>
    </table>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    const nodesBody = document.getElementById("nodesBody");
    const filterBox = document.getElementById("filterBox");
    const refreshBtn = document.getElementById("refreshBtn");
    const openDashboardBtn = document.getElementById("openDashboardBtn");
    const countBadge = document.getElementById("countBadge");

    let nodes = [];
    let focusNodeUid = "";

    function fmtDate(s) {
      if (!s) return "";
      try {
        const d = new Date(s);
        if (isNaN(d.getTime())) return String(s);
        const iso = d.toISOString().replace("T", " ").replace("Z", "");
        return iso.slice(0, 19);
      } catch {
        return String(s);
      }
    }

    function normalizeCaps(caps) {
      if (!caps) return null;
      if (typeof caps === "object") return caps;
      if (typeof caps === "string") {
        try {
          return JSON.parse(caps);
        } catch {
          return null;
        }
      }
      return null;
    }

    function getGpuModel(caps) {
      const c = normalizeCaps(caps);
      return c && c.gpu ? (c.gpu.model || "") : "";
    }

    function getCpuModel(caps) {
      const c = normalizeCaps(caps);
      return c && c.cpu ? (c.cpu.model || "") : "";
    }

    function getRamMb(caps) {
      const c = normalizeCaps(caps);
      return c && c.ram ? (c.ram.total_mb ?? "") : "";
    }

    function statusClass(statusText) {
      const s = String(statusText || "").toLowerCase();
      if (s === "running") return "status-running";
      if (s === "offline" || s === "stopped") return "status-offline";
      return "status-unknown";
    }

    function render() {
      const q = (filterBox.value || "").toLowerCase().trim();

      const rows = q
        ? nodes.filter(n => {
            const hay = [
              n.uid,
              n.node_id,
              n.provider_id,
              n.status_str,
              n.gpu,
              getGpuModel(n.caps),
              getCpuModel(n.caps),
              n.last_seen
            ].join(" ").toLowerCase();
            return hay.includes(q);
          })
        : nodes;

      countBadge.textContent = String(rows.length);

      if (!rows.length) {
        nodesBody.innerHTML = '<tr><td colspan="10" class="muted">No nodes</td></tr>';
        return;
      }

      nodesBody.innerHTML = rows.map(n => {
        const uid = n.uid || "";
        const st = n.status_str || "";
        const gpuModel = getGpuModel(n.caps);
        const cpuModel = getCpuModel(n.caps);
        const ramMb = getRamMb(n.caps);
        const lastSeen = fmtDate(n.last_seen);
        const capsText = JSON.stringify(n.caps || {}, null, 2)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
        const rowClass = (focusNodeUid && uid === focusNodeUid) ? "focused-row" : "";

        return \`
          <tr class="\${rowClass}">
            <td class="wrap" title="\${uid}">\${uid}</td>
            <td class="\${statusClass(st)}">\${st}</td>
            <td class="wrap" title="\${gpuModel}">
              \${n.gpu ? n.gpu + "x " : ""}\${gpuModel}
            </td>
            <td class="wrap" title="\${cpuModel}">\${cpuModel}</td>
            <td>\${ramMb}</td>
            <td>\${lastSeen}</td>
            <td class="actions">
              <button data-act="copy" data-val="\${uid}" title="Copy UID">Copy UID</button>
              <button data-act="copy" data-val="\${capsText}" title="Copy capabilities">Copy Caps</button>
            </td>
          </tr>\`;
      }).join("");
    }

    window.addEventListener("message", (event) => {
      const msg = event.data || {};
      if (msg.type === "nodes") {
        nodes = Array.isArray(msg.data) ? msg.data : [];
        focusNodeUid = String(msg.focusNodeUid || "");
        if (focusNodeUid) {
          filterBox.value = focusNodeUid;
        }
        render();
      } else if (msg.type === "error") {
        nodesBody.innerHTML = '<tr><td colspan="10" class="muted">Error: ' + (msg.error || "unknown") + '</td></tr>';
        countBadge.textContent = "0";
      }
    });

    refreshBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "refresh" });
    });

    openDashboardBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "openDashboard" });
    });

    filterBox.addEventListener("input", () => render());

    nodesBody.addEventListener("click", (e) => {
      const t = e.target;
      if (!t || !t.dataset) return;

      if (t.dataset.act === "copy") {
        vscode.postMessage({ type: "copy", value: t.dataset.val });
      }
    });
  </script>
</body>
</html>
  `;
}