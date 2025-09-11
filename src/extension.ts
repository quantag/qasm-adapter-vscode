
'use strict';

import * as Net from 'net';
import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { platform } from 'process';
import { ProviderResult } from 'vscode';
import { MockDebugSession } from './mockDebug';
import { activateMockDebug, setSessionID, workspaceFileAccessor } from './activateMockDebug';
import {submitFiles, log, parseJwt} from './tools';
import { getUserID, RemoteFileSystemProvider } from './remoteFileSystemProvider';

import * as fs from 'fs';
import * as path from 'path';

import { 
  DetectFnInfo,
  getConfig,
  detectFromBackend,
  compileGuppyFunctions,
  saveArtifacts
} from './guppyTools';

import { GuppyCodeLensProvider } from "./GuppyCodeLensProvider";
import { QasmHoverProvider } from './QasmHoverProvider';
import { CudaQCodeLensProvider } from './cudaqCodeLensProvider';
import { Config, updateConfig } from "./config";

/*
 * The compile time flag 'runMode' controls how the debug adapter is run.
 * Please note: the test suite only supports 'external' mode.
 */
const runMode: 'external' | 'server' | 'namedPipeServer' | 'inline' = 'server';


const config = vscode.workspace.getConfiguration('remoteFiles');
const apiBaseUrl = config.get<string>('baseUrl', 'https://cryspprod3.quantag-it.com/api5');
let statusBarItem: vscode.StatusBarItem;
const AUTH_CHECK_URL = Config["auth.check"];
const AUTH_START_URL = Config["auth.start"];
const AUTH_POLL_INTERVAL = 2000;


export function activate(context: vscode.ExtensionContext) {

	// debug adapters can be run in different ways by using a vscode.DebugAdapterDescriptorFactory:
	switch (runMode) {
		case 'server':
			// run the debug adapter as a server inside the extension and communicate via a socket
			activateMockDebug(context, new MockDebugAdapterServerDescriptorFactory());
			break;

		case 'namedPipeServer':
			// run the debug adapter as a server inside the extension and communicate via a named pipe (Windows) or UNIX domain socket (non-Windows)
			activateMockDebug(context, new MockDebugAdapterNamedPipeServerDescriptorFactory());
			break;

		case 'external': default:
			// run the debug adapter as a separate process
			activateMockDebug(context, new DebugAdapterExecutableFactory());
			break;

		case 'inline':
			// run the debug adapter inside the extension and directly talk to it
			activateMockDebug(context);
			break;
	}

	let remoteFsProvider: RemoteFileSystemProvider | undefined;

	context.secrets.get("remoteAuthToken").then(token => {
		if (token) {
			remoteFsProvider = new RemoteFileSystemProvider(apiBaseUrl, token);
			context.subscriptions.push(
				vscode.workspace.registerFileSystemProvider('remote', remoteFsProvider, {
					isReadonly: true,
					isCaseSensitive: true
				})
			);
		}
	});

 const provider2 = new CudaQCodeLensProvider();

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [{ language: "python" }, { language: "cpp" }],
      provider2
    )
  );

