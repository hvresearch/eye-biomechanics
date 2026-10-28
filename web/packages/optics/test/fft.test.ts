import { describe, expect, it } from "vitest";
import { fft2, fftShift } from "../src/image/fft";

function random(n: number, seed = 3): Float64Array {
  let s = seed;
  return Float64Array.from({ length: n }, () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5);
}

describe("fft2", () => {
  it("turns a delta into a flat spectrum", () => {
    const n = 16;
    const re = new Float64Array(n * n);
    const im = new Float64Array(n * n);
    re[0] = 1;
    fft2(re, im, n);
    for (let i = 0; i < n * n; i++) {
      expect(re[i]).toBeCloseTo(1, 14);
      expect(im[i]).toBeCloseTo(0, 14);
    }
  });

  it("round-trips forward then inverse within 1e-10 and obeys Parseval", () => {
    const n = 64;
    const re0 = random(n * n, 5);
    const im0 = random(n * n, 11);
    const re = Float64Array.from(re0);
    const im = Float64Array.from(im0);
    fft2(re, im, n);
    let eT = 0;
    let eF = 0;
    for (let i = 0; i < n * n; i++) {
      eT += re0[i]! ** 2 + im0[i]! ** 2;
      eF += re[i]! ** 2 + im[i]! ** 2;
    }
    expect(Math.abs(eF / (n * n) - eT) / eT).toBeLessThan(1e-9);
    fft2(re, im, n, true);
    for (let i = 0; i < n * n; i++) {
      expect(Math.abs(re[i]! - re0[i]!)).toBeLessThan(1e-10);
      expect(Math.abs(im[i]! - im0[i]!)).toBeLessThan(1e-10);
    }
  });

  it("agrees with a naive DFT on 8×8", () => {
    const n = 8;
    const re0 = random(n * n, 21);
    const im0 = random(n * n, 22);
    const re = Float64Array.from(re0);
    const im = Float64Array.from(im0);
    fft2(re, im, n);
    for (let u = 0; u < n; u++) {
      for (let v = 0; v < n; v++) {
        let sr = 0;
        let si = 0;
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            const a = (-2 * Math.PI * (u * y + v * x)) / n;
            const c = Math.cos(a);
            const s = Math.sin(a);
            sr += re0[y * n + x]! * c - im0[y * n + x]! * s;
            si += re0[y * n + x]! * s + im0[y * n + x]! * c;
          }
        }
        expect(re[u * n + v]).toBeCloseTo(sr, 10);
        expect(im[u * n + v]).toBeCloseTo(si, 10);
      }
    }
  });

  it("rejects lengths that are not powers of two", () => {
    expect(() => fft2(new Float64Array(36), new Float64Array(36), 6)).toThrow(/power of two/);
  });

  it("fftShift moves the origin to the center and is its own inverse", () => {
    const n = 4;
    const a = Float64Array.from({ length: 16 }, (_, i) => i);
    fftShift(a, n);
    expect(a[2 * n + 2]).toBe(0);
    fftShift(a, n);
    expect(Array.from(a)).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });
});
