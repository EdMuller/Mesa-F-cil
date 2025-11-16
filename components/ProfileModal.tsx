import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Role } from '../types';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, currentEstablishment, deleteCurrentUser } = useAppContext();
  const [isConfirmingDelete, setConfirmingDelete] = useState(false);

  if (!isOpen || !currentUser) return null;

  const handleDeleteAccount = () => {
    deleteCurrentUser();
    // The logout inside deleteCurrentUser will trigger App.tsx to change view
    onClose();
  };

  const isEstablishment = currentUser.role === Role.ESTABLISHMENT;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">
        <button onClick={() => { onClose(); setConfirmingDelete(false); }} className="absolute top-2 right-3 text-2xl text-gray-400 hover:text-gray-600">&times;</button>
        <h2 className="text-2xl font-bold mb-4 text-center">Meu Perfil</h2>
        
        {isConfirmingDelete ? (
          <div className="text-center">
            <h3 className="font-bold text-red-600 text-lg">Atenção!</h3>
            <p className="my-4 text-gray-700">
              Tem certeza que deseja excluir sua conta? Todas as suas informações, incluindo favoritos e dados do estabelecimento, serão perdidas permanentemente. Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-center gap-4 mt-6">
              <button onClick={() => setConfirmingDelete(false)} className="px-6 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400">
                Cancelar
              </button>
              <button onClick={handleDeleteAccount} className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
                Sim, Excluir
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {isEstablishment && currentEstablishment && (
                <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                    <img src={currentEstablishment.photoUrl} alt="Foto" className="w-16 h-16 rounded-full object-cover"/>
                    <div>
                        <p className="font-semibold text-lg">{currentEstablishment.name}</p>
                        <p className="text-gray-600">{currentEstablishment.phone}</p>
                    </div>
                </div>
            )}
            <InfoRow label="Nome" value={currentUser.name} />
            <InfoRow label="Email" value={currentUser.email} />
            <InfoRow label="Tipo de Conta" value={currentUser.role} />

            <div className="mt-6 border-t pt-4">
              <button onClick={() => setConfirmingDelete(true)} className="w-full px-4 py-2 bg-red-100 text-red-700 border border-red-200 font-semibold rounded-md hover:bg-red-200 transition-colors">
                Deletar Minha Conta
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const InfoRow: React.FC<{label: string, value: string}> = ({label, value}) => (
    <div>
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <p className="text-lg text-gray-800">{value}</p>
    </div>
)

export default ProfileModal;