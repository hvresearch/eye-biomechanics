"""EyeParameters result and displacement sidecar from an elastic FEM solve (Task 4.7).

The result is the input document with its anterior and posterior corneal surfaces replaced by
Zernike surfaces: the document's conic plus the height change between the reference state
(IOP only) and the loaded state, fitted at fixed lateral position (M4 plan, Deviation 3). Apex
shifts change the vertex positions: the corneal thickness by the posterior minus the anterior
shift, the anterior chamber by the lens minus the posterior shift (the lens follows the scleral
spur), the vitreous chamber by the retina minus the lens shift (the retina follows the posterior
pole of the inner surface), and the axial length by the retina minus the anterior shift
(Deviation 9).
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from eyebiomech.fem.mesh import REGIONS, ShellMesh
from eyebiomech.fem.surfaces import sample_surface, surface_change
from eyebiomech.schema import validate_deformation, validate_eye_parameters

# Sanity limit on a fitted height map's RMS, µm (master plan Review Focus 5; numerical).
MAX_MAP_RMS_UM = 500.0
# Fit radii and order of the corneal maps (numerical): the anterior map covers an 8 mm pupil;
# the posterior stays inside the zone where the shell follows the document's posterior surface.
ANTERIOR_NORM_RADIUS_MM = 4.0
POSTERIOR_NORM_RADIUS_MM = 3.5
MAX_ORDER = 8
# Sampling reaches this far beyond each fit radius so the disk stays covered at the loaded
# lateral positions (numerical; up to 250 µm of lateral motion, inside the zone where the inner
# surface follows the document's posterior cornea).
SAMPLE_MARGIN_MM = 0.25
SCHEMA_VERSION = "1.0.0"


class UnphysicalResultError(ValueError):
    pass


def _surface_nodes(shell: ShellMesh, which: str) -> NDArray:
    X = shell.mesh.doflocs
    theta = shell.geometry.polar(X)
    r = np.linalg.norm(X, axis=0)
    target = shell.geometry.r_out(theta) if which == "outer" else shell.geometry.r_in(theta)
    return np.abs(r - target) < 1e-9


def axial_shifts(shell: ShellMesh, U_ref: NDArray, U_load: NDArray) -> dict[str, float]:
    """Axial (z) displacement differences, loaded minus reference, mm: the scleral-spur ring of
    the outer surface (lens) and the posterior pole of the inner surface (retina)."""
    X = shell.mesh.doflocs
    dz = (np.asarray(U_load) - np.asarray(U_ref))[2]
    theta = shell.geometry.polar(X)
    R = shell.sclera_radius_mm
    from eyebiomech.fem.data import load_materials

    spur = shell.limbus_polar_rad + load_materials()["scleralSpur"]["arcFromLimbusMm"] / R
    outer = _surface_nodes(shell, "outer")
    # Nodes within half an element of the spur circle (numerical band).
    band = outer & (np.abs(theta - spur) <= np.pi / (4 * shell.n_face))
    inner = _surface_nodes(shell, "inner")
    pole = int(np.argmax(np.where(inner, theta, -np.inf)))
    return {"lensMm": float(dz[band].mean()), "retinaMm": float(dz[pole])}


def _zernike_surface(surface: dict, change, thickness: float) -> dict:
    out = {
        "name": surface["name"],
        "type": "zernike",
        "radiusMm": surface["radiusMm"],
        "conic": surface.get("conic", 0.0),
        "zernikeHeight": {
            "normRadiusMm": change.norm_radius_mm,
            "coeffsMicrons": [float(c) for c in change.coeffs_um],
        },
        "thicknessToNextMm": float(thickness),
        "mediumAfter": copy.deepcopy(surface["mediumAfter"]),
        "apertureSemiDiamMm": surface["apertureSemiDiamMm"],
    }
    for key in ("tilt", "decenter"):
        if key in surface:
            out[key] = copy.deepcopy(surface[key])
    return out


def build_result(
    params: dict,
    shell: ShellMesh,
    U_ref: NDArray,
    U_load: NDArray,
    provenance: dict,
    label_suffix: str = "elastic FEM result",
) -> tuple[dict, dict[str, float]]:
    """The loaded eye as an EyeParameters document, and the axial shifts used (mm)."""
    names = [s["name"] for s in params["surfaces"]]
    if names[:4] != ["cornea.anterior", "cornea.posterior", "lens.anterior", "lens.posterior"]:
        raise ValueError(f"expected cornea and lens surfaces first, got {names[:4]}")
    if any(s["type"] != "conic" for s in params["surfaces"][:2]):
        raise ValueError("the corneal surfaces of the input must be conic")
    ra, rp = ANTERIOR_NORM_RADIUS_MM, POSTERIOR_NORM_RADIUS_MM
    m = SAMPLE_MARGIN_MM
    ant = surface_change(
        sample_surface(shell, U_ref, "outer", ra + m),
        sample_surface(shell, U_load, "outer", ra + m),
        ra,
        MAX_ORDER,
    )
    post = surface_change(
        sample_surface(shell, U_ref, "inner", rp + m),
        sample_surface(shell, U_load, "inner", rp + m),
        rp,
        MAX_ORDER,
    )
    s = axial_shifts(shell, U_ref, U_load)
    shifts = {
        "anteriorApexMm": ant.apex_shift_mm,
        "posteriorApexMm": post.apex_shift_mm,
        "lensMm": s["lensMm"],
        "retinaMm": s["retinaMm"],
    }
    surfaces = copy.deepcopy(params["surfaces"])
    t = [sf["thicknessToNextMm"] for sf in surfaces]
    surfaces[0] = _zernike_surface(
        surfaces[0], ant, t[0] + shifts["posteriorApexMm"] - shifts["anteriorApexMm"]
    )
    surfaces[1] = _zernike_surface(
        surfaces[1], post, t[1] + shifts["lensMm"] - shifts["posteriorApexMm"]
    )
    surfaces[3]["thicknessToNextMm"] = t[3] + shifts["retinaMm"] - shifts["lensMm"]
    doc = copy.deepcopy(params)
    doc.update(
        schemaVersion=SCHEMA_VERSION,
        id=f"{params['id']}-fem",
        label=f"{params['label']}: {label_suffix}",
        provenance=dict(provenance),
        surfaces=surfaces,
        axialLengthMm=params["axialLengthMm"] + shifts["retinaMm"] - shifts["anteriorApexMm"],
    )
    return doc, shifts


def check_physical(doc: dict) -> None:
    """Raise `UnphysicalResultError` when a map's RMS (piston excluded) exceeds the limit or any
    surface number is not finite."""
    for s in doc["surfaces"]:
        for key in ("radiusMm", "thicknessToNextMm", "conic"):
            if key in s and not np.isfinite(s[key]):
                raise UnphysicalResultError(f"{s['name']}: {key} is not finite")
        z = s.get("zernikeHeight")
        if z is None:
            continue
        c = np.asarray(z["coeffsMicrons"], dtype=float)
        if not np.all(np.isfinite(c)):
            raise UnphysicalResultError(f"{s['name']}: non-finite Zernike coefficients")
        rms = float(np.sqrt(np.sum(c[1:] ** 2)))
        if rms > MAX_MAP_RMS_UM:
            raise UnphysicalResultError(
                f"{s['name']}: height map RMS {rms:.1f} µm exceeds {MAX_MAP_RMS_UM:.0f} µm"
            )
    if not np.isfinite(doc["axialLengthMm"]):
        raise UnphysicalResultError("axial length is not finite")


def _cyclic(quad: NDArray, X: NDArray) -> NDArray:
    """The four vertex indices of a quadrilateral in cyclic order (by angle about its center)."""
    P = X[:, quad]
    c = P.mean(axis=1)
    n = c / np.linalg.norm(c)
    e1 = P[:, 0] - c
    e1 = e1 - np.dot(e1, n) * n
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(n, e1)
    ang = np.arctan2((P - c[:, None]).T @ e2, (P - c[:, None]).T @ e1)
    return quad[np.argsort(ang)]


def build_deformation(
    shell: ShellMesh,
    U_ref: NDArray,
    U_load: NDArray,
    loads_summary: list[dict],
    reference: dict,
    provenance: dict,
    result_id: str | None = None,
) -> dict:
    """The outer surface (corner vertices, two triangles per facet) with the displacement of the
    loaded state relative to the reference state, in the FEM frame."""
    from eyebiomech.fem.data import load_eom_table

    m = shell.mesh
    quads = m.facets[:, shell.outer_facets]
    verts = np.unique(quads)
    index = np.full(m.p.shape[1], -1, dtype=np.int64)
    index[verts] = np.arange(verts.size)
    tris = []
    for q in quads.T:
        a, b, c, d = index[_cyclic(q, m.p)]
        tris += [[int(a), int(b), int(c)], [int(a), int(c), int(d)]]
    X = m.p[:, verts]
    dU = (np.asarray(U_load) - np.asarray(U_ref))[:, verts]
    region = shell.geometry.region_index(shell.geometry.polar(X))
    return {
        "schemaVersion": SCHEMA_VERSION,
        "id": result_id or f"{reference['id']}-fem",
        "provenance": dict(provenance),
        "frame": load_eom_table()["frame"],
        "elastic": True,
        "apexZMm": float(shell.apex_z_mm),
        "loads": loads_summary,
        "vertices": np.round(X.T, 9).tolist(),
        "triangles": tris,
        "displacementMm": np.round(dU.T, 12).tolist(),
        "region": [REGIONS[int(r)] for r in region],
        "reference": reference,
    }


def write_result(doc: dict, sidecar: dict, out_path: Path | str) -> tuple[Path, Path]:
    """Validate both documents and write `<name>.eye.json` and `<name>.deformation.json`."""
    out = Path(out_path)
    if not out.name.endswith(".eye.json"):
        raise ValueError(f"the output name must end in .eye.json, got {out.name}")
    check_physical(doc)
    validate_eye_parameters(doc)
    validate_deformation(sidecar)
    side = out.with_name(out.name[: -len(".eye.json")] + ".deformation.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=1) + "\n")
    side.write_text(json.dumps(sidecar, separators=(",", ":")) + "\n")
    return out, side
