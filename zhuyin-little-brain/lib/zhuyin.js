const COMMON_PRONUNCIATIONS = {
  的: "˙ㄉㄜ",
  風: "ㄈㄥ"
};

export function buildZhuyinMap(tsvText) {
  const rawMap = new Map();
  const lines = tsvText.split(/\r?\n/);

  for (const line of lines) {
    if (!line) {
      continue;
    }

    const [character, zhuyin] = line.split("\t");

    if (!character || !zhuyin) {
      continue;
    }

    const readings = rawMap.get(character) || [];
    readings.push(zhuyin);
    rawMap.set(character, readings);
  }

  const preferredMap = new Map();

  for (const [character, readings] of rawMap.entries()) {
    const preferred = COMMON_PRONUNCIATIONS[character] || readings[readings.length - 1];
    preferredMap.set(character, preferred);
  }

  return preferredMap;
}

export function splitWordIntoCharacterBoxes(word) {
  const characters = Array.from(word.text || "").filter((character) => character.trim());

  if (!characters.length || !word.bbox) {
    return [];
  }

  const { x0, y0, x1, y1 } = word.bbox;
  const width = Math.max(x1 - x0, 1);
  const height = Math.max(y1 - y0, 1);
  const isVertical = height > width * 1.2;

  return characters.map((character, index) => {
    if (isVertical) {
      const charHeight = height / characters.length;
      return {
        character,
        bbox: {
          x0,
          y0: y0 + charHeight * index,
          x1,
          y1: y0 + charHeight * (index + 1)
        }
      };
    }

    const charWidth = width / characters.length;
    return {
      character,
      bbox: {
        x0: x0 + charWidth * index,
        y0,
        x1: x0 + charWidth * (index + 1),
        y1
      }
    };
  });
}

export function createAnnotations(words, zhuyinMap) {
  const annotations = [];

  for (const word of words || []) {
    const characterBoxes = splitWordIntoCharacterBoxes(word);

    for (const item of characterBoxes) {
      const zhuyin = zhuyinMap.get(item.character);

      if (!zhuyin) {
        continue;
      }

      annotations.push({
        character: item.character,
        zhuyin,
        bbox: item.bbox
      });
    }
  }

  return annotations;
}

export async function prepareImageForOcr(file) {
  const previewUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(previewUrl);
    const { width, height } = getOcrDimensions(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      throw new Error("無法建立圖片處理畫布。");
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);
    enhanceForOcr(context, width, height);

    return {
      canvas,
      previewUrl,
      originalSize: {
        width: image.naturalWidth,
        height: image.naturalHeight
      },
      processedSize: {
        width,
        height
      }
    };
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    throw error;
  }
}

function getOcrDimensions(originalWidth, originalHeight) {
  const shortEdge = Math.min(originalWidth, originalHeight);
  const longEdge = Math.max(originalWidth, originalHeight);
  const targetShortEdge = 1200;
  const maxLongEdge = 2400;

  const upscale = targetShortEdge / shortEdge;
  const downscale = maxLongEdge / longEdge;
  const scale = Math.min(Math.max(upscale, 1), Math.max(downscale, 1));

  return {
    width: Math.max(Math.round(originalWidth * scale), 1),
    height: Math.max(Math.round(originalHeight * scale), 1)
  };
}

function enhanceForOcr(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const contrast = 1.28;

  for (let index = 0; index < data.length; index += 4) {
    const luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const contrasted = clamp((luminance - 128) * contrast + 128);

    data[index] = contrasted;
    data[index + 1] = contrasted;
    data[index + 2] = contrasted;
  }

  context.putImageData(imageData, 0, 0);
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("圖片讀取失敗。"));
    image.src = src;
  });
}
