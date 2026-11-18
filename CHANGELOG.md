# 1.0.40
* Command **Quantag Studio: Show Compiled OpenQASM** (Command Palette): opens the Disassembly view with the OpenQASM compiled from the Python or C++ file; the current QASM instruction is highlighted and stepping moves through the source and the QASM together. Without a debug session it starts debugging the active file first (needs QSCore with source lines for the Disassembly view)

# 1.0.39
* Rebranded extension display name to **Quantag Studio** with a dedicated Quantag Studio icon and updated documentation.

# 1.0.38
* CUDA-Q C++ debugging: Debug/Run buttons and breakpoints for C++ files (.cpp with `#include <cudaq.h>` or `__qpu__`). The kernel is translated to OpenQASM by QSCore (Quantag Studio workspaces with the CUDA-Q C++ toolchain)

# 1.0.37
* Circuit image and HTML are read from local disk (/var/dap/images) when config.json points debug.server to 127.0.0.1 or localhost (Quantag Studio workspaces)

# 1.0.36
* Added QEC Circuit Transform interactive form

# 1.0.35
* Added QEC Circuit Transform api endpoint

# 1.0.34
* Updated QEC Circuit Transform command with interactive UI:
  * Select QEC Code (Steane, Surface, Repetition)
  * Select Output Type (Physical Circuit or DEM)
  * Configurable depolarizing noise probability

# 1.0.33
* Added QEC Circuit Transform command

# 1.0.32
* refresh build

# 1.0.31
* added AI generation of quantum circuits

## 1.0.30
* added CPU Load nad GPU Load in Nodes panel

## 1.0.29
* show number of qubits in JobsPanel

## 1.0.28
* small fix in JobsPanel

## 1.0.27
* copy error message on results copy if job failed

## 1.0.26
* added filename to Jobs Panel

## 1.0.25
* added exec_time in Jobs Panel

## 1.0.24
* added link btween Jobs Panel and Nodes Panel

## 1.0.23
* added nodes panel

## 1.0.22
* updated API in jobsPanels.ts

## 1.0.21
* submit jobs to quantag cloud

## 1.0.20
* added BSQKit optimization


## 1.0.19
* skip file submit for web mode

## 1.0.18
* removed dparamter 'backend' from 3d transpile. now choosen automatically


## 1.0.16
* removed dedicated comamnd to submit job to Zurich Instruments, instead use special config and general Submit


## 1.0.11
* removed dedicated comamnd to submit job to IBMQ, instead use special config and general Submit

## 1.0.10
* openqasm2/3 rendering with PyZX

## 1.0.9
* fixed config parameters mapping


## 1.0.8
* Changed format for submitJob: src, config

## 1.0.6
* Open Jobs panel on Job submit


## 1.0.5
* Jobs managements in VS Code

## 1.0.0
* load workplace/config.json on every debug session

## 0.99.0
* opts params in submitFiles

## 0.95.0
* Fix relative pathes in submit

## 0.94.0
* Dynamic configuration loading

## 0.93.0
* Added python CUDA-Q kernels CodeLens support

## 0.92.0
* Added QASM syntaxis highlightning


## 0.91.0
* Added QASM Hover Provider. Now when you point mouse over agve in .qasm file you will see its explanation


## 0.90.0
* Added support of   Quantinuum [guppy](https://docs.quantinuum.com/guppy/) for guppy functions compilation to HUBR, JSON and STR formats


## 0.89.0
* Added support of   [ZX-Calculum library](https://zxcalculus.com/) for optimization and rendering

## 0.87.0
* Added 3d Circuit visualization

## 0.85.0
* Support of Google Auth and Remote File System

## 0.84.0
* Support of IBM Quantum hardware backend

## 0.82.0
* Using Google Cloud endpoint for OpenQASM to QIR converter

## 0.81.0
* Added OpenQASM to QIR command

## 0.76.0
* decoding results from Zurich Instruments Simulator

## 0.75.0
* added support of Zurich Instruments Simulator

## 0.72.0
* in readme added link to PDF documentation 

## 0.69.0
* delay changed to 1.5s
* added command in Command Palette 'Open Circuit Web' with opening web front end in external browser (after starting debuggin session!)

## 0.68.0
* added 2 sec delay for file uploading to avoid concurent problems

## 0.67.0
* added rendering of pure OpenQASM circuits (earlier only python-based frameworks were rendered)

## 0.64.0
* added command 'Quantag Studio: Render Qiskit Circuit' to render Qiskit circuit within VS Code.
* added command 'Quantag Studio: Render TKET Circuit' to render TKET circuit in external browser

