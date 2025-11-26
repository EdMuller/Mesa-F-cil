
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useMockData } from '../hooks/useMockData';
import ConfigModal from '../components/ConfigModal';
import { SUPABASE_CONFIG } from '../constants';

// Estende o tipo do hook para incluir a função de reset manual
type AppContextType = ReturnType<typeof useMockData> & {
    resetConfig: () => void;
};

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mockData = useMockData();
  
  // Inicializa o estado verificando o localStorage ou Configuração Fixa
  const [showConfig, setShowConfig] = useState(() => {
      // Se as credenciais estiverem no arquivo constants.ts, não mostra o modal
      if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
          return false;
      }

      const url = localStorage.getItem('supabase_url');
      const key = localStorage.getItem('supabase_key');
      return !url || !key;
  });

  const handleConfigSave = () => {
      window.location.reload();
      setShowConfig(false);
  };

  const resetConfig = () => {
      // Se estiver usando configuração fixa, não permite resetar localStorage
      if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
          alert("As configurações do servidor estão definidas pelo administrador e não podem ser alteradas.");
          return;
      }

      localStorage.removeItem('supabase_url');
      localStorage.removeItem('supabase_key');
      setShowConfig(true); // Força a modal a aparecer via React State
      try {
        window.location.reload(); 
      } catch (e) {
        console.log("Reload bloqueado pelo ambiente, seguindo via estado.");
      }
  };

  return (
    <AppContext.Provider value={{ ...mockData, resetConfig }}>
      {showConfig && <ConfigModal onSave={handleConfigSave} />}
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

const LoadingScreen = () => {
    const { resetConfig } = useAppContext(); 
    const [showReset, setShowReset] = useState(false);

    useEffect(() => {
        // Se demorar mais de 3 segundos carregando, mostra opção de reset
        const timer = setTimeout(() => setShowReset(true), 3000);
        return () => clearTimeout(timer);
    }, []);

    const handleReset = () => {
        if (window.confirm("Isso apagará as configurações de conexão salvas no navegador. Deseja continuar?")) {
            localStorage.removeItem('supabase_url');
            localStorage.removeItem('supabase_key');
            window.location.reload();
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen flex-col gap-6 p-4 text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <div>
                <p className="text-gray-500 font-medium mb-2">Conectando ao servidor...</p>
                <p className="text-xs text-gray-400">Verificando sessão segura</p>
            </div>

            {showReset && !SUPABASE_CONFIG.url && (
                <div className="mt-4 animate-fade-in">
                    <p className="text-sm text-red-500 mb-2">Está demorando mais que o normal?</p>
                    <button 
                        onClick={handleReset}
                        className="bg-white border border-red-300 text-red-600 px-4 py-2 rounded-md text-sm font-semibold hover:bg-red-50 transition-colors shadow-sm"
                    >
                        Redefinir Configurações do Servidor
                    </button>
                </div>
            )}
        </div>
    );
}
