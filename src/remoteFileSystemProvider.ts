import * as vscode from 'vscode';
import fetch from 'node-fetch';
import { log } from './tools';

export class RemoteFileSystemProvider implements vscode.FileSystemProvider {
  private emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  onDidChangeFile = this.emitter.event;

  private baseUrl: string;
  private token?: string;

  constructor(baseUrl: string, token?: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

makeHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
 // log("token: " + this.token);

  if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
  }
  return headers;
}

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
  const requestId = Math.random().toString(36).substring(2, 10);
  const url = `${this.baseUrl}/stat?path=${uri.path}`;
  log("stat ["+requestId+"] -> URL: " + url);

  try {
    const res = await fetch(url, {
      headers: this.makeHeaders()
    });

    log(`stat [${requestId}] -> Response status: ${res.status}`);

    if (res.status === 404) {
      return Promise.reject(vscode.FileSystemError.FileNotFound(uri));
    }

    if (!res.ok) {
      return Promise.reject(vscode.FileSystemError.Unavailable(uri));
    }

    const json = await res.json();
    log("stat ["+requestId+"] -> JSON response: " + JSON.stringify(json));

    return {
      type: json.isDirectory ? vscode.FileType.Directory : vscode.FileType.File,
      ctime: json.ctime,
      mtime: json.mtime,
      size: json.size,
    };
  } catch (err) {
    log("stat -> Error: " + err);
    throw err;
  }
}

async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
  const url = `${this.baseUrl}/list?path=${uri.path}`;
  log("readDirectory -> URL: " +url);

  try {
    const res = await fetch(url, {
      headers: this.makeHeaders()
    });

    log(`readDirectory -> Response status: ${res.status}`);

    if (res.status === 404) {
      return Promise.reject(vscode.FileSystemError.FileNotFound(uri));
    }

    if (!res.ok) {
      return Promise.reject(vscode.FileSystemError.Unavailable(uri));
    }

    const text = await res.text();
    log("readDirectory -> JSON response: " + text);

    const files = JSON.parse(text);

    log("readDirectory -> Parsed JSON:" + files);

    return files.map((file: any) => [
      file.name,
      file.isDirectory ? vscode.FileType.Directory : vscode.FileType.File,
    ]);

  } catch (err) {
    console.error("readDirectory -> Error:", err);
    throw err;
  }
}


async readFile(uri: vscode.Uri): Promise<Uint8Array> {
  const requestId = Math.random().toString(36).substring(2, 10);
  const url = `${this.baseUrl}/file?path=${uri.path}`;
  log(`readFile [${requestId}] -> URL: ${url}`);

  try {
    const res = await fetch(url, {
      headers: this.makeHeaders()
    });

    log(`readFile [${requestId}] -> Response status: ${res.status}`);
    
    if (res.status === 404) {
      return Promise.reject(vscode.FileSystemError.FileNotFound(uri));
    }

    if (!res.ok) {
      return Promise.reject(vscode.FileSystemError.Unavailable(uri));
    }

    const data = await res.arrayBuffer();
    log(`readFile [${requestId}] -> Received ${data.byteLength} bytes`);

    return new Uint8Array(data);
  } catch (err) {
    log(`readFile [${requestId}] -> Error: ${err}`);
    throw err;
  }
}

async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
  const requestId = Math.random().toString(36).substring(2, 10);
  const url = `${this.baseUrl}/file?path=${uri.path}`;
  log(`writeFile [${requestId}] -> URL: ${url}`);
  log(`writeFile [${requestId}] -> Sending ${content.byteLength} bytes`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: this.makeHeaders(),
      body: content,
    });

    log(`writeFile [${requestId}] -> Response status: ${res.status}`);

    if (!res.ok) {
      const text = await res.text();
      log(`writeFile [${requestId}] -> Error response body: ${text}`);
      throw new Error(`Failed to write file: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    log(`writeFile [${requestId}] -> Error: ${err}`);
    throw err;
  }
}

 async createDirectory(uri: vscode.Uri): Promise<void> {
  const requestId = Math.random().toString(36).substring(2, 10);
  const url = `${this.baseUrl}/mkdir?path=${uri.path}`;
  log(`createDirectory [${requestId}] -> URL: ${url}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: this.makeHeaders(),
    });

    log(`createDirectory [${requestId}] -> Response status: ${res.status}`);

    if (!res.ok) {
      const text = await res.text();
      log(`createDirectory [${requestId}] -> Error response body: ${text}`);
      throw new Error(`Failed to create directory: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    log(`createDirectory [${requestId}] -> Error: ${err}`);
    throw err;
  }
}


async delete(uri: vscode.Uri): Promise<void> {
  const requestId = Math.random().toString(36).substring(2, 10);
  const url = `${this.baseUrl}/delete?path=${uri.path}`;
  log(`delete [${requestId}] -> URL: ${url}`);

  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.makeHeaders(),
    });

    log(`delete [${requestId}] -> Response status: ${res.status}`);

    if (!res.ok) {
      const text = await res.text();
      log(`delete [${requestId}] -> Error response body: ${text}`);
      throw new Error(`Failed to delete: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    log(`delete [${requestId}] -> Error: ${err}`);
    throw err;
  }
}

  async rename(oldUri: vscode.Uri, newUri: vscode.Uri): Promise<void> {
    await fetch(`${this.baseUrl}/rename`, {
      method: 'POST',
      headers: {
        ...this.makeHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ oldPath: oldUri.path, newPath: newUri.path }),
    });
  }

}
