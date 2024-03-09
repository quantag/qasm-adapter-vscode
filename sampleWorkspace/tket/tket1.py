from pytket import Circuit

c = Circuit(2, 2) # define a circuit with 2 qubits and 2 bits
c.H(0)            # add a Hadamard gate to qubit 0
c.Rz(0.25, 0)     # add an Rz gate of angle 0.25*pi to qubit 0
c.CX(1,0)         # add a CX gate with control qubit 1 and target qubit 0
c.measure_all()   # measure qubits 0 and 1, recording the results in bits 0 and 1

