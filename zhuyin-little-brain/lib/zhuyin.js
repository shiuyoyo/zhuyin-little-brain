export function buildZhuyinMap(tsvText) {
  const map = new Map();
  const lines = tsvText.split(/\r?\n/);

  for (const line of lines) {
    if (!line) {
      continue;
    }

    const [character, zhuyin] = line.split("\t");

    if (!character || !zhuyin || map.has(character)) {
      continue;
    }

    map.set(character, zhuyin);
  }

  return map;
}

export function isSupportedCharacter(character, zhuyinMap) {
  return zhuyinMap.has(character);
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
