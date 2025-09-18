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
    formats: ["hugr", "json", "str"],
    outDir: "out"
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
  const url = `${apiBase}/detect`;
  log(url);

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_b64: Buffer.from(source, "utf-8").toString("base64"),
    }),
  });
  if (!resp.ok) { throw new Error(`Detect failed: ${resp.statusText}`); }
  
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
  // log(`[Guppy] Sending compile payload: ${JSON.stringify(payload, null, 2)}`);
  const resp = await fetch(apiBase + "/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    throw new Error(`Compile failed: ${resp.status} ${resp.statusText} - ${await resp.text()}`);
  }
  const json = await resp.json();
  // *** DEBUG LOGGING ***
 // log(`[Guppy] Raw compile response: ${JSON.stringify(json, null, 2)}`);
  log(`[Guppy] Raw compile response ok=${json.ok}, results keys=${Object.keys(json.results).join(", ")}`);

for (const [fn, fmts] of Object.entries(json.results)) {
  const formatsObj = fmts as Record<string, any>;
  log(`[Guppy] Function ${fn} returned formats: ${Object.keys(formatsObj).join(", ")}`);
}

  // return only results section
  return json.results as Record<string, Record<string, string>>;
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

      if (fmt === "hugr") {
        // binary base64
        filePath = path.join(dir, `${fnName}.hugr`);
        try {
          await fs.writeFile(filePath, Buffer.from(content as string, "base64"));
          log(`[Guppy] Saved HUGR binary: ${filePath}`);
        } catch (e: any) {
          log(`[Guppy] Failed to decode HUGR for ${fnName}: ${e.message}`);
        }
      } else if (fmt === "json") {
        // JSON representation
        filePath = path.join(dir, `${fnName}.json`);
        const data = typeof content === "string" ? content : JSON.stringify(content, null, 2);
        await fs.writeFile(filePath, data);
        log(`[Guppy] Saved JSON: ${filePath}`);
      } else if (fmt === "str") {
        // plain text representation
        filePath = path.join(dir, `${fnName}.txt`);
        await fs.writeFile(filePath, content as string);
        log(`[Guppy] Saved TXT: ${filePath}`);
      } else {
        log(`[Guppy] Unknown format: ${fmt}`);
      }
    }
  }

  log(`[Guppy] All artifacts saved under ${dir}`);
}
