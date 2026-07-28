/**
 * Memo Create — export.
 *
 * The editors preview with plain RN views (expo-image: cached, cheap);
 * export re-draws the SAME geometry into an offscreen Skia surface at
 * Instagram resolution (1080-class), so output quality never depends on the
 * preview's on-screen size or pixel density. `slotRects` is the shared
 * geometry, which is what keeps preview and export identical.
 *
 * Every page lands in the device Photos library — that's where Instagram
 * picks media up from.
 */

import {
  ClipOp,
  ImageFormat,
  Skia,
  type SkCanvas,
  type SkImage,
} from "@shopify/react-native-skia";
import * as MediaLibrary from "expo-media-library";
import {
  cacheDirectory,
  deleteAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";

import {
  ratioById,
  slotRects,
  templateById,
  type PixelRect,
} from "./templates";
import type { CollageProject, CarouselProject } from "./store/createProjectsStore";

const JPEG_QUALITY = 92;

/** Decode a local or remote (signed URL) image into a Skia image. */
const loadImage = async (uri: string): Promise<SkImage> => {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error(`Could not decode image: ${uri.slice(0, 80)}`);
  return image;
};

/** drawImageRect src rect for cover-fit of `image` into a w x h box. */
const coverSrcRect = (image: SkImage, width: number, height: number) => {
  const iw = image.width();
  const ih = image.height();
  const scale = Math.max(width / iw, height / ih);
  const cropW = width / scale;
  const cropH = height / scale;
  return Skia.XYWHRect((iw - cropW) / 2, (ih - cropH) / 2, cropW, cropH);
};

const drawCover = (
  canvas: SkCanvas,
  image: SkImage,
  rect: PixelRect,
  cornerRadius: number,
): void => {
  const dst = Skia.XYWHRect(rect.x, rect.y, rect.width, rect.height);
  canvas.save();
  canvas.clipRRect(
    Skia.RRectXY(dst, cornerRadius, cornerRadius),
    ClipOp.Intersect,
    true,
  );
  const paint = Skia.Paint();
  const src = coverSrcRect(image, rect.width, rect.height);
  canvas.drawImageRect(image, src, dst, paint);
  canvas.restore();
};

/** Encode a surface snapshot to a JPEG temp file; returns its file:// URI. */
const surfaceToTempFile = async (
  snapshot: SkImage,
  name: string,
): Promise<string> => {
  const base64 = snapshot.encodeToBase64(ImageFormat.JPEG, JPEG_QUALITY);
  const fileUri = `${cacheDirectory}${name}.jpg`;
  await writeAsStringAsync(fileUri, base64, { encoding: "base64" });
  return fileUri;
};

/** Saves rendered pages to the device Photos library, cleaning temp files. */
const saveToPhotos = async (fileUris: string[]): Promise<void> => {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Photos permission is required to save");
  }
  for (const uri of fileUris) {
    await MediaLibrary.createAssetAsync(uri);
    await deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
};

/**
 * Renders a collage at export resolution and saves it to Photos.
 * Empty slots render as background — the editor gates on fully-filled
 * layouts, so that's belt and braces, not a UX state.
 */
export const exportCollage = async (project: CollageProject): Promise<void> => {
  const ratio = ratioById(project.ratioId);
  const template = templateById(project.templateId);
  const { exportWidth, exportHeight } = ratio;

  const surface = Skia.Surface.MakeOffscreen(exportWidth, exportHeight);
  if (!surface) throw new Error("Could not create export surface");
  const canvas = surface.getCanvas();
  canvas.drawColor(Skia.Color(project.background));

  // The preview canvas is ~screen width; export is 1080-class. Gap and
  // radius are authored in preview points, so scale them with the canvas.
  const scale = exportWidth / PREVIEW_REFERENCE_WIDTH;
  const rects = slotRects(
    template,
    exportWidth,
    exportHeight,
    project.gap * scale,
  );

  const slotImages = await Promise.all(
    project.slots.map((slot) => (slot ? loadImage(slot.uri) : null)),
  );
  slotImages.forEach((image, i) => {
    const rect = rects[i];
    if (image && rect) {
      drawCover(canvas, image, rect, project.cornerRadius * scale);
    }
  });

  surface.flush();
  const fileUri = await surfaceToTempFile(
    surface.makeImageSnapshot(),
    `memo-collage-${Date.now()}`,
  );
  await saveToPhotos([fileUri]);
};

/**
 * Splits one photo into N seamless carousel pages: the source is cover-fit
 * across a virtual canvas N pages wide, and each page exports its slice.
 * Swiping the posted carousel then pans continuously across the photo.
 */
export const exportCarousel = async (
  project: CarouselProject,
): Promise<void> => {
  if (!project.photo) throw new Error("No photo selected");
  const ratio = ratioById(project.ratioId);
  const { exportWidth, exportHeight } = ratio;
  const totalWidth = exportWidth * project.pages;

  const image = await loadImage(project.photo.uri);
  const src = coverSrcRect(image, totalWidth, exportHeight);
  // Slice the SOURCE crop per page — one draw per page, no giant surface
  const srcPageW = src.width / project.pages;

  const fileUris: string[] = [];
  const stamp = Date.now();
  for (let page = 0; page < project.pages; page++) {
    const surface = Skia.Surface.MakeOffscreen(exportWidth, exportHeight);
    if (!surface) throw new Error("Could not create export surface");
    const canvas = surface.getCanvas();
    const pageSrc = Skia.XYWHRect(
      src.x + page * srcPageW,
      src.y,
      srcPageW,
      src.height,
    );
    canvas.drawImageRect(
      image,
      pageSrc,
      Skia.XYWHRect(0, 0, exportWidth, exportHeight),
      Skia.Paint(),
    );
    surface.flush();
    fileUris.push(
      await surfaceToTempFile(
        surface.makeImageSnapshot(),
        // Numbered so the camera roll (and IG's picker) keeps the order
        `memo-carousel-${stamp}-${page + 1}`,
      ),
    );
  }
  await saveToPhotos(fileUris);
};

/**
 * The preview width gap/radius values are authored against. The editor
 * renders its canvas at this logical width (screen width, near enough), so
 * exporting scales those point values by exportWidth / this.
 */
export const PREVIEW_REFERENCE_WIDTH = 360;
