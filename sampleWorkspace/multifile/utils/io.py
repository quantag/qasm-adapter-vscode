import csv
import json


def read_edges(path):
    with open(path) as f:
        return [(int(a), int(b)) for a, b in csv.reader(f)]


def read_params(path):
    with open(path) as f:
        return json.load(f)
