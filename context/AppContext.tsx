
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useMockData } from '../hooks/useMockData';
import ConfigModal from '../components/ConfigModal';
import { SUPABASE_CONFIG } from '../constants';

type AppContextType = ReturnType<typeof useMockData> & {
    resetConfig: () => void;
};

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mockData = useMockData();
  
  // Lógica: Se tem URL/Key no LocalStorage, ou se as constantes padrão funcionam, não mostra config.
  // Mas se falhar a conexão, vamos forçar mostrar.
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
      // Verifica se precisa de config no boot
      const hasLocal = localStorage.getItem('supabase_url') && localStorage.getItem('supabase_key');
      const hasConst = SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey;
      
      if (!hasLocal && !hasConst) {
          setShowConfig(true);
      } else if (mockData.initError) {
          // Se o hook reportou erro de init, abre o modal de config para corrigir
          setShowConfig(true);
      }
  }, [mockData.initError]);

  const handleConfigSave = () => {
      window.location.reload();
      setShowConfig(false);
  };

  const resetConfig = () => {
      if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
          if(!window.confirm("As configurações são fixas do administrador. Deseja realmente tentar resetar as credenciais locais do navegador?")) return;
      }
      localStorage.removeItem('supabase_url');
      localStorage.removeItem('supabase_key');
      setShowConfig(true);
      try {
        window.location.reload(); 
      } catch (e) {}
  };

  const content = () => {
      if (showConfig) return <ConfigModal onSave={handleConfigSave} />;
      if (mockData.isInitialized) return children;
      return <LoadingScreen onForceInit={() => mockData.setIsInitialized(true)} error={mockData.initError} onOpenConfig={() => setShowConfig(true)} />;
  };

  return (
    <AppContext.Provider value={{ ...mockData, resetConfig }}>
      {content()}
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

const LoadingScreen: React.FC<{ onForceInit: () => void; error?: string | null, onOpenConfig: () => void }> = ({ onForceInit, error, onOpenConfig }) => {
    const { logout, resetConfig } = useAppContext(); 
    const [showOptions, setShowOptions] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setShowOptions(true), 6000);
        return () => clearTimeout(timer);
    }, []);

    const handleHardReset = () => {
        if (window.confirm("Deseja limpar sua sessão de login e tentar entrar novamente?")) {
            logout().finally(() => window.location.reload());
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen flex-col gap-6 p-6 text-center bg-white">
            <div className="w-14 h-14 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">Mesa Fácil</h2>
                <p className="text-gray-500">{error || "Sincronizando seus dados..."}</p>
            </div>

            {showOptions && (
                <div className="mt-8 animate-fade-in max-w-xs w-full space-y-3">
                    <p className="text-xs text-red-500 mb-2 font-medium">A conexão está demorando mais que o esperado.</p>
                    
                    <button 
                        onClick={onOpenConfig}
                        className="w-full bg-yellow-100 text-yellow-800 border border-yellow-200 px-4 py-3 rounded-xl text-sm font-bold hover:bg-yellow-200 transition-colors"
                    >
                        Configurar Servidor Manualmente
                    </button>

                    <button 
                        onClick={onForceInit}
                        className="w-full bg-blue-600 text-white px-4 py-3 rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 transition-colors"
                    >
                        Tentar Entrar Mesmo Assim
                    </button>
                    
                    <button 
                        onClick={handleHardReset}
                        className="w-full bg-white border border-gray-300 text-gray-600 px-4 py-3 rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors"
                    >
                        Deslogar e Recomeçar
                    </button>
                    
                    <p className="text-[10px] text-gray-400 mt-4 leading-tight">
                        Dica: Se você estiver fora do editor, pode ser necessário configurar a URL do Supabase manualmente.
                    </p>
                </div>
            )}
        </div>
    );
}
