"""Would guessing missing surface tags change a route? Needs scikit learn by hand."""

import collections
import json
import math
import pathlib

import numpy as np
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import GroupKFold, StratifiedKFold

from api.services.cost_model import ROUGH_SURFACES

GRAPH = pathlib.Path(__file__).resolve().parents[1] / "api" / "data" / "graph.json"

# about a city block, so a test area is somewhere the model has not seen
BLOCK_M = 150.0

FOLDS = 5
SEED = 0


def normalise(value):
    # same folding as the pipeline, so labels match the graph
    if not value:
        return None
    return value.strip().lower().split(":")[0]


def load_ways():
    # one record per way, since splitting edges would put a way on both sides
    graph = json.loads(GRAPH.read_text(encoding="utf-8"))
    coords = {n["id"]: (n["lat"], n["lon"]) for n in graph["nodes"]}

    grouped = collections.defaultdict(list)
    for edge in graph["edges"]:
        grouped[edge["way_id"]].append(edge)

    ways = []
    for way_id, edges in grouped.items():
        tags = edges[0]["tags"]
        lats, lons = [], []
        for edge in edges:
            for node_id in (edge["u"], edge["v"]):
                if node_id in coords:
                    lats.append(coords[node_id][0])
                    lons.append(coords[node_id][1])
        if not lats:
            continue

        ways.append(
            {
                "way_id": way_id,
                "surface": normalise(tags.get("surface")),
                "highway": tags.get("highway") or "unknown",
                "tactile": 1 if tags.get("tactile_paving") in ("yes", "contrasted") else 0,
                "lit": 1 if tags.get("lit") else 0,
                "covered": 1 if tags.get("covered") else 0,
                "wheelchair": 1 if tags.get("wheelchair") else 0,
                "edges": len(edges),
                "length_m": sum(e["length_m"] for e in edges),
                "lat": sum(lats) / len(lats),
                "lon": sum(lons) / len(lons),
            }
        )
    return ways, graph


def featurise(ways, highways):
    # nothing here may give away the surface tag
    rows = []
    for way in ways:
        row = [1.0 if way["highway"] == h else 0.0 for h in highways]
        row.extend(
            [
                way["tactile"],
                way["lit"],
                way["covered"],
                way["wheelchair"],
                way["edges"],
                way["length_m"],
                math.log1p(way["length_m"]),
                way["length_m"] / max(way["edges"], 1),
                way["lat"],
                way["lon"],
            ]
        )
        rows.append(row)
    return np.array(rows, dtype=float)


def blocks_for(ways):
    lat_deg = BLOCK_M / 111_320.0
    mid = sum(w["lat"] for w in ways) / len(ways)
    lon_deg = BLOCK_M / (111_320.0 * math.cos(math.radians(mid)))
    return np.array(
        [f"{int(w['lat'] / lat_deg)}_{int(w['lon'] / lon_deg)}" for w in ways]
    )


def score(features, labels, splits, name):
    model_acc, model_f1, base_acc, base_f1 = [], [], [], []

    for train, test in splits:
        forest = RandomForestClassifier(
            n_estimators=300, min_samples_leaf=2, random_state=SEED, n_jobs=-1
        )
        forest.fit(features[train], labels[train])
        guess = forest.predict(features[test])

        dummy = DummyClassifier(strategy="most_frequent")
        dummy.fit(features[train], labels[train])
        plain = dummy.predict(features[test])

        model_acc.append(accuracy_score(labels[test], guess))
        model_f1.append(f1_score(labels[test], guess, average="macro", zero_division=0))
        base_acc.append(accuracy_score(labels[test], plain))
        base_f1.append(f1_score(labels[test], plain, average="macro", zero_division=0))

    print(f"\n--- {name} ---")
    print(f"model     accuracy {np.mean(model_acc):.3f}  macro f1 {np.mean(model_f1):.3f}")
    print(f"baseline  accuracy {np.mean(base_acc):.3f}  macro f1 {np.mean(base_f1):.3f}")
    print(f"gain      accuracy {np.mean(model_acc) - np.mean(base_acc):+.3f}")
    return np.mean(model_acc), np.mean(base_acc)


def rough_recall(features, binary, splits):
    # averaged f1 hides this, most folds hold no rough way and score perfectly
    found = 0
    missed = 0
    for train, test in splits:
        if binary[train].sum() == 0 or binary[test].sum() == 0:
            continue
        forest = RandomForestClassifier(
            n_estimators=300, min_samples_leaf=2, random_state=SEED, n_jobs=-1
        )
        forest.fit(features[train], binary[train])
        guess = forest.predict(features[test])
        for truth, said in zip(binary[test], guess):
            if truth == 1:
                found += int(said == 1)
                missed += int(said == 0)
    return found, missed


