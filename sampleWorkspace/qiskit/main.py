from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

qc = QuantumCircuit(2, 2)
qc.h([0, 1])

# Oracle marking |11>.
qc.cz(0, 1)

# Diffusion operator.
qc.h([0, 1])
qc.x([0, 1])
qc.cz(0, 1)
qc.x([0, 1])
qc.h([0, 1])

qc.measure([0, 1], [0, 1])
result = AerSimulator().run(qc, shots=1024).result()
print(result.get_counts())
