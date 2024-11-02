OPENQASM 2.0;
include "stdgates.inc";
qreg q[2];
creg c[2];
h q[0];
rz(0.25*pi) q[0];
cx q[1],q[0];
measure q[0] -> c[0];
measure q[1] -> c[1];