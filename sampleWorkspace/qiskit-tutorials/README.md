# Qiskit tutorials: algorithms (desktop debugger samples)

Samples based on the notebooks of [qiskit-tutorials/tutorials/algorithms](https://github.com/Qiskit/qiskit-tutorials/tree/master/tutorials/algorithms).
That repository is archived and uses `qiskit.algorithms`, `opflow` and `QuantumInstance`, which were removed in Qiskit 1.0.
These samples rewrite the algorithms with plain Qiskit 1.3 (no `qiskit-algorithms`), so they run on the desktop debugger backend (qiskit 1.3.2 + qiskit-aer).

| File | Notebook | What it does | Circuit in the debugger |
| --- | --- | --- | --- |
| `01_vqe_h2.py` | 01_algorithms_introduction | VQE for the H2 ground state energy, TwoLocal(ry, cz) ansatz, SciPy SLSQP | `qc`: optimal ansatz, 2 qubits, 13 instructions |
| `02_vqe_optimizers.py` | 02_vqe_advanced_options | VQE with COBYLA, L-BFGS-B, SLSQP; finite-difference gradient; warm start | `qc`: best ansatz, 13 instructions |
| `03_vqe_noise.py` | 03_vqe_simulation_with_noise | VQE with SPSA on Aer counts, without and with a noise model (depolarizing and readout errors) | `qc`: ansatz found with noise, 13 instructions |
| `04_vqd.py` | 04_vqd | VQD: the 3 lowest energies of H2 (overlap penalty, beta = 33) | `qc`: ansatz of the 3rd state, 11 instructions |
| `05_qaoa_maxcut.py` | 05_qaoa | QAOA (p=2) for Max-Cut on a 4-node graph; angles optimized with SciPy COBYLA | `qc`: QAOA circuit with the optimized angles, 4 qubits, 46 instructions |
| `06_grover.py` | 06_grover | Grover search, 3 qubits, marked `011` and `100`, 1 iteration | `qc`: 3 qubits, 33 instructions |
| `07_grover_3sat.py` | 07_grover_examples (3-SAT) | Grover search for the solutions of a DIMACS 3-SAT formula (`000`, `011`, `101`) | `qc`: 3 qubits, 40 instructions |
| `09_iterative_phase_estimation.py` | 09_IQPE | Iterative phase estimation of P(2*pi*5/8), 3 bits, classical phase correction | `qc`: last iteration, 2 qubits, 10 instructions |
| `10_pvqd.py` | 10_pvqd | pVQD of the Ising model H = 0.1 ZZ + X0 + X1, 100 time steps, compared with the exact evolution | `qc`: ansatz at t = 1, 9 instructions |
| `11_varqte.py` | 11_VarQTE | VarQITE (ground state) and VarQRTE (magnetization) with McLachlan's principle, compared with the exact evolution | `qc`: ansatz at the end of the imaginary time evolution, 11 instructions |
| `12_gradients.py` | 12_gradients_framework | Parameter shift (exact and from counts), finite differences, SPSA, QGT and QFI; VQE with CG and gradients | `qc`: VQE ansatz, 11 instructions |

Notes:

- The debugger shows one circuit per program: the module-level `qc`. Steps go to the program lines that added each gate, including lines inside helper functions (`oracle`, `diffuser`, `controlled_phase`).
- Only gates of `qelib1.inc` are used (`h`, `x`, `rx`, `ry`, `rz`, `cx`, `cz`, `ccx`, `measure`), so the circuits run on the debugger's simulator as they are. Controlled phase and `rzz` are written with `rz` and `cx`; CCZ as `h`, `ccx`, `h`.
- Variational samples optimize with SciPy on the exact statevector and show the circuit with the optimal angles bound (no `Parameter` objects: parameterized circuits cannot be exported to OpenQASM 2).
- 03, 10 and 11 run for 10 to 30 seconds before the debugger starts (optimization loops). 10 and 11 need QSCore 1.0.29 or later: older versions slow down quadratically on programs that build many temporary circuits and hit the 180 s timeout.
- Classical parts (optimization, DIMACS parsing, phase correction) run before the circuit is shown. Their `print` output is not shown in the Debug Console (the debugger keeps program output out of the QASM it receives); run the file with `python` to see the results.

Expected final state (probabilities before measurement):

- 01, 02: `01` about 0.99 (H2 ground state).
- 03: `01` about 0.98.
- 04: `00` and `11`, 0.5 each.
- 05: `0101` and `1010` about 0.43 each (the two maximum cuts).
- 06: `011` and `100`, 0.5 each.
- 07: `000`, `011`, `101` about 0.28 each.
- 09: `11` with probability 1 (ancilla measures the first bit, 1).
- 10: `11` about 0.5, `01` and `10` about 0.21, `00` about 0.09.
- 11: `00` and `11` about 0.28, `01` and `10` about 0.22.
- 12: `01` with probability 1.
