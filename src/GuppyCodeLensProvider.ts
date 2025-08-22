import * as vscode from "vscode";
import { detectFromBackend, getConfig, DetectFnInfo } from "./guppyTools";
import { log } from "./tools";

export class GuppyCodeLensProvider implements vscode.CodeLensProvider {
  private cache: Map<string, vscode.CodeLens[]> = new Map();
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor() {
    // Invalidate cache on edits or save
    vscode.workspace.onDidChangeTextDocument(e => {
      this.cache.delete(e.document.uri.toString());
      this._onDidChangeCodeLenses.fire();
    });
    vscode.workspace.onDidSaveTextDocument(doc => {
      this.cache.delete(doc.uri.toString());
      this._onDidChangeCodeLenses.fire();
    });
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const key = document.uri.toString();

    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    log(`[Guppy] Scanning ${document.fileName} for @guppy functions...`);

    try {
      const cfg = getConfig();
      const source = document.getText();
      const fns: DetectFnInfo[] = await detectFromBackend(
        source,
        cfg.apiBase,
        cfg.timeoutMs,
        cfg.insecureTLS
      );

      const lenses: vscode.CodeLens[] = [];
      for (const fn of fns) {
        if (fn.lineno !== null) {
          const range = new vscode.Range(
            new vscode.Position(fn.lineno - 1, 0),
            new vscode.Position(fn.lineno - 1, 0)
          );
          lenses.push(
            new vscode.CodeLens(range, {
              title: `Compile ${fn.name}`,
              command: "quantag.guppy.compileAllInFile",
              arguments: [document.uri]
            })
          );
        }
      }

      log(`[Guppy] Found ${fns.length} function(s): ${fns.map(f => f.name).join(", ")}`);
      this.cache.set(key, lenses);
      return lenses;
    } catch (e: any) {
      log(`[Guppy] detectFromBackend failed: ${e.message || e}`);
      this.cache.set(key, []);
      return [];
    }
  }
}
