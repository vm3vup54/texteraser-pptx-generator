import React from 'react';

interface ProcessingOverlayProps {
  status: string;
}

const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({ status }) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
      <h2 className="text-2xl font-bold text-white mb-2">{status}</h2>
      <p className="text-gray-300 text-sm">請稍候，AI 正在分析圖片...</p>
    </div>
  );
};

export default ProcessingOverlay;