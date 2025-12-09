
import React, { useState } from 'react';
import { Slide } from '../types';

interface StepResultProps {
  slide: Slide;
  onRevertToOriginal: () => void;
  onRefine: () => void;
}

const StepResult: React.FC<StepResultProps> = ({ slide, onRevertToOriginal, onRefine }) => {
  const [viewMode, setViewMode] = useState<'processed' | 'original'>('processed');

  // If we don't have a processed image yet (shouldn't happen in Result view ideally, but for safety), show original
  const displayImage = viewMode === 'processed' && slide.processedImageSrc ? slide.processedImageSrc : slide.originalImageSrc;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <div>
           <h2 className="text-lg font-bold text-gray-800">處理完成</h2>
           <p className="text-sm text-gray-500">
             {slide.isRefineMode 
                ? "修補完成" 
                : "文字辨識與背景修補完成"}
           </p>
        </div>
        <div className="flex space-x-2">
            <button 
                onClick={onRevertToOriginal}
                className="px-3 py-1.5 text-red-600 border border-red-200 rounded hover:bg-red-50 text-sm flex items-center"
                title="如果修補效果不好，點擊此處還原。PPTX 將使用原圖當背景，但仍保留文字方塊。"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
                還原至原圖
            </button>

            <button 
                onClick={onRefine}
                className="px-3 py-1.5 bg-orange-50 text-orange-700 border border-orange-200 rounded hover:bg-orange-100 flex items-center text-sm"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l2.846-.813a1.125 1.125 0 00.417-.225l9.75-9.75a1.125 1.125 0 000-1.591l-3-3a1.125 1.125 0 00-1.591 0L7.75 12.016a1.125 1.125 0 00-.225.417l-.813 2.846a1.125 1.125 0 001.321 1.321z" />
                </svg>
                二次修補
            </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Side: Preview */}
        <div className="flex-1 bg-gray-100 flex flex-col p-4 overflow-hidden relative">
           <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex space-x-4 bg-white/80 p-1 rounded-full shadow backdrop-blur-sm z-10">
              <button 
                onClick={() => setViewMode('processed')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${viewMode === 'processed' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                處理後
              </button>
              <button 
                onClick={() => setViewMode('original')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${viewMode === 'original' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                原始圖片
              </button>
           </div>
           
           <div className="flex-1 overflow-auto flex items-center justify-center border rounded-xl bg-white/50 p-2">
               <img src={displayImage} alt="Slide Content" className="max-w-full max-h-full object-contain shadow-lg" />
           </div>
        </div>

        {/* Right Side: OCR Data */}
        <div className="w-80 border-l bg-white flex flex-col overflow-hidden shrink-0">
          <div className="p-3 bg-gray-50 border-b">
            <h3 className="font-bold text-gray-700 text-sm">辨識文字 ({slide.ocrData.length})</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
             {slide.ocrData.length === 0 ? (
               <div className="text-center text-gray-400 mt-10 text-sm">無文字</div>
             ) : (
               slide.ocrData.map((item, idx) => (
                 <div key={idx} className="p-2 border rounded hover:border-blue-400 bg-white group">
                   <div className="text-[10px] text-blue-500 font-mono mb-1 hidden group-hover:block">
                     BOX: {item.box.ymin}-{item.box.xmin}
                   </div>
                   <p className="text-gray-800 text-xs whitespace-pre-wrap">{item.text}</p>
                 </div>
               ))
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StepResult;
