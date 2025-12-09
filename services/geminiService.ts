
import { GoogleGenAI, Type } from "@google/genai";
import { OCRResult } from "../types";

/**
 * Helper to get the AI client with the user provided key
 */
const getAiClient = (apiKey: string) => {
  return new GoogleGenAI({ apiKey });
};

/**
 * Helper to load image and get context for pixel checking
 */
const getMaskData = (maskBase64: string): Promise<{ data: Uint8ClampedArray; width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject("Canvas error");
      ctx.drawImage(img, 0, 0);
      resolve({
        data: ctx.getImageData(0, 0, img.width, img.height).data,
        width: img.width,
        height: img.height
      });
    };
    img.onerror = reject;
    img.src = maskBase64;
  });
};

/**
 * Performs OCR using Gemini 2.5 Flash, 
 * then filters results to only include text that falls inside the masked area.
 */
export const performOCR = async (apiKey: string, originalImageBase64: string, maskBase64: string): Promise<OCRResult[]> => {
  if (!apiKey) throw new Error("API Key is missing");
  const ai = getAiClient(apiKey);

  try {
    const cleanBase64 = originalImageBase64.split(',')[1] || originalImageBase64;
    // Reverted to gemini-2.5-flash as requested
    const model = "gemini-2.5-flash";
    
    // 1. Send the FULL ORIGINAL IMAGE to Gemini.
    // Keeping the improved prompt to help Flash model separate text blocks better.
    const prompt = `
      Analyze this image and extract ALL visible text.
      
      CRITICAL INSTRUCTIONS:
      1. Detect **INDIVIDUAL TEXT LINES** or **ISOLATED LABELS**. 
      2. For diagrams and flowcharts, do NOT merge separate text blocks. Keep them distinct.
      3. Return precise bounding boxes (0-1000 scale).
      4. Ensure NO text is missed, especially small labels or legends.
      
      Return JSON array.
    `;

    const [response, maskInfo] = await Promise.all([
      ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            { inlineData: { mimeType: "image/png", data: cleanBase64 } },
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                box: {
                  type: Type.OBJECT,
                  properties: {
                    ymin: { type: Type.INTEGER },
                    xmin: { type: Type.INTEGER },
                    ymax: { type: Type.INTEGER },
                    xmax: { type: Type.INTEGER },
                  },
                  required: ["ymin", "xmin", "ymax", "xmax"]
                }
              },
              required: ["text", "box"]
            }
          }
        }
      }),
      getMaskData(maskBase64)
    ]);

    const jsonText = response.text;
    if (!jsonText) return [];
    
    const parsed = JSON.parse(jsonText) as any[];

    // 2. Filter Results: Keep only text that intersects with the Mask
    
    const filteredResults: OCRResult[] = [];

    parsed.forEach((item: any) => {
      // Convert 0-1000 scale to pixel coordinates
      const xmin = (item.box.xmin / 1000) * maskInfo.width;
      const xmax = (item.box.xmax / 1000) * maskInfo.width;
      const ymin = (item.box.ymin / 1000) * maskInfo.height;
      const ymax = (item.box.ymax / 1000) * maskInfo.height;

      const centerX = Math.floor((xmin + xmax) / 2);
      const centerY = Math.floor((ymin + ymax) / 2);

      // Check the mask pixel at the center of the text box
      const idx = (centerY * maskInfo.width + centerX) * 4;
      const alpha = maskInfo.data[idx + 3];

      // If Alpha is low (Transparent), it means the user masked this area.
      let isMasked = alpha < 50;

      if (!isMasked) {
          // Double check corners
          const idxTL = (Math.floor(ymin) * maskInfo.width + Math.floor(xmin)) * 4;
          const idxBR = (Math.floor(ymax) * maskInfo.width + Math.floor(xmax)) * 4;
          if (maskInfo.data[idxTL+3] < 50 || maskInfo.data[idxBR+3] < 50) {
              isMasked = true;
          }
      }

      if (isMasked) {
        filteredResults.push({
          text: item.text,
          box: {
            ymin: item.box.ymin / 10,
            xmin: item.box.xmin / 10,
            ymax: item.box.ymax / 10,
            xmax: item.box.xmax / 10,
          }
        });
      }
    });

    return filteredResults;

  } catch (error) {
    console.error("OCR Service Error:", error);
    throw error; // Re-throw so UI knows it failed
  }
};

export interface DetectedRegion {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

/**
 * Detects text regions for auto-masking using Gemini 2.5 Flash.
 */
export const detectTextRegions = async (apiKey: string, imageBase64: string): Promise<DetectedRegion[]> => {
  if (!apiKey) throw new Error("API Key is missing");
  const ai = getAiClient(apiKey);
  
  try {
    const cleanBase64 = imageBase64.split(',')[1] || imageBase64;
    // Reverted to gemini-2.5-flash as requested
    const model = "gemini-2.5-flash";
    
    const prompt = `
      Identify all visible text regions in this image.
      Return TIGHT bounding boxes (0-1000 scale) for every distinct text block.
      Do NOT group distant labels together.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/png", data: cleanBase64 } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              ymin: { type: Type.INTEGER },
              xmin: { type: Type.INTEGER },
              ymax: { type: Type.INTEGER },
              xmax: { type: Type.INTEGER },
            },
            required: ["ymin", "xmin", "ymax", "xmax"]
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) return [];
    
    const parsed = JSON.parse(jsonText) as any[];

    return parsed.map(box => ({
        ymin: box.ymin / 10,
        xmin: box.xmin / 10,
        ymax: box.ymax / 10,
        xmax: box.xmax / 10,
    }));

  } catch (error) {
    console.error("Auto Detect Error:", error);
    return [];
  }
};
