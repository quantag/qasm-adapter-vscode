"""VQE with different classical optimizers, a gradient and a warm start.

Based on qiskit-tutorials/tutorials/algorithms/02_vqe_advanced_options.ipynb, written
without qiskit-algorithms: the same H2 problem as 01, solved with SciPy COBYLA,
L-BFGS-B and SLSQP; then SLSQP with a finite-difference gradient, and a second run
started from the optimum of the first (fewer evaluations).

Debugger: the circuit shown is `qc`, the ansatz with the best angles found.
"""
import numpy as np
from scipy.optimize import minimize
from qiskit import QuantumCircuit
from qiskit.quantum_info import SparsePauliOp, Statevector

H2_OP = SparsePauliOp.from_list([
    ("II", -1.052373245772859),
    ("IZ", 0.39793742484318045),
    ("ZI", -0.39793742484318045),
    ("ZZ", -0.01128010425623538),
    ("XX", 0.18093119978423156),
])
REFERENCE = np.linalg.eigvalsh(H2_OP.to_matrix()).min()
REPS = 3


def ansatz(params):
    """TwoLocal(2, 'ry', 'cz', reps=3)."""
    circuit = QuantumCircuit(2)
    params = iter(params)
    circuit.ry(next(params), 0)
    circuit.ry(next(params), 1)
    for _ in range(REPS):
        circuit.cz(0, 1)
        circuit.ry(next(params), 0)
        circuit.ry(next(params), 1)
    return circuit


def energy(params):
    return Statevector(ansatz(params)).expectation_value(H2_OP).real


def finite_difference_gradient(params, epsilon=0.01):
    """Central differences, like FiniteDiffEstimatorGradient(epsilon=0.01)."""
    grad = np.zeros_like(params)
    for i in range(len(params)):
        shift = np.zeros_like(params)
        shift[i] = epsilon
        grad[i] = (energy(params + shift) - energy(params - shift)) / (2 * epsilon)
    return grad


def run(method, x0, maxiter, jac=None):
    """Runs one optimizer and records the energy at every evaluation."""
    values = []

    def tracked(params):
        value = energy(params)
        values.append(value)
        return value

    result = minimize(tracked, x0, method=method, jac=jac, options={"maxiter": maxiter})
    return result, values


x0 = np.random.default_rng(50).uniform(-np.pi, np.pi, 2 * (REPS + 1))
print("reference energy: %.5f" % REFERENCE)
print("%-10s %10s %12s %8s" % ("optimizer", "energy", "difference", "evals"))
best = None
for method, maxiter in (("COBYLA", 80), ("L-BFGS-B", 60), ("SLSQP", 60)):
    result, values = run(method, x0, maxiter)
    print("%-10s %10.5f %12.1e %8d" % (method, result.fun, result.fun - REFERENCE, len(values)))
    if best is None or result.fun < best.fun:
        best = result

# Gradient: SLSQP with finite differences
with_gradient, values = run("SLSQP", x0, 100, jac=finite_difference_gradient)
print("SLSQP with gradient: %.5f in %d energy evaluations" % (with_gradient.fun, len(values)))

# Warm start: begin from the optimum found
warm, warm_values = run("SLSQP", with_gradient.x, 1000, jac=finite_difference_gradient)
print("warm start: %.5f in %d evaluations (vs %d without)" % (warm.fun, len(warm_values), len(values)))

if warm.fun < best.fun:
    best = warm
qc = ansatz(best.x)
qc.measure_all()
