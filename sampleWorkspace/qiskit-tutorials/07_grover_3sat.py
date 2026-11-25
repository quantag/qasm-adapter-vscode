"""Grover's search for the solutions of a 3-SAT problem.

Based on the 3-SAT example of qiskit-tutorials/tutorials/algorithms/07_grover_examples.ipynb,
written without qiskit-algorithms and without PhaseOracle (which needs tweedledum):
the formula is read from DIMACS CNF, its solutions are listed classically, and the
oracle flips the phase of each solution with basic gates.

Debugger: the circuit shown is `qc`.
"""
import itertools
import math
from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator

DIMACS = """
c example DIMACS-CNF 3-SAT
p cnf 3 5
-1 -2 -3 0
1 -2 3 0
1 2 -3 0
1 -2 -3 0
-1 2 3 0
"""


def parse_dimacs(text):
    """(number of variables, clauses); a clause is a list of signed variable numbers."""
    num_vars, clauses = 0, []
    for line in text.strip().splitlines():
        if line.startswith("c"):
            continue
        if line.startswith("p"):
            num_vars = int(line.split()[2])
            continue
        clauses.append([int(v) for v in line.split() if v != "0"])
    return num_vars, clauses


def satisfies(assignment, clauses):
    """assignment[k] is the value of variable k + 1."""
    return all(any(assignment[abs(v) - 1] == (v > 0) for v in clause) for clause in clauses)


NUM_VARS, CLAUSES = parse_dimacs(DIMACS)
SOLUTIONS = [a for a in itertools.product([False, True], repeat=NUM_VARS) if satisfies(a, CLAUSES)]
# variable k + 1 is qubit k; Qiskit prints qubit 2, 1, 0
marked = ["".join("1" if v else "0" for v in reversed(a)) for a in SOLUTIONS]
print("solutions (x3 x2 x1):", marked)


def ccz(circuit):
    circuit.h(2)
    circuit.ccx(0, 1, 2)
    circuit.h(2)


def oracle(circuit, assignment):
    """Phase flip of the basis state of one solution."""
    zeros = [q for q, value in enumerate(assignment) if not value]
    for q in zeros:
        circuit.x(q)
    ccz(circuit)
    for q in zeros:
        circuit.x(q)


def diffuser(circuit):
    circuit.h(range(NUM_VARS))
    circuit.x(range(NUM_VARS))
    ccz(circuit)
    circuit.x(range(NUM_VARS))
    circuit.h(range(NUM_VARS))


iterations = math.floor(math.pi / 4 * math.sqrt(2 ** NUM_VARS / len(SOLUTIONS)))
print("iterations:", iterations)

qc = QuantumCircuit(NUM_VARS, NUM_VARS)
qc.h(range(NUM_VARS))
for _ in range(iterations):
    for assignment in SOLUTIONS:
        oracle(qc, assignment)
    diffuser(qc)
qc.measure(range(NUM_VARS), range(NUM_VARS))

simulator = AerSimulator()
counts = simulator.run(transpile(qc, simulator), shots=1000, seed_simulator=7).result().get_counts()
print("counts:", dict(sorted(counts.items())))
hits = sum(n for bitstring, n in counts.items() if bitstring in marked)
print("probability of a solution: %.2f" % (hits / 1000))
