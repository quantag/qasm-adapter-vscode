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


export async function submitFiles(folderPath: string, sessionId: string, rootFolder: string) {
    const filesData: { path: string; source: string }[] = [];

    if (vscode.env.uiKind === vscode.UIKind.Web) {
      log("== Web mode ==");
    } else {
      log("== Desktop mode ==");
    }
    const baseUrl = process.env.QUANTAG_BASE_URL;
    if (baseUrl) {
      log("Running with QUANTAG_BASE_URL=" + baseUrl);
    } else {
      log("No QUANTAG_BASE_URL");
    }

    await getAllFilesInFolder(folderPath, filesData, rootFolder);

      // Prepare the JSON payload
    const payload = {
        sessionId: sessionId,
        files: filesData,
        root: rootFolder
    };
    log("Sumbiting ["+ filesData.length+"] workplace files to cloud.. SessionId = " + sessionId );
    try {
      const response = await fetch(Config["submit.files"], {
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
  try {
    const response = await fetch(Config["get.image"], {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {'Content-Type': 'application/json; charset=UTF-8'}
    });

    if (!response.ok) {
       log("reponse is not ok: ${response.status} - ${response.statusText}");
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

export async function runOnIBMQ(srcData: string) {
  try {
        var srcDataBase64 = btoa(srcData);
        const URL = Config["ibmq.submit"];
        const config = await readConfig(); // read token, user_id, instance, backend

        const payload = {
            qasm: srcDataBase64,
            user_id: config.user_id,
            instance: config.instance,
            token: config.token,
            backend: config.backend
        };
       // log("Submitting job to: " + URL);
       // log("Request payload: " + JSON.stringify(payload, null, 2));

        const response = await fetch(URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {'Content-Type': 'application/json; charset=UTF-8'}
        });

          if (!response.ok) {
            log("reponse is not ok: " + response.status + " - " + response.statusText);
          } else {
            const responseData = await response.json(); // 🔥 await this!
            log("Successfully submitted job to IBM. Check status at https://quantum.quantag-it.com/profile");
            log("Response JSON: " + JSON.stringify(responseData, null, 2));
          }
  } catch (error) {
      log("Error :" + error);
  }
}

export async function runZISimulator(srcData: string) {
  var srcDataBase64 = btoa(srcData);
  const payload = {
    src: srcDataBase64
  };
  try {
    const response = await fetch(Config["pyzx.optimize"], {
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
      const response = await fetch(Config["pyzx.optimize"], {
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