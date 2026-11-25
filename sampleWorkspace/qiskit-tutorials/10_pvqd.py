"""pVQD: projected variational quantum dynamics of a 2-qubit Ising model.

Based on qiskit-tutorials/tutorials/algorithms/10_pvqd.ipynb, written without
qiskit-algorithms: at every time step the parameters move to the ansatz state closest
to one Trotter step of the current state (maximum fidelity, SciPy L-BFGS-B). Energy and
magnetization are compared with the exact evolution (scipy expm).

H = 0.1 Z0 Z1 + X0 + X1, observable Z0 + Z1, start |00>, final time 1.
The tutorial's rzz is written as cx, rz, cx.

Debugger: the circuit shown is `qc`, the ansatz at the final time, measured.
"""
import numpy as np
from scipy.linalg import expm
from scipy.optimize import minimize
from qiskit import QuantumCircuit
from qiskit.quantum_info import SparsePauliOp, Statevector

FINAL_TIME = 1.0
NUM_TIMESTEPS = 100
HAMILTONIAN = SparsePauliOp.from_sparse_list([("ZZ", [0, 1], 0.1), ("X", [0], 1), ("X", [1], 1)], num_qubits=2)
OBSERVABLE = SparsePauliOp(["ZI", "IZ"])


def rzz(circuit, angle, a, b):
    """exp(-i angle/2 Z_a Z_b)."""
    circuit.cx(a, b)
    circuit.rz(angle, b)
    circuit.cx(a, b)


def ansatz(th):
    """rx, rx, rzz, rx, rx: 5 parameters."""
    circuit = QuantumCircuit(2)
    circuit.rx(th[0], 0)
    circuit.rx(th[1], 1)
    rzz(circuit, th[2], 0, 1)
    circuit.rx(th[3], 0)
    circuit.rx(th[4], 1)
    return circuit


def trotter_step(dt):
    """First-order Trotter step of exp(-i dt H)."""
    circuit = QuantumCircuit(2)
    rzz(circuit, 2 * 0.1 * dt, 0, 1)
    circuit.rx(2 * dt, 0)
    circuit.rx(2 * dt, 1)
    return circuit


dt = FINAL_TIME / NUM_TIMESTEPS
step = trotter_step(dt)
theta = np.zeros(5)
times, energies, magnetizations = [0.0], [], []
psi = Statevector(ansatz(theta))
energies.append(psi.expectation_value(HAMILTONIAN).real)
magnetizations.append(psi.expectation_value(OBSERVABLE).real)

for n in range(NUM_TIMESTEPS):
    target = Statevector(ansatz(theta)).evolve(step)

    def infidelity(delta):
        return 1 - abs(Statevector(ansatz(theta + delta)).inner(target)) ** 2

    delta = minimize(infidelity, np.zeros(5), method="L-BFGS-B", options={"ftol": 1e-15, "gtol": 1e-10}).x
    theta = theta + delta
    psi = Statevector(ansatz(theta))
    times.append((n + 1) * dt)
    energies.append(psi.expectation_value(HAMILTONIAN).real)
    magnetizations.append(psi.expectation_value(OBSERVABLE).real)

# Exact evolution of the same initial state
H, O = HAMILTONIAN.to_matrix(), OBSERVABLE.to_matrix()
psi0 = Statevector(ansatz(np.zeros(5))).data
print("%5s %10s %10s %10s %10s" % ("t", "E pVQD", "E exact", "M pVQD", "M exact"))
for i in range(0, NUM_TIMESTEPS + 1, NUM_TIMESTEPS // 5):
    exact = expm(-1j * times[i] * H) @ psi0
    print("%5.2f %10.4f %10.4f %10.4f %10.4f" % (
        times[i], energies[i], (exact.conj() @ H @ exact).real,
        magnetizations[i], (exact.conj() @ O @ exact).real))

qc = ansatz(theta)
qc.measure_all()
