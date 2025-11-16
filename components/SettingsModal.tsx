import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Settings } from '../types';
import { DEFAULT_SETTINGS } from '../constants';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { currentEstablishment, updateSettings } = useAppContext();
  const [settings, setSettings] = useState<Settings>(currentEstablishment?.settings ?? DEFAULT_SETTINGS);

  useEffect(() => {
    if (isOpen && currentEstablishment) {
      setSettings(currentEstablishment.settings);
    }
  }, [currentEstablishment, isOpen]);

  const handleSave = () => {
    if (currentEstablishment) {
      updateSettings(currentEstablishment.id, settings);
    }
    onClose();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({...prev, [name]: parseInt(value) || 0 }));
  }

  if (!isOpen || !currentEstablishment) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-2xl font-bold mb-4">Configurações Gerais</h2>
        
        <div className="space-y-6">
            <div>
                 <label htmlFor="totalTables" className="block text-sm font-medium text-gray-700">Total de Mesas no Estabelecimento</label>
                 <input type="number" name="totalTables" id="totalTables" value={settings.totalTables} onChange={handleInputChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                  <p className="text-xs text-gray-500 mt-1">Usado para calcular a % de ocupação.</p>
            </div>
            <div className="border-t pt-4">
                <h3 className="font-semibold text-lg mb-2">Configurações do Semáforo</h3>
                <div className="space-y-4">
                    <div>
                        <h4 className="font-semibold text-gray-800">Critérios por Tempo (segundos)</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="timeGreen" className="block text-sm font-medium text-gray-700">Verde até:</label>
                                <input type="number" name="timeGreen" id="timeGreen" value={settings.timeGreen} onChange={handleInputChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                            </div>
                            <div>
                                <label htmlFor="timeYellow" className="block text-sm font-medium text-gray-700">Amarelo até:</label>
                                <input type="number" name="timeYellow" id="timeYellow" value={settings.timeYellow} onChange={handleInputChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Acima de {settings.timeYellow}s fica Vermelho.</p>
                    </div>
                    <div>
                        <h4 className="font-semibold text-gray-800">Critérios por Qtde. de Chamados Iguais</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="qtyGreen" className="block text-sm font-medium text-gray-700">Verde até:</label>
                                <input type="number" name="qtyGreen" id="qtyGreen" value={settings.qtyGreen} onChange={handleInputChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                            </div>
                            <div>
                                <label htmlFor="qtyYellow" className="block text-sm font-medium text-gray-700">Amarelo até:</label>
                                <input type="number" name="qtyYellow" id="qtyYellow" value={settings.qtyYellow} onChange={handleInputChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Acima de {settings.qtyYellow} chamados do mesmo tipo fica Vermelho.</p>
                    </div>
                </div>
            </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancelar</button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Salvar</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;