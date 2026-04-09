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
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(Math.round(image.naturalWidth * scale), 1);
    const height = Math.max(Math.round(image.naturalHeight * scale), 1);
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("無法建立圖片處理畫布。");
    }

    context.drawImage(image, 0, 0, width, height);

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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("圖片讀取失敗。"));
    image.src = src;
  });
}
