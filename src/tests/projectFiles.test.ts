/*
 * Tests of the file selection for the desktop upload (src/projectFiles.ts).
 * Run: npm run test:files
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
	collectProjectFiles, findProjectRoot, parseIncludes, parsePythonImports, readProjectOptions, UploadLimitError
} from '../projectFiles';

function project(files: { [rel: string]: string }): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-files-'));
	for (const [rel, text] of Object.entries(files)) {
		const abs = path.join(root, rel);
		fs.mkdirSync(path.dirname(abs), { recursive: true });
		fs.writeFileSync(abs, text);
	}
	return root;
}

function collected(root: string, program: string, options = {}): string[] {
	return collectProjectFiles(path.join(root, program), root, options).files.map(f => f.relPath).sort();
}

describe('project root', () => {
	it('is the nearest folder with a project marker, not above the workspace folder', () => {
		const ws = project({
			'config.json': '{}',
			'proj/requirements.txt': 'qiskit\n',
			'proj/quantum/main.py': '',
			'loose/main.py': '',
		});
		assert.strictEqual(findProjectRoot(path.join(ws, 'proj/quantum/main.py'), ws), path.join(ws, 'proj'));
		assert.strictEqual(findProjectRoot(path.join(ws, 'loose/main.py'), ws), ws);
		assert.strictEqual(findProjectRoot(path.join(ws, 'loose/main.py'), path.join(ws, 'loose')), path.join(ws, 'loose'));
	});

	it('is the program folder when there is no marker', () => {
		const ws = project({ 'a/b/main.py': '' });
		assert.strictEqual(findProjectRoot(path.join(ws, 'a/b/main.py'), ws), path.join(ws, 'a/b'));
	});
});

describe('Python imports', () => {
	it('parses absolute, relative and multi-line imports; ignores strings and comments', () => {
		const imports = parsePythonImports([
			'import os, lib.gates as g',
			'from . import helper',
			'from ..pkg.mod import (a,',
			'    b)',
			'# import commented',
			's = "import in_string"',
			'"""',
			'import in_docstring',
			'"""',
			'def f():',
			'    from local import thing',
		].join('\n'));
		assert.deepStrictEqual(imports.map(i => [i.level, i.module, i.names.join(',')]), [
			[0, 'os', ''], [0, 'lib.gates', ''], [1, '', 'helper'], [2, 'pkg.mod', 'a,b'], [0, 'local', 'thing'],
		]);
	});

	it('uploads local modules and packages, recursively, and skips installed ones', () => {
		const root = project({
			'requirements.txt': 'qiskit\n',
			'main.py': 'import numpy\nfrom qiskit import QuantumCircuit\nfrom lib.gates import entangle\nimport helper\n',
			'helper.py': 'from lib import consts\n',
			'lib/__init__.py': '',
			'lib/gates.py': 'from .consts import N\n',
			'lib/consts.py': 'N = 2\n',
			'lib/unused.py': '',
			'other.py': '',
		});
		assert.deepStrictEqual(collected(root, 'main.py'),
			['helper.py', 'lib/__init__.py', 'lib/consts.py', 'lib/gates.py', 'main.py']);
	});

	it('resolves from the program folder first, then from the project root', () => {
		const root = project({
			'config.json': '{}',
			'quantum/main.py': 'import helper\nimport shared\n',
			'quantum/helper.py': '',
			'shared.py': '',
			'helper.py': 'should not be taken',
		});
		assert.deepStrictEqual(collected(root, 'quantum/main.py'), ['quantum/helper.py', 'quantum/main.py', 'shared.py']);
	});

	it('ends on circular imports', () => {
		const root = project({ 'main.py': 'import a\n', 'a.py': 'import b\n', 'b.py': 'import a\n' });
		assert.deepStrictEqual(collected(root, 'main.py'), ['a.py', 'b.py', 'main.py']);
	});

	it('uploads empty files', () => {
		const root = project({ 'main.py': 'import pkg.mod\n', 'pkg/__init__.py': '', 'pkg/mod.py': '' });
		const result = collectProjectFiles(path.join(root, 'main.py'), root);
		assert.deepStrictEqual(result.files.map(f => [f.relPath, f.size]).sort(), [['main.py', 15], ['pkg/__init__.py', 0], ['pkg/mod.py', 0]]);
	});
});

describe('C++ and OpenQASM includes', () => {
	it('follows #include "..." and include "..." but not system or standard includes', () => {
		assert.deepStrictEqual(parseIncludes('#include <cudaq.h>\n#include "kernels.h"\n', 'cpp'), ['kernels.h']);
		assert.deepStrictEqual(parseIncludes('include "qelib1.inc";\ninclude "my.inc";\n', 'qasm'), ['my.inc']);
		const root = project({
			'main.cpp': '#include <cudaq.h>\n#include "kernels/bell.h"\n',
			'kernels/bell.h': '#include "common.h"\n',
			'kernels/common.h': '',
			'circuit.qasm': 'OPENQASM 2.0;\ninclude "qelib1.inc";\ninclude "gates.inc";\n',
			'gates.inc': '',
		});
		assert.deepStrictEqual(collected(root, 'main.cpp'), ['kernels/bell.h', 'kernels/common.h', 'main.cpp']);
		assert.deepStrictEqual(collected(root, 'circuit.qasm'), ['circuit.qasm', 'gates.inc']);
	});
});

describe('data files, filters and limits', () => {
	it('adds "files" globs, respecting .gitignore, default folders and "exclude"', () => {
		const root = project({
			'config.json': JSON.stringify({ files: ['data/**', 'params.json'], exclude: ['data/big/**'] }),
			'.gitignore': 'data/secret.csv\n',
			'main.py': '',
			'params.json': '{}',
			'data/a.csv': '1',
			'data/secret.csv': '2',
			'data/big/huge.csv': '3',
			'data/node_modules/x.csv': '4',
		});
		assert.deepStrictEqual(collected(root, 'main.py', readProjectOptions(root)), ['data/a.csv', 'main.py', 'params.json']);
	});

	it('never uploads from skipped folders, even when imported', () => {
		const root = project({ 'main.py': 'import venv.lib\n', 'venv/__init__.py': '', 'venv/lib.py': '' });
		assert.deepStrictEqual(collected(root, 'main.py'), ['main.py']);
	});

	it('stops with a clear message over the file count or the total size', () => {
		const files: { [rel: string]: string } = { 'main.py': '' };
		for (let i = 0; i < 5; i++) {
			files[`data/f${i}.csv`] = 'x'.repeat(100);
		}
		const root = project(files);
		assert.throws(() => collectProjectFiles(path.join(root, 'main.py'), root, { files: ['data/**'], maxFiles: 4 }),
			(e: Error) => e instanceof UploadLimitError && /Too many files/.test(e.message) && /config\.json/.test(e.message));
		assert.throws(() => collectProjectFiles(path.join(root, 'main.py'), root, { files: ['data/**'], maxTotalBytes: 300 }),
			(e: Error) => e instanceof UploadLimitError && /too large/.test(e.message));
		assert.strictEqual(collectProjectFiles(path.join(root, 'main.py'), root, { files: ['data/**'] }).files.length, 6);
	});

	it('reports the program path from the project root', () => {
		const root = project({ 'requirements.txt': '', 'quantum/main.py': '' });
		assert.strictEqual(collectProjectFiles(path.join(root, 'quantum/main.py'), root).programRelative, 'quantum/main.py');
	});
});
