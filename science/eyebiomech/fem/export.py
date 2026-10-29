"""EyeParameters result and displacement sidecar from an elastic FEM solve (Task 4.7).

The result is the input document with its anterior and posterior corneal surfaces replaced by
Zernike surfaces: the document's conic plus the height change between the reference state
(IOP only) and the loaded state, fitted at fixed lateral position (M4 plan, Deviation 3). Apex
shifts change the vertex positions: the corneal thickness by the posterior minus the anterior
shift, the anterior chamber by the lens minus the posterior shift (the lens follows the scleral
spur), the vitreous chamber by the retina minus the lens shift (the retina follows the posterior
pole of the inner surface), and the axial length by the retina minus the anterior shift
(Deviation 9). The corneal maps are taken relative to the lens: the rigid lateral shift and tilt
that the scleral-spur ring (and with it the lens) shares with the cornea are removed first, so
the pivot of the globe about the optic-nerve support does not decenter the cornea against a lens
that stays on the axis (driver review of b6f5a0d).
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
# Fit radii and order of the corneal maps (numerical): both maps cover an 8 mm diameter, the
# zone rays of the largest pupils reach on either corneal surface. The maps are the change of
# the FEM shell's surfaces, which beyond about 3.1 mm from the axis (where the inner surface
# reaches the limbal thickness and leaves the document's posterior surface) is a blend; the
# change is still that of the shell's inner surface. Rays beyond 4 mm (pupils above about
# 7.5 mm) evaluate the order-8 polynomials outside the unit disk (approximation, stated in the
# citation; M4 follow-up, review of b6f5a0d: at 3.5 mm the posterior map's higher-order terms
# reached 0.8 µm at 4 mm).
ANTERIOR_NORM_RADIUS_MM = 4.0
POSTERIOR_NORM_RADIUS_MM = 4.0
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


def _spur_band(shell: ShellMesh) -> NDArray:
    """Outer-surface nodes on the scleral-spur circle, where the ciliary body holds the lens."""
    from eyebiomech.fem.data import load_materials

    theta = shell.geometry.polar(shell.mesh.doflocs)
    spur = (
        shell.limbus_polar_rad
        + load_materials()["scleralSpur"]["arcFromLimbusMm"] / shell.sclera_radius_mm
    )
    # Nodes within half an element of the spur circle (numerical band).
    return _surface_nodes(shell, "outer") & (np.abs(theta - spur) <= np.pi / (4 * shell.n_face))


def _retina_ring(shell: ShellMesh) -> tuple[NDArray, int]:
    """Inner-surface nodes of the free ring just outside the optic-nerve support (within half an
    element of the innermost free node), and the clamped posterior-pole node."""
    from eyebiomech.fem.data import load_materials

    X = shell.mesh.doflocs
    inner = _surface_nodes(shell, "inner") & (X[2] > 0)
    rho = np.hypot(X[0], X[1])
    on = load_materials()["opticNerve"]["radiusMm"]
    free = inner & (rho > on)
    if not np.any(free):
        raise ValueError("no free inner-surface node lies outside the optic-nerve support")
    # Half an element of arc near the pole (numerical band).
    half = np.pi * shell.sclera_radius_mm / (4 * shell.n_face)
    ring = free & (rho <= rho[free].min() + half)
    pole = int(np.argmax(np.where(inner, shell.geometry.polar(X), -np.inf)))
    return ring, pole


def axial_shifts(shell: ShellMesh, U_ref: NDArray, U_load: NDArray) -> dict[str, float]:
    """Axial (z) displacement differences, loaded minus reference, mm: the scleral-spur ring of
    the outer surface (lens) and the retina, taken as the mean of the free inner-surface ring at
    the edge of the optic-nerve support (`retinaMm`; the support, which the orbit holds, is the
    reference of every axial shift). The clamped posterior-pole node (`retinaClampMm`, M4's
    retina, always 0 in a solve) is reported too (M4 follow-up, review of edd021b)."""
    dz = (np.asarray(U_load) - np.asarray(U_ref))[2]
    ring, pole = _retina_ring(shell)
    return {
        "lensMm": float(dz[_spur_band(shell)].mean()),
        "retinaMm": float(dz[ring].mean()),
        "retinaClampMm": float(dz[pole]),
    }


def _rotation(vector: NDArray) -> NDArray:
    """Rotation matrix of a rotation vector (Rodrigues)."""
    angle = float(np.linalg.norm(vector))
    if angle == 0.0:
        return np.eye(3)
    k = vector / angle
    K = np.array([[0.0, -k[2], k[1]], [k[2], 0.0, -k[0]], [-k[1], k[0], 0.0]])
    return np.eye(3) + np.sin(angle) * K + (1.0 - np.cos(angle)) * K @ K


def relative_to_lens(shell: ShellMesh, U_ref: NDArray, U_load: NDArray) -> NDArray:
    """`U_load` with the spur ring's rigid motion relative to the reference state removed, except
    its axial translation (the lens's axial shift, kept for the vertex positions) and its torsion
    about the axis (which the rotationally symmetric lens does not see). The corneal maps and all
    axial shifts of the exported document are taken from this field.

    The ring's rigid motion is the least-squares (Kabsch) fit Q ≈ R P + t of the loaded to the
    reference ring positions; the loaded positions are mapped back by Rᵀ(· − t) and moved by the
    axial part of t again."""
    X = shell.mesh.doflocs
    band = _spur_band(shell)
    P = (X + np.asarray(U_ref))[:, band]
    Q = (X + np.asarray(U_load))[:, band]
    if np.array_equal(P, Q):
        return np.array(U_load, dtype=float)
    p0, q0 = P.mean(axis=1), Q.mean(axis=1)
    u, _, vt = np.linalg.svd((Q - q0[:, None]) @ (P - p0[:, None]).T)
    d = np.sign(np.linalg.det(u @ vt))
    R = u @ np.diag([1.0, 1.0, d]) @ vt
    # Rotation vector of R; drop the torsion (z) component.
    angle = np.arccos(np.clip((np.trace(R) - 1.0) / 2.0, -1.0, 1.0))
    axis = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])
    vec = axis * (angle / (2.0 * np.sin(angle))) if angle > 1e-12 else 0.5 * axis
    vec[2] = 0.0
    R = _rotation(vec)
    t = q0 - R @ p0
    back = R.T @ (X + np.asarray(U_load) - t[:, None])
    back[2] += t[2]
    return back - X


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
    U_rel = relative_to_lens(shell, U_ref, U_load)
    ant = surface_change(
        sample_surface(shell, U_ref, "outer", ra + m),
        sample_surface(shell, U_rel, "outer", ra + m),
        ra,
        MAX_ORDER,
    )
    post = surface_change(
        sample_surface(shell, U_ref, "inner", rp + m),
        sample_surface(shell, U_rel, "inner", rp + m),
        rp,
        MAX_ORDER,
    )
    s = axial_shifts(shell, U_ref, U_rel)
    shifts = {
        "anteriorApexMm": ant.apex_shift_mm,
        "posteriorApexMm": post.apex_shift_mm,
        "lensMm": s["lensMm"],
        "retinaMm": s["retinaMm"],
        "retinaClampMm": s["retinaClampMm"],
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
    """Raise `UnphysicalResultError` when a map's RMS (piston and tilt excluded: they are rigid
    motion of the surface, not deformation) exceeds the limit or any surface number is not
    finite."""
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
        rms = float(np.sqrt(np.sum(c[3:] ** 2)))
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
    loaded state relative to the reference state, in the FEM frame: `displacementMm` relative to
    the lens (`relative_to_lens`, as the corneal maps), `rawDisplacementMm` before that, and the
    scleral height maps (`scleralMaps`)."""
    from eyebiomech.fem.data import load_eom_table
    from eyebiomech.fem.scleral import scleral_maps

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
    U_rel = relative_to_lens(shell, U_ref, U_load)
    raw = (np.asarray(U_load) - np.asarray(U_ref))[:, verts]
    dU = (U_rel - np.asarray(U_ref))[:, verts]
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
        "rawDisplacementMm": np.round(raw.T, 12).tolist(),
        "scleralMaps": scleral_maps(shell, U_ref, U_rel),
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
