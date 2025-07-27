
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
import { RemoteFileSystemProvider } from './remoteFileSystemProvider';

import * as fs from 'fs';
import * as path from 'path';

/*
 * The compile time flag 'runMode' controls how the debug adapter is run.
 * Please note: the test suite only supports 'external' mode.
 */
const runMode: 'external' | 'server' | 'namedPipeServer' | 'inline' = 'server';


const config = vscode.workspace.getConfiguration('remoteFiles');
const apiBaseUrl = config.get<string>('baseUrl', 'https://cryspprod3.quantag-it.com/api5');
let statusBarItem: vscode.StatusBarItem;
const AUTH_CHECK_URL = "https://cryspprod3.quantag-it.com:444/api10/check_token_ready";
const AUTH_START_URL = "https://cryspprod3.quantag-it.com:444/api10/google-auth-start";
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
					isReadonly: false,
				})
			);
		}
	});

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
						isReadonly: false,
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
    } else {
        vscode.window.showErrorMessage("Login timeout. Please try again.");
    }

    updateLoginStatusBar(context);
}

function updateLoginStatusBar(context: vscode.ExtensionContext) {
	console.log("Calling updateLoginStatusBar");
	context.secrets.get("remoteAuthToken").then(token => {
		console.log("Got token from secrets:", token);
		let email = null;

		if (token) {
			const payload = parseJwt(token);
			email = payload?.email;
		}

		statusBarItem.text = email
			? `Quantag: ${email}`
			: token
			? "Quantag: Logged In"
			: "Quantag: Not Logged In";

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


