OPENQASM 2.0;
include "qelib1.inc"
qreg q[0];
creg c[0];
h q;
measure q -> c;
