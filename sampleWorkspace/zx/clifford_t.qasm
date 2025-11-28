OPENQASM 2.0;
include "qelib1.inc";

qreg q[3];
creg c[3];

// Redundant single-qubit inverses
h q[0];
h q[0];          // H*H = I, both should vanish

x q[1];
x q[1];          // X*X = I

s q[2];
sdg q[2];        // S followed by Sdg = I

t q[2];
tdg q[2];        // T followed by Tdg = I

// Redundant two-qubit pair
cx q[0], q[1];
cx q[0], q[1];   // CX*CX = I (same control/target), pair should vanish

// A small block that can be simplified
rz(0.5) q[0];
rz(-0.5) q[0];   // cancels to I

// Another canceling pattern with commuting gates
h q[1];
cx q[1], q[2];
cx q[1], q[2];   // cancels
h q[1];          // H at start/end should cancel too after CX pair removal

measure q[0] -> c[0];
measure q[1] -> c[1];
measure q[2] -> c[2];
