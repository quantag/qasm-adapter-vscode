# Qiskit tutorials: algorithms (desktop debugger samples)

Samples based on the notebooks of [qiskit-tutorials/tutorials/algorithms](https://github.com/Qiskit/qiskit-tutorials/tree/master/tutorials/algorithms).
That repository is archived and uses `qiskit.algorithms`, `opflow` and `QuantumInstance`, which were removed in Qiskit 1.0.
These samples rewrite the algorithms with plain Qiskit 1.3 (no `qiskit-algorithms`), so they run on the desktop debugger backend (qiskit 1.3.2 + qiskit-aer).

| File | Notebook | What it does | Circuit in the debugger |
| --- | --- | --- | --- |
| `05_qaoa_maxcut.py` | 05_qaoa | QAOA (p=2) for Max-Cut on a 4-node graph; angles optimized with SciPy COBYLA | `qc`: QAOA circuit with the optimized angles, 4 qubits, 46 instructions |
| `06_grover.py` | 06_grover | Grover search, 3 qubits, marked `011` and `100`, 1 iteration | `qc`: 3 qubits, 33 instructions |
| `07_grover_3sat.py` | 07_grover_examples (3-SAT) | Grover search for the solutions of a DIMACS 3-SAT formula (`000`, `011`, `101`) | `qc`: 3 qubits, 40 instructions |
| `09_iterative_phase_estimation.py` | 09_IQPE | Iterative phase estimation of P(2*pi*5/8), 3 bits, classical phase correction | `qc`: last iteration, 2 qubits, 10 instructions |

Notes:

- The debugger shows one circuit per program: the module-level `qc`. Steps go to the program lines that added each gate, including lines inside helper functions (`oracle`, `diffuser`, `controlled_phase`).
- Only gates of `qelib1.inc` are used (`h`, `x`, `rx`, `rz`, `cx`, `ccx`, `measure`), so the circuits run on the debugger's simulator as they are. Controlled phase is written with `rz` and `cx`; CCZ as `h`, `ccx`, `h`.
- Classical parts (optimization, DIMACS parsing, phase correction) run before the circuit is shown; their output is in the Debug Console.

Expected final state (probabilities before measurement):

- 05: `0101` and `1010` about 0.43 each (the two maximum cuts).
- 06: `011` and `100`, 0.5 each.
- 07: `000`, `011`, `101` about 0.28 each.
- 09: `11` with probability 1 (ancilla measures the first bit, 1).
