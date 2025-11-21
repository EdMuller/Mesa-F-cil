import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { CallType, CallStatus, Establishment, SemaphoreStatus } from '../types';
import { CALL_TYPE_INFO } from '../constants';
import Header from './Header';

// Selected Icons
import HandIcon from './icons/HandIcon';
import MenuIcon from './icons/MenuIcon';
import ReceiptIcon from './icons/ReceiptIcon';


interface CustomerViewProps {
    establishment: Establishment;
    tableNumber: string;
    onBack: () => void;
}

const CustomerView: React.FC<CustomerViewProps> = ({ establishment, tableNumber, onBack }) => {

  const backText = establishment.ownerId ? "Voltar aos Favoritos" : "Sair";

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <Header onBack={onBack} isEstablishment={false} establishmentOverride={establishment} backText={backText} />
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="text-center mb-6">
            <p className="text-lg text-gray-600">Sua Mesa</p>
            <h2 className="text-5xl font-bold text-blue-600">{tableNumber}</h2>
        </div>

        <div className="grid grid-cols-1 gap-4">
            <CallButton 
              type={CallType.WAITER}
              establishment={establishment}
              tableNumber={tableNumber}
            />
            <CallButton 
              type={CallType.MENU}
              establishment={establishment}
              tableNumber={tableNumber}
            />
            <CallButton 
              type={CallType.BILL} 
              establishment={establishment}
              tableNumber={tableNumber}
            />
        </div>
      </div>
    </div>
  );
};

interface CallButtonProps {
    type: CallType;
    establishment: Establishment;
    tableNumber: string;
}

const CallButton: React.FC<CallButtonProps> = ({ type, establishment, tableNumber }) => {
    const { addCall, cancelOldestCallByType, getCallTypeSemaphoreStatus } = useAppContext();

    const icons: Record<CallType, React.ReactNode> = {
        [CallType.WAITER]: <HandIcon />,
        [CallType.MENU]: <MenuIcon />,
        [CallType.BILL]: <ReceiptIcon />,
    };

    const table = establishment.tables.get(tableNumber);
    const pendingCalls = useMemo(() => {
        return table?.calls.filter(c => c.type === type && (c.status === CallStatus.SENT || c.status === CallStatus.VIEWED)) || [];
    }, [table, type]);
    
    const pendingCount = pendingCalls.length;
    const oldestCall = pendingCount > 0 ? pendingCalls.sort((a,b) => a.createdAt - b.createdAt)[0] : null;

    const semaphoreStatus = getCallTypeSemaphoreStatus(table ?? {number: tableNumber, calls: []}, type, establishment.settings);
    
    const semaphoreClasses: Record<SemaphoreStatus, string> = {
        [SemaphoreStatus.IDLE]: 'border-gray-200',
        [SemaphoreStatus.GREEN]: 'border-green-500',
        [SemaphoreStatus.YELLOW]: 'border-yellow-400',
        [SemaphoreStatus.RED]: 'border-red-500',
    };

    const receivedStatus = oldestCall?.status === CallStatus.VIEWED 
        ? 'bg-green-200 text-green-800' 
        : oldestCall?.status === CallStatus.SENT
        ? 'bg-yellow-200 text-yellow-800'
        : 'bg-gray-200 text-gray-500';

    return (
        <div className={`bg-white rounded-xl shadow-md border-2 ${semaphoreClasses[semaphoreStatus]}`}>
            <button 
                onClick={() => addCall(establishment.id, tableNumber, type)}
                className="w-full flex items-center justify-center text-gray-800 font-bold py-4 rounded-t-lg hover:bg-gray-50 transition-colors duration-200 p-4"
                aria-label={CALL_TYPE_INFO[type].verb}
            >
                <div className="flex items-center gap-3 text-blue-600">
                    {icons[type]}
                    <span className="text-xl text-gray-800">{CALL_TYPE_INFO[type].verb}</span>
                </div>
            </button>
            {pendingCount > 0 && (
                <div className="pt-2 border-t-2 border-dashed flex justify-between items-stretch bg-gray-50/50 p-2 rounded-b-lg text-center">
                    <div className={`w-1/3 py-2 rounded-md ${receivedStatus}`}>
                        <p className="text-xs font-semibold">Status</p>
                        <p className="font-bold text-sm">{oldestCall?.status === CallStatus.VIEWED ? 'Recebido' : 'Enviado'}</p>
                    </div>
                     <div className="w-1/3 py-2">
                        <p className="text-xs font-semibold text-gray-500">Qtde.</p>
                        <p className="font-bold text-lg text-gray-800">{pendingCount}</p>
                    </div>
                     <div className="w-1/3 flex items-center justify-center">
                         <button 
                            onClick={() => cancelOldestCallByType(establishment.id, tableNumber, type)} 
                            className="bg-red-100 text-red-700 font-semibold text-sm w-full h-full rounded-md hover:bg-red-200 transition-colors"
                            aria-label={`Cancelar ${CALL_TYPE_INFO[type].label}`}
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomerView;