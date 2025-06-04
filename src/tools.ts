import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

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
  logqirOutputger.appendLine(message);
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

async function getAllFilesInFolder(folderPath, filesData) {
  console.log("getAllFilesInFolder " + folderPath);
  const files = await fsPromises.readdir(folderPath);

  // Filter files with .qasm or .py extension
  const qasmFiles = files.filter(file => (path.extname(file) === '.qasm' || path.extname(file)==='.py'));

  for (const file of qasmFiles) {
    const filePath = path.join(folderPath, file);

    // Read file contents
    const fileContents = await fsPromises.readFile(filePath, 'utf-8');

    // Encode file contents in base64
    const encodedContents = base64Encode(fileContents);

    // Add file details to the array
    filesData.push({
      path: filePath,
      source: encodedContents,
    });
  }

  var subFolders = await getDirectories(folderPath);
  console.log("Found " + subFolders.length + " subfolders in " + folderPath);

  for(var sub of subFolders) { 
    await getAllFilesInFolder(sub, filesData);
  }
  
  return filesData;
}


export async function submitFiles(folderPath: string, sessionId: string, rootFolder: string) {
    const filesData: { path: string; source: string }[] = [];

    await getAllFilesInFolder(folderPath, filesData);
      // Prepare the JSON payload
    const payload = {
        sessionId: sessionId,
        files: filesData,
        root: rootFolder
    };

    log("Sumbiting ["+ filesData.length+"] workplace files to cloud.. SessionId = " + sessionId );
    try {
      const response = await fetch("https://cryspprod3.quantag-it.com:444/api2/submitFiles", {
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
    const response = await fetch("https://cryspprod3.quantag-it.com:444/api2/getImage", {
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

export async function runZISimulator(srcData: string) {
  var srcDataBase64 = btoa(srcData);
  const payload = {
    src: srcDataBase64
  };
  try {
    const response = await fetch("https://cryspprod2.quantag-it.com:4043/api2/run", {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {'Content-Type': 'application/json; charset=UTF-8'}
    });

    if (!response.ok) {
       log("reponse is not ok: " + response.status + " - " + response.statusText);
    }

    const responseData = await response.json();
  //  log(responseData);
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
    const response = await fetch("https://cryspprod3.quantag-it.com:444/api2/getFile", {
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
		vscode.env.openExternal(vscode.Uri.parse("https://quantag-it.com/quantum/#/qcd?id="+sessionId));
}