import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import {log} from "./tools"

// Type definition for function metadata
export interface DetectFnInfo {
  name: string;
  lineno: number | null;
  end_lineno: number | null;
  has_compile: boolean;
  compile_sig: string | null;
}

// Config shape
export interface GuppyConfig {
  apiBase: string;
  timeoutMs: number;
  insecureTLS: boolean;
  formats: string[];
  outDir: string;
}

export function getConfig(): GuppyConfig {
  return {
    apiBase: "https://cryspprod3.quantag-it.com:444/api17",
    timeoutMs: 20000,
    insecureTLS: false,
    formats: ["hugr", "json", "txt"],
    outDir: "out_build"
  };
}

// Utility: fetch with timeout
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// Detect functions from backend
export async function detectFromBackend(
  source: string,
  apiBase: string,
  timeoutMs: number,
  insecureTLS: boolean
): Promise<DetectFnInfo[]> {
  const resp = await fetch(`${apiBase}/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_b64: Buffer.from(source, "utf-8").toString("base64"),
    }),
  });
  if (!resp.ok) throw new Error(`Detect failed: ${resp.statusText}`);
  const data = await resp.json();
  return data.functions as DetectFnInfo[];
}
// Compile selected guppy functions
export async function compileGuppyFunctions(
  source: string,
  names: string[],
  formats: string[],
  apiBase: string,
  timeoutMs: number,
  insecureTLS: boolean
): Promise<Record<string, Record<string, string>>> {
  // encode once, cleanly
  const source_b64: string = Buffer.from(source, "utf8").toString("base64");

  const payload = {
    source_b64,
    functions: names,
    formats
  };

  const resp = await fetch(apiBase + "/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    throw new Error(`Compile failed: ${resp.status} ${resp.statusText} - ${await resp.text()}`);
  }

  return await resp.json();
}

export async function saveArtifacts(
  results: Record<string, Record<string, any>>,
  outRoot: vscode.Uri,
  stem: string
) {
  const dir = path.join(outRoot.fsPath, stem);
  await fs.mkdir(dir, { recursive: true });
  log(`[Guppy] Created directory: ${dir}`);

  for (const [fnName, formats] of Object.entries(results)) {
    for (const [fmt, content] of Object.entries(formats)) {
      let filePath: string;

      switch (fmt) {
        case "hugr":
          filePath = path.join(dir, fnName + ".hugr");
          await fs.writeFile(filePath, Buffer.from(content as string, "base64"));
          log(`[Guppy] Saved HUGR binary: ${filePath}`);
          break;

        case "json":
          filePath = path.join(dir, fnName + ".json");
          await fs.writeFile(filePath, typeof content === "string" ? content : JSON.stringify(content, null, 2));
          log(`[Guppy] Saved JSON: ${filePath}`);
          break;

        case "txt":
          filePath = path.join(dir, fnName + ".txt");
          await fs.writeFile(filePath, typeof content === "string" ? content : JSON.stringify(content, null, 2));
          log(`[Guppy] Saved TXT: ${filePath}`);
          break;

        default:
          log(`[Guppy] Unknown format: ${fmt}`);
      }
    }
  }

  log(`[Guppy] All artifacts saved under ${dir}`);
}
