
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Call, CallStatus, CallType, SemaphoreStatus, Table } from '../types';
import Header from './Header';
import SettingsIcon from './icons/SettingsIcon';
import ChartIcon from './icons/ChartIcon';
import ShareIcon from './icons/ShareIcon';
import UserIcon from './icons/UserIcon';
import SettingsModal from './SettingsModal';
import ShareModal from './ShareModal';
import ProfileModal from './ProfileModal';
import StatisticsModal from './StatisticsModal';
import { APP_URL, CALL_TYPE_INFO } from '../constants';


const EstablishmentDashboard: React.FC = () => {
  const { currentEstablishment, closeTable, viewAllCallsForTable, getTableSemaphoreStatus, logout, closeEstablishmentWorkday, subscribeToEstablishmentCalls } = useAppContext();
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isShareAppOpen, setShareAppOpen] = useState(false);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isStatisticsOpen, setStatisticsOpen] = useState(false);

  // Efeito para ativar o Realtime assim que o componente montar
  useEffect(() => {
      if (currentEstablishment) {
          const unsubscribe = subscribeToEstablishmentCalls(currentEstablishment.id);
          return () => {
              unsubscribe && unsubscribe();
          };
      }
  }, [currentEstablishment?.id, subscribeToEstablishmentCalls]);

  const tablesWithStatus = useMemo(() => {
    if (!currentEstablishment) return [];
    return Array.from(currentEstablishment.tables.values())
      .map((table: Table) => ({
        ...table,
        semaphore: getTableSemaphoreStatus(table, currentEstablishment.settings),
        activeCalls: table.calls.filter(c => c.status === CallStatus.SENT || c.status === CallStatus.VIEWED)
      }))
      .filter(table => table.activeCalls.length > 0)
      .sort((a, b) => (a.activeCalls[0]?.createdAt ?? 0) - (b.activeCalls[0]?.createdAt ?? 0));
  }, [currentEstablishment, getTableSemaphoreStatus]);

  const semaphoreCounts = useMemo(() => {
    if (!currentEstablishment) return {} as Record<SemaphoreStatus, number>;
    return tablesWithStatus.reduce((acc, table) => {
      acc[table.semaphore] = (acc[table.semaphore] || 0) + 1;
      return acc;
    }, {} as Record<SemaphoreStatus, number>);
  }, [tablesWithStatus, currentEstablishment]);
  
  // REGRA 4: Botão para Fechar o Estabelecimento Explicitamente
  const handleCloseShift = async () => {
      if (!currentEstablishment) return;
      
      if (tablesWithStatus.length > 0) {
          const confirm = window.confirm(
              `Existem ${tablesWithStatus.length} mesas com chamados ativos. Encerrar o expediente irá CANCELAR todos esses chamados e fechar o estabelecimento. Deseja continuar?`
          );
          if (!confirm) return;
      } else {
          const confirm = window.confirm("Deseja realmente encerrar o expediente e fechar o estabelecimento para clientes?");
          if (!confirm) return;
      }

      await closeEstablishmentWorkday(currentEstablishment.id);
      // Após fechar o dia, fazemos logout
      logout();
  }

  if (!currentEstablishment) {
    return (
        <div className="flex flex-col items-center justify-center h-screen p-4 bg-gray-50">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-gray-600 font-medium mb-6">Carregando painel do estabelecimento...</p>
            <button onClick={logout} className="px-6 py-2 bg-white border border-red-300 text-red-600 rounded-md hover:bg-red-50 font-bold shadow-sm">Cancelar / Sair</button>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <Header onBack={logout} isEstablishment backText="Sair (Manter Aberto)" />
      
      <main className="p-4 md:p-6 max-w-7xl mx-auto">
        
        {/* TOP BAR COM STATUS E AÇÃO DE FECHAR DIA */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-3 sm:mb-0">
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-green-700 font-bold text-sm uppercase tracking-wide">Estabelecimento Aberto</span>
            </div>
            
            <button 
                onClick={handleCloseShift}
                className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-700 shadow transition-colors text-sm flex items-center gap-2 w-full sm:w-auto justify-center"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                Encerrar Expediente
            </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <SemaphoreCard status={SemaphoreStatus.GREEN} count={semaphoreCounts.GREEN || 0} />
          <SemaphoreCard status={SemaphoreStatus.YELLOW} count={semaphoreCounts.YELLOW || 0} />
          <SemaphoreCard status={SemaphoreStatus.RED} count={semaphoreCounts.RED || 0} />
        </div>

        <div className="bg-white rounded-xl shadow-md p-4">
          <h2 className="text-xl font-bold mb-4">Mesas com Chamados</h2>
          {tablesWithStatus.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                 </svg>
                 <p className="text-lg font-medium">Tudo tranquilo!</p>
                 <p className="text-sm">Nenhum chamado pendente no momento.</p>
             </div>
          ) : (
            <div className="space-y-4">
              {tablesWithStatus.map(table => (
                <TableCard 
                  key={table.number} 
                  table={table} 
                  onCloseTable={() => closeTable(currentEstablishment.id, table.number)}
                  onViewCalls={() => viewAllCallsForTable(currentEstablishment.id, table.number)}
                  semaphore={table.semaphore}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white shadow-lg border-t border-gray-200 p-2 flex justify-around items-center z-20">
          <button onClick={() => setSettingsOpen(true)} className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-gray-600 hover:text-blue-600 transition-colors">
              <SettingsIcon /> <span className="text-xs sm:text-base">Configurações</span>
          </button>
          <button onClick={() => setStatisticsOpen(true)} className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-gray-600 hover:text-blue-600 transition-colors">
              <ChartIcon /> <span className="text-xs sm:text-base">Estatísticas</span>
          </button>
          <button onClick={() => setShareAppOpen(true)} className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-gray-600 hover:text-blue-600 transition-colors">
              <ShareIcon /> <span className="text-xs sm:text-base">Compartilhar</span>
          </button>
          <button onClick={() => setProfileOpen(true)} className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-gray-600 hover:text-blue-600 transition-colors">
              <UserIcon /> <span className="text-xs sm:text-base">Meu Perfil</span>
          </button>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setSettingsOpen(false)} />
      <StatisticsModal isOpen={isStatisticsOpen} onClose={() => setStatisticsOpen(false)} />
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

const SemaphoreCard: React.FC<{ status: SemaphoreStatus; count: number }> = ({ status, count }) => {
  const colors: Record<SemaphoreStatus, { bg: string; text: string; label: string }> = {
    [SemaphoreStatus.GREEN]: { bg: 'bg-green-100', text: 'text-green-800', label: 'Normal' },
    [SemaphoreStatus.YELLOW]: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Atenção' },
    [SemaphoreStatus.RED]: { bg: 'bg-red-100', text: 'text-red-800', label: 'Crítico' },
    [SemaphoreStatus.IDLE]: { bg: '', text: '', label: ''},
  };
  if(status === SemaphoreStatus.IDLE) return null;

  return (
    <div className={`p-4 rounded-lg shadow ${colors[status].bg} ${colors[status].text} flex-1`}>
      <div className="flex justify-between items-center">
        <span className="font-semibold text-base md:text-lg">{colors[status].label}</span>
        <span className="text-2xl md:text-3xl font-bold">{count}</span>
      </div>
    </div>
  );
};

interface TableCardProps {
  table: Table & {semaphore: SemaphoreStatus};
  onCloseTable: () => void;
  onViewCalls: () => void;
  semaphore: SemaphoreStatus;
}

const TableCard: React.FC<TableCardProps> = ({ table, onCloseTable, onViewCalls, semaphore }) => {
  const { currentEstablishment, attendOldestCallByType, getCallTypeSemaphoreStatus } = useAppContext();
  
  const semaphoreColors: Record<SemaphoreStatus, string> = {
    [SemaphoreStatus.GREEN]: 'border-green-500',
    [SemaphoreStatus.YELLOW]: 'border-yellow-500',
    [SemaphoreStatus.RED]: 'border-red-500',
    [SemaphoreStatus.IDLE]: 'border-gray-300',
  };

  const hasUnseenCalls = table.calls.some(c => c.status === CallStatus.SENT);

  React.useEffect(() => {
    if (hasUnseenCalls) {
        const timer = setTimeout(() => {
            onViewCalls();
        }, 1500);
        return () => clearTimeout(timer);
    }
  }, [hasUnseenCalls, onViewCalls, table.number]);
  
  const callsByType = table.calls.reduce((acc, call) => {
    if(call.status === CallStatus.SENT || call.status === CallStatus.VIEWED) {
      if (!acc[call.type]) {
        acc[call.type] = 0;
      }
      acc[call.type]++;
    }
    return acc;
  }, {} as Record<CallType, number>);

  return (
    <div className={`border-l-4 ${semaphoreColors[semaphore]} bg-gray-50 rounded-lg p-3 shadow-sm transition-all duration-300 ${hasUnseenCalls ? 'animate-pulse-bg' : ''}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h3 className="text-2xl font-bold text-gray-800 whitespace-nowrap pl-2">Mesa {table.number}</h3>
        
        <div className="flex flex-wrap items-center gap-2 justify-start sm:justify-end flex-grow">
           {Object.entries(callsByType).map(([type, count]) => (
             <CallActionButton
                key={type}
                callType={type as CallType}
                count={count}
                table={table}
                onClick={() => attendOldestCallByType(currentEstablishment!.id, table.number, type as CallType)}
             />
           ))}
        </div>
        
        <div className="flex items-center gap-2 sm:border-l sm:pl-4 sm:border-gray-200">
          <button onClick={onCloseTable} className="bg-red-500 text-white px-3 py-1.5 text-sm rounded-md hover:bg-red-600 w-full sm:w-auto font-medium">Fechar Mesa</button>
        </div>
      </div>
    </div>
  );
};

const CallActionButton: React.FC<{callType: CallType, count: number, table: Table, onClick: () => void}> = ({ callType, count, table, onClick }) => {
    const { getCallTypeSemaphoreStatus, currentEstablishment } = useAppContext();
    const status = getCallTypeSemaphoreStatus(table, callType, currentEstablishment!.settings);

    const semaphoreClasses: Record<SemaphoreStatus, string> = {
        [SemaphoreStatus.GREEN]: 'bg-green-500 hover:bg-green-600',
        [SemaphoreStatus.YELLOW]: 'bg-yellow-500 hover:bg-yellow-600',
        [SemaphoreStatus.RED]: 'bg-red-500 hover:bg-red-600',
        [SemaphoreStatus.IDLE]: 'bg-gray-400 hover:bg-gray-500',
    };

    return (
        <button onClick={onClick} className={`text-white px-3 py-1.5 text-sm rounded-md transition-colors font-semibold shadow-sm ${semaphoreClasses[status]}`}>
            {CALL_TYPE_INFO[callType].label} ({count})
        </button>
    )
}

export default EstablishmentDashboard;
