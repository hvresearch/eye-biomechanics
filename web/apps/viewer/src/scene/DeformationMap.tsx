import { useLayoutEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide } from "three";
import { useScene } from "../store/scene";
import { sequentialColor } from "../ui/optics/colormap";

/** Lower end of the ramp on the stage (the chart ramp starts at the panel color, which would vanish on the dark stage). */
const RAMP_FLOOR = 0.18;

/** Heat-map color for t in [0, 1] (0 = no displacement, 1 = the largest), as a CSS color. */
export function heatMapRamp(t: number): string {
  const [r, g, b] = sequentialColor(RAMP_FLOOR + (1 - RAMP_FLOOR) * Math.min(1, Math.max(0, t)));
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/**
 * The loaded result's outer surface colored by displacement magnitude, drawn at
 * `position + exaggeration × displacement` in the right globe's frame. The FEM frame is the
 * eye's local frame with its origin at the globe center (data/eom); the mesh is shifted along
 * the optical axis so its undeformed apex meets the drawn cornea.
 */
export function DeformationMap({ apexOffsetMm }: { apexOffsetMm: number }) {
  const deformation = useScene((s) => s.loadedResult?.deformation ?? null);
  const exaggeration = useScene((s) => s.exaggeration);
  const show = useScene((s) => s.showHeatMap);
  const setHovered = useScene((s) => s.setHovered);
  const ref = useRef<BufferGeometry>(null);

  const colors = useMemo(() => {
    if (!deformation) return null;
    const c = new Float32Array(deformation.magnitudeUm.length * 3);
    const max = deformation.maxUm > 0 ? deformation.maxUm : 1;
    deformation.magnitudeUm.forEach((m, i) => {
      const [r, g, b] = sequentialColor(RAMP_FLOOR + (1 - RAMP_FLOOR) * (m / max));
      c[3 * i] = r / 255;
      c[3 * i + 1] = g / 255;
      c[3 * i + 2] = b / 255;
    });
    return c;
  }, [deformation]);

  // `show` is a dependency because hiding the map unmounts the mesh: showing it again mounts an
  // empty geometry that has to be filled anew.
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g || !deformation || !colors) return;
    const p = new Float32Array(deformation.vertices.length);
    for (let i = 0; i < p.length; i++) p[i] = deformation.vertices[i]! + exaggeration * deformation.displacementMm[i]!;
    g.setAttribute("position", new BufferAttribute(p, 3));
    g.setAttribute("color", new BufferAttribute(colors, 3));
    g.setIndex(new BufferAttribute(deformation.triangles, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }, [deformation, colors, exaggeration, show]);

  if (!deformation || !show) return null;
  return (
    <mesh
      position={[0, 0, apexOffsetMm - deformation.apexZMm]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered({ kind: "structure", label: `Displacement heat map, ×${exaggeration} (elastic; 0 to ${deformation.maxUm.toFixed(1)} µm)` });
      }}
      onPointerOut={() => setHovered(null)}
    >
      <bufferGeometry ref={ref} />
      <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.55} metalness={0} />
    </mesh>
  );
}
