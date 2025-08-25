import * as vscode from "vscode";

type GateInfo = {
  name: string;
  summary: string;
  details?: string;
};

const GATES: Record<string, GateInfo> = {
  x:  { name: "X (NOT)", summary: "Pauli-X gate. Flips |0> <-> |1>.", details: "`X = [[0,1],[1,0]]`" },
  y:  { name: "Y", summary: "Pauli-Y gate.", details: "`Y = [[0,-i],[i,0]]`" },
  z:  { name: "Z", summary: "Pauli-Z gate. Phase flip.", details: "`Z = [[1,0],[0,-1]]`" },
  h:  { name: "H", summary: "Hadamard. Creates superposition.", details: "`H = (1/sqrt(2))*[[1,1],[1,-1]]`" },
  s:  { name: "S", summary: "Phase gate (pi/2).", details: "`S = diag(1, i)`" },
  t:  { name: "T", summary: "T gate (pi/4).", details: "`T = diag(1, e^{i*pi/4})`" },
  rx: { name: "RX(theta)", summary: "Rotation around X by theta.", details: "`RX(θ) = exp(-i*θ/2 * X)`" },
  ry: { name: "RY(theta)", summary: "Rotation around Y by theta.", details: "`RY(θ) = exp(-i*θ/2 * Y)`" },
  rz: { name: "RZ(theta)", summary: "Rotation around Z by theta.", details: "`RZ(θ) = exp(-i*θ/2 * Z)`" },
  u3: { name: "U3(theta,phi,lambda)", summary: "Generic 1-qubit rotation.", details: "`U3(θ,φ,λ)`" },
  u:  { name: "U(theta,phi,lambda)", summary: "OpenQASM3 U gate.", details: "`U(θ,φ,λ)`" },
  cx: { name: "CX", summary: "Controlled-X (CNOT).", details: "Two-qubit entangler." },
  cz: { name: "CZ", summary: "Controlled-Z.", details: "Two-qubit phase entangler." },
  swap:{ name: "SWAP", summary: "Swap two qubits.", details: "" },
  ecr: { name: "ECR", summary: "Echoed cross-resonance.", details: "Hardware-native on some IBM backends." },
  measure: { name: "measure", summary: "Measure qubit into classical bit.", details: "" },
  barrier: { name: "barrier", summary: "Compiler fence; prevents reordering.", details: "" }
};

export class QasmHoverProvider implements vscode.HoverProvider {
  provideHover(doc: vscode.TextDocument, pos: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    const range = doc.getWordRangeAtPosition(pos, /[A-Za-z_][A-Za-z0-9_]*/);
    if (!range) return;

    const word = doc.getText(range).toLowerCase();

    // qreg/creg info
    const line = doc.lineAt(pos.line).text.trim();
    if (line.startsWith("qreg ")) {
      const m = line.match(/^qreg\s+([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*(\d+)\s*\]\s*;/);
      if (m) {
        const name = m[1];
        const n = m[2];
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**Quantum register** \`${name}\` with \`${n}\` qubits.\n\n`);
        md.appendMarkdown(this.actionsBlock());
        md.isTrusted = true;
        return new vscode.Hover(md, range);
      }
    }
    if (line.startsWith("creg ")) {
      const m = line.match(/^creg\s+([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*(\d+)\s*\]\s*;/);
      if (m) {
        const name = m[1];
        const n = m[2];
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**Classical register** \`${name}\` with \`${n}\` bits.\n\n`);
        md.appendMarkdown(this.actionsBlock());
        md.isTrusted = true;
        return new vscode.Hover(md, range);
      }
    }

    // gate info
    if (GATES[word]) {
      const info = GATES[word];
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**${info.name}**\n\n`);
      md.appendMarkdown(`${info.summary}\n\n`);
      if (info.details) {
        md.appendCodeblock(info.details, "text");
      }
      md.appendMarkdown(this.actionsBlock());
      md.isTrusted = true;
      return new vscode.Hover(md, range);
    }

    // measure line variant
    if (/^\s*measure\b/.test(line)) {
      const info = GATES["measure"];
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**${info.name}**\n\n${info.summary}\n\n`);
      md.appendMarkdown(this.actionsBlock());
      md.isTrusted = true;
      return new vscode.Hover(md, range);
    }

    return;
  }

  private actionsBlock(): string {
/*
    const runCmd = "command:quantag.runOnHardware";
    const transpileCmd = "command:quantag.transpileWithGuppy";
    const zxCmd = "command:quantag.openZXPreview";

    return [
      "\n---\n",
      "[Transpile (Guppy)](" + transpileCmd + ")",
      " | ",
      "[Run on Hardware](" + runCmd + ")",
      " | ",
      "[ZX Preview](" + zxCmd + ")\n"
    ].join("");
    */
   return "";
  }
}
