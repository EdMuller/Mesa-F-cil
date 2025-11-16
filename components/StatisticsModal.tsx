import React from 'react';
import { useAppContext } from '../context/AppContext';
import StatisticsView from './StatisticsView';

interface StatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const StatisticsModal: React.FC<StatisticsModalProps> = ({ isOpen, onClose }) => {
  const { currentEstablishment } = useAppContext();

  if (!isOpen || !currentEstablishment) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col p-6">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-2xl font-bold">Estatísticas - {currentEstablishment.name}</h2>
          <button onClick={onClose} className="text-3xl text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        <div className="overflow-y-auto">
          <StatisticsView establishment={currentEstablishment} />
        </div>
      </div>
    </div>
  );
};

export default StatisticsModal;