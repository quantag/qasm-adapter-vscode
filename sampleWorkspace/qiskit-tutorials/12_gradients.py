"""Gradients of expectation values, QGT and QFI, and VQE with a gradient.

Based on qiskit-tutorials/tutorials/algorithms/12_gradients_framework.ipynb, written
without qiskit-algorithms:
- parameter shift: exact (statevector) and from Aer counts;
- finite differences and an SPSA estimate;
- quantum geometric tensor (QGT) and quantum Fisher information (QFI = 4 Re QGT);
- VQE for H2 with conjugate gradient (SciPy CG) and parameter shift gradients.

Debugger: the circuit shown is `qc`, the VQE ansatz with the optimal angles, measured.
"""
import numpy as np
from scipy.optimize import minimize
from qiskit import QuantumCircuit, transpile
from qiskit.quantum_info import SparsePauliOp, Statevector
from qiskit_aer import AerSimulator

# Part 1: one qubit, H = 2X + Z, circuit h, rz(a), rx(b)
H = SparsePauliOp.from_list([("X", 2), ("Z", 1)])


def circuit_ab(a, b):
    circuit = QuantumCircuit(1)
    circuit.h(0)
    circuit.rz(a, 0)
    circuit.rx(b, 0)
    return circuit


def energy(params):
    return Statevector(circuit_ab(*params)).expectation_value(H).real


simulator = AerSimulator()


def energy_shots(params, shots=20000, seed=1):
    """2<X> + <Z> from counts: X by measuring after h, Z directly."""
    value = 0
    for coeff, basis in ((2, "X"), (1, "Z")):
        circuit = circuit_ab(*params)
        if basis == "X":
            circuit.h(0)
        circuit.measure_all()
        counts = simulator.run(transpile(circuit, simulator), shots=shots, seed_simulator=seed).result().get_counts()
        value += coeff * (counts.get("0", 0) - counts.get("1", 0)) / shots
    return value


def parameter_shift(f, params):
    params = np.asarray(params, dtype=float)
    grad = np.zeros_like(params)
    for i in range(len(params)):
        e = np.zeros_like(params)
        e[i] = np.pi / 2
        grad[i] = (f(params + e) - f(params - e)) / 2
    return grad


def finite_difference(f, params, epsilon=0.001):
    params = np.asarray(params, dtype=float)
    return np.array([(f(params + epsilon * e) - f(params - epsilon * e)) / (2 * epsilon)
                     for e in np.eye(len(params))])


def spsa_gradient(f, params, epsilon=0.001, batch_size=10, seed=50):
    rng = np.random.default_rng(seed)
    params = np.asarray(params, dtype=float)
    grad = np.zeros_like(params)
    for _ in range(batch_size):
        delta = rng.choice([-1, 1], size=len(params))
        grad += (f(params + epsilon * delta) - f(params - epsilon * delta)) / (2 * epsilon) * delta
    return grad / batch_size


params = [np.pi / 4, 0]
print("gradient at", np.round(params, 4))
print("  parameter shift (exact):", np.round(parameter_shift(energy, params), 4))
print("  parameter shift (shots):", np.round(parameter_shift(energy_shots, params), 4))
print("  finite difference:      ", np.round(finite_difference(energy, params), 4))
print("  SPSA:                   ", np.round(spsa_gradient(energy, params), 4))


def qgt(params):
    """QGT_ij = <d_i psi|d_j psi> - <d_i psi|psi><psi|d_j psi>; d_i psi = psi(theta + pi e_i) / 2."""
    psi = Statevector(circuit_ab(*params)).data
    d = [Statevector(circuit_ab(*(np.asarray(params) + np.pi * e))).data / 2 for e in np.eye(len(params))]
    return np.array([[di.conj() @ dj - (di.conj() @ psi) * (psi.conj() @ dj) for dj in d] for di in d])


tensor = qgt([np.pi / 4, 0.1])
print("QGT:\n", np.round(tensor, 4))
print("QFI:\n", np.round(4 * tensor.real, 4))

# Part 2: VQE for H2 with conjugate gradient and parameter shift gradients
H2 = SparsePauliOp.from_list([("II", -1.05), ("IZ", 0.39), ("ZI", -0.39), ("ZZ", -0.01)])
H2_ENERGY = -1.85727503  # target energy of the tutorial (full H2 Hamiltonian)


def wavefunction(th):
    circuit = QuantumCircuit(2)
    circuit.ry(th[0], 0)
    circuit.ry(th[1], 1)
    circuit.rz(th[2], 0)
    circuit.rz(th[3], 1)
    circuit.cx(0, 1)
    circuit.ry(th[4], 0)
    circuit.ry(th[5], 1)
    circuit.rz(th[6], 0)
    circuit.rz(th[7], 1)
    return circuit


def h2_energy(th):
    return Statevector(wavefunction(th)).expectation_value(H2).real


x0 = np.random.default_rng(3).uniform(-np.pi, np.pi, 8)
result = minimize(h2_energy, x0, jac=lambda th: parameter_shift(h2_energy, th), method="CG", options={"maxiter": 50})
print("VQE with CG and parameter shift: %.5f" % result.fun)
print("exact for this Hamiltonian:      %.5f" % np.linalg.eigvalsh(H2.to_matrix()).min())
print("reference of the tutorial:       %.5f" % H2_ENERGY)

qc = wavefunction(result.x)
qc.measure_all()
