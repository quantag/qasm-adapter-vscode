import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { Config } from './config';

const logger = vscode.window.createOutputChannel("OpenQASM");
const fs = require('fs');
const qirOutput = vscode.window.createOutputChannel("QIR");



function formatMilliseconds(date: Date): string {
	const day = String(date.getDate()).padStart(2, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero based
	const year = date.getFullYear();
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');
	const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

	return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}:${milliseconds}`;
}

export function log(message) {
  logger.appendLine(formatMilliseconds(new Date()) + " " + message);
}

export function logQIR(message) {
  qirOutput.appendLine(message);
}

export function parseJwt(token: string): any {
    try {
        const payload = token.split('.')[1];
        const decoded = Buffer.from(payload, 'base64').toString('utf8');
        return JSON.parse(decoded);
    } catch (e) {
        console.error("Failed to decode JWT:", e);
        return null;
    }
}


export function showImage64(data: string) {
    var src = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            img {
                max-width: 100%;
                max-height: 100%;
            }
        </style>
    </head>
    <body>
        <img src="data:image/png;base64,${data}" alt="Image">
    </body>
    </html>
`
      // Set the HTML content of the webview to display the image
      showHtml(src, "Quantum Circuit");
}

export function showQUA64(data: string) {
  var src = `
  <!DOCTYPE html>
  <html>
  <head>
      <style>
          img {
              max-width: 100%;
              max-height: 100%;
          }
      </style>
  </head>
  <body>
      <xmp>${data}</xmp>
  </body>
  </html>
`
    // Set the HTML content of the webview to display the image
    showHtml(src, "QUA");
}

export function showHtml(src: string, title: string) {
    const panel = vscode.window.createWebviewPanel(
      'imageViewer',
      title,
      vscode.ViewColumn.One,
      {}
  );
  panel.webview.html = src;
}

export function showHtmlInExternalBrowser(htmlData: string) {
    // Get the first workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found.");
        return;
    }

    // Generate a unique filename
    const tempFileName = `temp_${Date.now()}.html`;
    const tempFilePath = path.join(workspaceFolder.uri.fsPath, tempFileName);

    // Write the HTML data to the temporary file
    fs.writeFileSync(tempFilePath, htmlData);

    // Open the temporary file in the default web browser
    vscode.env.openExternal(vscode.Uri.file(tempFilePath));
}

// Folder where a local QSCore (for example in a Quantag Studio workspace) saves
// circuit images and HTML renders: <dir>/<sessionId>.png and <dir>/<sessionId>.html.
const LOCAL_ARTIFACTS_DIR = "/var/dap/images";

// Returns the artifacts folder when config.json points the debugger to QSCore
// on this machine; then images are read from disk instead of the cloud file service.
async function getLocalArtifactsDir(): Promise<string | undefined> {
  try {
    const cfg = await readConfig();
    const server = String(cfg?.debug?.server ?? "");
    const host = server.split(":")[0].trim().toLowerCase();
    if (host === "127.0.0.1" || host === "localhost") {
      return String(cfg?.debug?.artifacts || LOCAL_ARTIFACTS_DIR);
    }
  } catch (error) {
    log("Could not read config.json: " + error);
  }
  return undefined;
}

// Reads <dir>/<sessionId><ext> written by the local QSCore. Returns undefined if not found.
async function readLocalArtifact(dir: string, sessionId: string, ext: string): Promise<Buffer | undefined> {
  if (!/^[A-Za-z0-9._-]+$/.test(sessionId || "")) {
    log("Unexpected session id: " + sessionId);
    return undefined;
  }
  const file = path.join(dir, sessionId + ext);
  try {
    return await fsPromises.readFile(file);
  } catch (error) {
    log("Local file not found: " + file);
    return undefined;
  }
}

export async function getImage(sessionId: string) {
  const localDir = await getLocalArtifactsDir();
  if (localDir) {
    const data = await readLocalArtifact(localDir, sessionId, ".png");
    if (data) {
      showImage64(data.toString("base64"));
    } else {
      vscode.window.showWarningMessage("Circuit image is not available yet. Start a debug session first.");
    }
    return;
  }

  const payload = {
    sessionId: sessionId
  };
    const url = Config["get.image"];

  log("session = " +sessionId + " send " + JSON.stringify(payload) + " to " + url);
  try {
    const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {'Content-Type': 'application/json; charset=UTF-8'}
    });

    if (!response.ok) {
       log(`reponse from ${url} is not ok: ${response.status} - ${response.statusText}`);
    }

    const responseData = await response.json();
    log(responseData);
    var base64data = responseData.data;
    showImage64(base64data);

  } catch (error) {
      log("Error get image:" + error);
  }
}

export async function readConfig(): Promise<any> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
      log("No workspace folder open.");
      return {};
  }

  const configPath = path.join(workspaceFolders[0].uri.fsPath, 'config.json');
  log("configPath: " + configPath);
  if (!fs.existsSync(configPath)) {
      log(`No config.json found at ${configPath}`);
      return {};
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}


