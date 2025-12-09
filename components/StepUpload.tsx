
import React, { useCallback, useState } from 'react';
import { convertPdfToImages } from '../services/pdfService';

interface StepUploadProps {
  onImagesUpload: (images: string[]) => void;
  isLoading: boolean;
}

const StepUpload: React.FC<StepUploadProps> = ({ onImagesUpload, isLoading }) => {
  const [loadingText, setLoadingText] = useState("");

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      await processFiles(Array.from(files));
    }
  };

  const processFiles = async (files: File[]) => {
    setLoadingText("正在讀取檔案...");
    const images: string[] = [];

    for (const file of files) {
      if (file.type === 'application/pdf') {
        setLoadingText(`正在轉換 PDF 頁面: ${file.name}...`);
        try {
            const pdfImages = await convertPdfToImages(file);
            images.push(...pdfImages);
        } catch (e) {
            console.error(e);
            alert(`無法讀取 PDF: ${file.name}`);
        }
      } else if (file.type.startsWith('image/')) {
        // Handle Image
        const base64 = await readFileAsBase64(file);
        if (base64) images.push(base64);
      }
    }

    if (images.length > 0) {
      onImagesUpload(images);
    }
    setLoadingText("");
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await processFiles(Array.from(files));
    }
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (isLoading || loadingText) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
           <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
           <p className="text-gray-600 font-medium">{loadingText || "處理中..."}</p>
        </div>
      );
  }

  return (
    <div 
      className="flex flex-col items-center justify-center h-full min-h-[400px] border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="text-center p-10">
        <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-800 mb-2">上傳檔案</h3>
        <p className="text-gray-500 mb-6">支援多張圖片 (JPG, PNG) 或 PDF 簡報</p>
        
        <label className="relative">
          <input 
            type="file" 
            accept="image/*,application/pdf" 
            multiple
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={handleFileChange}
          />
          <span className="bg-blue-600 text-white px-6 py-2.5 rounded-lg shadow hover:bg-blue-700 transition font-medium">
            選擇檔案
          </span>
        </label>
      </div>
    </div>
  );
};

export default StepUpload;
