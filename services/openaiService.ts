/**
 * Service to handle Image Editing via Smart Diffusion (Pixel Diffusion).
 */

export type InpaintMode = 'chart' | 'photo';

/**
 * Iterative Diffusion.
 * 
 * @param preserveContent If true, it treats the existing pixels in the hole as an "initial guess" 
 * and blends them with neighbors (Seam Healing / Blur). 
 * If false, it clears the hole first and fills from edges (Space Filling).
 */
const sharpDiffusion = (
  data: Uint8ClampedArray,
  mData: Uint8ClampedArray,
  width: number,
  height: number,
  maxPasses: number,
  preserveContent: boolean = false
) => {
  const todoPixels: number[] = [];
  
  // Init
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // Mask Logic: Transparent (Alpha < 128) in mask image means "Erase this"
      if (mData[idx + 3] < 128) { 
        todoPixels.push(idx);
        if (!preserveContent) {
            data[idx + 3] = 0; // Clear pixel (Chart mode)
        }
      }
    }
  }

  let remaining = todoPixels.length;
  let pass = 0;

  // For Chart mode, we want many passes to fill large voids.
  // For Photo mode (Seam Healing), we usually start with a guess, so fewer passes are needed to blend.
  
  while (remaining > 0 && pass < maxPasses) {
    let filledCount = 0;
    const newFilled: Map<number, Uint8ClampedArray> = new Map();

    for (let i = 0; i < todoPixels.length; i++) {
      const idx = todoPixels[i];
      if (idx === -1) continue; 

      const pIdx = idx / 4;
      const x = pIdx % width;
      const y = Math.floor(pIdx / width);

      let r = 0, g = 0, b = 0, count = 0;

      // Check neighbors
      const neighbors = [
        [x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y],
        [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1]
      ];

      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = (ny * width + nx) * 4;
          
          // Validity Check:
          // If preserveContent is true, all pixels are "valid" (alpha 255), so we blur everything.
          // If preserveContent is false, we only look at pixels that have been filled (alpha > 0).
          if (data[nIdx + 3] > 0) { 
            r += data[nIdx];
            g += data[nIdx + 1];
            b += data[nIdx + 2];
            count++;
          }
        }
      }

      if (count > 0) {
        newFilled.set(idx, new Uint8ClampedArray([
          Math.round(r / count),
          Math.round(g / count),
          Math.round(b / count),
          255
        ]));
      }
    }

    for (const [idx, color] of newFilled.entries()) {
      data[idx] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = color[3]; 
      
      // If we are just filling empty space, remove from todo once filled.
      // If we are smoothing (preserveContent), we might want to keep refining it?
      // For performance, we treat it as "done for this pass" but in standard diffusion 
      // we usually iterate the whole set. Here we stick to simple logic:
      // In 'preserveContent' mode, this loop acts as a Box Blur.
      if (!preserveContent) {
          const listIdx = todoPixels.indexOf(idx);
          if (listIdx !== -1) todoPixels[listIdx] = -1;
      }
      filledCount++;
    }

    if (preserveContent) {
        // In smoothing mode, we process all pixels every pass to diffuse color
        // No reduction in 'remaining' until maxPasses hit.
    } else {
        remaining -= filledCount;
        if (filledCount === 0) break;
    }
    
    pass++;
  }
};

/**
 * Hierarchical Diffusion Inpainting.
 * 
 * Solves the inpainting problem from Coarse to Fine.
 * 1. Downscale to 12.5%. Fill hole with global color average.
 * 2. Upscale to 25%. Use previous result as initial guess. Blur to blend seams.
 * 3. Upscale to 50%...
 * 4. Upscale to 100%...
 * 
 * This ensures large structures (sky gradients) are consistent, while edges are sharp.
 */
