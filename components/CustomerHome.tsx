
import React, { useState, useMemo } from 'react';
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
      users,
      logout, 
      establishments, 
      currentCustomerProfile, 
      getEstablishmentByPhone,
      searchEstablishmentByPhone,
      favoriteEstablishment,
      unfavoriteEstablishment,
    } = useAppContext();

  const [selectedEstablishment, setSelectedEstablishment] = useState<Establishment | null>(null);
  const [tableNumber, setTableNumber] = useState('');
  const [isEnteringTable, setIsEnteringTable] = useState(false);
  const [phoneToSearch, setPhoneToSearch] = useState('');
  const [error, setError] = useState('');
  const [tableError, setTableError] = useState('');
  const [isShareAppOpen, setShareAppOpen] = useState(false);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isVipModalOpen, setVipModalOpen] = useState(false);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);

  const favorited = useMemo(() => {
    if (!currentCustomerProfile) return [];
    return currentCustomerProfile.favoritedEstablishmentIds
        .map(id => establishments.get(id))
        .filter((e): e is Establishment => e !== undefined);
  }, [currentCustomerProfile, establishments]);
  
  const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setIsLoadingSearch(true);
      
      try {
        // Try to get from cache or async search
        let establishment = getEstablishmentByPhone(phoneToSearch);
        if (!establishment && searchEstablishmentByPhone) {
            // @ts-ignore
            establishment = await searchEstablishmentByPhone(phoneToSearch);
        }
        
        if (!establishment) {
            setError("Nenhum estabelecimento encontrado com este telefone.");
            setIsLoadingSearch(false);
            return;
        }
        
        if (isGuest) {
            handleSelectEstablishment(establishment);
        } else {
            try {
            if (!currentUser) throw new Error("Usuário não logado.");
            await favoriteEstablishment(currentUser!.id, establishment.id);
            setPhoneToSearch('');
            } catch (err: any) {
            if (err.message.includes("máximo 3")) {
                setVipModalOpen(true);
            } else {
                setError(err.message);
            }
            }
        }
      } catch (err) {
          setError("Erro ao buscar estabelecimento.");
      } finally {
          setIsLoadingSearch(false);
      }
  };

  const handleSelectEstablishment = (establishment: Establishment) => {
    setError('');
    // With Supabase, users list might not be populated with everyone. 
    // We rely on RLS or specific queries. 
    // Assuming establishment object is valid if we have it.
    setSelectedEstablishment(establishment);
    setIsEnteringTable(true);
  };
  
  const handleTableSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setTableError('');

      if (!tableNumber.trim()) {
        setTableError("Por favor, informe o número da mesa.");
        return;
      }

      // Check if table is already in use in local state (snapshot)
      // In real app, we might not want to block entry based on 'in use' if multiple people sit at table
      // But preserving original logic:
      const table = selectedEstablishment?.tables.get(tableNumber);
      const hasActiveCalls = table?.calls.some(c => c.status === 'SENT' || c.status === 'VIEWED');

      if (hasActiveCalls) {
          setTableError("Esta mesa já tem chamados em andamento.");
          // return; // Optional: block or allow
      }
      
      const tableNum = parseInt(tableNumber, 10);
      const totalTables = selectedEstablishment?.settings?.totalTables || 20;
      
      if (isNaN(tableNum) || tableNum < 1 || tableNum > totalTables) {
           setTableError("Mesa Inexistente. Verifique o número e tente novamente.");
           return;
      }

      setIsEnteringTable(false); // This will hide the modal and show the CustomerView
  }

  // If a table has been set, show the call view
  if (selectedEstablishment && tableNumber && !isEnteringTable) {
      return <CustomerView 
                establishment={selectedEstablishment} 
                tableNumber={tableNumber} 
                onBack={() => {
                    setSelectedEstablishment(null);
                    setTableNumber('');
                    setTableError('');
                    if (isGuest && selectedEstablishment) {
                        // For guest, go back to table entry for the same establishment
                        setIsEnteringTable(true); 
                    }
                }}
             />
  }

  const headerAction = isGuest ? onExitGuestMode! : logout;
  const backText = isGuest ? "Voltar" : "Sair (Logout)";

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <Header onBack={headerAction} backText={backText} establishmentOverride={null} />
       <main className="p-4 md:p-6 max-w-2xl mx-auto">
        
        {isGuest ? (
            <div className="text-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Acesso Eventual</h1>
                <p className="text-gray-600">Encontre o estabelecimento para começar.</p>
            </div>
        ) : (
            <div className="text-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Meus Favoritos</h1>
                <p className="text-gray-600">Selecione um estabelecimento para começar.</p>
            </div>
        )}


        {/* Add new/search form */}
        <form onSubmit={handleSearch} className="mb-8 p-4 bg-white rounded-lg shadow">
            <h2 className="font-bold mb-2">{isGuest ? 'Buscar pelo Telefone' : 'Adicionar novo favorito'}</h2>
            <div className="flex flex-col sm:flex-row gap-2">
                <input 
                    type="tel"
                    value={phoneToSearch}
                    onChange={(e) => setPhoneToSearch(e.target.value)}
                    placeholder="Telefone do estabelecimento"
                    className="flex-grow p-2 border border-gray-300 rounded-md"
                />
                <button disabled={isLoadingSearch} type="submit" className="bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-300">
                    {isLoadingSearch ? 'Buscando...' : (isGuest ? 'Buscar' : 'Adicionar')}
                </button>
            </div>
            {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}
        </form>
        
        {/* Favorited list (only for logged-in users) */}
        {!isGuest && (
            <>
            {favorited.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Você ainda não tem favoritos.</p>
            ) : (
                <div className="space-y-4">
                    {favorited.map(est => (
                        <div key={est.id} className="bg-white rounded-xl shadow-md p-4 flex items-center justify-between hover:shadow-lg transition-shadow">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation(); // prevent select establishment
                                        if (window.confirm(`Tem certeza que deseja remover "${est.name}" dos seus favoritos?`)) {
                                            unfavoriteEstablishment(currentUser!.id, est.id);
                                        }
                                    }}
                                    className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-red-100"
                                    aria-label={`Remover ${est.name} dos favoritos`}
                                >
                                    <TrashIcon />
                                </button>
                                <div onClick={() => handleSelectEstablishment(est)} className="flex items-center gap-4 cursor-pointer">
                                    <img src={est.photoUrl} alt={est.name} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                                    <div>
                                        <h3 className="text-xl font-bold text-blue-600">{est.name}</h3>
                                        <p className="text-sm text-gray-500 italic">"{est.phrase}"</p>
                                    </div>
                                </div>
                            </div>
                            <div onClick={() => handleSelectEstablishment(est)} className="cursor-pointer">
                                <span className="text-blue-500 font-semibold text-2xl">&rarr;</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
             <div className="my-6 text-center">
                <button onClick={() => setVipModalOpen(true)} className="font-medium text-blue-600 hover:text-blue-500 underline">
                   Quer favoritar mais locais? Conheça o VIP!
                </button>
            </div>
            </>
        )}

      </main>

      {/* Enter table modal */}
      {isEnteringTable && selectedEstablishment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 text-center">
                  <h2 className="text-2xl font-bold mb-2">Bem-vindo(a) ao {selectedEstablishment.name}</h2>
                  <form onSubmit={handleTableSubmit}>
                      <label htmlFor="tableNumber" className="block text-lg font-medium text-gray-700 my-4">Informe o número da sua mesa</label>
                      <input
                          id="tableNumber"
                          type="text"
                          value={tableNumber}
                          onChange={(e) => setTableNumber(e.target.value.slice(0, 3).toUpperCase())}
                          className="w-full text-center text-3xl font-bold p-4 border-2 border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                          maxLength={3}
                          autoFocus
                          required
                      />
                      {tableError && <p className="text-red-500 text-sm mt-2">{tableError}</p>}
                      <div className="mt-6 flex gap-2">
                         <button type="button" onClick={() => { setIsEnteringTable(false); setSelectedEstablishment(null); setTableNumber(''); setTableError(''); }} className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-6 rounded-lg shadow-md hover:bg-gray-300">
                            Cancelar
                        </button>
                        <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-blue-700">
                            Entrar na Mesa
                        </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
      
      {!isGuest && (
        <>
            <div className="fixed bottom-0 left-0 right-0 bg-white shadow-lg border-t border-gray-200 p-2 flex justify-around items-center">
              <button onClick={() => setShareAppOpen(true)} className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-gray-600 hover:text-blue-600 transition-colors">
                  <ShareIcon /> <span className="text-xs sm:text-base">Compartilhar</span>
              </button>
              <button onClick={() => setProfileOpen(true)} className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-gray-600 hover:text-blue-600 transition-colors">
                  <UserIcon /> <span className="text-xs sm:text-base">Meu Perfil</span>
              </button>
            </div>
            <ShareModal 
                isOpen={isShareAppOpen} 
                onClose={() => setShareAppOpen(false)}
                title="Compartilhe o Mesa Ativa!"
                text="Convide outros estabelecimentos e clientes a usarem o aplicativo."
                url={APP_URL}
            />
            <ProfileModal isOpen={isProfileOpen} onClose={() => setProfileOpen(false)} />
            <VipModal isOpen={isVipModalOpen} onClose={() => setVipModalOpen(false)} />
        </>
      )}

    </div>
  );
};

export default CustomerHome;
