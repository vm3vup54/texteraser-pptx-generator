
import React, { useState } from 'react';

interface StepApiKeyProps {
  onSave: (key: string) => void;
}

const StepApiKey: React.FC<StepApiKeyProps> = ({ onSave }) => {
  const [inputKey, setInputKey] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputKey.trim().length > 0) {
      onSave(inputKey.trim());
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] w-full max-w-md mx-auto p-6">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 w-full">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center text-white text-3xl font-bold shadow-lg">
            T
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-gray-800 text-center mb-2">歡迎使用 TextEraser</h2>
        <p className="text-gray-500 text-center mb-8 text-sm">
          請輸入您的 Google Gemini API Key 以開始使用。<br/>
          您的 Key 僅會儲存在本地瀏覽器中。
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-1">
              Gemini API Key
            </label>
            <input
              id="apiKey"
              type="password"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              required
            />
          </div>

          <button
            type="submit"
            disabled={!inputKey}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors shadow-md"
          >
            開始使用
          </button>
        </form>

        <div className="mt-6 text-center">
          <a 
            href="https://aistudio.google.com/app/apikey" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:text-blue-700 font-medium inline-flex items-center"
          >
            沒有 API Key? 前往 Google AI Studio 取得
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
};

export default StepApiKey;
