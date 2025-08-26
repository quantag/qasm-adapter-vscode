import * as vscode from "vscode";

export class CudaQCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/);

    // Detect Python kernels: line with "@cudaq.kernel" followed by "def name("
    const pyDecorator = /^\s*@cudaq\.kernel\s*$/;
    const pyDefName = /^\s*def\s+([A-Za-z_]\w*)\s*\(/;

    // Detect C++ kernels: "__qpu__ void name("
    const cppKernel = /^\s*__qpu__\s+void\s+([A-Za-z_]\w*)\s*\(/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Python pattern
      if (pyDecorator.test(line)) {
        const next = lines[i + 1] || "";
        const m = next.match(pyDefName);
        if (m) {
          const kernelName = m[1];
          const range = new vscode.Range(i, 0, i, line.length);
          lenses.push(
            new vscode.CodeLens(range, {
              title: "Run CUDA-Q Kernel",
              command: "quantagStudio.cudaq.runKernel",
              arguments: [{ kernelName, docUri: document.uri.toString() }]
            })
          );
        }
      }

      // C++ pattern
      const cm = line.match(cppKernel);
      if (cm) {
        const kernelName = cm[1];
        const range = new vscode.Range(i, 0, i, line.length);
        lenses.push(
          new vscode.CodeLens(range, {
            title: "Run CUDA-Q Kernel",
            command: "quantagStudio.cudaq.runKernel",
            arguments: [{ kernelName, docUri: document.uri.toString() }]
          })
        );
      }
    }

    return lenses;
  }
}
