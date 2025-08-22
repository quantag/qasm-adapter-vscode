from guppylang import guppy
from guppylang.std.builtins import array
from guppylang.std.quantum import qubit, h, cx, measure_array

@guppy
def bell() -> None:
    qs = array(qubit() for _ in range(2))
    h(qs[0])
    cx(qs[0], qs[1])
    _ = measure_array(qs)
