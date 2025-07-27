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
  const url = `${this.baseUrl}/stat?path=${uri.path}`;
  log("stat -> URL: " + url);

  try {
    const res = await fetch(url, {
      headers: this.makeHeaders()
    });

    log(`stat -> Response status: ${res.status}`);

    const json = await res.json();
    log("stat -> JSON response: " + JSON.stringify(json));

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
    const res = await fetch(`${this.baseUrl}/file?path=${uri.path}`, {
      headers: this.makeHeaders()
    });
    const data = await res.arrayBuffer();
    return new Uint8Array(data);
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    await fetch(`${this.baseUrl}/file?path=${uri.path}`, {
      method: 'POST',
      headers: this.makeHeaders(),
      body: content,
    });
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    await fetch(`${this.baseUrl}/mkdir?path=${uri.path}`, {
      method: 'POST',
      headers: this.makeHeaders(),
    });
  }

  async delete(uri: vscode.Uri): Promise<void> {
    await fetch(`${this.baseUrl}/delete?path=${uri.path}`, {
      method: 'DELETE',
      headers: this.makeHeaders(),
    });
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
