import * as fsPromises from 'fs/promises';
import * as path from 'path';


const fs = require('fs');

function base64Encode(data: string): string {
  return Buffer.from(data).toString('base64');
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
  // collect all files in all subfolders

  try {
    const filesData: { path: string; source: string }[] = [];

     await getAllFilesInFolder(folderPath, filesData);
      // Prepare the JSON payload
    const payload = {
      sessionId: sessionId,
      files: filesData,
      root: rootFolder
    };

    var json = JSON.stringify(payload);
    const response = await fetch("https://cryspprod3.quantag-it.com:444/api2/submitFiles", {
      method: 'POST',
      body: json,
      headers: {'Content-Type': 'application/json; charset=UTF-8'} });
      
      if (!response.ok) {  }
      // If you care about a response:
      if (response.body !== null) {
        // parse as needed
      }
    
    // Return the payload if needed
    return ""; //payload;
  } catch (err) {
    console.error('Error:', err);
  }
}