context.subscriptions.push(
    vscode.commands.registerCommand(
      "quantagStudio.cudaq.runKernel",
      async (args: { kernelName: string; docUri: string }) => {
        try {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(args.docUri));
          const sourceCode = doc.getText();

          // Convert source to base64
          const srcB64 = Buffer.from(sourceCode, "utf-8").toString("base64");

          // Settings from package.json (workspace config)
          const target = vscode.workspace.getConfiguration("quantagStudio").get<string>("cudaqTarget") 
                          || "qpp-cpu";

          // Call microservice
          const response = await fetch(Config["cudaq.run"], {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source_b64: srcB64,
              lang: doc.languageId,   // "python" or "cpp"
              kernel: args.kernelName,
              target,
              shots: 1000
            })
          });

          if (!response.ok) {
            const text = await response.text();
            throw new Error("Service error " + response.status + ": " + text);
          }

          const payload = await response.json();

          if (payload.counts) {
            log("CUDA-Q result: " + JSON.stringify(payload.counts));
          } else if (payload.statevector_amplitudes) {
            log("CUDA-Q statevector returned (" + payload.statevector_amplitudes.length + " amps)");
          } else {
            log("CUDA-Q run completed.");
          }

        } catch (err: any) {
          log("CUDA-Q call failed: " + err.message);
        }
      }
    )
  );

	context.subscriptions.push(
		vscode.commands.registerCommand("remoteFiles.openRemote", async () => {
			const token = await context.secrets.get("remoteAuthToken");

			if (!token) {
				vscode.window.showErrorMessage("Not logged in. Please run Google Login first.");
				return;
			}

			if (!remoteFsProvider) {
				// Safety net: register provider now
				remoteFsProvider = new RemoteFileSystemProvider(apiBaseUrl, token);
				context.subscriptions.push(
					vscode.workspace.registerFileSystemProvider('remote', remoteFsProvider, {
						isReadonly: true,
						isCaseSensitive: true
					})
				);
			}

			vscode.workspace.updateWorkspaceFolders(
				0,
				0,
				{ uri: vscode.Uri.parse('remote:/'), name: 'Remote Files' }
			);
		})
	);

	// register CodeLens provider
	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(
			{ scheme: "file", language: "python" },
			new GuppyCodeLensProvider()
		)
	);
	log("Registered CodeLens provider");

	const langId = "openqasm";
	const provider = vscode.languages.registerHoverProvider(
		{ language: langId, scheme: "file" },
		new QasmHoverProvider()
	);

  context.subscriptions.push(provider);

	context.subscriptions.push(vscode.commands.registerCommand(
	"quantag.guppy.compileOne",
	async (uri: vscode.Uri, fnName: string) => {
		const cfg = getConfig();
		const doc = await vscode.workspace.openTextDocument(uri);
		const source = doc.getText();

		try {
		const results = await compileGuppyFunctions(
			source,
			[fnName],    // compile only this one
			cfg.formats,
			cfg.apiBase,
			cfg.timeoutMs,
			cfg.insecureTLS
		);
		const ws = vscode.workspace.workspaceFolders?.[0];
		if (!ws) {
			vscode.window.showErrorMessage("Open a workspace to save outputs.");
			return;
		}
		const outRoot = vscode.Uri.joinPath(ws.uri, cfg.outDir);
		const stem = path.parse(uri.fsPath).name;
		await saveArtifacts(results, outRoot, stem);
		vscode.window.showInformationMessage(`Compiled ${fnName} to ${cfg.outDir}/${stem}/`);
		} catch (e: any) {
		vscode.window.showErrorMessage(`Compile failed for ${fnName}: ${e.message || e}`);
		}
	}
	));


  // compileAllInFile command
  context.subscriptions.push(vscode.commands.registerCommand("quantag.guppy.compileAllInFile",
    async (uri: vscode.Uri) => {
      const cfg = getConfig();
      const doc = await vscode.workspace.openTextDocument(uri);
      const source = doc.getText();

      // detect again to ensure fresh list
      let fns: DetectFnInfo[] = [];
      try {
        fns = await detectFromBackend(source, cfg.apiBase, cfg.timeoutMs, cfg.insecureTLS);
      } catch (e: any) {
        vscode.window.showErrorMessage(`Detect failed: ${e.message || e}`);
        return;
      }
      const names = fns.map(f => f.name);
      if (!names.length) { vscode.window.showInformationMessage("No @guppy functions found."); return; }

	try {
	const resp = await compileGuppyFunctions(
		source,
		names,
		cfg.formats,
		cfg.apiBase,
		cfg.timeoutMs,
		cfg.insecureTLS
	);

	const results = (resp as any).results ?? resp as Record<string, Record<string, string>>;

	const ws = vscode.workspace.workspaceFolders?.[0];
	if (!ws) {
		vscode.window.showErrorMessage("Open a workspace to save outputs.");
		return;
	}

	const outRoot = vscode.Uri.joinPath(ws.uri, cfg.outDir);
	const stem = path.parse(uri.fsPath).name;

	await saveArtifacts(results, outRoot, stem);

	vscode.window.showInformationMessage(
		`Compiled ${names.length} function(s) → saved under ${cfg.outDir}/${stem}/`
	);
	} catch (e: any) {
	vscode.window.showErrorMessage(`Compile failed: ${e.message || e}`);
	}

    })
  );

	context.subscriptions.push(
	vscode.commands.registerCommand("quantagStudio.show3dVisualizer", async () => {
		// Step 1: Read QASM from active file BEFORE opening WebView
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
		vscode.window.showErrorMessage("No active editor");
		return;
		}

		const qasm = editor.document.getText();

		// Step 2: Transpile using cloud API
		let circuitJson;
		try {
			const qasmB64 = Buffer.from(qasm, "utf-8").toString("base64");
			const response = await fetch(Config["transpile"], {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
				qasm_b64: qasmB64,
				backend: "ibm_brisbane",
				opt: 3
				})
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error("Transpile failed: " + response.status + ": " + text);
			}

			circuitJson = await response.json();

		} catch (err: any) {
			vscode.window.showErrorMessage("Failed to transpile: " + err.message);
			return;
		}

		// Step 3: Open the WebView panel
		const panel = vscode.window.createWebviewPanel(
		"quantumVisualizer",
		"3D Quantum Circuit Visualizer",
		vscode.ViewColumn.Two,
		{
			enableScripts: true,
			retainContextWhenHidden: true
		}
		);

		panel.webview.html = getWebviewVisualizerHtml(context, panel);

		// Step 4: Send the circuit data to the WebView
		setTimeout(() => {
		panel.webview.postMessage({
			type: "renderCircuit",
			data: circuitJson
		});
		}, 500);
	})
	);

  context.subscriptions.push(
    vscode.commands.registerCommand('quantagStudio.optimizeQasmPyZX', optimizeQasmCommandPyZX),
    vscode.commands.registerCommand('quantagStudio.renderQasmPyZX', renderQasmCommandPyZX)
  );


	context.subscriptions.push(vscode.commands.registerCommand("quantagStudio.logout", async () => {
			await context.secrets.delete("remoteAuthToken");
			statusBarItem.text = "Quantag: Not Logged In";
			statusBarItem.show();

			vscode.window.showInformationMessage("Logged out successfully.");

			const folders = vscode.workspace.workspaceFolders || [];
			const remoteIndex = folders.findIndex(f => f.uri.scheme === "remote");

			if (remoteIndex !== -1) {
				vscode.workspace.updateWorkspaceFolders(remoteIndex, 1);
			}
		})
	);



	// === Register Quantag Studio Google Auth Command ===
	context.subscriptions.push(
		vscode.commands.registerCommand("quantagStudio.authWithGoogle", async () => {
			await authWithGoogle(context);
		})
	);

	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	statusBarItem.command = "quantagStudio.authWithGoogle";
	statusBarItem.tooltip = "Quantag Studio Google Auth";
	context.subscriptions.push(statusBarItem);

	statusBarItem.text = "Quantag Studio: Init...";
	statusBarItem.show();

	updateLoginStatusBar(context); 
}

