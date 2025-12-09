
export enum AppStep {
  API_KEY = 'API_KEY', // New step for entering API Key
  UPLOAD = 'UPLOAD',
  EDITOR = 'EDITOR' // Combined Masking and Result into a main Editor view
}

export enum SlideStatus {
  PENDING = 'PENDING',     // Uploaded, waiting for user to mask/process
  PROCESSING = 'PROCESSING',
  DONE = 'DONE',           // Processed, ready to download
  ERROR = 'ERROR'
}

export interface OCRResult {
  text: string;
  box: {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
  };
}

export interface Slide {
  id: string;
  originalImageSrc: string;
  processedImageSrc: string | null; // Null if not processed yet
  ocrData: OCRResult[];
  status: SlideStatus;
  isRefineMode: boolean; // If true, next process is "Refine" not "OCR+Fill"
}

export interface AppState {
  step: AppStep;
  slides: Slide[];
  activeSlideId: string | null; // The ID of the slide currently shown in the main area
  
  isGlobalProcessing: boolean;
  globalStatusText: string;
  apiKey: string; // Store the user provided API key
}
