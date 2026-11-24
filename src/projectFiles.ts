/*
 * Files of a program that the desktop extension uploads for a debug or run session.
 *
 * Instead of every .py/.cpp/.qasm file of the workspace, only the program and what it
 * needs are uploaded, relative to the program's project root:
 *  - the project root is the nearest folder above the program with config.json,
 *    requirements.txt or pyproject.toml (not above the workspace folder), otherwise
 *    the program's folder;
 *  - local dependencies, followed recursively inside the project root: Python imports
 *    (absolute from the program's folder and the project root, relative imports,
 *    the __init__.py of every package on the way), C++ #include "..." and
 *    OpenQASM include "...";
 *  - data files listed in config.json "files" (globs), minus .gitignore and "exclude";
 *  - never anything in node_modules, .git, .venv, venv, __pycache__, dist, build.
 *
 * No VS Code API here: the module only reads the file system (unit-tested with Node).
 */

import * as fs from 'fs';
import * as path from 'path';
import ignore, { Ignore } from 'ignore';
import { minimatch } from 'minimatch';

export const PROJECT_MARKERS = ['config.json', 'requirements.txt', 'pyproject.toml'];
export const SKIPPED_DIRS = ['node_modules', '.git', '.venv', 'venv', '__pycache__', 'dist', 'build'];
export const DEFAULT_MAX_FILES = 200;
export const DEFAULT_MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const QASM_STANDARD_INCLUDES = ['qelib1.inc', 'stdgates.inc'];

export type FileReason = 'program' | 'import' | 'include' | 'files';

export interface ProjectFile {
	relPath: string;	// from the project root, forward slashes
	absPath: string;
	size: number;
	reason: FileReason;
}

export interface CollectOptions {
	files?: string[];	// config.json "files": globs relative to the project root
	exclude?: string[];	// config.json "exclude": globs relative to the project root
	maxFiles?: number;
	maxTotalBytes?: number;
}

export interface CollectResult {
	root: string;
	programRelative: string;
	files: ProjectFile[];
	totalBytes: number;
}

export class UploadLimitError extends Error {
}

export function toPosix(p: string): string {
	return p.split(path.sep).join('/');
}

