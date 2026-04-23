async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("图片像素读取失败"));
    });

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function grayscalePixel(red: number, green: number, blue: number): number {
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

function binaryStringToHex(binary: string): string {
  return binary.match(/.{1,4}/g)?.map((chunk) => Number.parseInt(chunk, 2).toString(16)).join("") || "";
}

export async function createPerceptualHash(file: File): Promise<string> {
  const size = 8;
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  let context:
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;

  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(size, size);
    context = canvas.getContext("2d");
  } else {
    canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    context = canvas.getContext("2d");
  }

  if (!context) {
    throw new Error("浏览器不支持图像指纹计算");
  }

  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    try {
      context.drawImage(bitmap, 0, 0, size, size);
    } finally {
      bitmap.close();
    }
  } else {
    const image = await loadImageElement(file);
    context.drawImage(image, 0, 0, size, size);
  }

  const imageData = context.getImageData(0, 0, size, size);
  const grayscale = [];

  for (let index = 0; index < imageData.data.length; index += 4) {
    grayscale.push(
      grayscalePixel(
        imageData.data[index] ?? 0,
        imageData.data[index + 1] ?? 0,
        imageData.data[index + 2] ?? 0,
      ),
    );
  }

  const average =
    grayscale.reduce((sum, value) => sum + value, 0) / grayscale.length;
  const binary = grayscale
    .map((value) => (value >= average ? "1" : "0"))
    .join("");

  return binaryStringToHex(binary);
}

