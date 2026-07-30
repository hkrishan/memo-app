/**
 * Memo Create Studio — the document model.
 *
 * A studio project is a freeform, layered, multi-page canvas (the SCRL
 * idea): one continuous strip of 1..10 pages that images and text sit on
 * anywhere — including across page boundaries — exported page-by-page so
 * the posted carousel swipes seamlessly.
 *
 * Every coordinate in this model is in DOC PIXELS: one page is exactly
 * `exportWidth x exportHeight` (1080-class, from CANVAS_RATIOS), the strip
 * is `pageCount * exportWidth` wide. Export applies no scaling at all;
 * the editor preview applies exactly one multiplier
 * (`previewPageWidth / exportWidth`). That single-scale contract is what
 * keeps what-you-see and what-exports identical (it generalizes v1's
 * PREVIEW_REFERENCE_WIDTH trick).
 */

import { ratioById, slotRects, templateById } from "../templates";
import { lineHeightFor } from "./fonts";
import { coverCropUnitRect } from "./geometry";
import type {
  CarouselProject,
  CollageProject,
  CreateProject,
  SlotPhoto,
} from "../store/createProjectsStore";

/** v1 collage gap/radius were authored against a 360pt preview; doc px
 *  are 1080-wide, so those values scale by exactly 3. */
const V1_TO_DOC = 3;

/** Layer placement: center position in doc px, uniform scale, radians. */
export interface LayerTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

interface LayerBase {
  id: string;
  transform: LayerTransform;
  /** 0..1. Z-order is array order in `StudioProject.layers` (0 = bottom). */
  opacity: number;
}

export interface ImageLayer extends LayerBase {
  type: "image";
  /** { uri, photoId } — photoId is what lets a stale signed URL heal. */
  photo: SlotPhoto;
  /** Intrinsic asset pixels; 0 until known (server photos may omit them). */
  assetWidth: number;
  assetHeight: number;
  /** Frame size in doc px at scale = 1 — the visible rect pre-transform. */
  baseWidth: number;
  baseHeight: number;
  /** Source crop in UNIT space of the asset (0..1). Cover-fit crops are
   *  expressible here, which is what makes v1-draft conversion lossless. */
  crop: { x: number; y: number; w: number; h: number };
  /** Doc px, applied to the frame pre-scale (so it scales with the layer,
   *  exactly like borderRadius on the preview view does). */
  cornerRadius: number;
  /** What to do when the asset's real pixel size is discovered late:
   *  "natural" (freeform adds) reshapes the frame to the photo's aspect;
   *  "cover" (template/carousel conversions) keeps the frame and derives
   *  a cover crop instead. */
  fitMode: "natural" | "cover";
}

export type FontFamilyId = "inter" | "pacifico" | "playfair" | "bebas" | "dmmono";

export interface TextLayer extends LayerBase {
  type: "text";
  text: string;
  fontFamily: FontFamilyId;
  fontWeight: 400 | 600 | 700;
  /** Doc px (≈ px on the exported 1080-wide page). */
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  /** Always written explicitly at creation — never renderer defaults —
   *  so preview and export lay out identically. */
  lineHeightMultiplier: number;
  letterSpacing: number;
  /** Wrap width in doc px at scale = 1; height derives from layout. */
  maxWidth: number;
  /** Optional pill behind the text, SCRL-style. */
  background: {
    color: string;
    cornerRadius: number;
    padX: number;
    padY: number;
  } | null;
  /** Last measured paragraph height in doc px (derived, cached by the
   *  canvas so selection chrome has a box before fonts finish loading). */
  measuredHeight?: number;
}

export type Layer = ImageLayer | TextLayer;

export type Background =
  | { type: "solid"; color: string }
  | { type: "gradient"; from: string; to: string; angle: number };

export interface StudioProject {
  id: string;
  type: "studio";
  version: 1;
  ratioId: string;
  pageCount: number;
  background: Background;
  layers: Layer[];
  createdAt: string;
  updatedAt: string;
}

export const MAX_PAGES = 10;

/** Doc-px size of one page for a ratio (1080-class export size). */
export const pageSizeFor = (
  ratioId: string,
): { width: number; height: number } => {
  const ratio = ratioById(ratioId);
  return { width: ratio.exportWidth, height: ratio.exportHeight };
};

let layerCounter = 0;
export const newLayerId = (): string => `layer-${Date.now()}-${layerCounter++}`;