export function deactivate() {
	// nothing to do
}


async function optimizeQasmCommandPyZX() {
	// Step 1: Read QASM from active file 
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage("No active editor");
		return;
	}

	const qasm = editor.document.getText();
    if (!qasm) return;
    const qasmB64 = Buffer.from(qasm, "utf-8").toString("base64");

  try {
		const response = await fetch(Config["pyzx.optimize"], {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ qasm: qasmB64 }),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error("Optimize failed: " + response.status + ": " + text);
		}

		const result = await response.json();
		const optimizedQasm = Buffer.from(result.qasm, "base64").toString("utf-8");

		const newDoc = await vscode.workspace.openTextDocument({
			content: optimizedQasm,
			language: "qasm"
		});
		vscode.window.showTextDocument(newDoc);
		vscode.window.showInformationMessage("QASM optimized using PyZX.");
  } catch (err: any) {
    vscode.window.showErrorMessage("Optimization failed: " + err.message);
  }
}

async function renderQasmCommandPyZX() {
	// Step 1: Read QASM from active file 
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage("No active editor");
		return;
	}

	const qasm = editor.document.getText();
    if (!qasm) return;
	const qasmB64 = Buffer.from(qasm, "utf-8").toString("base64");
  

  try {
		const response = await fetch(Config["qasm2qir"], {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ qasm: qasmB64 }),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error("Render failed: " + response.status + ": " + text);
		}

		const result = await response.json();
		const imageB64 = result.image;

		const panel = vscode.window.createWebviewPanel(
			"qasmDiagram",
			"QASM Diagram",
			vscode.ViewColumn.Beside,
			{ enableScripts: true }
		);

		panel.webview.html = `
		<!DOCTYPE html>
		<html>
		<head>
			<style>body { margin: 0; background: #1e1e1e; display: flex; justify-content: center; align-items: center; height: 100vh; }</style>
		</head>
		<body>
			<img src="data:image/png;base64,${imageB64}" style="max-width: 100%; max-height: 100%;" />
		</body>
		</html>
		`;
  } catch (err: any) {
    vscode.window.showErrorMessage("Rendering failed: " + err.message);
  }
}

