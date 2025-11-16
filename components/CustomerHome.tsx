import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Establishment } from '../types';
import Header from './Header';
import CustomerView from './CustomerView';
import ShareIcon from './icons/ShareIcon';
import UserIcon from './icons/UserIcon';
import ShareModal from './ShareModal';
import ProfileModal from './ProfileModal';
import { APP_URL } from '../constants';

const CustomerHome: React.FC = () => {
  const { 
      currentUser,
      logout, 
      establishments, 
      currentCustomerProfile, 
      getEstablishmentByPhone, 
      favoriteEstablishment 
    } = useAppContext();

  const [selectedEstablishment, setSelectedEstablishment] = useState<Establishment | null>(null);
  const [tableNumber, setTableNumber] = useState('');
  const [isEnteringTable, setIsEnteringTable] = useState(false);
  const [phoneToAdd, setPhoneToAdd] = useState('');
  const [error, setError] = useState('');
  const [isShareAppOpen, setShareAppOpen] = useState(false);
  const [isProfileOpen, setProfileOpen] = useState(false);

  const favorited = useMemo(() => {
    if (!currentCustomerProfile) return [];
    return currentCustomerProfile.favoritedEstablishmentIds
        .map(id => establishments.get(id))
        .filter((e): e is Establishment => e !== undefined);
  }, [currentCustomerProfile, establishments]);
  
  const handleAddFavorite = (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      const establishment = getEstablishmentByPhone(phoneToAdd);
      if (!establishment) {
          setError("Nenhum estabelecimento encontrado com este telefone.");
          return;
      }
      try {
        favoriteEstablishment(currentUser!.id, establishment.id);
        setPhoneToAdd('');
      } catch (err: any) {
        setError(err.message);
      }
  };

  const handleSelectEstablishment = (establishment: Establishment) => {
    setSelectedEstablishment(establishment);
    setIsEnteringTable(true);
  };
  
  const handleTableSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if(tableNumber.trim()) {
          setIsEnteringTable(false); // This will hide the modal and show the CustomerView
      }
  }

  // If a table has been set, show the call view
  if (selectedEstablishment && tableNumber && !isEnteringTable) {
      return <CustomerView 
                establishment={selectedEstablishment} 
                tableNumber={tableNumber} 
                onBack={() => {
                    setSelectedEstablishment(null);
                    setTableNumber('');
                }}
             />
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <Header onBack={logout} backText="Sair (Logout)" establishmentOverride={null} />
       <main className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-800">Meus Favoritos</h1>
            <p className="text-gray-600">Selecione um estabelecimento para começar.</p>
        </div>

        {/* Add new favorite form */}
        <form onSubmit={handleAddFavorite} className="mb-8 p-4 bg-white rounded-lg shadow">
            <h2 className="font-bold mb-2">Adicionar novo favorito</h2>
            <div className="flex flex-col sm:flex-row gap-2">
                <input 
                    type="tel"
                    value={phoneToAdd}
                    onChange={(e) => setPhoneToAdd(e.target.value)}
                    placeholder="Telefone do estabelecimento"
                    className="flex-grow p-2 border border-gray-300 rounded-md"
                />
                <button type="submit" className="bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700">Adicionar</button>
            </div>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </form>
        
        {/* Favorited list */}
        {favorited.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Você ainda não tem favoritos.</p>
        ) : (
            <div className="space-y-4">
                {favorited.map(est => (
                    <div key={est.id} onClick={() => handleSelectEstablishment(est)} className="bg-white rounded-xl shadow-md p-4 flex items-center justify-between cursor-pointer hover:shadow-lg transition-shadow">
                        <div className="flex items-center gap-4">
                            <img src={est.photoUrl} alt={est.name} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                            <div>
                                <h3 className="text-xl font-bold text-blue-600">{est.name}</h3>
                                <p className="text-sm text-gray-500 italic">"{est.phrase}"</p>
                            </div>
                        </div>
                        <span className="text-blue-500 font-semibold text-2xl">&rarr;</span>
                    </div>
                ))}
            </div>
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
                      <div className="mt-6 flex gap-2">
                         <button type="button" onClick={() => setIsEnteringTable(false)} className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-6 rounded-lg shadow-md hover:bg-gray-300">
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
    </div>
  );
};

export default CustomerHome;