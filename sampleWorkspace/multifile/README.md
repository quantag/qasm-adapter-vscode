# Multi-file example

Open this folder (or any folder above it) in VS Code desktop, open `main.py` and use
**Run Circuit** or **Debug Circuit**. The **OpenQASM** output channel lists what is uploaded:

    main.py                 (program)
    circuits/__init__.py    (import)
    circuits/ghz.py         (import)
    circuits/layers.py      (import)
    utils/__init__.py       (import)
    utils/io.py             (import)
    data/edges.csv          (files)
    data/params.json        (files)

Not uploaded: `unrelated.py` and `notes.txt` (nothing uses them), `data/raw/` (`exclude` in
`config.json`), `data/secret.csv` (`.gitignore`), `README.md` and `requirements.txt`.

`requirements.txt` marks the project root; on the desktop the packages come from the
debugger server, not from this file.
