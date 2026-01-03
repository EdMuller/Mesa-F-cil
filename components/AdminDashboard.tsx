
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Role, User, Establishment, CallType, SemaphoreStatus, Table, CallStatus, Call, UserStatus } from '../types';
import Header from './Header';
import CustomerView from './CustomerView'; // Re-using for simulation
import StatisticsView from './StatisticsView';

const USER_STATUS_TRANSLATION: { [key in UserStatus]: string } = {
  [UserStatus.TESTING]: 'Testando',
  [UserStatus.SUBSCRIBER]: 'Assinante',
  [UserStatus.DISCONNECTED]: 'Desconectado',
};

const AdminDashboard: React.FC = () => {
    const { logout } = useAppContext();
    const [view, setView] = useState<'users' | 'simulation' | 'stats'>('users');

    return (
        <div className="min-h-screen bg-gray-100">
            <Header onBack={logout} backText="Sair (Logout)" />
            <main className="p-4 md:p-6 max-w-7xl mx-auto">
                <div className="flex justify-center border-b border-gray-300 mb-6">
                    <TabButton label="Gerenciar Usuários" isActive={view === 'users'} onClick={() => setView('users')} />
                    <TabButton label="Simulação em Tempo Real" isActive={view === 'simulation'} onClick={() => setView('simulation')} />
                    <TabButton label="Estatísticas" isActive={view === 'stats'} onClick={() => setView('stats')} />
                </div>

                {view === 'users' && <UserManagementSection />}
                {view === 'simulation' && <SimulationSection />}
                {view === 'stats' && <StatisticsSection />}
            </main>
        </div>
    );
};

const TabButton: React.FC<{ label: string; isActive: boolean; onClick: () => void }> = ({ label, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`px-4 py-2 text-sm font-medium transition-colors duration-200 -mb-px border-b-2 ${
            isActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
        }`}
    >
        {label}
    </button>
);

