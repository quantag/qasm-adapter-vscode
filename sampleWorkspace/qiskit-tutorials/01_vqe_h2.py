"""VQE: ground state energy of the H2 molecule (2 qubits).

Based on qiskit-tutorials/tutorials/algorithms/01_algorithms_introduction.ipynb,
written without qiskit-algorithms: the TwoLocal(ry, cz) ansatz is built gate by gate,
the energy is the exact expectation value of the Hamiltonian, and SciPy SLSQP
minimizes it. The result is compared with exact diagonalization.

Debugger: the circuit shown is `qc`, the ansatz with the optimal angles, measured.
"""
import numpy as np
from scipy.optimize import minimize
from qiskit import QuantumCircuit, transpile
from qiskit.quantum_info import SparsePauliOp, Statevector
from qiskit_aer import AerSimulator

# H2 Hamiltonian at bond length 0.735 A (from the tutorial)
H2_OP = SparsePauliOp.from_list([
    ("II", -1.052373245772859),
    ("IZ", 0.39793742484318045),
    ("ZI", -0.39793742484318045),
    ("ZZ", -0.01128010425623538),
    ("XX", 0.18093119978423156),
])
NUM_QUBITS = 2
REPS = 3  # TwoLocal default


def ansatz(params):
    """TwoLocal(2, 'ry', 'cz', reps=3): ry layer, then (cz, ry layer) x reps."""
    circuit = QuantumCircuit(NUM_QUBITS)
    params = iter(params)
    for q in range(NUM_QUBITS):
        circuit.ry(next(params), q)
    for _ in range(REPS):
        circuit.cz(0, 1)
        for q in range(NUM_QUBITS):
            circuit.ry(next(params), q)
    return circuit


NUM_PARAMS = NUM_QUBITS * (REPS + 1)


def energy(params):
    return Statevector(ansatz(params)).expectation_value(H2_OP).real


rng = np.random.default_rng(42)
result = minimize(energy, rng.uniform(-np.pi, np.pi, NUM_PARAMS), method="SLSQP", options={"maxiter": 1000})
reference = np.linalg.eigvalsh(H2_OP.to_matrix()).min()

print("VQE energy:       %.5f" % result.fun)
print("exact (numpy):    %.5f" % reference)
print("difference:       %.1e" % (result.fun - reference))
print("evaluations:      %d" % result.nfev)

# Ground state found by VQE, measured
qc = ansatz(result.x)
qc.measure_all()

simulator = AerSimulator()
counts = simulator.run(transpile(qc, simulator), shots=1000, seed_simulator=42).result().get_counts()
print("counts:", dict(sorted(counts.items())))
