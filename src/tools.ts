import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { Config } from './config';

const logger = vscode.window.createOutputChannel("OpenQASM");
const fs = require('fs');
const qirOutput = vscode.window.createOutputChannel("QIR");

function base64Encode(data: string): string {
  return Buffer.from(data).toString('base64');
}

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


async function getDirectories(folderPath) {
  var result: string[] = []; 
  const files = await fsPromises.readdir(folderPath);
  for (const item of files) {
      const itemPath = path.join(folderPath, item);
      let stats = fs.statSync(itemPath);
      if(stats.isDirectory()) {
          result.push(itemPath);
      }
  }
  return result;
}

async function getAllFilesInFolder(folderPath: string, filesData: any[], rootFolder: string) {
  log("getAllFilesInFolder " + folderPath);
  const files = await fsPromises.readdir(folderPath);

  // Filter files with .qasm or .py extension
  const qasmFiles = files.filter(file =>
    (path.extname(file) === '.qasm' || path.extname(file) === '.py')
  );

  for (const file of qasmFiles) {
    const filePath = path.join(folderPath, file);

    // Read file contents
    const fileContents = await fsPromises.readFile(filePath, 'utf-8');

    // Encode file contents in base64
    const encodedContents = base64Encode(fileContents);

    // Compute relative path from rootFolder
    const relPath = path.relative(rootFolder, filePath).replace(/\\/g, "/");

    // Add file details to the array
    filesData.push({
      path: relPath,
      source: encodedContents,
    });
  }

  const subFolders = await getDirectories(folderPath);
  log("Found " + subFolders.length + " subfolders in " + folderPath);

  for (const sub of subFolders) {
    await getAllFilesInFolder(sub, filesData, rootFolder);
  }

  return filesData;
}

type SubmitOpts = {
  mode?: "desktop" | "web";
  baseUrl?: string; // QUANTAG_BASE_URL, e.g. "https://cloud.quantag-it.com"
};

export async function submitFiles(folderPath: string, sessionId: string, rootFolder: string) {
    const filesData: { path: string; source: string }[] = [];

    const mode: "desktop" | "web" =
    vscode.env.uiKind === vscode.UIKind.Web ? "web" : "desktop";
    log(mode === "web" ? "== Web mode ==" : "== Desktop mode ==");
    const baseUrl = process.env.QUANTAG_BASE_URL;
    if (baseUrl) {
        log("Running with QUANTAG_BASE_URL=" + baseUrl);
    } else {
        log("No QUANTAG_BASE_URL");
    }

    // Build SubmitOpts object
    const opts: SubmitOpts = {
      mode,
      baseUrl: baseUrl ?? undefined
    };
    await getAllFilesInFolder(folderPath, filesData, rootFolder);

      // Prepare the JSON payload
    const payload = {
        sessionId: sessionId,
        files: filesData,
        root: rootFolder,
        opts 
    };
    log("Sumbiting ["+ filesData.length+"] workplace files to cloud.. SessionId = " + sessionId );

    try {
      var serverUrl = Config["submit.files"];
      if (vscode.env.uiKind === vscode.UIKind.Web && baseUrl) {
            const normalized = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
            serverUrl = `${normalized}/api2/public/submitFiles`;
            log("Overriding server URL to: " + serverUrl);
      }

      const response = await fetch(serverUrl, {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: {'Content-Type': 'application/json; charset=UTF-8'}
      });

    if (!response.ok) {
       log("reponse is not ok");
       throw new Error(`Failed to submit files: ${response.status} - ${response.statusText}`);
    }

    const responseData = await response.json();
    log(JSON.stringify(responseData, null, 2)); // Log the JSON data with indentation for better readability

   /* if (vscode.env.uiKind === vscode.UIKind.Web && baseUrl && responseData.sessionFolder) {
      const normalized = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
      const url = `${normalized}/?folder=${encodeURIComponent(responseData.sessionFolder)}`;
      log("Opening browser at: " + url);
      vscode.env.openExternal(vscode.Uri.parse(url));
    }*/

  } catch (error) {
      log("Error submitting files:" + error);
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

export async function getImage(sessionId: string) {
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
    throw new Error('No workspace folder open');
  }

  const configPath = path.join(workspaceFolders[0].uri.fsPath, 'config.json');
  log("configPath: " + configPath);
  if (!fs.existsSync(configPath)) {
    throw new Error(`No config.json file found in workplace folder ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

// submitJobGeneral.ts

// Types are optional but help avoid mistakes
type SubmitExecution = {
  mode?: "sampler" | "estimator";
  shots?: number;
};

/*
type SubmitOptionsIBM = {
  token: string;
  instance: string;
  device: string; // e.g. "ibm_brisbane"
};

type SubmitPayload = {
  apikey: string;
  src: string;           // base64
  src_type: string;      // "qasm" by default
  execution: SubmitExecution;
  backend: "ibm" | "cudaq";
  options: Record<string, unknown>; // provider-specific
};

async function pollJobUntilDone(jobUid: string, apikey: string) {
  const baseUrl = "https://quantum.quantag-it.com/api5/qvm/job";
  let delay = 1000;
  const maxDelay = 8000;
  const maxTimeMs = 3 * 60 * 1000; // 3 min
  const t0 = Date.now();

  while (true) {
    const resp = await fetch(`${baseUrl}/${encodeURIComponent(jobUid)}`, {
      method: "GET",
      headers: {
        "X-API-Key": apikey,
        "Accept": "application/json"
      }
    });

    const text = await resp.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch {}

    if (!resp.ok) {
      log(`Status check failed: ${resp.status} ${resp.statusText} ${text}`);
      return { ok: false, error: text || resp.statusText };
    }

    const st = String(json?.status || "");
    if (st === "DONE") {
      log("Job finished. Results received.");
      return { ok: true, data: json };
    }
    if (st === "ERROR") {
      log("Job ended with ERROR.");
      return { ok: false, error: JSON.stringify(json) };
    }

    if (Date.now() - t0 > maxTimeMs) {
      log("Timeout waiting for job.");
      return { ok: false, error: "timeout" };
    }

    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(maxDelay, Math.round(delay * 1.6));
  }
}
*/
export function openJobsDashboard() {
  vscode.env.openExternal(vscode.Uri.parse("https://cloud.quantag-it.com/jobs"));
}

export async function submitJobGeneral(srcData: string) {
  try {
    const cfg = await readConfig();

    const url =
      (globalThis as any).Config?.["qvm.submit"] ??
      cfg.submit_url ??
      "https://quantum.quantag-it.com/api5/qvm/submit";

    // Base64 encode QASM
    const srcBase64 = Buffer.from(srcData, "utf8").toString("base64");

    // Just send config as-is
    const payload = {
      src: srcBase64,
      config: cfg,
    };

    log("Submitting job to: " + url);

    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
      },
    });

    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* ignore JSON parse error */
    }

    if (!response.ok) {
      log(
        `Submit failed: ${response.status} ${response.statusText} ${
          json ? JSON.stringify(json) : text
        }`
      );
      return;
    }

    const jobUid = json?.job_uid ?? json?.action_id ?? "(no id)";
    log(`Job queued: ${jobUid}`);
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

