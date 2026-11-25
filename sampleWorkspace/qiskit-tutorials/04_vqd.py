"""VQD: ground state and the first excited states of H2.

Based on qiskit-tutorials/tutorials/algorithms/04_vqd.ipynb, written without
qiskit-algorithms: state k minimizes <H> + sum_i beta_i |<psi_i|psi>|^2 over the
states found before it (exact overlaps from statevectors instead of ComputeUncompute).
Ansatz TwoLocal(2, ['ry', 'rz'], 'cz', reps=1), optimizer SciPy SLSQP.

Debugger: the circuit shown is `qc`, the ansatz of the last state found (k = 2), measured.
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
K = 3
BETAS = [33, 33, 33]


def ansatz(p):
    """TwoLocal(2, ['ry', 'rz'], 'cz', reps=1): 8 parameters."""
    circuit = QuantumCircuit(2)
    circuit.ry(p[0], 0)
    circuit.ry(p[1], 1)
    circuit.rz(p[2], 0)
    circuit.rz(p[3], 1)
    circuit.cz(0, 1)
    circuit.ry(p[4], 0)
    circuit.ry(p[5], 1)
    circuit.rz(p[6], 0)
    circuit.rz(p[7], 1)
    return circuit


def state(params):
    return Statevector(ansatz(params))


found = []  # (energy, params, statevector)
rng = np.random.default_rng(1)
for k in range(K):
    previous = [s for _, _, s in found]

    def cost(params):
        psi = state(params)
        value = psi.expectation_value(H2_OP).real
        for beta, phi in zip(BETAS, previous):
            value += beta * abs(phi.inner(psi)) ** 2
        return value

    best = min((minimize(cost, rng.uniform(-np.pi, np.pi, 8), method="SLSQP") for _ in range(3)),
               key=lambda r: r.fun)
    psi = state(best.x)
    found.append((psi.expectation_value(H2_OP).real, best.x, psi))
    print("state %d: energy %.5f (cost %.5f, %d evaluations)" % (k, found[-1][0], best.fun, best.nfev))

reference = np.linalg.eigvalsh(H2_OP.to_matrix())[:K]
print("reference values:", np.round(reference, 5))
print("VQD values:      ", np.round([e for e, _, _ in found], 5))

qc = ansatz(found[-1][1])
qc.measure_all()
