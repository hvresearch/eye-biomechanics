"""Random but reproducible optical systems and rays for the cross-check (data/oracle/cases.json).

Each system has two to four refracting surfaces followed by a flat image plane, all with
absolute vertex positions; each carries five rays that the reference tracer passes cleanly.
"""

from __future__ import annotations

import numpy as np

from eyebiomech.oracle.reference_tracer import trace

RAYS_PER_CASE = 5


def _surface(rng: np.random.Generator, kind: str, z: float, n_after: float) -> dict:
    sign = rng.choice([-1.0, 1.0])
    radius = float(sign * rng.uniform(8.0, 40.0))
    conic = float(rng.uniform(-1.0, 0.5))
    s = {"kind": kind, "vertexZMm": z, "index": n_after, "apertureSemiDiamMm": 6.0}
    if kind == "conic":
        s.update(radiusMm=radius, conic=conic)
    elif kind == "toric":
        s.update(
            rxMm=radius,
            ryMm=float(radius * rng.uniform(0.85, 1.15)),
            axisDeg=float(rng.uniform(0.0, 180.0)),
            conicX=conic,
            conicY=float(rng.uniform(-1.0, 0.5)),
        )
    else:
        coeffs = [0.0] * 15
        for j in range(3, 15):
            coeffs[j] = float(rng.uniform(-3.0, 3.0))
        s.update(radiusMm=radius, conic=conic, normRadiusMm=4.0, coeffsMicrons=coeffs)
    return s


def _system(rng: np.random.Generator, kind: str) -> list[dict]:
    count = int(rng.integers(2, 5))
    special = int(rng.integers(0, count))  # the surface that carries the case's kind
    z = 0.0
    surfaces = []
    for i in range(count):
        n_after = float(rng.uniform(1.3, 1.7)) if i < count - 1 else 1.0
        if i == count - 1 and rng.uniform() < 0.5:
            n_after = float(rng.uniform(1.3, 1.4))  # end in a medium, like an eye
        surfaces.append(_surface(rng, kind if i == special else "conic", z, n_after))
        z += float(rng.uniform(0.5, 5.0))
    image_z = z + float(rng.uniform(5.0, 25.0))
    surfaces.append(
        {
            "kind": "conic",
            "radiusMm": float("inf"),
            "conic": 0.0,
            "vertexZMm": image_z,
            "index": surfaces[-1]["index"],
            "apertureSemiDiamMm": 50.0,
            "image": True,
        }
    )
    return surfaces


def make_cases(seed: int = 20261028) -> dict:
    """20 conic, 10 toric, and 10 Zernike systems with five clean rays each."""
    rng = np.random.default_rng(seed)
    cases = []
    for kind, count in (("conic", 20), ("toric", 10), ("zernike", 10)):
        made = 0
        while made < count:
            surfaces = _system(rng, kind)
            rays = []
            attempts = 0
            while len(rays) < RAYS_PER_CASE and attempts < 200:
                attempts += 1
                origin = [float(rng.uniform(-2.0, 2.0)), float(rng.uniform(-2.0, 2.0)), -5.0]
                ax, ay = np.radians(rng.uniform(-10.0, 10.0, size=2))
                direction = [float(np.sin(ax)), float(np.sin(ay)), 0.0]
                direction[2] = float(np.sqrt(1 - direction[0] ** 2 - direction[1] ** 2))
                if not trace(surfaces, origin, direction)["vignetted"]:
                    rays.append({"origin": origin, "direction": direction})
            if len(rays) == RAYS_PER_CASE:
                cases.append(
                    {"id": f"{kind}-{made:02d}", "kind": kind, "surfaces": surfaces, "rays": rays}
                )
                made += 1
    return {
        "description": "Cross-check systems for the TypeScript tracer; see data/oracle/README.md.",
        "seed": seed,
        "wavelengthNm": 555,
        "cases": cases,
    }
