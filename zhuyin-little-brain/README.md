# Zhuyin Little Brain

Independent Next.js MVP for a web version of ReadingWithPinyin, prepared for Vercel.

## Current MVP

- Upload an image with Chinese text
- Run OCR in the browser using `tesseract.js`
- Load the original `word4k.tsv` dictionary from the Android project
- Only annotate characters that exist in the dictionary
- Overlay zhuyin labels on top of the uploaded image

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Vercel

1. Create a new Vercel project from this folder or repo.
2. Deploy directly. No environment variables are required for the current MVP.

## Suggested next steps

- Add camera capture mode for mobile browsers
- Tune OCR preprocessing for screenshots vs printed pages
- Add tap-to-freeze interactions similar to the Android version
- Save scans and annotations for review
