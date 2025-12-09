
import React, { useState, useEffect } from 'react';
import { AppState, AppStep, Slide, SlideStatus } from './types';
import StepUpload from './components/StepUpload';
import StepMasking from './components/StepMasking';
import StepResult from './components/StepResult';
import StepApiKey from './components/StepApiKey';
import ProcessingOverlay from './components/ProcessingOverlay';
import { performOCR } from './services/geminiService';
import { performInpainting, InpaintMode } from './services/openaiService'; 
import { downloadPPTX } from './services/pptxService';
import { v4 as uuidv4 } from 'uuid'; // We need simple ID generation, can use Date.now() if no uuid lib

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>({
    step: AppStep.API_KEY, // Default to API Key step first
    slides: [],
    activeSlideId: null,
    isGlobalProcessing: false,
    globalStatusText: '',
    apiKey: '',
  });

  // Check for stored API Key on Mount
  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) {
      setAppState(prev => ({
        ...prev,
        apiKey: storedKey,
        step: AppStep.UPLOAD // Go to upload if key exists
      }));
    }
  }, []);

  // --- Actions ---

  const handleSaveApiKey = (key: string) => {
    localStorage.setItem('gemini_api_key', key);
    setAppState(prev => ({
      ...prev,
      apiKey: key,
      step: AppStep.UPLOAD
    }));
  };

  const handleClearApiKey = () => {
    localStorage.removeItem('gemini_api_key');
    setAppState({
      step: AppStep.API_KEY,
      slides: [],
      activeSlideId: null,
      isGlobalProcessing: false,
      globalStatusText: '',
      apiKey: ''
    });
  };

  const handleImagesUpload = (images: string[]) => {
    const newSlides: Slide[] = images.map(img => ({
        id: generateId(),
        originalImageSrc: img,
        processedImageSrc: null,
        ocrData: [],
        status: SlideStatus.PENDING,
        isRefineMode: false
    }));

    setAppState(prev => ({
      ...prev,
      step: AppStep.EDITOR,
      slides: [...prev.slides, ...newSlides],
      activeSlideId: prev.activeSlideId || newSlides[0].id // If first upload, select first
    }));
  };

  const deleteSlide = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setAppState(prev => {
          const newSlides = prev.slides.filter(s => s.id !== id);
          let newActiveId = prev.activeSlideId;
          
          if (newSlides.length === 0) {
              return { ...prev, step: AppStep.UPLOAD, slides: [], activeSlideId: null };
          }

          if (id === prev.activeSlideId) {
              newActiveId = newSlides[0].id;
          }
          return { ...prev, slides: newSlides, activeSlideId: newActiveId };
      });
  };

  const handleMaskCancel = () => {
      setAppState(prev => {
        const { activeSlideId, slides } = prev;
        if (!activeSlideId) return prev;

        const idx = slides.findIndex(s => s.id === activeSlideId);
        if (idx === -1) return prev;
        
        const slide = slides[idx];
        
        // If in Refine Mode -> Exit Refine Mode (this switches view back to StepResult)
        if (slide.isRefineMode) {
            const newSlides = [...slides];
            newSlides[idx] = { ...slide, isRefineMode: false };
            return { ...prev, slides: newSlides };
        }

        return prev;
      });
  };

  const handleProcessingStart = async (maskBase64: string, mode: InpaintMode) => {
    const { activeSlideId, slides, apiKey } = appState;
    if (!activeSlideId) return;

    const currentSlideIndex = slides.findIndex(s => s.id === activeSlideId);
    if (currentSlideIndex === -1) return;
    const currentSlide = slides[currentSlideIndex];

    setAppState(prev => ({ ...prev, isGlobalProcessing: true, globalStatusText: '正在初始化...' }));

    try {
      let currentOCRData = currentSlide.ocrData;

      // 1. OCR (Only if not in Refine Mode)
      if (!currentSlide.isRefineMode) {
          setAppState(prev => ({ ...prev, globalStatusText: '正在識別文字 (Gemini OCR)...' }));
          currentOCRData = await performOCR(apiKey, currentSlide.originalImageSrc, maskBase64);
      }

      // 2. Inpainting
      setAppState(prev => ({ ...prev, globalStatusText: mode === 'chart' ? '正在進行色彩擴散...' : '正在進行影像融合...' }));
      const processedImage = await performInpainting(
        currentSlide.isRefineMode && currentSlide.processedImageSrc ? currentSlide.processedImageSrc : currentSlide.originalImageSrc, // Source
        maskBase64,
        mode
      );

      // Update State
      setAppState(prev => {
          const updatedSlides = [...prev.slides];
          updatedSlides[currentSlideIndex] = {
              ...currentSlide,
              processedImageSrc: processedImage,
              ocrData: currentOCRData,
              status: SlideStatus.DONE,
              isRefineMode: false // Reset refine mode after success
          };
          return {
              ...prev,
              isGlobalProcessing: false,
              slides: updatedSlides
          };
      });

    } catch (error: any) {
      console.error(error);
      setAppState(prev => ({ ...prev, isGlobalProcessing: false }));
      alert(`處理失敗: ${error.message}`);
    }
  };

  const handleRefine = () => {
    const { activeSlideId, slides } = appState;
    if (!activeSlideId) return;
    
    setAppState(prev => {
        const idx = prev.slides.findIndex(s => s.id === activeSlideId);
        if (idx === -1) return prev;
        
        const updatedSlides = [...prev.slides];
        updatedSlides[idx] = {
            ...updatedSlides[idx],
            isRefineMode: true
        };
        return { ...prev, slides: updatedSlides };
    });
  };

  const handleRevertToOriginal = () => {
      const { activeSlideId, slides } = appState;
      if (!activeSlideId) return;

      setAppState(prev => {
        const idx = prev.slides.findIndex(s => s.id === activeSlideId);
        if (idx === -1) return prev;
        
        const updatedSlides = [...prev.slides];
        updatedSlides[idx] = {
            ...updatedSlides[idx],
            processedImageSrc: updatedSlides[idx].originalImageSrc, // Revert logic
            status: SlideStatus.DONE,
            isRefineMode: false
        };
        return { ...prev, slides: updatedSlides };
    });
  };

  const handleDownloadAll = () => {
      downloadPPTX(appState.slides, "Presentation_Export");
  };

  const handleResetAll = () => {
      setAppState(prev => ({
        ...prev,
        step: AppStep.UPLOAD,
        slides: [],
        activeSlideId: null,
        isGlobalProcessing: false,
        globalStatusText: ''
      }));
  };

  // --- Render Logic ---

  const activeSlide = appState.slides.find(s => s.id === appState.activeSlideId);

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50 text-gray-900 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b h-14 flex items-center px-4 shadow-sm z-20 justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 w-7 h-7 rounded flex items-center justify-center text-white font-bold text-sm">T</div>
          <h1 className="text-lg font-bold text-gray-800">TextEraser <span className="text-gray-400 font-normal">v2.1 Desktop</span></h1>
        </div>
        
        <div className="flex items-center space-x-4">
             {appState.apiKey && (
                 <button 
                   onClick={handleClearApiKey}
                   className="text-xs text-gray-400 hover:text-gray-600 underline"
                   title="清除儲存的 API Key"
                 >
                   更換 Key
                 </button>
             )}

             {appState.slides.length > 0 && (
                <div className="flex space-x-3">
                    <button 
                        type="button"
                        onClick={handleResetAll} 
                        className="text-gray-500 hover:text-red-500 text-sm px-3 font-medium transition-colors"
                    >
                        全部清空
                    </button>
                    <button 
                        type="button"
                        onClick={handleDownloadAll}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm font-medium flex items-center shadow-sm"
                    >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        下載 PPTX ({appState.slides.length} 頁)
                    </button>
                </div>
             )}
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Step 0: API Key Input */}
        {appState.step === AppStep.API_KEY && (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50">
               <StepApiKey onSave={handleSaveApiKey} />
            </div>
        )}

        {/* Step 1: Upload View (Full Screen if no slides) */}
        {appState.step === AppStep.UPLOAD && (
            <div className="flex-1 p-10 flex flex-col justify-center max-w-4xl mx-auto w-full">
                <h2 className="text-2xl font-bold text-center mb-2">開始您的專案</h2>
                <p className="text-center text-gray-500 mb-8">支援批量圖片上傳與 PDF 檔案匯入</p>
                <StepUpload onImagesUpload={handleImagesUpload} isLoading={appState.isGlobalProcessing} />
            </div>
        )}

        {/* Step 2: Editor View (Sidebar + Main) */}
        {appState.step === AppStep.EDITOR && (
            <>
                {/* Left Sidebar: Filmstrip */}
                <div className="w-52 bg-gray-100 border-r flex flex-col shrink-0">
                    <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">投影片 ({appState.slides.length})</span>
                        <label className="cursor-pointer hover:text-blue-600">
                             {/* Small add icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => {
                                // Simplified adding:
                                if(e.target.files) {
                                    // A robust app would reuse processFiles logic. 
                                    // For now, user can click "New Page" at bottom.
                                }
                            }} />
                        </label>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {appState.slides.map((slide, idx) => (
                            <div 
                                key={slide.id}
                                onClick={() => setAppState(prev => ({ ...prev, activeSlideId: slide.id }))}
                                className={`relative group p-1 rounded border-2 cursor-pointer transition-all ${
                                    slide.id === appState.activeSlideId ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:border-gray-300 bg-white'
                                }`}
                            >
                                <div className="aspect-video bg-gray-200 rounded overflow-hidden relative">
                                    <img 
                                        src={slide.processedImageSrc || slide.originalImageSrc} 
                                        className="w-full h-full object-cover" 
                                        alt={`Slide ${idx+1}`}
                                    />
                                    {/* Status Badge */}
                                    <div className="absolute top-1 right-1">
                                        {slide.status === SlideStatus.DONE && <div className="w-2 h-2 bg-green-500 rounded-full shadow-sm"></div>}
                                        {slide.status === SlideStatus.PENDING && <div className="w-2 h-2 bg-yellow-400 rounded-full shadow-sm"></div>}
                                    </div>
                                </div>
                                <div className="flex justify-between items-center mt-1 px-1">
                                    <span className="text-xs text-gray-500 font-medium">Page {idx + 1}</span>
                                    <button 
                                        onClick={(e) => deleteSlide(e, slide.id)}
                                        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                        
                        <div className="p-2 border-2 border-dashed border-gray-300 rounded text-center text-gray-400 hover:border-gray-400 hover:text-gray-500 cursor-pointer text-xs" onClick={() => setAppState(prev => ({...prev, step: AppStep.UPLOAD }))}>
                            + 新增頁面
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 relative bg-white">
                    {activeSlide ? (
                        <>
                           {(activeSlide.status === SlideStatus.PENDING || activeSlide.isRefineMode) ? (
                               <StepMasking 
                                   key={activeSlide.id} 
                                   imageSrc={activeSlide.isRefineMode && activeSlide.processedImageSrc ? activeSlide.processedImageSrc : activeSlide.originalImageSrc}
                                   apiKey={appState.apiKey}
                                   onConfirm={handleProcessingStart}
                                   onCancel={handleMaskCancel}
                               />
                           ) : (
                               <StepResult 
                                   key={activeSlide.id}
                                   slide={activeSlide}
                                   onRevertToOriginal={handleRevertToOriginal}
                                   onRefine={handleRefine}
                               />
                           )}
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-400">請選擇一張投影片</div>
                    )}
                </div>
            </>
        )}

        {/* Loading Overlay */}
        {appState.isGlobalProcessing && (
          <ProcessingOverlay status={appState.globalStatusText} />
        )}
      </main>
    </div>
  );
};

export default App;
