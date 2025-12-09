
// Global declaration for PDF.js loaded via CDN
declare const pdfjsLib: any;

export const convertPdfToImages = async (file: File): Promise<string[]> => {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error("PDF.js library not loaded");
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const images: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    
    // Set scale to ensure good quality (e.g., scale 2.0 = 200% resolution)
    // Standard slides are usually landscape.
    const viewport = page.getViewport({ scale: 2.0 });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (context) {
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      images.push(canvas.toDataURL('image/jpeg', 0.85));
    }
  }

  return images;
};
