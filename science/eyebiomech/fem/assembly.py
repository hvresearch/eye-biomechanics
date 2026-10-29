"""Vectorized element assembly for 27-node vector hexahedra (M4 plan, Task 4.4).

scikit-fem's form assembly calls the form once per pair of local basis functions (81² pairs for
a quadratic vector hexahedron), which is too slow for a nonlinear solve. Here the gradients of
the 81 local basis functions are stacked into G (elements, quadrature points, 81, 9), and the
element vectors and matrices are formed with batched products:

    f_e = Σ_q Gᵀ_q P_q dx_q,        K_e = Σ_q Gᵀ_q A_q G_q dx_q,

with P the first Piola–Kirchhoff stress (9) and A = ∂P/∂F (9 × 9) at each quadrature point.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray
from scipy import sparse

# Elements per batch, bounding the temporary arrays (numerical).
CHUNK = 192


def basis_gradients(basis, elements: NDArray) -> NDArray:
    """G (len(elements), nqp, nlocal, 9): ∂φ_a,i/∂X_J flattened as 3 i + J."""
    g = np.stack([basis.basis[a][0].grad[:, :, elements, :] for a in range(len(basis.basis))])
    # (a, i, J, e, q) → (e, q, a, i·3+J)
    return np.ascontiguousarray(np.moveaxis(g, (3, 4), (0, 1))).reshape(
        len(elements), g.shape[4], g.shape[0], 9
    )


def basis_values(basis, elements: NDArray) -> NDArray:
    """Φ (len(elements), nqp, nlocal, 3): φ_a,i at the quadrature points."""
    v = np.stack([np.asarray(basis.basis[a][0])[:, elements, :] for a in range(len(basis.basis))])
    return np.ascontiguousarray(np.moveaxis(v, (2, 3), (0, 1)))


def gradient_at_quadrature(basis, u: NDArray, elements: NDArray) -> NDArray:
    """∇u (3, 3, len(elements), nqp) of the field u."""
    return basis.interpolate(u).grad[:, :, elements, :]


def element_vectors(G: NDArray, P: NDArray, dx: NDArray) -> NDArray:
    """f (e, nlocal) from G (e, q, a, 9), P (e, q, 9), dx (e, q)."""
    return np.einsum("eqai,eqi,eq->ea", G, P, dx, optimize=True)


def element_matrices(G: NDArray, A: NDArray, dx: NDArray, Gb: NDArray | None = None) -> NDArray:
    """K (e, nlocal, nlocal) from G (e, q, a, 9), A (e, q, 9, 9), dx (e, q); Gb defaults to G."""
    Gb = G if Gb is None else Gb
    T = np.matmul(Gb, np.swapaxes(A, 2, 3))  # (e, q, b, i): Σ_k A_ik G_bk
    T *= dx[:, :, None, None]
    e, q, a, i = G.shape
    Gf = np.swapaxes(G, 1, 2).reshape(e, a, q * i)
    Tf = np.swapaxes(T, 1, 2).reshape(e, Gb.shape[2], q * i)
    return np.matmul(Gf, np.swapaxes(Tf, 1, 2))


def scatter_vector(n: int, dofs: NDArray, fe: NDArray) -> NDArray:
    """Global vector from element vectors fe (e, nlocal) and element dofs (nlocal, e)."""
    return np.bincount(dofs.T.ravel(), weights=fe.ravel(), minlength=n)


def scatter_matrix(n: int, dofs_a: NDArray, Ke: NDArray, dofs_b: NDArray | None = None):
    dofs_b = dofs_a if dofs_b is None else dofs_b
    rows = np.repeat(dofs_a.T[:, :, None], dofs_b.shape[0], axis=2)
    cols = np.repeat(dofs_b.T[:, None, :], dofs_a.shape[0], axis=1)
    return sparse.coo_matrix((Ke.ravel(), (rows.ravel(), cols.ravel())), shape=(n, n)).tocsr()


def tensor_to_quadrature_matrix(A: NDArray) -> NDArray:
    """(3, 3, 3, 3, e, q) → (e, q, 9, 9)."""
    e, q = A.shape[4], A.shape[5]
    return np.moveaxis(A.reshape(9, 9, e, q), (2, 3), (0, 1))


def tensor_to_quadrature_vector(P: NDArray) -> NDArray:
    """(3, 3, e, q) → (e, q, 9)."""
    e, q = P.shape[2], P.shape[3]
    return np.moveaxis(P.reshape(9, e, q), 0, 2)
