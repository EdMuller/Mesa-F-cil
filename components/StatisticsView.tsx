
import React, { useState, useMemo } from 'react';
import { Establishment, EventLogItem, CallType, Table } from '../types';
import { CALL_TYPE_INFO } from '../constants';

type TimeFilter = 'day' | 'week' | 'month';

const getStartDate = (filter: TimeFilter): Date => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (filter === 'day') {
        return now;
    }
    if (filter === 'week') {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        return new Date(now.setDate(diff));
    }
    if (filter === 'month') {
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return now;
};

const StatisticsView: React.FC<{ establishment: Establishment }> = ({ establishment }) => {
    const [filter, setFilter] = useState<TimeFilter>('day');

    const currentStats = useMemo(() => {
        const totalTables = establishment.settings.totalTables || 1;
        const occupiedTables = establishment.tables.size;
        const occupationPercentage = ((occupiedTables / totalTables) * 100).toFixed(0);
        // FIX: Explicitly type 't' as Table to allow access to 'calls' property.
        const activeCalls = Array.from(establishment.tables.values()).flatMap((t: Table) => t.calls);
        const activeCallsByType = activeCalls.reduce((acc, call) => {
            acc[call.type] = (acc[call.type] || 0) + 1;
            return acc;
        }, {} as Record<CallType, number>);

        return { occupiedTables, totalTables, occupationPercentage, activeCallsByType };
    }, [establishment]);
    
    const historicalStats = useMemo(() => {
        const startDate = getStartDate(filter);
        const filteredLog = (establishment.eventLog || []).filter(log => log.timestamp >= startDate.getTime());

        const customersServed = filteredLog.filter(log => log.type === 'TABLE_CLOSED').length;
        
        const callsByType = filteredLog.reduce((acc, log) => {
            if (log.type === 'CALL_ATTENDED' && log.callType) {
                acc[log.callType] = (acc[log.callType] || 0) + 1;
            }
            return acc;
        }, {} as Record<CallType, number>);

        const cancellations = filteredLog.filter(log => log.type === 'CALL_CANCELED').length;

        let average = { customers: 0, calls: 0 };
        if (filter === 'week') {
            const today = new Date();
            const dayOfWeek = today.getDay();
            const daysPassed = dayOfWeek === 0 ? 7 : dayOfWeek;
            const totalCalls = (Object.values(callsByType) as number[]).reduce((sum, count) => sum + count, 0);
            average.customers = customersServed / daysPassed;
            average.calls = totalCalls / daysPassed;
        }

        return { customersServed, callsByType, cancellations, average };
    }, [establishment, filter]);

    return (
        <div className="space-y-6">
            {/* Current Stats */}
            <div className="p-4 bg-gray-50 rounded-lg border">
                <h3 className="text-xl font-bold mb-3 text-gray-800">Visão Atual (em tempo real)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <StatCard label="Mesas Ocupadas" value={`${currentStats.occupiedTables} / ${currentStats.totalTables}`} />
                    <StatCard label="% de Ocupação" value={`${currentStats.occupationPercentage}%`} />
                    <StatCard label="Chamados de Garçom" value={currentStats.activeCallsByType.WAITER || 0} />
                    <StatCard label="Pedidos de Cardápio" value={currentStats.activeCallsByType.MENU || 0} />
                    <StatCard label="Pedidos de Conta" value={currentStats.activeCallsByType.BILL || 0} />
                </div>
            </div>

            {/* Historical Stats */}
            <div className="p-4 bg-gray-50 rounded-lg border">
                 <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Visão Histórica</h3>
                    <div className="flex items-center gap-2 p-1 bg-gray-200 rounded-lg">
                        <FilterButton label="Hoje" isActive={filter === 'day'} onClick={() => setFilter('day')} />
                        <FilterButton label="Semana" isActive={filter === 'week'} onClick={() => setFilter('week')} />
                        <FilterButton label="Mês" isActive={filter === 'month'} onClick={() => setFilter('month')} />
                    </div>
                 </div>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                     <StatCard label="Clientes Atendidos" value={historicalStats.customersServed} />
                     <StatCard label="Chamados (Garçom)" value={historicalStats.callsByType.WAITER || 0} />
                     <StatCard label="Chamados (Cardápio)" value={historicalStats.callsByType.MENU || 0} />
                     <StatCard label="Chamados (Conta)" value={historicalStats.callsByType.BILL || 0} />
                     <StatCard label="Cancelamentos" value={historicalStats.cancellations} />
                 </div>
                 {filter === 'week' && (
                     <div className="mt-4 border-t pt-4">
                         <h4 className="font-semibold text-center mb-2">Média Diária (nesta semana)</h4>
                         <div className="grid grid-cols-2 gap-4 text-center">
                            <StatCard label="Média de Clientes/dia" value={historicalStats.average.customers.toFixed(1)} />
                            <StatCard label="Média de Chamados/dia" value={historicalStats.average.calls.toFixed(1)} />
                         </div>
                     </div>
                 )}
            </div>
        </div>
    );
};

const StatCard: React.FC<{label: string, value: string | number}> = ({ label, value }) => (
    <div className="bg-white p-3 rounded-lg shadow-sm">
        <p className="text-sm text-gray-600">{label}</p>
        <p className="text-3xl font-bold text-blue-600">{value}</p>
    </div>
);

const FilterButton: React.FC<{ label: string, isActive: boolean, onClick: () => void}> = ({ label, isActive, onClick }) => (
    <button onClick={onClick} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${isActive ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:bg-gray-300'}`}>
        {label}
    </button>
);


export default StatisticsView;