export function openJobsDashboard() {
  vscode.env.openExternal(vscode.Uri.parse("https://cloud.quantag-it.com/jobs"));
}

export async function submitJobGeneral(srcData: string, filename: string) {
  try {
    const cfg = await readConfig();

    const apiKey = cfg?.apikey;
    if (!apiKey) {
      log("Missing apikey in config.json");
      return;
    }

    const url =
      (globalThis as any).Config?.["cloud.submit"] ??
      cfg?.submit?.url ??
      "https://quantum.quantag-it.com/api/jobs/submit";

    const srcBase64 = Buffer.from(srcData, "utf8").toString("base64");

    const shots = Number(cfg?.submit?.shots ?? 1024);
    const node = (cfg?.submit?.node ?? "auto") as string;

    const payload: any = {
      src: srcBase64,
      shots: shots,
    };

    if (filename) {
      payload.filename = filename;
    }


    // If node is pinned, send it. If "auto", omit it.
    if (node && node !== "auto") {
      payload.node_id = node;
    }

    log("Submitting job to: " + url);
    log("Submit params: provider=cloud node=" + node + " shots=" + shots);

    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-API-Key": apiKey,
      },
    });

    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* ignore */
    }

    if (!response.ok) {
      log(
        `Submit failed: ${response.status} ${response.statusText} ${
          json ? JSON.stringify(json) : text
        }`
      );
      return;
    }

    if (json?.status !== 0) {
      log("Submit returned error: " + (json ? JSON.stringify(json) : text));
      return;
    }

    const jobUid = json?.job_uid ?? "(no id)";
    const usedNode = json?.node_id;
    const rate = json?.rate;

    log("Job queued: " + jobUid);
    if (usedNode) log("Node: " + usedNode);
    if (rate != null) log("Rate: " + rate);
    log("Check status at https://cloud.quantag-it.com/jobs");

    await showJobsPanel();
  } catch (err: any) {
    log("Submit error: " + (err?.message || String(err)));
  }
}


export async function runZISimulator(srcData: string) {
  var srcDataBase64 = btoa(srcData);
  const payload = {
    src: srcDataBase64
  };
  try {
    const endpoint = Config["zi.run"];
    log("Sending request to " + endpoint);
    const response = await fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {'Content-Type': 'application/json; charset=UTF-8'}
    });

    if (!response.ok) {
       log("reponse is not ok: " + response.status + " - " + response.statusText);
    }

    const responseData = await response.json();
    var respStatus = responseData.status;
    if(respStatus==2) {
      log("Error: " + responseData.err);
    }
    if(respStatus==0) {
      var decodedRes = atob(responseData.res);
      log("Result: " + decodedRes);
    }

  } catch (error) {
      log("Error :" + error);
  }
}

export async function getHtml(sessionId: string) {
  const localDir = await getLocalArtifactsDir();
  if (localDir) {
    const data = await readLocalArtifact(localDir, sessionId, ".html");
    if (data) {
      showHtmlInExternalBrowser(data.toString("utf8"));
    } else {
      vscode.window.showWarningMessage("Circuit HTML is not available yet. Start a debug session first.");
    }
    return;
  }

  const payload = {
    file: sessionId + ".html"
  };
  try {
    const response = await fetch(Config["get.file"], {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {'Content-Type': 'application/json; charset=UTF-8'}
    });

    if (!response.ok) {
       log("reponse is not ok: ${response.status} - ${response.statusText}");
    }

    const responseData = await response.json();
    var html64 = responseData.data;
    const html: string = atob(html64);

    showHtmlInExternalBrowser(html);
  } catch (error) {
      log("Error get image:" + error);
  }
}

export async function openCircuitWeb(sessionId: string) {
		// 	open browser pointing to web frontend
		vscode.env.openExternal(vscode.Uri.parse(Config["circuit.web"] + sessionId));
}

async function  showQirInNewTab(qirText: string) {
    const fileName = 'qir_output.ll'; // Optional: gives a nicer syntax highlight if filetype known
    const doc = await vscode.workspace.openTextDocument({
        content: qirText,
        language: 'llvm'  // or 'plaintext' if unsure
    });
    await vscode.window.showTextDocument(doc, { preview: false });
}

export async function QASMtoQIR(srcData: string) {
  var srcDataBase64 = btoa(srcData);
    const payload = {
      qasm: srcDataBase64
    };

    try {
      const response = await fetch(Config["qasm2qir"], {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: {'Content-Type': 'application/json; charset=UTF-8'}
      });

      if (!response.ok) {
        log("QASMtoQIR reponse is not ok: " + response.status + " - " + response.statusText);
      }

      const responseData = await response.json();
      log(responseData)

      var resp64 = responseData.qir;
      const qir: string = atob(resp64);
      qirOutput.append(qir);

      showQirInNewTab(qir);
    } 
    catch (error) {
      log("Error in QASMtoQIR: " + error);
    }

}

export async function showJobsPanel() {
  await vscode.commands.executeCommand('quantag.studio.viewJobs');
}

export async function showNodesPanel() {
  await vscode.commands.executeCommand('quantag.studio.viewNodes');
}

