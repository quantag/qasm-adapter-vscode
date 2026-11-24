# Multi-file example: GHZ state + ring of RZZ layers from a data file.
# Uploaded for debugging (see the OpenQASM output channel): this file, the local
# modules it imports (circuits/, utils/) and data/** from config.json.
from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

from circuits import ghz_state, rzz_layer
from utils.io import read_edges, read_params

params = read_params("data/params.json")
edges = read_edges("data/edges.csv")
n = params["qubits"]

qc = QuantumCircuit(n, n)
ghz_state(qc, n)
for gamma in params["gammas"]:
    rzz_layer(qc, edges, gamma)
qc.measure(range(n), range(n))

counts = AerSimulator().run(qc, shots=params["shots"]).result().get_counts()
print(counts)
