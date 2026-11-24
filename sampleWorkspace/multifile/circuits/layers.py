from .ghz import ghz_state  # noqa: F401  (relative import, also uploaded)


def rzz_layer(qc, edges, gamma):
    # exp(-i gamma/2 Z_a Z_b) on every edge, with qelib1 gates only
    for a, b in edges:
        qc.cx(a, b)
        qc.rz(gamma, b)
        qc.cx(a, b)
