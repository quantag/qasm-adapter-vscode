"""Grover's search on 3 qubits with two marked states.

Based on qiskit-tutorials/tutorials/algorithms/06_grover.ipynb, written without
qiskit-algorithms: the oracle and the diffuser are built from basic gates
(CCZ = H, Toffoli, H), the number of iterations is computed classically.

Debugger: the circuit shown is `qc`.
"""
import math
from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator

NUM_QUBITS = 3
MARKED = ["011", "100"]  # bitstrings as Qiskit prints them: qubit 2, 1, 0


def ccz(circuit):
    """Phase flip of |111> on qubits 0, 1, 2."""
    circuit.h(2)
    circuit.ccx(0, 1, 2)
    circuit.h(2)


def oracle(circuit, bitstring):
    """Phase flip of one basis state: map it to |111>, flip, map back."""
    zeros = [q for q in range(NUM_QUBITS) if bitstring[NUM_QUBITS - 1 - q] == "0"]
    for q in zeros:
        circuit.x(q)
    ccz(circuit)
    for q in zeros:
        circuit.x(q)


def diffuser(circuit):
    """Inversion about the mean: H X (CCZ) X H."""
    circuit.h(range(NUM_QUBITS))
    circuit.x(range(NUM_QUBITS))
    ccz(circuit)
    circuit.x(range(NUM_QUBITS))
    circuit.h(range(NUM_QUBITS))


# Optimal number of Grover iterations for M marked states out of N
N, M = 2 ** NUM_QUBITS, len(MARKED)
iterations = math.floor(math.pi / 4 * math.sqrt(N / M))
print("iterations:", iterations)

qc = QuantumCircuit(NUM_QUBITS, NUM_QUBITS)
qc.h(range(NUM_QUBITS))
for _ in range(iterations):
    for bitstring in MARKED:
        oracle(qc, bitstring)
    diffuser(qc)
qc.measure(range(NUM_QUBITS), range(NUM_QUBITS))

simulator = AerSimulator()
counts = simulator.run(transpile(qc, simulator), shots=1000, seed_simulator=7).result().get_counts()
print("counts:", dict(sorted(counts.items())))
found = max(counts, key=counts.get)
print("most frequent:", found, "marked" if found in MARKED else "not marked")
