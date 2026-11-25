"""QAOA for Max-Cut on a 4-node graph.

Based on qiskit-tutorials/tutorials/algorithms/05_qaoa.ipynb, written without
qiskit-algorithms: the QAOA circuit is built gate by gate, the parameters are
optimized classically with SciPy (COBYLA) on the exact expectation value, and the
final circuit with the best parameters is sampled on Aer.

Debugger: the circuit shown is `qc` (the QAOA circuit with the optimized angles).
"""
import numpy as np
from scipy.optimize import minimize
from qiskit import QuantumCircuit, transpile
from qiskit.quantum_info import Statevector
from qiskit_aer import AerSimulator

# Graph: 4 nodes, unit weights (the graph of the tutorial)
NUM_NODES = 4
EDGES = [(0, 1), (0, 2), (0, 3), (1, 2), (2, 3)]
LAYERS = 2  # QAOA depth p


def cut_value(bits):
    """Number of edges cut by a partition; bits[i] is the side of node i."""
    return sum(1 for i, j in EDGES if bits[i] != bits[j])


def qaoa_circuit(gammas, betas):
    """QAOA ansatz: |+>^n, then per layer the cost unitary and the mixer."""
    circuit = QuantumCircuit(NUM_NODES)
    circuit.h(range(NUM_NODES))
    for gamma, beta in zip(gammas, betas):
        # cost: exp(-i gamma Z_i Z_j) for every edge
        for i, j in EDGES:
            circuit.cx(i, j)
            circuit.rz(2 * gamma, j)
            circuit.cx(i, j)
        # mixer: exp(-i beta X) on every qubit
        for q in range(NUM_NODES):
            circuit.rx(2 * beta, q)
    return circuit


def expected_cut(params):
    """Average cut value of the QAOA state (exact, from the statevector)."""
    gammas, betas = params[:LAYERS], params[LAYERS:]
    probabilities = Statevector(qaoa_circuit(gammas, betas)).probabilities()
    total = 0.0
    for index, p in enumerate(probabilities):
        bits = [(index >> q) & 1 for q in range(NUM_NODES)]  # qubit q = node q
        total += p * cut_value(bits)
    return total


# Classical optimization: maximize the expected cut (minimize its negative)
rng = np.random.default_rng(7)
best = None
for start in range(3):
    x0 = rng.uniform(0, np.pi, 2 * LAYERS)
    result = minimize(lambda x: -expected_cut(x), x0, method="COBYLA", options={"maxiter": 200})
    if best is None or result.fun < best.fun:
        best = result
print("optimized angles:", np.round(best.x, 4))
print("expected cut:", round(-best.fun, 4))

# Brute force, to compare with
optimum = max(cut_value([(k >> q) & 1 for q in range(NUM_NODES)]) for k in range(2 ** NUM_NODES))
print("maximum cut (brute force):", optimum)

# Final circuit with the optimized angles, measured
qc = qaoa_circuit(best.x[:LAYERS], best.x[LAYERS:])
qc.measure_all()

simulator = AerSimulator()
counts = simulator.run(transpile(qc, simulator), shots=2000, seed_simulator=7).result().get_counts()
top = sorted(counts.items(), key=lambda kv: -kv[1])[:4]
for bitstring, n in top:
    bits = [int(b) for b in reversed(bitstring)]  # bitstring is qubit n-1 ... qubit 0
    print(bitstring, n, "cut =", cut_value(bits))
