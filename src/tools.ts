import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

const logger = vscode.window.createOutputChannel("OpenQASM");
const fs = require('fs');

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
    //  var subFiles = 
    await getAllFilesInFolder(sub, filesData);
     // console.log("Found " + subFiles.length + " files in " + sub);
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
  const panel = vscode.window.createWebviewPanel(
          'imageViewer',
          'Quantum Circuit',
          vscode.ViewColumn.One,
          {}
      );
  // Get the URI of the image file
 //     const imagePath = vscode.Uri.file(rootFolder + '/image.jpg');
 // log(imagePath);
 //     const imageSrc = panel.webview.asWebviewUri(imagePath);

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
      log(src);
      // Set the HTML content of the webview to display the image
      panel.webview.html = src;

      // Return the webview-based debug adapter descriptor
    //  return new vscode.DebugAdapterInlineImplementation(panel.webview);
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
       log("reponse is not ok");
      // throw new Error(`Failed to submit files: ${response.status} - ${response.statusText}`);
    }

    const responseData = await response.json();
    log(responseData);
    var base64data = responseData.data;
    showImage64(base64data);
   // log(JSON.stringify(responseData, null, 2)); // Log the JSON data with indentation for better readability

  } catch (error) {
      log("Error get image:" + error);
  }
}
