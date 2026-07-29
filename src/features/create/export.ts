/**
 * Memo Create — the carousel splitter's export + the shared Skia→Photos
 * plumbing (image decode, JPEG temp files, camera-roll save) that the
 * Studio exporter reuses. Everything renders offscreen at Instagram
 * resolution (1080-class), so output never depends on preview size or
 * pixel density.
 */

import { ImageFormat, Skia, type SkImage } from "@shopify/react-native-skia";
import * as MediaLibrary from "expo-media-library";
import {
  cacheDirectory,
  deleteAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";

import { ratioById } from "./templates";
import type { CarouselProject } from "./store/createProjectsStore";

const JPEG_QUALITY = 92;

/** Decode a local or remote (signed URL) image into a Skia image. */
export const loadImage = async (uri: string): Promise<SkImage> => {
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

/** Encode a surface snapshot to a JPEG temp file; returns its file:// URI. */
export const surfaceToTempFile = async (
  snapshot: SkImage,
  name: string,
): Promise<string> => {
  const base64 = snapshot.encodeToBase64(ImageFormat.JPEG, JPEG_QUALITY);
  const fileUri = `${cacheDirectory}${name}.jpg`;
  await writeAsStringAsync(fileUri, base64, { encoding: "base64" });
  return fileUri;
};

/** Saves rendered pages to the device Photos library, cleaning temp files. */
export const saveToPhotos = async (fileUris: string[]): Promise<void> => {
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
        `memo-carousel-${stamp}-${page + 1}`,
      ),
    );
  }
  // Save REVERSED: Instagram's picker sorts by save time (newest first),
  // so page 1 must be saved last to appear first — tapping left-to-right
  // then selects pages in posting order. Filename numbering can't do this;
  // the picker ignores names.
  await saveToPhotos([...fileUris].reverse());
};
