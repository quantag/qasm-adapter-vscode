from guppylang import guppy
from guppylang.std.builtins import array
from guppylang.std.quantum import qubit, h, cx, x, z, measure_array


# 2-qubit Bell state
@guppy
def bell() -> None:
    qs = array(qubit() for _ in range(2))
    h(qs[0])
    cx(qs[0], qs[1])
    _ = measure_array(qs)


# 3-qubit GHZ state
@guppy
def ghz3() -> None:
    qs = array(qubit() for _ in range(3))
    h(qs[0])
    cx(qs[0], qs[1])
    cx(qs[1], qs[2])
    _ = measure_array(qs)


# 1-qubit randomizer
@guppy
def randomize() -> None:
    qs = array(qubit() for _ in range(1))
    h(qs[0])
    x(qs[0])
    z(qs[0])
    _ = measure_array(qs)
