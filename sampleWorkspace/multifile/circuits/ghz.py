def ghz_state(qc, n):
    qc.h(0)
    for i in range(n - 1):
        qc.cx(i, i + 1)
