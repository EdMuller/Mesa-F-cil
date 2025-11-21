
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useMockData } from '../hooks/useMockData';
import ConfigModal from '../components/ConfigModal';

type AppContextType = ReturnType<typeof useMockData>;

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mockData = useMockData();
  
  // Inicializa o estado verificando o localStorage imediatamente
  // Isso evita que showConfig comece como false e depois vire true, ou vice-versa
  const [showConfig, setShowConfig] = useState(() => {
      const url = localStorage.getItem('supabase_url');
      const key = localStorage.getItem('supabase_key');
      return !url || !key;
  });

  const handleConfigSave = () => {
      // Ao salvar, recarregamos a página para garantir que os hooks (useMockData)
      // reinicializem com as novas credenciais limpas.
      window.location.reload();
  };

  return (
    <AppContext.Provider value={mockData}>
      {showConfig && <ConfigModal onSave={handleConfigSave} />}
      {/* Só renderiza os filhos se a config estiver OK e os dados inicializados */}
      {!showConfig && mockData.isInitialized ? children : !showConfig ? <LoadingScreen /> : null}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

const LoadingScreen = () => (
    <div className="flex items-center justify-center min-h-screen flex-col gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-500 font-medium">Conectando ao servidor...</p>
    </div>
)