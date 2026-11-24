/*
 * Desktop VS Code: upload the program's files to the debugger backend before a debug
 * or run session (in Studio workspaces the debugger reads the files in place and
 * nothing is uploaded). Which files: see projectFiles.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Config } from './config';
import { log } from './tools';
import { collectProjectFiles, findProjectRoot, readProjectOptions, CollectResult } from './projectFiles';

/** Project root and path of the program from it, for the launch configuration. */
export function programLocation(program: string): { projectRoot: string; programRelative: string } | undefined {
	if (!program || !fs.existsSync(program)) {
		return undefined;
	}
	const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(program));
	const projectRoot = findProjectRoot(program, folder?.uri.fsPath);
	return {
		projectRoot,
		programRelative: path.relative(projectRoot, path.resolve(program)).split(path.sep).join('/'),
	};
}

function uploadUrl(): string {
	const baseUrl = process.env.QUANTAG_BASE_URL;
	if (vscode.env.uiKind === vscode.UIKind.Web && baseUrl) {
		const normalized = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
		return `${normalized}/api2/public/submitFiles`;
	}
	return Config['submit.files'];
}

/**
 * Uploads the program, its local dependencies and its data files into the session
 * folder. Throws an Error with a message for the user when the files are over the
 * limits or the server rejects them; the debug session must not start then.
 */
export async function uploadProjectFiles(sessionId: string, program: string, projectRoot?: string): Promise<CollectResult> {
	const root = projectRoot && fs.existsSync(projectRoot) ? projectRoot : (programLocation(program)?.projectRoot ?? path.dirname(program));
	const result = collectProjectFiles(program, root, readProjectOptions(root));

	log(`Project root: ${result.root}`);
	log(`Uploading ${result.files.length} file(s), ${result.totalBytes} bytes, session ${sessionId}:`);
	for (const f of result.files) {
		log(`  ${f.relPath} (${f.reason}, ${f.size} bytes)`);
	}

	const payload = {
		sessionId,
		files: result.files.map(f => ({
			path: f.relPath,
			source: fs.readFileSync(f.absPath).toString('base64'),
		})),
		root: result.root,
		opts: {
			mode: vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop',
			baseUrl: process.env.QUANTAG_BASE_URL ?? undefined,
		},
	};

	let response: Awaited<ReturnType<typeof fetch>>;
	try {
		response = await fetch(uploadUrl(), {
			method: 'POST',
			body: JSON.stringify(payload),
			headers: { 'Content-Type': 'application/json; charset=UTF-8' },
		});
	} catch (error: any) {
		throw new Error(`Cannot upload the program files to the debugger: ${error?.message ?? error}`);
	}

	let body: any = undefined;
	try {
		body = await response.json();
	} catch {
		// not JSON (for example a proxy error page)
	}
	if (!response.ok || !body || body.code !== 0) {
		const reason = body?.message ?? `${response.status} ${response.statusText}`;
		const file = body?.path ? ` (${body.path})` : '';
		log(`Upload rejected: ${reason}${file}`);
		throw new Error(`The debugger rejected the program files: ${reason}${file}`);
	}
	log(`Uploaded: ${JSON.stringify(body)}`);
	return result;
}
