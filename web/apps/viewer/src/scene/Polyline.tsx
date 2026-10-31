import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

type P3 = readonly [number, number, number];

export interface PolylineProps {
  points: readonly P3[];
  color: string;
  /** Screen-space width, px. */
  lineWidth?: number;
  dashed?: boolean;
  dashSize?: number;
  gapSize?: number;
  transparent?: boolean;
  opacity?: number;
  name?: string;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}

/**
 * A screen-space-width polyline (three's Line2) whose material lives as long as the component.
 * drei's `<Line>` disposes its material together with the geometry whenever `points` change,
 * which releases the shader program and recompiles it on the next frame; lines that move every
 * frame (sight lines, the ray fan, insertion arcs while the gaze changes) then compiled three
 * programs per frame and held the stage to a few frames per second under software WebGL. Here
 * only the geometry is replaced (and disposed) when the points change.
 */
export function Polyline({ points, color, lineWidth = 1, dashed = false, dashSize = 1, gapSize = 1, transparent = false, opacity = 1, ...rest }: PolylineProps) {
  const size = useThree((s) => s.size);
  const line = useMemo(() => new Line2(), []);
  const material = useMemo(() => new LineMaterial(), []);
  const geometry = useMemo(() => {
    const g = new LineGeometry();
    g.setPositions(points.flatMap((p) => [p[0], p[1], p[2]]));
    return g;
  }, [points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    line.geometry = geometry;
    line.material = material;
    if (dashed) line.computeLineDistances();
  }, [line, geometry, material, dashed]);

  useLayoutEffect(() => {
    material.color.set(color);
    material.linewidth = lineWidth;
    material.dashSize = dashSize;
    material.gapSize = gapSize;
    material.transparent = transparent;
    material.opacity = opacity;
    material.resolution.set(size.width, size.height);
  }, [material, color, lineWidth, dashSize, gapSize, transparent, opacity, size.width, size.height]);

  useLayoutEffect(() => {
    // Toggling the dash define changes the program, so it is done only when `dashed` changes.
    if (material.dashed !== dashed) {
      material.dashed = dashed;
      material.needsUpdate = true;
    }
  }, [material, dashed]);

  return <primitive object={line} {...rest} />;
}
