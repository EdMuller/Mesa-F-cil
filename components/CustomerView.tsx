
import React, { useMemo, useEffect } from 'react';
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

const CustomerView: React.FC<CustomerViewProps> = ({ establishment: initialEstablishment, tableNumber, onBack }) => {
  const { establishments, subscribeToEstablishmentCalls, trackTableSession } = useAppContext();
  
  // Obtém versão atualizada do contexto para reagir ao realtime
  const establishment = establishments.get(initialEstablishment.id) || initialEstablishment;

  // SUBSCRIPTION VITAL
  useEffect(() => {
      const unsubscribe = subscribeToEstablishmentCalls(establishment.id);
      
      // REGISTRA A SESSÃO: Marca que o usuário está ativo "nesta mesa"
      // Isso permite ter várias mesas abertas ao mesmo tempo em abas/componentes diferentes
      trackTableSession(establishment.id, tableNumber);

      return () => {
          unsubscribe && unsubscribe();
      }
  }, [establishment.id, tableNumber, subscribeToEstablishmentCalls, trackTableSession]);

  // Se o estabelecimento fechar enquanto o cliente está na mesa
  if (!establishment.isOpen) {
      return (
          <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
              <div className="bg-white p-6 rounded-lg shadow-lg text-center max-w-sm">
                  <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <h2 className="text-xl font-bold mb-2 text-gray-800">Estabelecimento Fechado no Momento</h2>
                  <p className="text-gray-600 mb-6">O estabelecimento encerrou as atividades. Seus chamados pendentes serão encerrados.</p>
                  <button onClick={onBack} className="w-full bg-blue-600 text-white font-bold py-2 rounded-md hover:bg-blue-700">
                      Sair da Mesa
                  </button>
              </div>
          </div>
      )
  }
  
  // FIX 4: Botão Voltar apenas navega para a tela anterior (Home), 
  // NÃO limpa a mesa e NEM cancela chamados. Isso permite abrir outra mesa.
  const handleBack = () => {
      onBack();
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <Header onBack={handleBack} isEstablishment={false} establishmentOverride={establishment} backText="Voltar" />
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
        [SemaphoreStatus.GREEN]: 'border-green-500 bg-green-50 ring-2 ring-green-200',
        [SemaphoreStatus.YELLOW]: 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-200',
        [SemaphoreStatus.RED]: 'border-red-500 bg-red-50 ring-2 ring-red-200',
    };

    const receivedStatus = oldestCall?.status === CallStatus.VIEWED 
        ? 'bg-green-100 text-green-800 border-green-200' 
        : oldestCall?.status === CallStatus.SENT
        ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
        : 'bg-gray-100 text-gray-500 border-gray-200';

    const statusLabel = oldestCall?.status === CallStatus.VIEWED ? 'Visualizado' : 'Enviado';

    return (
        <div className={`bg-white rounded-xl shadow-md border-2 transition-all duration-300 ${semaphoreClasses[semaphoreStatus]}`}>
            <button 
                onClick={() => addCall(establishment.id, tableNumber, type)}
                className="w-full flex items-center justify-center text-gray-800 font-bold py-4 rounded-t-lg hover:bg-black hover:bg-opacity-5 transition-colors duration-200 p-4"
                aria-label={CALL_TYPE_INFO[type].verb}
            >
                <div className="flex items-center gap-4 text-blue-600">
                    <div className="scale-110">{icons[type]}</div>
                    <span className="text-xl text-gray-800">{CALL_TYPE_INFO[type].verb}</span>
                </div>
            </button>
            {pendingCount > 0 && (
                <div className="pt-0 border-t-2 border-dashed border-gray-200 flex justify-between items-center bg-gray-50/80 p-3 rounded-b-lg">
                    <div className={`px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wide flex items-center gap-1 ${receivedStatus}`}>
                        <span className={`w-2 h-2 rounded-full ${oldestCall?.status === CallStatus.VIEWED ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                        {statusLabel}
                    </div>
                    
                    <div className="flex items-center gap-1 text-gray-600">
                        <span className="text-xs font-bold uppercase">Chamados:</span>
                        <span className="text-lg font-bold">{pendingCount}</span>
                    </div>

                    <button 
                        onClick={() => cancelOldestCallByType(establishment.id, tableNumber, type)} 
                        className="bg-white border border-red-200 text-red-600 font-bold text-xs px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors shadow-sm"
                        aria-label={`Cancelar ${CALL_TYPE_INFO[type].label}`}
                    >
                        Cancelar
                    </button>
                </div>
            )}
        </div>
    );
};

export default CustomerView;
