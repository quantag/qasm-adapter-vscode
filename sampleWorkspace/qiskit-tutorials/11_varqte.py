"""Variational quantum time evolution: imaginary (VarQITE) and real (VarQRTE).

Based on qiskit-tutorials/tutorials/algorithms/11_VarQTE.ipynb, written without
qiskit-algorithms. McLachlan's variational principle: the parameter velocities solve
G theta_dot = rhs, with
    G_ij = Re <t_i|t_j>,  t_i = d_i psi - <psi|d_i psi> psi   (quantum geometric tensor)
    rhs_i = -Re <t_i|H|psi>   (imaginary time)    or    Im <t_i|H|psi>   (real time).
Every parameter is in one rotation exp(-i theta P / 2), so d_i psi = psi(theta + pi e_i) / 2
exactly. The ODE is integrated with SciPy RK45 and compared with the exact evolution.

H = -0.2 Z0 Z1 - X0 - X1, ansatz EfficientSU2(2, reps=1), all angles pi/2 at start.

Debugger: the circuit shown is `qc`, the ansatz at the end of the imaginary time
evolution (approximate ground state), measured.
"""
import numpy as np
from scipy.integrate import solve_ivp
from scipy.linalg import expm
from qiskit import QuantumCircuit
from qiskit.quantum_info import SparsePauliOp, Statevector

HAMILTONIAN = SparsePauliOp(["ZZ", "IX", "XI"], coeffs=[-0.2, -1, -1])
MAGNETIZATION = SparsePauliOp(["IZ", "ZI"], coeffs=[1, 1])
H, M = HAMILTONIAN.to_matrix(), MAGNETIZATION.to_matrix()
NUM_PARAMS = 8


def ansatz(th):
    """EfficientSU2(2, reps=1): ry, rz layer, cx, ry, rz layer."""
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


def state(th):
    return Statevector(ansatz(th)).data


def velocity(th, imaginary):
    psi = state(th)
    tangents = []
    for i in range(NUM_PARAMS):
        shifted = np.array(th, dtype=float)
        shifted[i] += np.pi
        d = state(shifted) / 2
        tangents.append(d - (psi.conj() @ d) * psi)
    T = np.array(tangents)                    # rows t_i
    G = (T.conj() @ T.T).real
    Hpsi = H @ psi
    overlaps = T.conj() @ Hpsi
    rhs = -overlaps.real if imaginary else overlaps.imag
    return np.linalg.lstsq(G, rhs, rcond=1e-8)[0]


theta0 = np.full(NUM_PARAMS, np.pi / 2)
psi0 = state(theta0)

# Imaginary time: the energy goes down to the ground state energy
imag = solve_ivp(lambda t, th: velocity(th, True), (0, 5.0), theta0, t_eval=np.linspace(0, 5, 6), rtol=1e-6)
print("imaginary time evolution, energy")
print("%5s %10s %10s" % ("tau", "VarQITE", "exact"))
for tau, th in zip(imag.t, imag.y.T):
    phi = expm(-tau * H) @ psi0
    phi /= np.linalg.norm(phi)
    psi = state(th)
    print("%5.1f %10.5f %10.5f" % (tau, (psi.conj() @ H @ psi).real, (phi.conj() @ H @ phi).real))
print("ground state energy (numpy): %.5f" % np.linalg.eigvalsh(H).min())

# Real time: magnetization
real = solve_ivp(lambda t, th: velocity(th, False), (0, 10.0), theta0, t_eval=np.linspace(0, 10, 6), rtol=1e-6)
print("real time evolution, magnetization")
print("%5s %10s %10s" % ("t", "VarQRTE", "exact"))
for t, th in zip(real.t, real.y.T):
    phi = expm(-1j * t * H) @ psi0
    psi = state(th)
    print("%5.1f %10.5f %10.5f" % (t, (psi.conj() @ M @ psi).real, (phi.conj() @ M @ phi).real))

qc = ansatz(imag.y[:, -1])
qc.measure_all()
