/**
 * Memo Create Studio — drag snapping.
 *
 * Snap lines are built on the JS thread when a gesture starts (they only
 * depend on page geometry, and later other layers' edges); the solver is a
 * worklet the pan handler calls per frame. Everything is in DOC px — the
 * caller converts the threshold from preview px once.
 */

export interface SnapLines {
  xs: number[];
  ys: number[];
}

/** Page boundaries + page centers (x), canvas top/middle/bottom (y). */
export const buildSnapLines = (
  pageCount: number,
  pageWidth: number,
  pageHeight: number,
): SnapLines => {
  const xs: number[] = [];
  for (let page = 0; page <= pageCount; page++) xs.push(page * pageWidth);
  for (let page = 0; page < pageCount; page++)
    xs.push(page * pageWidth + pageWidth / 2);
  return { xs, ys: [0, pageHeight / 2, pageHeight] };
};

/**
 * Page lines + the OTHER layers' edges and centers (their axis-aligned
 * boxes), so dragging aligns layers to each other the way pro editors do.
 * Built per-layer (excluding itself) whenever the doc changes — never per
 * frame.
 */
export const buildSnapLinesForLayer = (
  base: SnapLines,
  others: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }[],
): SnapLines => {
  const xs = [...base.xs];
  const ys = [...base.ys];
  for (const box of others) {
    xs.push(box.minX, (box.minX + box.maxX) / 2, box.maxX);
    ys.push(box.minY, (box.minY + box.maxY) / 2, box.maxY);
  }
  return { xs, ys };
};

export interface SnapResult {
  x: number;
  y: number;
  /** Snapped-to line, or -1 when free — drives the guide overlays. */
  guideX: number;
  guideY: number;
}

/**
 * Snaps the dragged layer's center so that its center OR either edge
 * lands on a line (edge alignment is what makes layer-to-layer snapping
 * feel professional). Half-extents are the layer's current unrotated box.
 * Best match within the threshold wins.
 */
export const snapPoint = (
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  lines: SnapLines,
  threshold: number,
): SnapResult => {
  "worklet";
  let outX = x;
  let guideX = -1;
  let bestX = threshold;
  for (const line of lines.xs) {
    for (const offset of [0, -halfW, halfW]) {
      const distance = Math.abs(x + offset - line);
      if (distance < bestX) {
        bestX = distance;
        outX = line - offset;
        guideX = line;
      }
    }
  }
  let outY = y;
  let guideY = -1;
  let bestY = threshold;
  for (const line of lines.ys) {
    for (const offset of [0, -halfH, halfH]) {
      const distance = Math.abs(y + offset - line);
      if (distance < bestY) {
        bestY = distance;
        outY = line - offset;
        guideY = line;
      }
    }
  }
  return { x: outX, y: outY, guideX, guideY };
};

/** Rotation snap: lock to 45° multiples inside a small capture window. */
export const snapRotation = (
  rotation: number,
  captureRadians: number,
): { rotation: number; snapped: boolean } => {
  "worklet";
  const step = Math.PI / 4;
  const nearest = Math.round(rotation / step) * step;
  if (Math.abs(rotation - nearest) < captureRadians) {
    return { rotation: nearest, snapped: true };
  }
  return { rotation, snapped: false };
};