const hierarchicalInpaint = (
  ctx: CanvasRenderingContext2D,
  maskCtx: CanvasRenderingContext2D,
  width: number,
  height: number
) => {
  // Steps: 1/8 -> 1/4 -> 1/2 -> 1/1
  const scales = [0.125, 0.25, 0.5, 1.0];
  
  let lastCanvas: HTMLCanvasElement | null = null;

  scales.forEach((scale, index) => {
      const sw = Math.ceil(width * scale);
      const sh = Math.ceil(height * scale);
      
      const sCanvas = document.createElement('canvas');
      sCanvas.width = sw;
      sCanvas.height = sh;
      const sCtx = sCanvas.getContext('2d');
      if (!sCtx) return;

      // 1. Draw Original Image at this scale
      sCtx.drawImage(ctx.canvas, 0, 0, sw, sh);
      
      // 2. Prepare Mask at this scale
      const mCanvas = document.createElement('canvas');
      mCanvas.width = sw;
      mCanvas.height = sh;
      const mCtx = mCanvas.getContext('2d');
      if (!mCtx) return;
      mCtx.drawImage(maskCtx.canvas, 0, 0, sw, sh);
      
      // 3. If we have a Low-Res Guess, inject it into the hole
      if (lastCanvas) {
          // Draw the low-res result scaled up (this creates the smooth gradient base)
          const guessCanvas = document.createElement('canvas');
          guessCanvas.width = sw;
          guessCanvas.height = sh;
          const gCtx = guessCanvas.getContext('2d');
          if (!gCtx) return;
          
          gCtx.imageSmoothingEnabled = true;
          gCtx.imageSmoothingQuality = 'high';
          gCtx.drawImage(lastCanvas, 0, 0, sw, sh);

          const guessData = gCtx.getImageData(0,0,sw,sh).data;
          const currentData = sCtx.getImageData(0,0,sw,sh);
          const currentMaskData = mCtx.getImageData(0,0,sw,sh).data;
          
          for(let i=0; i<guessData.length; i+=4) {
             // If this pixel is part of the hole (Transparent in Mask)
             if (currentMaskData[i+3] < 128) { 
                 // Replace original (which is probably text/garbage) with our smooth guess
                 currentData.data[i] = guessData[i];
                 currentData.data[i+1] = guessData[i+1];
                 currentData.data[i+2] = guessData[i+2];
                 currentData.data[i+3] = 255;
             }
          }
          sCtx.putImageData(currentData, 0, 0);
      }

      // 4. Run Diffusion
      // If index is 0 (Smallest), we run in "Fill Mode" (preserveContent = false) to fill from edges.
      // If index > 0, we have a Guess, so we run in "Heal Mode" (preserveContent = true) to blend seams.
      
      const imgD = sCtx.getImageData(0,0,sw,sh);
      const maskD = mCtx.getImageData(0,0,sw,sh);
      
      const isBaseLayer = (index === 0);
      const passes = isBaseLayer ? 50 : 15; // More passes for base fill, fewer for blending
      
      sharpDiffusion(imgD.data, maskD.data, sw, sh, passes, !isBaseLayer);
      
      sCtx.putImageData(imgD, 0, 0);
      lastCanvas = sCanvas;
  });
  
  // 5. Final Composite with Noise
  if (lastCanvas) {
     const finalData = ctx.getImageData(0,0,width,height);
     // The lastCanvas is already 1.0 scale
     const smoothData = lastCanvas.getContext('2d')!.getImageData(0,0,width,height).data;
     const mData = maskCtx.getImageData(0,0,width,height).data;
     
     for(let i=0; i<finalData.data.length; i+=4) {
         if(mData[i+3] < 128) {
             // Add texture to prevent "plastic" look
             const noise = (Math.random() - 0.5) * 12; 
             
             finalData.data[i] = Math.max(0, Math.min(255, smoothData[i] + noise));
             finalData.data[i+1] = Math.max(0, Math.min(255, smoothData[i+1] + noise));
             finalData.data[i+2] = Math.max(0, Math.min(255, smoothData[i+2] + noise));
             finalData.data[i+3] = 255;
         }
     }
     ctx.putImageData(finalData, 0, 0);
  }
};


export const performInpainting = async (
  imageSrc: string,
  maskSrc: string,
  mode: InpaintMode = 'chart'
): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      const mask = new Image();
      
      img.crossOrigin = "Anonymous";
      mask.crossOrigin = "Anonymous";

      let loaded = 0;
      const onLoaded = () => {
        loaded++;
        if (loaded === 2) {
          process();
        }
      };

      img.onload = onLoaded;
      mask.onload = onLoaded;
      img.onerror = (e) => reject(new Error("Failed to load original image"));
      mask.onerror = (e) => reject(new Error("Failed to load mask image"));

      img.src = imageSrc;
      mask.src = maskSrc;

      const process = () => {
        const width = img.width;
        const height = img.height;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject("Canvas error");
        
        ctx.drawImage(img, 0, 0);

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = width;
        maskCanvas.height = height;
        const maskCtx = maskCanvas.getContext('2d');
        if (!maskCtx) return reject("Mask error");
        
        maskCtx.drawImage(mask, 0, 0);

        try {
            if (mode === 'photo') {
                // Use the new Hierarchical Diffusion
                // Superior for gradients, skies, and removing large artifacts
                hierarchicalInpaint(ctx, maskCtx, width, height);
            } else {
                // Use the original Sharp Diffusion for charts
                // Good for solid colors and sharp lines
                const imgData = ctx.getImageData(0,0,width,height);
                const maskData = maskCtx.getImageData(0,0,width,height);
                // preserveContent = false (Fill empty space)
                sharpDiffusion(imgData.data, maskData.data, width, height, Math.max(width, height), false);
                ctx.putImageData(imgData, 0, 0);
            }
            
            const resultBase64 = canvas.toDataURL('image/png');
            resolve(resultBase64);
        } catch (e) {
            console.error("Diffusion Algo Failed", e);
            reject(e);
        }
      };

    } catch (error) {
      console.error("Inpainting Error:", error);
      reject(error);
    }
  });
};