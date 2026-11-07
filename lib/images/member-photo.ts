const MAX_PHOTO_BYTES = 350 * 1024;
const MAX_PHOTO_EDGE = 1280;

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) return createImageBitmap(file);

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Resizes large member photos in the browser before uploading them. The server
 * still validates the resulting bytes; this function only reduces storage and
 * transfer usage on the free production tier.
 */
export async function prepareMemberPhoto(file: File): Promise<File> {
  if (file.size <= MAX_PHOTO_BYTES) return file;

  const image = await loadImage(file);
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if ('close' in image && typeof image.close === 'function') image.close();

  let blob: Blob | null = null;
  for (const quality of [0.82, 0.7, 0.58]) {
    blob = await canvasBlob(canvas, quality);
    if (blob && blob.size <= MAX_PHOTO_BYTES) break;
  }
  if (!blob) throw new Error('Photo conversion failed');

  return new File([blob], 'member-photo.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}
