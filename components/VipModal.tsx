import React from 'react';

interface VipModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const VipModal: React.FC<VipModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 text-center relative">
        <button onClick={onClose} className="absolute top-2 right-3 text-2xl text-gray-400 hover:text-gray-600">&times;</button>
        <h2 className="text-2xl font-bold mb-2 text-blue-600">Torne-se VIP!</h2>
        <p className="text-gray-600 my-4">Você atingiu o limite de 3 estabelecimentos favoritos.</p>
        <div className="text-left bg-gray-50 p-3 rounded-md border">
            <p className="text-gray-700">Se desejar cadastrar mais estabelecimentos, deverá utilizar a assinatura <strong>VIP</strong> que lhe dá direito a até <strong>10 estabelecimentos</strong> ao custo simbólico de <strong>R$ 10,00 / ano</strong>.</p>
            <p className="text-gray-700 mt-2">Se preferir, você pode apagar algum dos estabelecimentos já cadastrados.</p>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <a 
            href="http://www.terra.com.br" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-full px-4 py-3 bg-green-500 text-white font-bold rounded-md hover:bg-green-600 transition-colors"
          >
            Quero ser VIP!
          </a>
          <button onClick={onClose} className="w-full px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Fechar</button>
        </div>
      </div>
    </div>
  );
};

export default VipModal;