function isInside(root: string, file: string): boolean {
	const rel = path.relative(root, file);
	return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function isFile(p: string): boolean {
	try {
		return fs.statSync(p).isFile();
	} catch {
		return false;
	}
}

function isDir(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

/**
 * Nearest folder above the program (including its own) with a project marker, not
 * above stopAt (the workspace folder); the program's folder if none is found.
 */
export function findProjectRoot(program: string, stopAt?: string): string {
	const programDir = path.dirname(path.resolve(program));
	const limit = stopAt ? path.resolve(stopAt) : undefined;
	let dir = programDir;
	while (true) {
		if (PROJECT_MARKERS.some(m => isFile(path.join(dir, m)))) {
			return dir;
		}
		if (limit && path.resolve(dir) === limit) {
			break;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			break;
		}
		if (limit && !isInside(limit, parent) && path.resolve(parent) !== limit) {
			break;
		}
		dir = parent;
	}
	return programDir;
}

/** Reads "files" and "exclude" from <root>/config.json (both optional). */
export function readProjectOptions(root: string): CollectOptions {
	const configPath = path.join(root, 'config.json');
	if (!isFile(configPath)) {
		return {};
	}
	try {
		const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
		const list = (v: unknown) => Array.isArray(v) ? v.filter(x => typeof x === 'string') as string[] : undefined;
		return { files: list(cfg.files), exclude: list(cfg.exclude) };
	} catch {
		return {};
	}
}

/* ------------------------------------------------------------------------- */
/* Dependencies                                                              */
/* ------------------------------------------------------------------------- */

interface PyImport {
	level: number;		// 0 = absolute, 1 = "from .", 2 = "from .." ...
	module: string;		// dotted, may be "" for "from . import x"
	names: string[];	// names after "from ... import"
}

/** Python import statements (also inside functions and try blocks; strings and comments ignored). */
export function parsePythonImports(source: string): PyImport[] {
	// drop comments and string literals so "import" in text does not count
	const text = source
		.replace(/("""[\s\S]*?"""|'''[\s\S]*?''')/g, ' ')
		.replace(/("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/g, '""')
		.replace(/#[^\n]*/g, '');
	// join "from x import (a,\n b)" and backslash continuations
	const joined = text
		.replace(/\\\n/g, ' ')
		.replace(/\(([^()]*)\)/g, (_m, inner: string) => '(' + inner.replace(/\n/g, ' ') + ')');
	const result: PyImport[] = [];
	for (const statement of joined.split(/[\n;]/)) {
		const line = statement.trim();
		let m = /^import\s+(.+)$/.exec(line);
		if (m) {
			for (const part of m[1].split(',')) {
				const name = part.trim().split(/\s+as\s+/)[0].trim();
				if (/^[A-Za-z_][\w.]*$/.test(name)) {
					result.push({ level: 0, module: name, names: [] });
				}
			}
			continue;
		}
		m = /^from\s+(\.*)\s*([A-Za-z_][\w.]*)?\s+import\s+(.+)$/.exec(line);
		if (m) {
			const names = m[3].replace(/[()]/g, ' ').split(',')
				.map(n => n.trim().split(/\s+as\s+/)[0].trim())
				.filter(n => /^[A-Za-z_]\w*$/.test(n));
			result.push({ level: m[1].length, module: m[2] || '', names });
		}
	}
	return result;
}

/** C++ #include "..." and OpenQASM include "..." targets. */
export function parseIncludes(source: string, kind: 'cpp' | 'qasm'): string[] {
	const re = kind === 'cpp' ? /^\s*#\s*include\s*"([^"]+)"/gm : /^\s*include\s+"([^"]+)"\s*;/gm;
	const out: string[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) {
		if (kind === 'qasm' && QASM_STANDARD_INCLUDES.includes(path.basename(m[1]))) {
			continue;
		}
		out.push(m[1]);
	}
	return out;
}

/** Files (inside root) a module path resolves to from base: package __init__.py files and the module. */
function resolveModule(base: string, parts: string[], root: string): string[] {
	const found: string[] = [];
	let dir = base;
	for (let i = 0; i < parts.length; i++) {
		const last = i === parts.length - 1;
		const asFile = path.join(dir, parts[i] + '.py');
		const asPkg = path.join(dir, parts[i]);
		if (last && isFile(asFile)) {
			found.push(asFile);
			return found.filter(f => isInside(root, f));
		}
		if (isDir(asPkg)) {
			const init = path.join(asPkg, '__init__.py');
			if (isFile(init)) {
				found.push(init);
			}
			dir = asPkg;
			continue;
		}
		return [];	// not a local module (stdlib or installed package)
	}
	return found.filter(f => isInside(root, f));
}

function pythonDependencies(file: string, source: string, programDir: string, root: string): string[] {
	const deps: string[] = [];
	for (const imp of parsePythonImports(source)) {
		const parts = imp.module ? imp.module.split('.') : [];
		let bases: string[];
		if (imp.level > 0) {
			let base = path.dirname(file);
			for (let i = 1; i < imp.level; i++) {
				base = path.dirname(base);
			}
			bases = [base];
		} else {
			// like the debugger's sys.path: the program's folder, then the project root
			bases = programDir === root ? [root] : [programDir, root];
		}
		for (const base of bases) {
			const files = parts.length ? resolveModule(base, parts, root) : [];
			const moduleDir = parts.length ? path.join(base, ...parts) : base;
			// "from pkg import sub": sub may be a submodule
			const subs: string[] = [];
			if (isDir(moduleDir)) {
				for (const name of imp.names) {
					subs.push(...resolveModule(moduleDir, [name], root));
				}
			}
			if (files.length || subs.length) {
				deps.push(...files, ...subs);
				break;
			}
		}
	}
	return deps;
}

function includeDependencies(file: string, source: string, kind: 'cpp' | 'qasm', root: string): string[] {
	const deps: string[] = [];
	for (const inc of parseIncludes(source, kind)) {
		for (const base of [path.dirname(file), root]) {
			const candidate = path.resolve(base, inc);
			if (isFile(candidate) && isInside(root, candidate)) {
				deps.push(candidate);
				break;
			}
		}
	}
	return deps;
}

function dependenciesOf(file: string, programDir: string, root: string): { deps: string[]; reason: FileReason } {
	let source: string;
	try {
		source = fs.readFileSync(file, 'utf8');
	} catch {
		return { deps: [], reason: 'import' };
	}
	const ext = path.extname(file).toLowerCase();
	if (ext === '.py') {
		return { deps: pythonDependencies(file, source, programDir, root), reason: 'import' };
	}
	if (['.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh'].includes(ext)) {
		return { deps: includeDependencies(file, source, 'cpp', root), reason: 'include' };
	}
	if (['.qasm', '.inc'].includes(ext)) {
		return { deps: includeDependencies(file, source, 'qasm', root), reason: 'include' };
	}
	return { deps: [], reason: 'include' };
}

/* ------------------------------------------------------------------------- */
/* Filters and data files                                                    */
/* ------------------------------------------------------------------------- */

function skippedByDefault(relPath: string): boolean {
	return relPath.split('/').some(part => SKIPPED_DIRS.includes(part));
}

function loadGitignore(root: string): Ignore {
	const ig = ignore();
	const gitignore = path.join(root, '.gitignore');
	if (isFile(gitignore)) {
		ig.add(fs.readFileSync(gitignore, 'utf8'));
	}
	return ig;
}

function matchesAny(relPath: string, globs: string[] | undefined): boolean {
	return !!globs && globs.some(g => minimatch(relPath, g, { dot: true, matchBase: !g.includes('/') }));
}

/** Files under root matching "files" globs, without default dirs, .gitignore and "exclude". */
function dataFiles(root: string, globs: string[], exclude: string[] | undefined, limit: number): string[] {
	const ig = loadGitignore(root);
	const out: string[] = [];
	const walk = (dir: string) => {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const abs = path.join(dir, entry.name);
			const rel = toPosix(path.relative(root, abs));
			if (skippedByDefault(rel) || matchesAny(rel, exclude)) {
				continue;
			}
			if (entry.isDirectory()) {
				if (!ig.ignores(rel + '/')) {
					walk(abs);
				}
			} else if (entry.isFile() && !ig.ignores(rel) && matchesAny(rel, globs)) {
				out.push(abs);
				if (out.length > limit) {
					return;	// over the limit anyway; the caller reports it
				}
			}
		}
	};
	walk(root);
	return out;
}

/* ------------------------------------------------------------------------- */
/* Collect                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * The program, its local dependencies and the data files, relative to root.
 * Throws UploadLimitError when there are more than maxFiles files or maxTotalBytes in total.
 */
export function collectProjectFiles(program: string, root: string, options: CollectOptions = {}): CollectResult {
	const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
	const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
	const absProgram = path.resolve(program);
	const absRoot = path.resolve(root);
	const programDir = path.dirname(absProgram);

	const chosen = new Map<string, FileReason>();
	chosen.set(absProgram, 'program');

	// local dependencies, recursively (each file once, so import cycles end)
	const queue = [absProgram];
	while (queue.length) {
		const file = queue.shift() as string;
		const { deps, reason } = dependenciesOf(file, programDir, absRoot);
		for (const dep of deps) {
			const rel = toPosix(path.relative(absRoot, dep));
			if (chosen.has(dep) || skippedByDefault(rel) || matchesAny(rel, options.exclude)) {
				continue;
			}
			chosen.set(dep, reason);
			queue.push(dep);
			if (chosen.size > maxFiles) {
				break;
			}
		}
		if (chosen.size > maxFiles) {
			break;
		}
	}

	// data files from config.json "files"
	if (options.files && options.files.length && chosen.size <= maxFiles) {
		for (const file of dataFiles(absRoot, options.files, options.exclude, maxFiles)) {
			if (!chosen.has(file)) {
				chosen.set(file, 'files');
			}
		}
	}

	if (chosen.size > maxFiles) {
		throw new UploadLimitError(
			`Too many files to upload: more than ${maxFiles} (limit ${maxFiles}). ` +
			`Narrow "files" or add "exclude" in ${path.join(absRoot, 'config.json')}.`);
	}

	const files: ProjectFile[] = [];
	let totalBytes = 0;
	for (const [absPath, reason] of chosen) {
		const size = fs.statSync(absPath).size;
		totalBytes += size;
		files.push({ relPath: toPosix(path.relative(absRoot, absPath)), absPath, size, reason });
	}
	if (totalBytes > maxTotalBytes) {
		const mb = (n: number) => (n / (1024 * 1024)).toFixed(1) + ' MB';
		throw new UploadLimitError(
			`Files to upload are too large: ${mb(totalBytes)} in ${files.length} files (limit ${mb(maxTotalBytes)}). ` +
			`Narrow "files" or add "exclude" in ${path.join(absRoot, 'config.json')}.`);
	}

	return {
		root: absRoot,
		programRelative: toPosix(path.relative(absRoot, absProgram)),
		files,
		totalBytes,
	};
}
