/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
/*
 * extension.ts (and activateMockDebug.ts) forms the "plugin" that plugs into VS Code and contains the code that
 * connects VS Code with the debug adapter.
 * 
 * extension.ts contains code for launching the debug adapter in three different ways:
 * - as an external program communicating with VS Code via stdin/stdout,
 * - as a server process communicating with VS Code via sockets or named pipes, or
 * - as inlined code running in the extension itself (default).
 * 
 * Since the code in extension.ts uses node.js APIs it cannot run in the browser.
 */

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
import {submitFiles, log} from './tools';

import * as fs from 'fs';
import * as path from 'path';

/*
 * The compile time flag 'runMode' controls how the debug adapter is run.
 * Please note: the test suite only supports 'external' mode.
 */
const runMode: 'external' | 'server' | 'namedPipeServer' | 'inline' = 'server';

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
}

export function deactivate() {
	// nothing to do
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


