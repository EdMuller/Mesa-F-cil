
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import EstablishmentDashboard from './components/EstablishmentDashboard';
import CustomerHome from './components/CustomerHome';
import Login from './components/Login';
import RegisterScreen from './components/RegisterScreen';
import AdminDashboard from './components/AdminDashboard';
import { Role } from './types';

type View = 'ROLE_SELECTION' | 'LOGIN' | 'REGISTER' | 'APP';

const App: React.FC = () => {
  const { currentUser, logout } = useAppContext();
  const [view, setView] = useState<View>('ROLE_SELECTION');
  const [registrationRole, setRegistrationRole] = useState<Role | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(false);

  useEffect(() => {
    // Detecção automática: Se já estiver logado, vai direto para o APP
    if (currentUser) {
      setView('APP');
      setIsGuestMode(false);
    } else if (!isGuestMode) {
      setView('ROLE_SELECTION');
    }
  }, [currentUser, isGuestMode]);

  const handleSelectRole = (role: Role | 'GUEST') => {
    if (role === 'GUEST') {
        setIsGuestMode(true);
    } else {
        setRegistrationRole(role);
        setView('REGISTER');
    }
  };
  
  const handleGoToRegister = () => {
     logout(); 
     setIsGuestMode(false);
     setView('ROLE_SELECTION');
  }

  const renderContent = () => {
    if (isGuestMode && !currentUser) {
        return <CustomerHome isGuest={true} onExitGuestMode={() => {
            setIsGuestMode(false);
            setView('ROLE_SELECTION');
        }} />
    }

    switch (view) {
      case 'LOGIN':
        return <Login onGoToRegister={handleGoToRegister} onBack={() => setView('ROLE_SELECTION')} />;
      case 'ROLE_SELECTION':
        return <RoleSelectionScreen onSelectRole={handleSelectRole} onGoToLogin={() => setView('LOGIN')} />;
      case 'REGISTER':
        return <RegisterScreen role={registrationRole!} onBack={() => setView('ROLE_SELECTION')} />;
      case 'APP':
        if (currentUser?.role === Role.CUSTOMER) {
          return <CustomerHome />;
        }
        if (currentUser?.role === Role.ESTABLISHMENT) {
          return <EstablishmentDashboard />;
        }
        if (currentUser?.role === Role.ADMIN) {
          return <AdminDashboard />;
        }
        return <Login onGoToRegister={handleGoToRegister} onBack={() => setView('ROLE_SELECTION')} />; 
      default:
        return <RoleSelectionScreen onSelectRole={handleSelectRole} onGoToLogin={() => setView('LOGIN')} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {renderContent()}
    </div>
  );
};

interface RoleSelectionScreenProps {
  onSelectRole: (role: Role | 'GUEST') => void;
  onGoToLogin: () => void;
}

const RoleSelectionScreen: React.FC<RoleSelectionScreenProps> = ({ onSelectRole, onGoToLogin }) => {
  const { resetConfig } = useAppContext();
  const [showRegisterOptions, setShowRegisterOptions] = useState(false);
  
  // Função para "Fechar" (Reiniciar a tela)
  const handleClose = () => {
      window.location.reload();
  }

  // Se o usuário clicou em "Cadastre-se", mostramos a tela de escolha de cadastro
  if (showRegisterOptions) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 relative animate-fade-in bg-white">
             <div className="absolute top-4 right-4">
                <button onClick={() => setShowRegisterOptions(false)} className="text-gray-400 hover:text-gray-600">
                   &times; Fechar
                </button>
             </div>
             <div className="w-full max-w-md space-y-6 text-center">
                <h2 className="text-2xl font-bold text-blue-600 mb-6">Criar Conta</h2>
                
                <button
                    onClick={() => onSelectRole(Role.CUSTOMER)}
                    className="w-full bg-white border border-blue-200 text-blue-600 p-6 rounded-xl hover:bg-blue-50 transition-all shadow-sm hover:shadow-md text-left group"
                >
                    <div className="font-bold text-xl mb-1 group-hover:text-blue-700">Sou Cliente</div>
                    <div className="text-sm text-gray-500">Salve seus Estabelecimentos Favoritos</div>
                </button>

                <button
                    onClick={() => onSelectRole(Role.ESTABLISHMENT)}
                    className="w-full bg-blue-600 text-white p-6 rounded-xl hover:bg-blue-700 transition-all shadow-md hover:shadow-lg text-left"
                >
                    <div className="font-bold text-xl mb-1">Sou Estabelecimento</div>
                    <div className="text-sm text-blue-100">Cadastro Obrigatório</div>
                </button>

                <button onClick={() => setShowRegisterOptions(false)} className="text-gray-500 hover:text-gray-700 underline mt-4 text-sm">
                    Voltar
                </button>
             </div>
        </div>
      );
  }

  // Tela Inicial Padrão
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 relative bg-gray-50">
      
      {/* Botão Fechar Discreto */}
      <div className="absolute top-4 right-4">
          <button onClick={handleClose} className="text-xs text-gray-300 hover:text-gray-500">
              &#10005; Sair
          </button>
      </div>

      <div className="text-center mb-10 mt-[-40px]">
        {/* Título com tamanho ajustado para combinar com o botão Acesso Rápido (text-xl/2xl) */}
        <h1 className="text-2xl md:text-3xl font-extrabold text-blue-600 mb-2 tracking-tight">Mesa Fácil</h1>
        {/* Subtítulo reduzido 2 números (text-xs) */}
        <p className="text-xs text-slate-500 font-light max-w-[200px] mx-auto leading-relaxed">
            Agilidade no atendimento,<br/>conforto para Você.
        </p>
      </div>

      <div className="w-full max-w-xs space-y-6">
        
        {/* Bloco de Acesso Rápido - Cliente Eventual */}
        {/* Botão com gradiente e textos ajustados internamente */}
        <div className="w-full">
            <button
            onClick={() => onSelectRole('GUEST')}
            className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 flex flex-col items-center justify-center py-3 px-4"
            >
                <div className="flex items-center gap-2 mb-1">
                    {/* Ícone Movido para a esquerda */}
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    {/* Fonte tamanho lg para igualar ao botão Cliente Fidelizado */}
                    <span className="text-lg font-bold">Acesso Rápido</span>
                </div>
                {/* Texto movido para baixo e reduzido (text-xs) */}
                <span className="text-xs font-normal text-green-100 opacity-90">Para Clientes</span>
            </button>
        </div>

        {/* Divisor */}
        <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="flex-shrink-0 mx-4 text-gray-400 text-xs font-medium">Área de Membros</span>
            <div className="flex-grow border-t border-gray-300"></div>
        </div>

        {/* Bloco de Membros */}
        <div className="grid grid-cols-1 gap-3">
            {/* Botão Cliente Fidelizado - Cor alterada para Azul Sólido (igual Estabelecimento) */}
            <button
            onClick={onGoToLogin}
            className="w-full bg-blue-600 text-white font-bold py-4 px-6 rounded-xl hover:bg-blue-700 transition-colors shadow-md flex items-center justify-center gap-2"
            >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
             <span className="text-lg">Sou Cliente Fidelizado</span>
            </button>
            
            <button
            onClick={onGoToLogin}
            className="w-full bg-blue-600 text-white font-bold py-4 px-6 rounded-xl hover:bg-blue-700 transition-colors shadow-md flex items-center justify-center gap-2"
            >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            <span className="text-lg">Sou Estabelecimento</span>
            </button>
        </div>

        {/* Rodapé de Cadastro */}
        <div className="text-center mt-6">
            <p className="text-gray-500 text-xs mb-1">Ainda não se Cadastrou?</p>
            <button 
                onClick={() => setShowRegisterOptions(true)} 
                className="font-bold text-blue-600 hover:text-blue-800 underline decoration-2 underline-offset-2 text-sm"
            >
                Cadastre-se
            </button>
        </div>

      </div>
    </div>
  );
};

export default App;
