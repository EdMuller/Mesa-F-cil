
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Establishment, UserStatus } from '../types';
import Header from './Header';
import CustomerView from './CustomerView';
import ShareIcon from './icons/ShareIcon';
import UserIcon from './icons/UserIcon';
import TrashIcon from './icons/TrashIcon';
import ShareModal from './ShareModal';
import ProfileModal from './ProfileModal';
import VipModal from './VipModal';
import { APP_URL } from '../constants';

interface CustomerHomeProps {
  isGuest?: boolean;
  onExitGuestMode?: () => void;
}

const CustomerHome: React.FC<CustomerHomeProps> = ({ isGuest = false, onExitGuestMode }) => {
  const { 
      currentUser,
      logout, 
      establishments, 
      currentCustomerProfile, 
      getEstablishmentByPhone,
      searchEstablishmentByPhone,
      favoriteEstablishment,
      unfavoriteEstablishment,
      subscribeToEstablishmentCalls,
      activeSessions,
      clearAllSessions
    } = useAppContext();

  const [selectedEstablishment, setSelectedEstablishment] = useState<Establishment | null>(null);
  const [tableNumber, setTableNumber] = useState('');
  const [isEnteringTable, setIsEnteringTable] = useState(false);
  const [phoneToSearch, setPhoneToSearch] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [tableError, setTableError] = useState('');
  const [isShareAppOpen, setShareAppOpen] = useState(false);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isVipModalOpen, setVipModalOpen] = useState(false);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);

  // 1. Efeito para conectar aos favoritos e ouvir mudanças de status em tempo real
  useEffect(() => {
      const unsubs: (() => void)[] = [];
      
      // Se tiver perfil de cliente e favoritos, subscreve a todos
      if (currentCustomerProfile?.favoritedEstablishmentIds) {
          currentCustomerProfile.favoritedEstablishmentIds.forEach(id => {
              // A função subscribeToEstablishmentCalls atualiza o 'establishments' map quando algo muda
              const unsub = subscribeToEstablishmentCalls(id);
              unsubs.push(unsub);
          });
      }
      
      // Se for convidado e selecionou um estabelecimento temporário (não salvo no perfil), ouve ele também
      if (isGuest && selectedEstablishment) {
          const unsub = subscribeToEstablishmentCalls(selectedEstablishment.id);
          unsubs.push(unsub);
      }

      return () => {
          unsubs.forEach(u => u());
      };
  }, [currentCustomerProfile?.favoritedEstablishmentIds, selectedEstablishment?.id, isGuest, subscribeToEstablishmentCalls]);


  const favorited = useMemo(() => {
    if (!currentCustomerProfile) return [];
    return currentCustomerProfile.favoritedEstablishmentIds
        .map(id => establishments.get(id))
        .filter((e): e is Establishment => e !== undefined);
  }, [currentCustomerProfile, establishments]); // establishments muda com o Realtime
  
  const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setStatusMessage('');
      setIsLoadingSearch(true);
      
      try {
        let establishment = getEstablishmentByPhone(phoneToSearch);
        if (!establishment && searchEstablishmentByPhone) {
            // @ts-ignore
            establishment = await searchEstablishmentByPhone(phoneToSearch);
        }
        
        if (!establishment) {
            setError("Não encontrado.");
            return;
        }
        
        if (isGuest) {
            // Convidados podem selecionar fechado, mas serão barrados ao tentar entrar na mesa
            handleSelectEstablishment(establishment);
        } else {
            try {
                if (!currentUser) throw new Error("Usuário não logado.");
                await favoriteEstablishment(currentUser!.id, establishment.id);
                setPhoneToSearch('');
                // Verifica status mas PERMITE adicionar
                if(!establishment.isOpen) {
                    setStatusMessage(`Adicionado aos favoritos (Fechado).`);
                } else {
                    setStatusMessage("Adicionado com sucesso!");
                }
                setTimeout(() => setStatusMessage(''), 3000);
            } catch (err: any) {
                if (err.message && err.message.includes("máximo 3")) {
                    setVipModalOpen(true);
                } else {
                    setError(err.message || "Erro.");
                }
            }
        }
      } catch (err: any) {
          console.error("Erro na busca:", err);
          setError("Erro de conexão.");
      } finally {
          setIsLoadingSearch(false);
      }
  };

  const handleSelectEstablishment = (establishment: Establishment) => {
    setError('');
    setStatusMessage('');
    
    // Atualiza a seleção local com os dados mais frescos do Contexto
    const freshData = establishments.get(establishment.id) || establishment;
    setSelectedEstablishment(freshData);

    // Se estiver fechado, avisa, mas permite a seleção (para ver detalhes se quisesse, mas bloqueia mesa depois)
    if (!freshData.isOpen) {
        setStatusMessage(`"${freshData.name}" - Estabelecimento Fechado no Momento`);
        setTimeout(() => setStatusMessage(''), 3000);
    }
    
    setIsEnteringTable(true);
  };
  
  const handleTableSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setTableError('');

      if (!selectedEstablishment) return;
      
      // Busca dados frescos antes de validar entrada
      const freshEstablishment = establishments.get(selectedEstablishment.id) || selectedEstablishment;

      if(!freshEstablishment.isOpen) {
          setTableError("Estabelecimento Fechado no Momento");
          return;
      }
      
      if (!tableNumber.trim()) {
        setTableError("Informe a mesa.");
        return;
      }

      const tableNum = parseInt(tableNumber, 10);
      const totalTables = freshEstablishment.settings?.totalTables || 20;
      
      if (isNaN(tableNum) || tableNum < 1 || tableNum > totalTables) {
           setTableError("Mesa Inexistente.");
           return;
      }

      // Sucesso
      setIsEnteringTable(false);
  }

  // FIX 4: Intercepta o Logout para limpar mesas abertas se necessário
  const handleSafeLogout = async () => {
      // Verifica se há sessões ativas
      if (activeSessions.size > 0) {
          const confirmClose = window.confirm(
              "Você possui mesas abertas. Sair do aplicativo encerrará suas mesas e cancelará chamados pendentes. Deseja continuar?"
          );
          if (confirmClose) {
              await clearAllSessions();
              if (isGuest && onExitGuestMode) onExitGuestMode();
              else logout();
          }
      } else {
          // Sem sessões ativas, sai direto
          if (isGuest && onExitGuestMode) onExitGuestMode();
          else logout();
      }
  };

  // Se selecionou mesa válida e estabelecimento aberto
  if (selectedEstablishment && tableNumber && !isEnteringTable) {
      return <CustomerView 
                establishment={selectedEstablishment} 
                tableNumber={tableNumber} 
                onBack={() => {
                    // Ao voltar, apenas limpa a seleção visual local, mas NÃO fecha a mesa no banco
                    // Isso permite navegar e abrir outra mesa
                    setSelectedEstablishment(null);
                    setTableNumber('');
                    setTableError('');
                    // Se for convidado, volta para o passo anterior de seleção
                    if (isGuest && selectedEstablishment) {
                        // Não faz nada especial, apenas renderiza a Home
                    }
                }}
             />
  }
  
  const backText = isGuest ? "Sair do Acesso Rápido" : "Sair"; 

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <Header onBack={handleSafeLogout} backText={backText} establishmentOverride={null} />
       <main className="p-2 max-w-lg mx-auto">
        
        {isGuest ? (
            <div className="mb-3">
                <div className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg shadow py-2 px-3 flex items-center justify-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    <span className="text-lg font-bold">Acesso Eventual</span>
                </div>
            </div>
        ) : (
            <div className="text-center mb-2 mt-1">
                <h1 className="text-lg font-bold text-blue-600">Meus Favoritos</h1>
            </div>
        )}

        {/* LISTA DE FAVORITOS */}
        {!isGuest && (
            <div className="mb-3 animate-fade-in">
                {favorited.length === 0 ? (
                    <div className="bg-white rounded-lg border border-dashed border-gray-300 p-4 text-center">
                        <p className="text-gray-400 text-xs">Lista de favoritos vazia.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {favorited.map(est => (
                            <div 
                                key={est.id} 
                                onClick={() => handleSelectEstablishment(est)}
                                className={`bg-white rounded-lg shadow-sm border p-2 transition-all cursor-pointer relative overflow-hidden group ${!est.isOpen ? 'opacity-70 border-gray-200' : 'hover:shadow-md border-gray-200 hover:border-blue-200'}`}
                            >
                                <div className="flex gap-2 items-center">
                                    <div className="relative">
                                        <img src={est.photoUrl} alt={est.name} className="w-14 h-14 rounded-lg object-cover bg-gray-200 flex-shrink-0" />
                                        {!est.isOpen && (
                                            <div className="absolute inset-0 bg-gray-900 bg-opacity-40 rounded-lg flex items-center justify-center">
                                                <span className="text-[8px] text-white font-bold bg-black bg-opacity-50 px-1 rounded">FECHADO</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-grow overflow-hidden min-w-0">
                                        <h3 className="text-sm font-bold text-blue-600 truncate leading-tight">{est.name}</h3>
                                        <p className="text-[10px] text-gray-500 italic truncate leading-tight mt-0.5">"{est.phrase}"</p>
                                        
                                        <div className="flex items-center justify-between mt-1">
                                            {/* BADGE DE STATUS REALTIME */}
                                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide flex items-center gap-1 ${est.isOpen ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${est.isOpen ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                                                {est.isOpen ? 'Aberto agora' : 'Fechado'}
                                            </span>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (window.confirm(`Remover "${est.name}"?`)) {
                                                        unfavoriteEstablishment(currentUser!.id, est.id);
                                                    }
                                                }}
                                                className="text-gray-300 hover:text-red-500 p-1 -mr-1"
                                            >
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        {/* SEARCH FORM */}
        <form onSubmit={handleSearch} className="mb-2 p-2 bg-white rounded-lg shadow-sm border border-gray-200">
            <h2 className="font-bold mb-1.5 text-[10px] uppercase text-gray-500 tracking-wider">
                {isGuest ? 'Buscar Estabelecimento' : 'Adicionar Novo Favorito'}
            </h2>
            <div className="flex flex-row gap-2 items-center">
                <input 
                    type="tel"
                    value={phoneToSearch}
                    onChange={(e) => setPhoneToSearch(e.target.value)}
                    placeholder="Telefone do local..."
                    className="flex-grow w-0 p-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
                <button 
                    disabled={isLoadingSearch} 
                    type="submit" 
                    className="flex-shrink-0 bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-300 text-xs whitespace-nowrap"
                >
                    {isLoadingSearch ? '...' : (isGuest ? 'Entrar' : 'Adicionar')}
                </button>
            </div>
            {error && <p className="text-red-500 text-xs mt-1 text-center">{error}</p>}
            {statusMessage && <p className="text-blue-600 text-xs font-bold mt-1 text-center">{statusMessage}</p>}
        </form>

        {!isGuest && (
             <div className="mt-2 text-center bg-blue-50 py-2 px-3 rounded-lg border border-blue-100 flex items-center justify-between">
                <span className="text-[10px] text-gray-600">Quer mais favoritos?</span>
                <button onClick={() => setVipModalOpen(true)} className="text-xs font-bold text-blue-600 hover:text-blue-800 underline">
                   Seja VIP
                </button>
            </div>
        )}

      </main>

      {/* MODAL DE ENTRADA NA MESA */}
      {isEnteringTable && selectedEstablishment && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-xs p-5 text-center relative">
                  
                  {/* Se estiver fechado, mostra aviso em vez de input */}
                  {!(establishments.get(selectedEstablishment.id) || selectedEstablishment).isOpen ? (
                        <div>
                             <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                             </div>
                             <h2 className="text-lg font-bold text-gray-800 mb-2">Estabelecimento Fechado no Momento</h2>
                             <p className="text-sm text-gray-600 mb-4">O estabelecimento "{selectedEstablishment.name}" encerrou as atividades por hoje.</p>
                             <button onClick={() => setIsEnteringTable(false)} className="w-full bg-gray-200 text-gray-800 font-bold py-2 rounded-md hover:bg-gray-300">Voltar</button>
                        </div>
                  ) : (
                    <form onSubmit={handleTableSubmit}>
                        <h2 className="text-lg font-bold mb-1 text-blue-800 truncate">{selectedEstablishment.name}</h2>
                        <label htmlFor="tableNumber" className="block text-sm font-medium text-gray-600 my-3">Qual o número da mesa?</label>
                        <input
                            id="tableNumber"
                            type="number"
                            value={tableNumber}
                            onChange={(e) => setTableNumber(e.target.value)}
                            className="w-full text-center text-3xl font-bold p-3 border-2 border-gray-200 rounded-lg focus:ring-green-500 focus:border-green-500 text-gray-800"
                            autoFocus
                            required
                            placeholder="#"
                        />
                        {tableError && <p className="text-red-500 text-xs mt-2 font-medium bg-red-50 p-1 rounded">{tableError}</p>}
                        
                        <div className="mt-5 flex gap-2">
                            <button type="button" onClick={() => { setIsEnteringTable(false); setSelectedEstablishment(null); setTableNumber(''); setTableError(''); }} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2 rounded-md text-sm hover:bg-gray-200">
                                Cancelar
                            </button>
                            <button 
                                type="submit" 
                                className="flex-1 bg-green-600 text-white font-bold py-2 rounded-md text-sm hover:bg-green-700 shadow-md"
                            >
                                Entrar
                            </button>
                        </div>
                    </form>
                  )}
              </div>
          </div>
      )}
      
      {!isGuest && (
        <>
            <div className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.05)] border-t border-gray-100 p-2 flex justify-between px-8 items-center z-10 h-12">
              <button onClick={() => setShareAppOpen(true)} className="flex flex-col items-center text-gray-400 hover:text-blue-600 transition-colors">
                  <ShareIcon /> <span className="text-[9px] mt-0.5">Share</span>
              </button>
              <button onClick={() => setProfileOpen(true)} className="flex flex-col items-center text-gray-400 hover:text-blue-600 transition-colors">
                  <UserIcon /> <span className="text-[9px] mt-0.5">Perfil</span>
              </button>
            </div>
            <ShareModal isOpen={isShareAppOpen} onClose={() => setShareAppOpen(false)} title="Compartilhar" text="" url={APP_URL} />
            <ProfileModal isOpen={isProfileOpen} onClose={() => setProfileOpen(false)} />
            <VipModal isOpen={isVipModalOpen} onClose={() => setVipModalOpen(false)} />
        </>
      )}

    </div>
  );
};

export default CustomerHome;
