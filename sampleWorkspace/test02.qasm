OPENQASM 2.0;
include "qelib1.inc";

// Allocate a 3-qubit quantum register and a 3-bit classical register
qreg q[3];
creg c[3];

// Create a maximally entangled GHZ state: (|000> + |111>) / sqrt(2)
h q[0];
cx q[0], q[1];
cx q[1], q[2];

// Measure all qubits
measure q[0] -> c[0];
measure q[1] -> c[1];
measure q[2] -> c[2];