const UserManagementSection = () => {
    const { users, registerCustomer, registerEstablishment, updateUserStatus, loadAllUsers } = useAppContext();
    const [formType, setFormType] = useState<Role.CUSTOMER | Role.ESTABLISHMENT>(Role.CUSTOMER);
    const [feedback, setFeedback] = useState('');
    const [isProcessing, setIsProcessing] = useState<string | null>(null);

    useEffect(() => {
        loadAllUsers();
    }, []);

    const handleSubmit = async (formData: any) => {
        try {
            let newUser;
            if (formType === Role.ESTABLISHMENT) {
                newUser = await registerEstablishment(formData.name, formData.phone, formData.email, formData.password, formData.photo, formData.phrase || '');
            } else {
                newUser = await registerCustomer(formData.name, formData.email, formData.password);
            }
            setFeedback(`Usuário '${newUser.name}' criado com sucesso!`);
            setTimeout(() => setFeedback(''), 3000);
            loadAllUsers(); // Reload list after creation
            return true;
        } catch (err: any) {
            setFeedback("Erro: " + err.message);
            return false;
        }
    };

    const handleStatusUpdate = async (userId: string, status: UserStatus) => {
        setIsProcessing(userId);
        try {
            await updateUserStatus(userId, status);
            setFeedback("Status atualizado com sucesso!");
            setTimeout(() => setFeedback(''), 2000);
        } catch (e) {
            alert("Erro ao salvar no banco. Verifique sua conexão.");
        } finally {
            setIsProcessing(null);
        }
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-2xl font-bold mb-4">Usuários Cadastrados</h2>
                {feedback && <div className="mb-4 p-2 bg-blue-50 text-blue-700 text-xs font-bold rounded border border-blue-100 text-center">{feedback}</div>}
                <div className="max-h-96 overflow-y-auto space-y-2">
                    {users.filter(u => u.role !== Role.ADMIN).map(user => (
                        <div key={user.id} className="p-3 border rounded-md bg-gray-50 flex flex-col sm:flex-row justify-between sm:items-center">
                           <div>
                                <p className="font-semibold">{user.name} <span className="text-xs font-normal bg-blue-100 text-blue-700 px-1 py-0.5 rounded-full">{user.role}</span></p>
                                <p className="text-sm text-gray-600">{user.email}</p>
                           </div>
                           <div className="mt-2 sm:mt-0 relative">
                                <select 
                                    value={user.status}
                                    disabled={isProcessing === user.id}
                                    onChange={(e) => handleStatusUpdate(user.id, e.target.value as UserStatus)}
                                    className={`w-full sm:w-auto p-1 border border-gray-300 rounded-md text-sm ${isProcessing === user.id ? 'opacity-50' : ''}`}
                                >
                                    {Object.values(UserStatus).map(s => (
                                        <option key={s} value={s}>{USER_STATUS_TRANSLATION[s]}</option>
                                    ))}
                                </select>
                                {isProcessing === user.id && <div className="absolute inset-0 bg-white/50 flex items-center justify-center text-[8px] font-bold">SAVING...</div>}
                           </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-2xl font-bold mb-4">Adicionar Novo Usuário</h2>
                <div className="flex gap-2 mb-4">
                    <button onClick={() => setFormType(Role.CUSTOMER)} className={`px-3 py-1 rounded-md text-sm ${formType === Role.CUSTOMER ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>Cliente</button>
                    <button onClick={() => setFormType(Role.ESTABLISHMENT)} className={`px-3 py-1 rounded-md text-sm ${formType === Role.ESTABLISHMENT ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>Estabelecimento</button>
                </div>
                <RegistrationForm type={formType} onSubmit={handleSubmit} />
            </div>
        </div>
    );
};

const RegistrationForm: React.FC<{ type: Role.CUSTOMER | Role.ESTABLISHMENT, onSubmit: (data: any) => Promise<boolean> }> = ({ type, onSubmit }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState(''); // Establishment only
    const [phrase, setPhrase] = useState(''); // Establishment only
    const [photo, setPhoto] = useState<string | null>(null);
    const [showCamera, setShowCamera] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const isEstablishment = type === Role.ESTABLISHMENT;

    const resetForm = () => {
        setEmail(''); setPassword(''); setName(''); setPhone(''); setPhoto(null); setPhrase('');
    }
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        const success = await onSubmit({ name, phone, email, password, photo, phrase });
        setIsLoading(false);
        if(success) resetForm();
    };

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (event) => setPhoto(event.target?.result as string);
            reader.readAsDataURL(e.target.files[0]);
        }
    }
    
    const handlePhotoCapture = (imageDataUrl: string) => {
        setPhoto(imageDataUrl);
        setShowCamera(false);
    }

    if (showCamera) {
        return <CameraCapture onCapture={handlePhotoCapture} onCancel={() => setShowCamera(false)} />
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700">{isEstablishment ? 'Nome do Estabelecimento' : 'Seu Nome'}</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md" required />
            </div>
            {isEstablishment && (
                <>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Telefone de Contato</label>
                        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Frase de Efeito</label>
                        <input type="text" value={phrase} onChange={(e) => setPhrase(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md" placeholder="Ex: A melhor do bairro" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Foto</label>
                        <div className="mt-1 flex items-center gap-4">
                            {photo ? <img src={photo} alt="Preview" className="w-16 h-16 rounded-lg object-cover" /> : <div className="w-16 h-16 rounded-lg bg-gray-200"/>}
                            <div className="flex flex-col gap-2">
                                <label htmlFor="photo-upload-admin" className="cursor-pointer bg-white py-1 px-2 border rounded-md text-sm hover:bg-gray-50 text-center">Arquivo</label>
                                <input id="photo-upload-admin" type="file" className="sr-only" onChange={handlePhotoUpload} accept="image/*" />
                                <button type="button" onClick={() => setShowCamera(true)} className="bg-white py-1 px-2 border rounded-md text-sm hover:bg-gray-50">Câmera</button>
                                {photo && <button type="button" onClick={() => setPhoto(null)} className="bg-red-100 py-1 px-2 border border-red-200 rounded-md text-sm text-red-700 hover:bg-red-200">Limpar</button>}
                            </div>
                        </div>
                    </div>
                </>
            )}
            <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md" required />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Senha</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md" required />
            </div>
            <button type="submit" disabled={isLoading} className={`w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-colors ${isLoading ? 'bg-blue-400' : 'hover:bg-blue-700'}`}>
                {isLoading ? 'Cadastrando...' : 'Cadastrar'}
            </button>
        </form>
    );
};

const SimulationSection = () => {
    const { users, establishments } = useAppContext();
    const [selectedEstablishmentId, setSelectedEstablishmentId] = useState<string>('');
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
    const [tableNumber, setTableNumber] = useState('');
    const [isSimulating, setIsSimulating] = useState(false);

    const customerUsers = useMemo(() => users.filter(u => u.role === Role.CUSTOMER), [users]);
    const establishmentList = useMemo(() => Array.from(establishments.values()), [establishments]);
    
    const selectedEstablishment = establishments.get(selectedEstablishmentId);

    const startSimulation = () => {
        if(selectedEstablishmentId && selectedCustomerId && tableNumber) {
            setIsSimulating(true);
        } else {
            alert("Por favor, selecione um estabelecimento, um cliente e informe uma mesa.");
        }
    }

    if (isSimulating && selectedEstablishment) {
        return (
            <div>
                <button onClick={() => setIsSimulating(false)} className="mb-4 bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300">&larr; Voltar à seleção</button>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Simulating Customer View */}
                    <div className="border-4 border-blue-300 rounded-lg p-2 bg-blue-50">
                        <h2 className="text-center font-bold text-blue-700 mb-2">Visão do Cliente</h2>
                        <CustomerView
                            establishment={selectedEstablishment}
                            tableNumber={tableNumber}
                            onBack={() => {}} // No-op for simulation
                        />
                    </div>
                     {/* Simulating Establishment View */}
                    <div className="border-4 border-green-300 rounded-lg p-2 bg-green-50">
                        <h2 className="text-center font-bold text-green-700 mb-2">Visão do Estabelecimento</h2>
                        <SimulatedEstablishmentView establishment={selectedEstablishment} />
                    </div>
                </div>
            </div>
        );
    }
    
    return (
        <div className="bg-white p-6 rounded-lg shadow max-w-lg mx-auto">
            <h2 className="text-2xl font-bold mb-4">Configurar Simulação</h2>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Estabelecimento</label>
                    <select value={selectedEstablishmentId} onChange={(e) => setSelectedEstablishmentId(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md">
                        <option value="">Selecione...</option>
                        {establishmentList.map(est => <option key={est.id} value={est.id}>{est.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Cliente</label>
                     <select value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md">
                        <option value="">Selecione...</option>
                        {customerUsers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Número da Mesa</label>
                    <input type="text" value={tableNumber} onChange={e => setTableNumber(e.target.value.slice(0,3).toUpperCase())} className="mt-1 w-full p-2 border border-gray-300 rounded-md" />
                </div>
                <button onClick={startSimulation} className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700">Iniciar Simulação</button>
            </div>
        </div>
    );
};

const StatisticsSection = () => {
    const { establishments } = useAppContext();
    const [selectedEstablishmentId, setSelectedEstablishmentId] = useState<string>('');

    const establishmentList = useMemo(() => Array.from(establishments.values()), [establishments]);
    const selectedEstablishment = establishments.get(selectedEstablishmentId);

    return (
        <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-2xl font-bold mb-4">Estatísticas por Estabelecimento</h2>
            <div className="mb-6">
                <label htmlFor="est-select" className="block text-sm font-medium text-gray-700 mb-1">Selecione um estabelecimento</label>
                <select id="est-select" value={selectedEstablishmentId} onChange={(e) => setSelectedEstablishmentId(e.target.value)} className="w-full max-w-xs p-2 border border-gray-300 rounded-md">
                    <option value="">Selecione...</option>
                    {establishmentList.map(est => <option key={est.id} value={est.id}>{est.name}</option>)}
                </select>
            </div>

            {selectedEstablishment ? (
                <StatisticsView establishment={selectedEstablishment} />
            ) : (
                <p className="text-gray-500 text-center py-8">Selecione um estabelecimento para ver suas estatísticas.</p>
            )}
        </div>
    );
};


const SimulatedEstablishmentView: React.FC<{ establishment: Establishment }> = ({ establishment }) => {
    const { closeTable, viewAllCallsForTable, getTableSemaphoreStatus, attendOldestCallByType, getCallTypeSemaphoreStatus } = useAppContext();

    const tablesWithStatus = useMemo(() => {
        return Array.from(establishment.tables.values())
            .map((table: Table) => ({
                ...table,
                semaphore: getTableSemaphoreStatus(table, establishment.settings),
                activeCalls: table.calls.filter(c => c.status === CallStatus.SENT || c.status === CallStatus.VIEWED)
            }))
            .filter(table => table.activeCalls.length > 0)
            .sort((a, b) => (a.activeCalls[0]?.createdAt ?? 0) - (b.activeCalls[0]?.createdAt ?? 0));
    }, [establishment, getTableSemaphoreStatus]);

    return (
        <div className="bg-white rounded-xl shadow-md p-4 h-full">
            <h2 className="text-xl font-bold mb-4">Mesas com Chamados</h2>
            {tablesWithStatus.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Nenhum chamado ativo no momento.</p>
            ) : (
                <div className="space-y-4">
                    {tablesWithStatus.map(table => (
                        <TableCard
                            key={table.number}
                            table={table}
                            establishment={establishment}
                            onCloseTable={() => closeTable(establishment.id, table.number)}
                            onViewCalls={() => viewAllCallsForTable(establishment.id, table.number)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};


const TableCard: React.FC<{ table: any, establishment: Establishment, onCloseTable: () => void, onViewCalls: () => void }> = ({ table, establishment, onCloseTable, onViewCalls }) => {
    const { attendOldestCallByType, getCallTypeSemaphoreStatus } = useAppContext();
    const semaphoreColors: Record<SemaphoreStatus, string> = {
        [SemaphoreStatus.GREEN]: 'border-green-500',
        [SemaphoreStatus.YELLOW]: 'border-yellow-500',
        [SemaphoreStatus.RED]: 'border-red-500',
        [SemaphoreStatus.IDLE]: 'border-gray-300',
    };
    const hasUnseenCalls = table.calls.some((c: Call) => c.status === CallStatus.SENT);

    useEffect(() => {
        if (hasUnseenCalls) {
            const timer = setTimeout(() => onViewCalls(), 1500);
            return () => clearTimeout(timer);
        }
    }, [hasUnseenCalls, onViewCalls]);
    
    const callsByType = table.calls.reduce((acc: any, call: Call) => {
        if (call.status === CallStatus.SENT || call.status === CallStatus.VIEWED) {
            if (!acc[call.type]) acc[call.type] = 0;
            acc[call.type]++;
        }
        return acc;
    }, {} as Record<CallType, number>);

    return (
        <div className={`border-l-4 ${semaphoreColors[table.semaphore]} bg-gray-50 rounded-lg p-3 shadow-sm`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h3 className="text-2xl font-bold text-gray-800">Mesa {table.number}</h3>
                <div className="flex flex-wrap items-center gap-2">
                    {Object.entries(callsByType).map(([type, count]) => (
                        <button key={type} onClick={() => attendOldestCallByType(establishment.id, table.number, type as CallType)} className="bg-blue-500 text-white px-3 py-1 text-sm rounded-md">
                            Atender {CALL_TYPE_INFO[type as CallType].label} ({count as number})
                        </button>
                    ))}
                </div>
                <button onClick={onCloseTable} className="bg-red-500 text-white px-3 py-1 text-sm rounded-md">Fechar</button>
            </div>
        </div>
    );
};

const CALL_TYPE_INFO: { [key in CallType]: { label: string } } = {
  [CallType.WAITER]: { label: 'Garçom' },
  [CallType.MENU]: { label: 'Cardápio' },
  [CallType.BILL]: { label: 'Conta' },
};


const CameraCapture: React.FC<{onCapture: (data: string) => void, onCancel: () => void}> = ({ onCapture, onCancel }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startCamera = useCallback(async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
            streamRef.current = mediaStream;
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("Não foi possível acessar a câmera. Verifique as permissões do seu navegador.");
            onCancel();
        }
    }, [onCancel]);
    
    useEffect(() => {
        startCamera();
        return () => {
            streamRef.current?.getTracks().forEach(track => track.stop());
        }
    }, [startCamera]);

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext('2d');
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            context?.drawImage(videoRef.current, 0, 0, videoRef.current.videoWidth, videoRef.current.videoHeight);
            const dataUrl = canvasRef.current.toDataURL('image/jpeg');
            onCapture(dataUrl);
            streamRef.current?.getTracks().forEach(track => track.stop());
        }
    };

    return (
        <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
            <canvas ref={canvasRef} className="hidden"></canvas>
            <div className="absolute bottom-4 flex gap-4">
                 <button onClick={onCancel} className="px-4 py-2 bg-gray-500 text-white rounded-md">Cancelar</button>
                 <button onClick={handleCapture} className="px-4 py-2 bg-blue-600 text-white rounded-md">Tirar Foto</button>
            </div>
        </div>
    );
};


export default AdminDashboard;
