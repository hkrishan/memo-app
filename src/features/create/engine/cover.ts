/**
 * Memo Create Studio — the library cover.
 *
 * What lands in the user's Memo photos (and albums) is ONE image that
 * reads as "a creation": multi-page projects render page 1 as a card with
 * the next pages peeking out behind it (the swipe affordance), single
 * pages render full-bleed. The image itself carries NO stamp — the
 * "made with Memo Create" indication is a UI badge the photo tiles draw
 * (see createdCoversStore + MemoCreateBadge). The clean pages still go to
 * the camera roll for posting; the cover is the in-app record.
 */

import {
  ClipOp,
  Skia,
  type SkCanvas,
  type SkImage,
  type SkParagraph,
} from "@shopify/react-native-skia";

import { surfaceToTempFile } from "../export";
import { pageSizeFor, type StudioProject } from "./document";
import { drawBackground, drawDocument } from "./render";

/** Stacked-card geometry, in fractions of the page box. */
const CARD_SCALES = [0.78, 0.72, 0.66];
const CARD_X_STEP = 62;
const CARD_SHIFT_LEFT = 36;
const CARD_RADIUS = 36;
const CARD_RIM = 10;

const drawPageCard = (
  canvas: SkCanvas,
  project: StudioProject,
  imagesByUri: Map<string, SkImage>,
  paragraphsById: Map<string, SkParagraph>,
  pageIndex: number,
  pageWidth: number,
  pageHeight: number,
  centerX: number,
  scale: number,
): void => {
  const cardWidth = pageWidth * scale;
  const cardHeight = pageHeight * scale;
  const left = centerX - cardWidth / 2;
  const top = (pageHeight - cardHeight) / 2;
  const rect = Skia.XYWHRect(left, top, cardWidth, cardHeight);

  // White rim so cards separate from the backdrop and each other
  const rim = Skia.Paint();
  rim.setColor(Skia.Color("#FFFFFF"));
  canvas.drawRRect(
    Skia.RRectXY(
      Skia.XYWHRect(
        left - CARD_RIM,
        top - CARD_RIM,
        cardWidth + CARD_RIM * 2,
        cardHeight + CARD_RIM * 2,
      ),
      CARD_RADIUS + CARD_RIM,
      CARD_RADIUS + CARD_RIM,
    ),
    rim,
  );

  canvas.save();
  canvas.clipRRect(
    Skia.RRectXY(rect, CARD_RADIUS, CARD_RADIUS),
    ClipOp.Intersect,
    true,
  );
  canvas.translate(left, top);
  canvas.scale(scale, scale);
  canvas.translate(-pageIndex * pageWidth, 0);
  drawDocument(canvas, project, imagesByUri, paragraphsById, {
    x0: pageIndex * pageWidth,
    x1: (pageIndex + 1) * pageWidth,
  });
  canvas.restore();
};

/**
 * Renders the cover to a temp JPEG; the caller uploads it. Reuses the
 * already-decoded images and built paragraphs from the page export so the
 * cover costs one extra surface, not a second decode pass.
 */
export const renderStudioCover = async (
  project: StudioProject,
  imagesByUri: Map<string, SkImage>,
  paragraphsById: Map<string, SkParagraph>,
): Promise<string> => {
  const page = pageSizeFor(project.ratioId);
  const surface = Skia.Surface.MakeOffscreen(page.width, page.height);
  if (!surface) throw new Error("Could not create cover surface");
  const canvas = surface.getCanvas();

  if (project.pageCount === 1) {
    drawDocument(canvas, project, imagesByUri, paragraphsById, {
      x0: 0,
      x1: page.width,
    });
  } else {
    // Backdrop: the project's own background across one page box
    drawBackground(canvas, project.background, page.width, page.height);
    const scrim = Skia.Paint();
    scrim.setColor(Skia.Color("#FFFFFF"));
    scrim.setAlphaf(0.18);
    canvas.drawRect(Skia.XYWHRect(0, 0, page.width, page.height), scrim);

    // Deepest card first; pages 2..3 peek out to the right of page 1
    const cardCount = Math.min(project.pageCount, CARD_SCALES.length);
    const mainCenterX = page.width / 2 - CARD_SHIFT_LEFT;
    for (let card = cardCount - 1; card >= 0; card--) {
      drawPageCard(
        canvas,
        project,
        imagesByUri,
        paragraphsById,
        card,
        page.width,
        page.height,
        mainCenterX + card * CARD_X_STEP,
        CARD_SCALES[card]!,
      );
    }
  }

  surface.flush();
  return surfaceToTempFile(
    surface.makeImageSnapshot(),
    `memo-studio-cover-${Date.now()}`,
  );
};
