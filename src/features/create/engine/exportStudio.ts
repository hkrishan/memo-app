/**
 * Memo Create Studio — export.
 *
 * Renders each page as its own offscreen surface (a full 10-page strip at
 * 1080x1920 would be ~80MB of surface — per page is ~8MB) with the shared
 * `drawDocument` behind a translate, so pages are guaranteed to line up
 * edge-to-edge. Every source image is decoded exactly once and reused
 * across pages AND the cover.
 *
 * Camera-roll pages are saved in REVERSE order: the camera roll (and
 * Instagram's picker) sorts by save time, newest first, so saving page N
 * first makes page 1 the newest — tapping left-to-right in Instagram then
 * selects pages in posting order.
 *
 * The cover (see cover.ts) is rendered to a temp file and returned — the
 * caller uploads it to the Memo library / an album and deletes the temp.
 */

import { Skia } from "@shopify/react-native-skia";
import type { SkImage, SkParagraph } from "@shopify/react-native-skia";

import { loadImage, saveToPhotos, surfaceToTempFile } from "../export";
import { renderStudioCover } from "./cover";
import {
  pageSizeFor,
  type StudioProject,
  type TextLayer,
} from "./document";
import { getFontProvider } from "./fonts";
import { buildParagraph } from "./paragraph";
import { drawDocument } from "./render";

export interface StudioExportOptions {
  /** Save the clean, badge-free pages for posting to Instagram. */
  saveToCameraRoll: boolean;
  /** Render the badged cover (the in-app record); returned as a temp file. */
  renderCover: boolean;
  onProgress?: (label: string) => void;
}

export interface StudioExportResult {
  /** Temp JPEG of the cover; caller uploads then deletes it. */
  coverFileUri: string | null;
}

export const exportStudioProject = async (
  project: StudioProject,
  options: StudioExportOptions,
): Promise<StudioExportResult> => {
  const page = pageSizeFor(project.ratioId);

  const uris = [
    ...new Set(
      project.layers
        .filter((layer) => layer.type === "image")
        .map((layer) => layer.photo.uri),
    ),
  ];
  const images = await Promise.all(uris.map((uri) => loadImage(uri)));
  const imagesByUri = new Map<string, SkImage>(
    uris.map((uri, i) => [uri, images[i]!]),
  );

  // Same font provider as the live canvas — text can't drift
  const textLayers = project.layers.filter(
    (layer): layer is TextLayer => layer.type === "text",
  );
  const paragraphsById = new Map<string, SkParagraph>();
  if (textLayers.length > 0) {
    const provider = await getFontProvider();
    for (const layer of textLayers) {
      paragraphsById.set(layer.id, buildParagraph(layer, provider));
    }
  }

  if (options.saveToCameraRoll) {
    const fileUris: string[] = [];
    const stamp = Date.now();
    for (let index = 0; index < project.pageCount; index++) {
      options.onProgress?.(
        `Rendering page ${index + 1} of ${project.pageCount}…`,
      );
      const surface = Skia.Surface.MakeOffscreen(page.width, page.height);
      if (!surface) throw new Error("Could not create export surface");
      const canvas = surface.getCanvas();
      canvas.translate(-index * page.width, 0);
      drawDocument(canvas, project, imagesByUri, paragraphsById, {
        x0: index * page.width,
        x1: (index + 1) * page.width,
      });
      surface.flush();
      fileUris.push(
        await surfaceToTempFile(
          surface.makeImageSnapshot(),
          `memo-studio-${stamp}-${index + 1}`,
        ),
      );
    }
    await saveToPhotos([...fileUris].reverse());
  }

  let coverFileUri: string | null = null;
  if (options.renderCover) {
    options.onProgress?.("Creating cover…");
    coverFileUri = await renderStudioCover(
      project,
      imagesByUri,
      paragraphsById,
    );
  }

  return { coverFileUri };
};
