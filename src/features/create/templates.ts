/**
 * Memo Create — the layout vocabulary.
 *
 * A collage template is a set of slots in UNIT space (0..1 on both axes);
 * everything that renders one — the mini template previews, the editor
 * canvas, and the Skia exporter — maps those unit rects into its own pixel
 * box with `slotRects`, so all three stay geometrically identical by
 * construction.
 */

export type UnitRect = { x: number; y: number; w: number; h: number };

export interface CollageTemplate {
  id: string;
  name: string;
  slots: UnitRect[];
}

/** Export/canvas aspect ratios (Instagram's supported post shapes). */
export interface CanvasRatio {
  id: string;
  label: string;
  width: number;
  height: number;
  /** Export pixel size (longest edge tuned to IG's 1080 pipeline). */
  exportWidth: number;
  exportHeight: number;
}

export const CANVAS_RATIOS: CanvasRatio[] = [
  { id: "square", label: "1:1", width: 1, height: 1, exportWidth: 1080, exportHeight: 1080 },
  { id: "portrait", label: "4:5", width: 4, height: 5, exportWidth: 1080, exportHeight: 1350 },
  { id: "story", label: "9:16", width: 9, height: 16, exportWidth: 1080, exportHeight: 1920 },
];

export const ratioById = (id: string): CanvasRatio =>
  CANVAS_RATIOS.find((ratio) => ratio.id === id) ?? CANVAS_RATIOS[0]!;

const half = 0.5;
const third = 1 / 3;

export const COLLAGE_TEMPLATES: CollageTemplate[] = [
  {
    id: "solo",
    name: "Single",
    slots: [{ x: 0, y: 0, w: 1, h: 1 }],
  },
  {
    id: "duo-v",
    name: "Side by side",
    slots: [
      { x: 0, y: 0, w: half, h: 1 },
      { x: half, y: 0, w: half, h: 1 },
    ],
  },
  {
    id: "duo-h",
    name: "Stacked",
    slots: [
      { x: 0, y: 0, w: 1, h: half },
      { x: 0, y: half, w: 1, h: half },
    ],
  },
  {
    id: "hero-left",
    name: "Hero left",
    slots: [
      { x: 0, y: 0, w: half, h: 1 },
      { x: half, y: 0, w: half, h: half },
      { x: half, y: half, w: half, h: half },
    ],
  },
  {
    id: "hero-top",
    name: "Hero top",
    slots: [
      { x: 0, y: 0, w: 1, h: half },
      { x: 0, y: half, w: half, h: half },
      { x: half, y: half, w: half, h: half },
    ],
  },
  {
    id: "triptych",
    name: "Triptych",
    slots: [
      { x: 0, y: 0, w: third, h: 1 },
      { x: third, y: 0, w: third, h: 1 },
      { x: 2 * third, y: 0, w: third, h: 1 },
    ],
  },
  {
    id: "quad",
    name: "Quad",
    slots: [
      { x: 0, y: 0, w: half, h: half },
      { x: half, y: 0, w: half, h: half },
      { x: 0, y: half, w: half, h: half },
      { x: half, y: half, w: half, h: half },
    ],
  },
  {
    id: "hero-quad",
    name: "Feature",
    slots: [
      { x: 0, y: 0, w: 2 * third, h: 1 },
      { x: 2 * third, y: 0, w: third, h: third },
      { x: 2 * third, y: third, w: third, h: third },
      { x: 2 * third, y: 2 * third, w: third, h: third },
    ],
  },
  {
    id: "six",
    name: "Six",
    slots: [
      { x: 0, y: 0, w: half, h: third },
      { x: half, y: 0, w: half, h: third },
      { x: 0, y: third, w: half, h: third },
      { x: half, y: third, w: half, h: third },
      { x: 0, y: 2 * third, w: half, h: third },
      { x: half, y: 2 * third, w: half, h: third },
    ],
  },
  {
    id: "nine",
    name: "Grid",
    slots: Array.from({ length: 9 }, (_, i) => ({
      x: (i % 3) * third,
      y: Math.floor(i / 3) * third,
      w: third,
      h: third,
    })),
  },
];

export const templateById = (id: string): CollageTemplate =>
  COLLAGE_TEMPLATES.find((template) => template.id === id) ??
  COLLAGE_TEMPLATES[0]!;

export type PixelRect = { x: number; y: number; width: number; height: number };

/**
 * Unit slots → pixel rects inside a canvas, with a uniform gap: the canvas
 * is padded by gap/2 and every slot inset by gap/2, so neighbouring slots
 * end up exactly `gap` apart and the outer border matches.
 */
export const slotRects = (
  template: CollageTemplate,
  canvasWidth: number,
  canvasHeight: number,
  gap: number,
): PixelRect[] => {
  const pad = gap / 2;
  const innerW = canvasWidth - gap;
  const innerH = canvasHeight - gap;
  return template.slots.map((slot) => ({
    x: pad + slot.x * innerW + pad,
    y: pad + slot.y * innerH + pad,
    width: slot.w * innerW - gap,
    height: slot.h * innerH - gap,
  }));
};
