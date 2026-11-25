"""VQE with shot noise and with device noise (Aer).

Based on qiskit-tutorials/tutorials/algorithms/03_vqe_simulation_with_noise.ipynb,
written without qiskit-algorithms: the energy is estimated from measurement counts
(Z basis for II, IZ, ZI, ZZ; X basis for XX), SPSA is written out, and the noise
model is built by hand (the tutorial's FakeVigo is not in Qiskit 1.x): depolarizing
errors on 1- and 2-qubit gates and readout errors.

Debugger: the circuit shown is `qc`, the ansatz with the angles found with noise,
measured.
"""
import numpy as np
from qiskit import QuantumCircuit, transpile
from qiskit.quantum_info import SparsePauliOp
from qiskit_aer import AerSimulator
from qiskit_aer.noise import NoiseModel, ReadoutError, depolarizing_error

H2_OP = SparsePauliOp.from_list([
    ("II", -1.052373245772859),
    ("IZ", 0.39793742484318045),
    ("ZI", -0.39793742484318045),
    ("ZZ", -0.01128010425623538),
    ("XX", 0.18093119978423156),
])
COEFF = {label: c.real for label, c in zip(H2_OP.paulis.to_labels(), H2_OP.coeffs)}
REFERENCE = np.linalg.eigvalsh(H2_OP.to_matrix()).min()
SHOTS, SEED, ITERATIONS = 1024, 170, 125


def ansatz(params):
    """TwoLocal(2, 'ry', 'cz', reps=3)."""
    circuit = QuantumCircuit(2, 2)
    params = iter(params)
    circuit.ry(next(params), 0)
    circuit.ry(next(params), 1)
    for _ in range(3):
        circuit.cz(0, 1)
        circuit.ry(next(params), 0)
        circuit.ry(next(params), 1)
    return circuit


def measured(params, basis):
    circuit = ansatz(params)
    if basis == "X":
        circuit.h([0, 1])
    circuit.measure([0, 1], [0, 1])
    return circuit


def parity(counts, qubits):
    """Expectation of Z on the given qubits from counts ('b1 b0')."""
    total = sum(counts.values())
    value = 0
    for bitstring, n in counts.items():
        ones = sum(int(bitstring[1 - q]) for q in qubits)
        value += (-1) ** ones * n
    return value / total


def make_estimator(simulator):
    calls = {"seed": SEED}

    def estimate(params):
        circuits = transpile([measured(params, "Z"), measured(params, "X")], simulator)
        calls["seed"] += 1
        z, x = simulator.run(circuits, shots=SHOTS, seed_simulator=calls["seed"]).result().get_counts()
        return (COEFF["II"] + COEFF["IZ"] * parity(z, [0]) + COEFF["ZI"] * parity(z, [1])
                + COEFF["ZZ"] * parity(z, [0, 1]) + COEFF["XX"] * parity(x, [0, 1]))

    return estimate


def spsa(cost, x0, iterations, seed):
    """Simultaneous perturbation stochastic approximation (standard gains)."""
    rng = np.random.default_rng(seed)
    x = np.array(x0, dtype=float)
    a, c, alpha, gamma, A = 0.2, 0.1, 0.602, 0.101, 10
    for k in range(iterations):
        ak, ck = a / (k + 1 + A) ** alpha, c / (k + 1) ** gamma
        delta = rng.choice([-1, 1], size=len(x))
        g = (cost(x + ck * delta) - cost(x - ck * delta)) / (2 * ck) * delta
        x -= ak * g
    return x, cost(x)


noise_model = NoiseModel()
noise_model.add_all_qubit_quantum_error(depolarizing_error(0.002, 1), ["ry", "h"])
noise_model.add_all_qubit_quantum_error(depolarizing_error(0.02, 2), ["cz"])
noise_model.add_all_qubit_readout_error(ReadoutError([[0.97, 0.03], [0.05, 0.95]]))

x0 = np.random.default_rng(SEED).uniform(-np.pi, np.pi, 8)
noiseless_x, noiseless = spsa(make_estimator(AerSimulator()), x0, ITERATIONS, SEED)
noisy_simulator = AerSimulator(method="density_matrix", noise_model=noise_model)
noisy_x, noisy = spsa(make_estimator(noisy_simulator), x0, ITERATIONS, SEED)

print("reference value:            %.5f" % REFERENCE)
print("VQE, shots only (no noise): %.5f  (delta %.5f)" % (noiseless, noiseless - REFERENCE))
print("VQE, with device noise:     %.5f  (delta %.5f)" % (noisy, noisy - REFERENCE))

qc = ansatz(noisy_x)
qc.measure([0, 1], [0, 1])
