import React, { useState, useEffect } from 'react';
import { Settings, X, Key } from 'lucide-react';

export const SettingsModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [deepseekKey, setDeepseekKey] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('deepseek_api_key');
    if (saved) setDeepseekKey(saved);
  }, [isOpen]);

  const handleSave = () => {
    if (deepseekKey) {
      localStorage.setItem('deepseek_api_key', deepseekKey);
    } else {
      localStorage.removeItem('deepseek_api_key');
    }
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="p-2 text-accent-light hover:text-accent transition-colors rounded-md hover:bg-gray-800 flex items-center justify-center gap-2 font-bold text-xs"
        title="Configurações"
      >
        <Settings size={18} />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface-muted border-2 border-primary-dark rounded-lg p-6 w-full max-w-md shadow-2xl relative">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-accent-light/50 hover:text-accent-light transition-colors"
            >
              <X size={24} />
            </button>
            
            <h2 className="text-xl font-bold text-accent-light mb-6 flex items-center gap-2">
              <Settings className="text-accent" />
              Configurações
            </h2>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-accent-light ml-1 flex items-center gap-1">
                  <Key size={14} className="text-purple-400" />
                  DeepSeek API Key
                </label>
                <input
                  type="password"
                  value={deepseekKey}
                  onChange={(e) => setDeepseekKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-4 py-3 bg-gray-950 border border-gray-800 text-accent-light rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder-accent-light/30"
                />
                <p className="text-xs text-accent-light/60">
                  Sua chave será salva apenas no navegador (localStorage). Ela é usada para refinar tarefas e para o assistente de voz.
                </p>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 rounded-md font-bold text-sm text-accent-light hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-md font-bold text-sm bg-gradient-to-r from-primary to-primary-dark hover:from-primary-hover hover:to-primary-dark text-accent-light transition-all"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