function getWebviewVisualizerHtml(context: vscode.ExtensionContext, panel: vscode.WebviewPanel): string {
  const webview = panel.webview;

  const script = (name: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', name)).toString();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>QPU Visualizer</title>
  <style>
    body { margin:0; overflow:hidden; background:#0b0d10; color:#e5e7eb; font-family:sans-serif; }
    canvas { display: block; }
  </style>
  <script type="module">
    import * as THREE from "${script("three.module.js")}";
    import { OrbitControls } from "${script("OrbitControls.js")}";
    import { initViewer, setGateLibrary, renderFromData } from "${script("qpu_viewer.js")}";
    import { renderQPU } from "${script("render_default.js")}";

    const ctx = initViewer(THREE, OrbitControls, renderQPU);
    await setGateLibrary("${script("gate_lib_default.js")}", ctx);

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg?.type === 'renderCircuit') {
        ctx.currentData = msg.data;
        renderFromData(ctx, msg.data);
      }
    });
  </script>
</head>
<body></body>
</html>
  `;
}



function getActiveQasmText(): string | undefined {
	log("getActiveQasmText");
	const editor = vscode.window.activeTextEditor;
	if (!editor) {return;}
	log("getActiveQasmText 1");
	const document = editor.document;
	if (document.languageId !== 'openqasm') {return;}
	log("getActiveQasmText 2");
	return document.getText();
}

async function transpileQasm(apiBaseUrl: string, qasm: string, backend: string): Promise<any> {
  const qasmB64 = Buffer.from(qasm, 'utf-8').toString('base64');

  const response = await fetch(`${apiBaseUrl}/transpile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qasm_b64: qasmB64,
      backend: backend,
      opt: 3
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Transpile failed: ${response.status}: ${text}`);
  }

  return await response.json();
}


async function authWithGoogle(context: vscode.ExtensionContext) {
	const loginToken = crypto.randomUUID(); // или shortid или base64

	const url = `${AUTH_START_URL}?login_token=${loginToken}`;
	vscode.env.openExternal(vscode.Uri.parse(url));

    vscode.window.showInformationMessage("Please complete login in your browser...");
    const status = vscode.window.setStatusBarMessage("Waiting for Google login...");

    let token: string | undefined = undefined;
    const maxAttempts = 10;
    let attempts = 0;

    while (attempts++ < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, AUTH_POLL_INTERVAL));

        try {
            const res = await fetch(`${AUTH_CHECK_URL}?login_token=${loginToken}`, {
                method: 'GET'
            });

            if (res.status === 200) {
                const json = await res.json();
                token = json.token;
                break;
            }
        } catch (err) {
            console.error("Polling error", err);
        }
    }

    status.dispose();

    if (token) {
        await context.secrets.store("remoteAuthToken", token);
        vscode.window.showInformationMessage("Google login successful.");
		console.info("Google login successful!");

		        // === Decode token and call backend ===
        const payload = parseJwt(token);
        const google_id = payload?.sub;   // Google unique user ID
        const email = payload?.email;

        if (google_id && email) {
            try {
                const resp = await fetch(Config["getuser.by_googleid"], {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ google_id, email })
                });

                if (resp.ok) {
                    const user = await resp.json();
					const uid = user.uid?.toString();
					if (uid) {
						await context.secrets.store("internalUserId", uid);
						console.info("Bound internal user:", uid);
						vscode.window.showInformationMessage(`Logged in as internal user ${uid}`);
            		}
                    console.info("Bound internal user:", user);
                    vscode.window.showInformationMessage(`Logged in as ${user.uid}`);
                    // optionally store UID for later
                    await context.secrets.store("internalUserId", user.uid.toString());
                } else {
                    console.error("Failed to bind GoogleID:", await resp.text());
                }
            } catch (err) {
                console.error("Error calling getuser_by_googleid:", err);
            }
        }
    } else {
        vscode.window.showErrorMessage("Login timeout. Please try again.");
    }

    updateLoginStatusBar(context);
}
async function getConfigForUser(userId: string): Promise<void> {
    try {
        const resp = await fetch(Config["get.config"], {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId })
        });

        if (!resp.ok) {
            const txt = await resp.text();
            throw new Error(`get_config failed: ${resp.status} ${txt}`);
        }

        const newCfg = await resp.json();
        updateConfig(newCfg);

        console.info("Config updated for user", userId, newCfg);
    } catch (err: any) {
        console.error("Error in getConfigForUser:", err.message || err);
    }
}
function updateLoginStatusBar(context: vscode.ExtensionContext) {
    console.log("Calling updateLoginStatusBar");

    Promise.all([
        context.secrets.get("remoteAuthToken"),
        context.secrets.get("internalUserId")
    ]).then(([token, userId]) => {
        console.log("Got token from secrets:", token);
        console.log("Got internalUserId from secrets:", userId);

        let email: string | null = null;

        if (token) {
            const payload = parseJwt(token);
            email = payload?.email || null;
        }

        if (email && userId) {
            statusBarItem.text = `Quantag: ${email} (uid=${userId})`;
			getConfigForUser(userId);

        } else if (email) {
            statusBarItem.text = `Quantag: ${email}`;
        } else if (token) {
            statusBarItem.text = "Quantag: Logged In";
        } else {
            statusBarItem.text = "Quantag: Not Logged In";
        }

        statusBarItem.show();
    });
}



class DebugAdapterExecutableFactory implements vscode.DebugAdapterDescriptorFactory {
	// The following use of a DebugAdapter factory shows how to control what debug adapter executable is used.
	// Since the code implements the default behavior, it is absolutely not neccessary and we show it here only for educational purpose.

	createDebugAdapterDescriptor(_session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): ProviderResult<vscode.DebugAdapterDescriptor> {
		// param "executable" contains the executable optionally specified in the package.json (if any)
		// use the executable specified in the package.json if it exists or determine it based on some other information (e.g. the session)
		if (!executable) {
			const command = "absolute path to my DA executable";
			const args = [
				"some args",
				"another arg"
			];
			const options = {
				cwd: "working directory for executable",
				env: { "envVariable": "some value" }
			};
			executable = new vscode.DebugAdapterExecutable(command, args, options);
		}

		// make VS Code launch the DA executable
		return executable;
	}
}

async function sleep(ms) {
	return new Promise((resolve) => {
	  setTimeout(resolve, ms);
	});
  }


class MockDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
	private server?: Net.Server;
	private config: any;
	private serverName: string  = "cryspprod3.quantag-it.com";
	private serverPort: number = 5555;

	constructor() {
		this.loadConfig(); // Load config when the factory is created
	  }

	  private async loadConfig() {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
	
		if (workspaceFolder) {
		  const configPath = path.join(workspaceFolder, 'config.json');
	      
		  if (fs.existsSync(configPath)) {
			try {
			  const configFileContent = await fs.promises.readFile(configPath, 'utf8');
			  this.config = JSON.parse(configFileContent);
			  this.parseBackendConfig();
			  log('Loaded config from: ' + configPath);
			} catch (error) {
			  log('Failed to load config.json:' + error);
			}
		  } else {
			log('config.json not found in workspace.');
		  }
		} else {
		  log('No workspace folder found.');
		}
	  }

	  private parseBackendConfig() {
		if (this.config && this.config.backend) {
		  const [server, portStr] = this.config.backend.split(':');
	
		  if (server && portStr) {
			this.serverName = server;
			var _port = parseInt(portStr, 10);
			
			if (isNaN(this.serverPort)) {
			  log('Invalid port value in backend configuration. Using default');
			  this.serverPort = 5555; // Reset if port is invalid
			} else {
				this.serverPort = _port;
			    log(`Parsed serverName: ${this.serverName}, port: ${this.serverPort}`);
			}
		  }
		} else {
		  log('No backend configuration found in config.json.');
		}
	  }

	async createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): Promise<vscode.ProviderResult<vscode.DebugAdapterDescriptor>> {
		if (!this.server) {
			// start listening on a random port
			this.server = Net.createServer(socket => {
				const session = new MockDebugSession(workspaceFileAccessor);
				session.setRunAsServer(true);
				session.start(socket as NodeJS.ReadableStream, socket);
			}).listen(0);
		}

		// Write to output.
		log("Starting OpenQASM debugging session..");
		if(vscode.workspace.workspaceFolders !== undefined) {
			let workplaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
			log("workplaceFolder: " + workplaceFolder);

			setSessionID(session.id);
			log("SessionId: "+ session.id);
			
			log("UserID: "+ getUserID());
			if(getUserID() !== undefined) {

				const payload = {
					sessionId: session.id,
					userId: getUserID()
				};
				try {
					log("send prepareData to " + Config["prepare.data"]);
					const response = await fetch(Config["prepare.data"], {
						method: 'POST',
						body: JSON.stringify(payload),
						headers: {'Content-Type': 'application/json; charset=UTF-8'}
					});
					
					if (!response.ok) {
					log("reponse of prepare data is not ok: "+ response.status +", "+ response.statusText);
					}
					
				} catch (error) {
					log("Error prepare data:" + error);
				}
			}
			
			submitFiles(workplaceFolder, session.id, workplaceFolder);

			await sleep(1500);
		}

		return new vscode.DebugAdapterServer(this.serverPort, this.serverName);
	}

	dispose() {
		if (this.server) {
			this.server.close();
		}
	}
}

class MockDebugAdapterNamedPipeServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
	private server?: Net.Server;
	createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		if (!this.server) {
			// start listening on a random named pipe path
			const pipeName = randomBytes(10).toString('utf8');
			const pipePath = platform === "win32" ? join('\\\\.\\pipe\\', pipeName) : join(tmpdir(), pipeName);

			this.server = Net.createServer(socket => {
				const session = new MockDebugSession(workspaceFileAccessor);
				session.setRunAsServer(true);
				session.start(<NodeJS.ReadableStream>socket, socket);
			}).listen(pipePath);
		}

		// make VS Code connect to debug server
		return new vscode.DebugAdapterNamedPipeServer(this.server.address() as string);
	}

	dispose() {
		if (this.server) {
			this.server.close();
		}
	}
}


