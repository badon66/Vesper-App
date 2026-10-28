// Photos are shrunk in the browser before upload: 1600 px on the long edge,
// re-encoded as JPEG, which also drops the location data a phone camera
// writes into the file. They upload straight from the phone into the
// uploader's own folder in the private lead-photos bucket, while the rest of
// the form is still being filled in.
export const PHOTO_BUCKET = "lead-photos";
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_QUALITY = 0.82;
export const MAX_PHOTOS_PER_FORM = 6;
export const PHOTO_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

export function fitWithin(width: number, height: number, maxEdge = PHOTO_MAX_EDGE) {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function photoPath(userId: string, photoId: string): string {
  return `${userId}/${photoId}.jpg`;
}

export function isOwnPhotoPath(path: string, userId: string): boolean {
  return PHOTO_PATH_PATTERN.test(path) && path.startsWith(`${userId}/`);
}

// Browser only.
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  const decoded = await decode(file);
  try {
    const size = fitWithin(decoded.width, decoded.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This phone could not prepare the photo.");
    context.drawImage(decoded.source, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITY),
    );
    if (!blob) throw new Error("This phone could not prepare the photo.");
    return blob;
  } finally {
    decoded.release();
  }
}

async function decode(file: Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall back to an image element below.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("That file isn't a photo this phone can read.");
  }
}
