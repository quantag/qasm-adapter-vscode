"""Iterative quantum phase estimation (IPE) with one ancilla qubit.

Based on qiskit-tutorials/tutorials/algorithms/09_IQPE.ipynb, written without
qiskit-algorithms and without mid-circuit classical control: every iteration is a
separate circuit, and the phase correction from the bits already measured is computed
classically and applied as an rz rotation.

U = phase gate P(2*pi*PHI), eigenstate |1>, PHI = 0.101 in binary (5/8).
The controlled powers of U are written with rz and cx (controlled phase).

Debugger: the circuit shown is `qc`, the circuit of the last iteration (the first bit).
"""
import math
from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator

PHI = 5 / 8      # phase to estimate
NUM_BITS = 3     # bits of precision
ANCILLA, TARGET = 0, 1


def controlled_phase(circuit, angle, control, target):
    """Controlled P(angle), up to a global phase."""
    circuit.rz(angle / 2, control)
    circuit.cx(control, target)
    circuit.rz(-angle / 2, target)
    circuit.cx(control, target)
    circuit.rz(angle / 2, target)


simulator = AerSimulator()
bits = []  # measured bits, least significant first: x_m, x_{m-1}, ...
for k in range(NUM_BITS, 0, -1):
    # correction: remove the phase of the bits already known, -2*pi*0.0 x_{k+1} ... x_m
    correction = -2 * math.pi * sum(b / 2 ** (j + 2) for j, b in enumerate(reversed(bits)))

    qc = QuantumCircuit(2, 1)
    qc.x(TARGET)  # eigenstate |1> of U
    qc.h(ANCILLA)
    controlled_phase(qc, 2 * math.pi * PHI * 2 ** (k - 1), ANCILLA, TARGET)  # controlled U^(2^(k-1))
    qc.rz(correction, ANCILLA)
    qc.h(ANCILLA)
    qc.measure(ANCILLA, 0)

    counts = simulator.run(transpile(qc, simulator), shots=200, seed_simulator=7).result().get_counts()
    bit = int(max(counts, key=counts.get))
    bits.append(bit)
    print("iteration k=%d: counts %s -> x_%d = %d" % (k, counts, k, bit))

binary = "".join(str(b) for b in reversed(bits))  # x_1 x_2 ... x_m
estimate = int(binary, 2) / 2 ** NUM_BITS
print("phase: 0.%s (binary) = %.4f, exact %.4f" % (binary, estimate, PHI))