def impute(features, labels, ways, labelled, untagged, highways):
    # what shipping it would really change, which matters more than accuracy
    forest = RandomForestClassifier(
        n_estimators=300, min_samples_leaf=2, random_state=SEED, n_jobs=-1
    )
    forest.fit(features, labels)
    guess = forest.predict(featurise(untagged, highways))

    counts = collections.Counter(guess)
    print("\n=== what it would fill in ===")
    for value, n in counts.most_common():
        rough = "  rough, changes cost" if value in ROUGH_SURFACES else ""
        print(f"  {value:16} {n:5}  {100.0 * n / len(untagged):5.1f}%{rough}")

    rough_n = sum(n for value, n in counts.items() if value in ROUGH_SURFACES)
    metres = sum(
        w["length_m"] for w, g in zip(untagged, guess) if g in ROUGH_SURFACES
    )
    total = sum(w["length_m"] for w in ways)
    print(f"\nways it would call rough {rough_n} of {len(untagged)}")
    print(f"network repriced         {metres:.0f} m of {total:.0f} m "
          f"({100.0 * metres / total:.2f}%)")
    return rough_n


def main() -> int:
    ways, graph = load_ways()
    labelled = [w for w in ways if w["surface"]]
    untagged = [w for w in ways if not w["surface"]]

    print("=== what we have ===")
    print(f"ways total   {len(ways)}")
    print(f"with surface {len(labelled)} ({100.0 * len(labelled) / len(ways):.1f}%)")
    print(f"untagged     {len(untagged)}")

    counts = collections.Counter(w["surface"] for w in labelled)
    print("\nsurface values on the labelled ways")
    for value, n in counts.most_common():
        rough = "  rough, changes cost" if value in ROUGH_SURFACES else ""
        print(f"  {value:16} {n:5}  {100.0 * n / len(labelled):5.1f}%{rough}")

    # surface only reaches the router through the rough list
    rough_ways = [w for w in labelled if w["surface"] in ROUGH_SURFACES]
    rough_len = sum(w["length_m"] for w in rough_ways)
    total_len = sum(w["length_m"] for w in labelled)

    print("\n=== how much of this can change a route ===")
    print("surface only enters the cost model through the rough list, so")
    print("concrete, asphalt and paved are all priced identically.")
    print(f"rough ways among the labelled  {len(rough_ways)} of {len(labelled)} "
          f"({100.0 * len(rough_ways) / len(labelled):.2f}%)")
    print(f"rough by length                {rough_len:.0f} m of {total_len:.0f} m "
          f"({100.0 * rough_len / total_len:.2f}%)")

    highways = sorted({w["highway"] for w in ways})
    features = featurise(labelled, highways)
    labels = np.array([w["surface"] for w in labelled])
    groups = blocks_for(labelled)

    print("\n=== can a model beat guessing the commonest value ===")
    print(f"majority class is {counts.most_common(1)[0][0]} at "
          f"{100.0 * counts.most_common(1)[0][1] / len(labelled):.1f}%")

    # rare classes cannot land in every fold, so leave them out
    keep = np.array([counts[s] >= FOLDS for s in labels])
    random_splits = list(
        StratifiedKFold(n_splits=FOLDS, shuffle=True, random_state=SEED).split(
            features[keep], labels[keep]
        )
    )
    random_acc, random_base = score(
        features[keep], labels[keep], random_splits, "split at random"
    )

    n_blocks = len(set(groups))
    spatial_splits = list(
        GroupKFold(n_splits=min(FOLDS, n_blocks)).split(features, labels, groups)
    )
    spatial_acc, spatial_base = score(
        features, labels, spatial_splits, f"split by area, {n_blocks} blocks"
    )

    binary = np.array([1 if s in ROUGH_SURFACES else 0 for s in labels])
    print("\n=== the only question that changes a route ===")
    print(f"rough examples available to learn from: {int(binary.sum())}")
    found, missed = rough_recall(features, binary, spatial_splits)
    print(f"rough ways the model found when they were held out: {found} of "
          f"{found + missed}")

    predicted = impute(features, labels, ways, labelled, untagged, highways)

    print("\n=== verdict ===")
    honest_gain = spatial_acc - spatial_base
    leak = random_acc - spatial_acc

    print(f"held out by area, the model beats the baseline by {honest_gain:+.3f}")
    print(f"splitting at random instead flatters it by {leak:+.3f}, which is")
    print("neighbouring ways sharing a surface rather than real skill")

    if predicted == 0:
        print("\nSKIP, and the accuracy above is a red herring. the model is")
        print("genuinely better than guessing at telling concrete from asphalt,")
        print("but the router prices those two the same, so not one route moves.")
        print(f"it labels none of the {len(untagged)} untagged ways rough, which is")
        print("the only label that would have changed anything.")
    elif found == 0:
        print("\nSKIP. it never once found a rough way it had not already seen,")
        print("so what it does predict as rough cannot be trusted.")
    elif honest_gain <= 0.02:
        print("\nSKIP. it does not beat guessing the commonest value by enough")
        print("to be worth a dependency and a disclosure.")
    else:
        print("\nWORTH SHIPPING. it beats the baseline held out by area, and it")
        print("moves ground into the rough class that the router really reads.")

    print("\nnote: the labelled ways are not a random sample. somebody chose")
    print("to tag those, and paths people bother tagging are not the same as")
    print("the ones nobody touched.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
