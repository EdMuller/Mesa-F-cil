import React, { useState, useMemo } from 'react';
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
  const { currentEstablishment, closeTable, viewAllCallsForTable, getTableSemaphoreStatus, logout } = useAppContext();
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isShareAppOpen, setShareAppOpen] = useState(false);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isStatisticsOpen, setStatisticsOpen] = useState(false);

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
    return tablesWithStatus.reduce((acc, table) => {
      acc[table.semaphore] = (acc[table.semaphore] || 0) + 1;
      return acc;
    }, {} as Record<SemaphoreStatus, number>);
  }, [tablesWithStatus]);

  if (!currentEstablishment) {
    return <div className="p-4">Carregando dados do estabelecimento...</div>
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <Header onBack={logout} isEstablishment/>
      
      <main className="p-4 md:p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <SemaphoreCard status={SemaphoreStatus.GREEN} count={semaphoreCounts.GREEN || 0} />
          <SemaphoreCard status={SemaphoreStatus.YELLOW} count={semaphoreCounts.YELLOW || 0} />
          <SemaphoreCard status={SemaphoreStatus.RED} count={semaphoreCounts.RED || 0} />
        </div>

        <div className="bg-white rounded-xl shadow-md p-4">
          <h2 className="text-xl font-bold mb-4">Mesas com Chamados</h2>
          {tablesWithStatus.length === 0 ? (
             <p className="text-center text-gray-500 py-8">Nenhum chamado ativo no momento.</p>
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

      <div className="fixed bottom-0 left-0 right-0 bg-white shadow-lg border-t border-gray-200 p-2 flex justify-around items-center">
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
    <div className={`p-4 rounded-lg shadow ${colors[status].bg} ${colors[status].text}`}>
      <div className="flex justify-between items-center">
        <span className="font-semibold text-lg">{colors[status].label}</span>
        <span className="text-3xl font-bold">{count}</span>
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
        <h3 className="text-2xl font-bold text-gray-800 whitespace-nowrap">Mesa {table.number}</h3>
        
        <div className="flex flex-wrap items-center gap-2">
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
        
        <div className="flex items-center gap-2">
          <button onClick={onCloseTable} className="bg-red-500 text-white px-3 py-1 text-sm rounded-md hover:bg-red-600 w-full sm:w-auto">Fechar Mesa</button>
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
        <button onClick={onClick} className={`text-white px-3 py-1 text-sm rounded-md transition-colors font-semibold ${semaphoreClasses[status]}`}>
            {CALL_TYPE_INFO[callType].label} ({count})
        </button>
    )
}

export default EstablishmentDashboard;