export const newStudioProject = (
  id: string,
  ratioId: string,
  pageCount: number,
  backgroundColor = "#FFFFFF",
): StudioProject => {
  const now = new Date().toISOString();
  return {
    id,
    type: "studio",
    version: 1,
    ratioId,
    pageCount: Math.min(Math.max(pageCount, 1), MAX_PAGES),
    background: { type: "solid", color: backgroundColor },
    layers: [],
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * A fresh image layer for a picked photo: full (uncropped) frame at the
 * photo's own aspect, sized to a fraction of a page. Unknown dimensions
 * fall back to 4:5 and self-correct once the preview image reports its
 * real size (see ImageLayerView).
 */
export const imageLayerForPhoto = (
  photo: SlotPhoto,
  assetWidth: number,
  assetHeight: number,
  ratioId: string,
  centerX: number,
  centerY: number,
): ImageLayer => {
  const page = pageSizeFor(ratioId);
  const aspect =
    assetWidth > 0 && assetHeight > 0 ? assetHeight / assetWidth : 5 / 4;
  const baseWidth = Math.round(page.width * 0.62);
  const baseHeight = Math.min(
    Math.round(baseWidth * aspect),
    Math.round(page.height * 0.8),
  );
  return {
    id: newLayerId(),
    type: "image",
    photo,
    assetWidth,
    assetHeight,
    baseWidth,
    baseHeight,
    crop: { x: 0, y: 0, w: 1, h: 1 },
    cornerRadius: 0,
    fitMode: "natural",
    opacity: 1,
    transform: { x: centerX, y: centerY, scale: 1, rotation: 0 },
  };
};

/** Everything the text entry overlay decides; the factory fills in the
 *  explicit layout constants (parity requires they're never defaulted by
 *  a renderer). */
export interface TextDraft {
  text: string;
  fontFamily: FontFamilyId;
  fontWeight: 400 | 600 | 700;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  background: TextLayer["background"];
}

export const textLayerFromDraft = (
  draft: TextDraft,
  ratioId: string,
  centerX: number,
  centerY: number,
): TextLayer => {
  const page = pageSizeFor(ratioId);
  return {
    id: newLayerId(),
    type: "text",
    ...draft,
    // Family-specific: script faces need taller lines or their swashes
    // paint outside the line box
    lineHeightMultiplier: lineHeightFor(draft.fontFamily),
    letterSpacing: 0,
    maxWidth: Math.round(page.width * 0.8),
    opacity: 1,
    transform: { x: centerX, y: centerY, scale: 1, rotation: 0 },
  };
};

/**
 * Re-resolve every image layer's signed URL against the live library by
 * photoId (signed R2 GETs rot after ~24h; same healing contract as v1
 * collage drafts). Layers whose photo left the library keep their stored
 * URI as a best effort.
 */
/**
 * Seed a studio project from a v1 collage template: each slot becomes a
 * cover-cropped image layer at exactly its `slotRects` frame, so the
 * starting point matches what the old collage editor rendered — then
 * everything is freeform-editable. Photos are picked FIRST (the picker
 * caps at the slot count); fewer picks than slots just leave gaps.
 */
export const projectFromTemplate = (
  id: string,
  templateId: string,
  ratioId: string,
  photos: (SlotPhoto & { width?: number; height?: number })[],
): StudioProject => {
  const template = templateById(templateId);
  const page = pageSizeFor(ratioId);
  const gap = 4 * V1_TO_DOC;
  const cornerRadius = 8 * V1_TO_DOC;
  const rects = slotRects(template, page.width, page.height, gap);
  const project = newStudioProject(id, ratioId, 1);
  const layers: Layer[] = [];
  rects.forEach((rect, i) => {
    const photo = photos[i];
    if (!photo) return;
    layers.push({
      id: newLayerId(),
      type: "image",
      photo: {
        uri: photo.uri,
        photoId: photo.photoId,
        ...(photo.albumId && photo.albumPhotoId
          ? { albumId: photo.albumId, albumPhotoId: photo.albumPhotoId }
          : {}),
      },
      assetWidth: photo.width ?? 0,
      assetHeight: photo.height ?? 0,
      baseWidth: rect.width,
      baseHeight: rect.height,
      crop: coverCropUnitRect(
        photo.width ?? 0,
        photo.height ?? 0,
        rect.width,
        rect.height,
      ),
      cornerRadius,
      fitMode: "cover",
      opacity: 1,
      transform: {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        scale: 1,
        rotation: 0,
      },
    });
  });
  return { ...project, layers };
};

const studioFromCollage = (source: CollageProject): StudioProject => {
  const template = templateById(source.templateId);
  const page = pageSizeFor(source.ratioId);
  const rects = slotRects(
    template,
    page.width,
    page.height,
    source.gap * V1_TO_DOC,
  );
  const layers: Layer[] = [];
  rects.forEach((rect, i) => {
    const slot = source.slots[i];
    if (!slot) return;
    layers.push({
      id: newLayerId(),
      type: "image",
      photo: slot,
      // v1 never stored pixel dimensions; the cover crop derives from the
      // decoded image (preview onLoad / export decode) via fitMode
      assetWidth: 0,
      assetHeight: 0,
      baseWidth: rect.width,
      baseHeight: rect.height,
      crop: { x: 0, y: 0, w: 1, h: 1 },
      cornerRadius: source.cornerRadius * V1_TO_DOC,
      fitMode: "cover",
      opacity: 1,
      transform: {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        scale: 1,
        rotation: 0,
      },
    });
  });
  return {
    id: source.id,
    type: "studio",
    version: 1,
    ratioId: source.ratioId,
    pageCount: 1,
    background: { type: "solid", color: source.background },
    layers,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
};

const studioFromCarousel = (source: CarouselProject): StudioProject => {
  const page = pageSizeFor(source.ratioId);
  const layers: Layer[] = source.photo
    ? [
        {
          id: newLayerId(),
          type: "image",
          photo: source.photo,
          assetWidth: 0,
          assetHeight: 0,
          baseWidth: page.width * source.pages,
          baseHeight: page.height,
          crop: { x: 0, y: 0, w: 1, h: 1 },
          cornerRadius: 0,
          fitMode: "cover",
          opacity: 1,
          transform: {
            x: (page.width * source.pages) / 2,
            y: page.height / 2,
            scale: 1,
            rotation: 0,
          },
        },
      ]
    : [];
  return {
    id: source.id,
    type: "studio",
    version: 1,
    ratioId: source.ratioId,
    pageCount: source.pages,
    background: { type: "solid", color: "#FFFFFF" },
    layers,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
};

/** Visually-lossless upgrade of any v1 draft; studio projects pass through.
 *  Keeps the source's id, so upserting replaces the old record. */
export const convertToStudio = (project: CreateProject): StudioProject => {
  switch (project.type) {
    case "studio":
      return project;
    case "collage":
      return studioFromCollage(project);
    case "carousel":
      return studioFromCarousel(project);
  }
};

export const healStudioProject = (
  project: StudioProject,
  libraryPhotos: { photoId: string; url: string }[],
): StudioProject => {
  let changed = false;
  const layers = project.layers.map((layer) => {
    if (layer.type !== "image" || !layer.photo.photoId) return layer;
    const fresh = libraryPhotos.find(
      (p) => p.photoId === layer.photo.photoId,
    );
    if (!fresh || fresh.url === layer.photo.uri) return layer;
    changed = true;
    return { ...layer, photo: { ...layer.photo, uri: fresh.url } };
  });
  return changed ? { ...project, layers } : project;
};

/** Album ids referenced by album-picked layers — what album healing fetches. */
export const referencedAlbumIds = (project: StudioProject): string[] => [
  ...new Set(
    project.layers.flatMap((layer) =>
      layer.type === "image" && layer.photo.albumId && layer.photo.albumPhotoId
        ? [layer.photo.albumId]
        : [],
    ),
  ),
];

/** Same contract as healStudioProject, for album-picked layers. */
export const healAlbumPhotos = (
  project: StudioProject,
  albumPhotosByAlbum: Record<string, { photoId: string; url: string }[]>,
): StudioProject => {
  let changed = false;
  const layers = project.layers.map((layer) => {
    if (
      layer.type !== "image" ||
      !layer.photo.albumId ||
      !layer.photo.albumPhotoId
    ) {
      return layer;
    }
    const fresh = albumPhotosByAlbum[layer.photo.albumId]?.find(
      (p) => p.photoId === layer.photo.albumPhotoId,
    );
    if (!fresh || fresh.url === layer.photo.uri) return layer;
    changed = true;
    return { ...layer, photo: { ...layer.photo, uri: fresh.url } };
  });
  return changed ? { ...project, layers } : project;
};
