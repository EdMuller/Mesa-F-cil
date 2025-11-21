
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Establishment } from '../types';

interface HeaderProps {
    onBack: () => void;
    isEstablishment?: boolean;
    establishmentOverride?: Establishment | null;
    backText?: string;
}

const Header: React.FC<HeaderProps> = ({ onBack, isEstablishment = false, establishmentOverride, backText }) => {
  const { currentEstablishment, currentUser } = useAppContext();
  const establishment = establishmentOverride ?? currentEstablishment;

  // Estado local para controlar erro de imagem
  const [imageError, setImageError] = useState(false);

  // Resetar erro quando mudar o estabelecimento
  useEffect(() => {
      setImageError(false);
  }, [establishment?.id]);

  const renderTitle = () => {
    if (establishment) {
      return (
        <div className="flex items-center gap-3">
          {!imageError && establishment.photoUrl ? (
              <img 
                src={establishment.photoUrl} 
                alt={establishment.name} 
                className="w-12 h-12 rounded-full object-cover shadow-sm"
                onError={() => setImageError(true)}
              />
          ) : (
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shadow-sm font-bold">
                  {establishment.name.substring(0, 2).toUpperCase()}
              </div>
          )}
          <div className="text-left">
            <h1 className="text-xl sm:text-2xl font-bold text-blue-600">{establishment.name}</h1>
            <p className="text-xs sm:text-sm text-gray-500 italic hidden sm:block">"{establishment.phrase}"</p>
          </div>
        </div>
      );
    }
    if(currentUser?.role === 'ADMIN') {
        return <h1 className="text-2xl font-bold text-blue-600">Painel do Administrador</h1>
    }

    return (
        <h1 className="text-2xl font-bold text-blue-600">Mesa Ativa</h1>
    )
  }

  const defaultBackText = isEstablishment ? 'Sair (Logout)' : 'Sair';

  return (
    <header className="bg-white shadow-md relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
            <div className="w-24 md:w-32">
                 <button onClick={onBack} className="text-blue-600 hover:text-blue-800 transition-colors">
                    &larr; {backText || defaultBackText}
                </button>
            </div>
         
          <div className="text-center">
            {renderTitle()}
          </div>
          <div className="w-24 md:w-32"> {/* Spacer */} </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
