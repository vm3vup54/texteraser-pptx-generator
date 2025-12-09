
import { Slide, SlideStatus } from "../types";

// Declare global PptxGenJS from CDN
declare const PptxGenJS: any;

const SLIDE_WIDTH_INCH = 10;
const SLIDE_HEIGHT_INCH = 5.625;

/**
 * Helper to load an image and get its dimensions
 */
const getImageDimensions = (base64: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = (e) => reject(e);
    img.src = base64;
  });
};

export const downloadPPTX = async (
  slides: Slide[],
  filename: string = "TextEraser_Presentation"
) => {
  if (typeof PptxGenJS === 'undefined') {
    alert("PPTX library not loaded properly.");
    return;
  }

  try {
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_16x9';

    // Sort slides to ensure order? Array order is preserve.
    // We filter out slides that don't have an image (shouldn't happen)
    // We use originalImage as fallback if processed is null (though UI should handle this)
    
    const validSlides = slides.filter(s => s.status !== SlideStatus.ERROR);

    for (const slideData of validSlides) {
        // Determine which image to use. 
        // If status is DONE and we have processedImage, use it.
        // Otherwise use original (e.g. if user skipped processing or reverted).
        const bgImage = slideData.processedImageSrc || slideData.originalImageSrc;
        
        const slide = pres.addSlide();
        
        // 1. Get Dimensions for Aspect Ratio Fit
        const imgDims = await getImageDimensions(bgImage);
        const imgRatio = imgDims.width / imgDims.height;
        const slideRatio = SLIDE_WIDTH_INCH / SLIDE_HEIGHT_INCH;

        let targetW, targetH, targetX, targetY;

        if (imgRatio > slideRatio) {
            targetW = SLIDE_WIDTH_INCH;
            targetH = SLIDE_WIDTH_INCH / imgRatio;
            targetX = 0;
            targetY = (SLIDE_HEIGHT_INCH - targetH) / 2;
        } else {
            targetH = SLIDE_HEIGHT_INCH;
            targetW = SLIDE_HEIGHT_INCH * imgRatio;
            targetY = 0;
            targetX = (SLIDE_WIDTH_INCH - targetW) / 2;
        }

        // 2. Add Background Image
        slide.addImage({ 
            data: bgImage, 
            x: targetX, 
            y: targetY, 
            w: targetW, 
            h: targetH 
        });

        // 3. Add OCR Text
        // Only if we have OCR data
        if (slideData.ocrData && slideData.ocrData.length > 0) {
            slideData.ocrData.forEach((item) => {
                const relW = ((item.box.xmax - item.box.xmin) / 100) * targetW;
                const relH = ((item.box.ymax - item.box.ymin) / 100) * targetH;
                const relX = targetX + (item.box.xmin / 100) * targetW;
                const relY = targetY + (item.box.ymin / 100) * targetH;

                const textLen = item.text.length || 1;
                const boxHeightPts = relH * 72;
                const boxWidthPts = relW * 72;

                const maxFontSizeByHeight = boxHeightPts * 0.75; 
                const estimatedCharFactor = 0.8;
                const maxFontSizeByWidth = boxWidthPts / (Math.max(textLen, 2) * estimatedCharFactor);

                let fontSize = Math.min(maxFontSizeByHeight, maxFontSizeByWidth);
                fontSize = Math.min(fontSize, 32); 
                fontSize = Math.max(fontSize, 9); 

                slide.addText(item.text, {
                    x: relX,
                    y: relY,
                    w: Math.max(relW, 1.0), 
                    h: Math.max(relH, 0.4),
                    fontSize: fontSize, 
                    color: '333333',
                    fill: { color: 'FFFFFF', transparency: 70 }, 
                    align: 'left',
                    valign: 'top', 
                    rectRadius: 0,
                    inset: 0, 
                    wrap: true, 
                });
            });
        }
    }

    await pres.writeFile({ fileName: `${filename}.pptx` });

  } catch (error) {
    console.error("PPTX Generation Error:", error);
    alert("Failed to generate PPTX. See console for details.");
  }
};
