
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Establishment, Table, Call, CallType, CallStatus, Settings, SemaphoreStatus, User, Role, CustomerProfile, UserStatus, EventLogItem } from '../types';
import { DEFAULT_SETTINGS, SUPABASE_CONFIG } from '../constants';

// --- Types for DB Tables ---
interface DBProfile {
    id: string;
    email: string;
    role: Role;
    name: string;
    status: UserStatus;
}

interface DBEstablishment {
    id: string;
    owner_id: string;
    name: string;
    phone: string;
    photo_url: string;
    phrase: string;
    settings: any;
    is_open: boolean;
}

interface DBCall {
    id: string;
    establishment_id: string;
    table_number: string;
    type: CallType;
    status: CallStatus;
    created_at_ts: number;
}

// --- Initialize Supabase ---
let supabase: any = null;

// FIX CRÍTICO: Função blindada para evitar que dados corrompidos no Storage travem o app
const initSupabase = () => {
    try {
        let url = (SUPABASE_CONFIG.url || '').trim().replace(/['"]/g, '');
        let key = (SUPABASE_CONFIG.anonKey || '').trim().replace(/['"]/g, '');

        if (!url || !key) {
            url = (localStorage.getItem('supabase_url') || '').trim();
            key = (localStorage.getItem('supabase_key') || '').trim();
        }

        if (url && key) {
             if (!supabase) {
                if (!url.startsWith('http')) {
                    console.warn("URL do Supabase inválida encontrada e removida:", url);
                    localStorage.removeItem('supabase_url');
                    localStorage.removeItem('supabase_key');
                    return null;
                }
                
                try {
                    supabase = createClient(url, key, {
                        auth: {
                            persistSession: true,
                            autoRefreshToken: true,
                            detectSessionInUrl: false, // Evita loops de redirect
                        },
                        realtime: {
                            params: {
                                eventsPerSecond: 10,
                            },
                        },
                    });
                } catch (clientErr) {
                    console.error("Erro fatal ao criar cliente Supabase. Limpando credenciais.", clientErr);
                    localStorage.removeItem('supabase_url');
                    localStorage.removeItem('supabase_key');
                    supabase = null;
                }
             }
        } else {
            supabase = null;
        }
    } catch (e) {
        console.error("Failed to init supabase", e);
        localStorage.removeItem('supabase_url');
        localStorage.removeItem('supabase_key');
        supabase = null;
    }
    return supabase;
}

const sanitizePhone = (phone: string) => {
    return phone.replace(/\D/g, '');
}

const handleCommonErrors = (err: any) => {
    const msg = err.message || (typeof err === 'object' ? JSON.stringify(err) : "Erro desconhecido.");
    
    if (msg.includes("Invalid API key")) {
         throw new Error("Chave de API Inválida. Por favor, verifique o arquivo constants.ts ou redefina as configurações.");
    }
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        throw new Error("Erro de Conexão: Não foi possível contatar o servidor. Verifique sua internet ou se a URL do Supabase está correta.");
    }
    return msg;
}

async function withRetry<T>(operation: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
        return await operation();
    } catch (err: any) {
        if (err.message && (err.message.includes("Invalid API key") || err.code === "PGRST301")) {
             throw new Error("Chave de API Inválida.");
        }

        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return withRetry(operation, retries - 1, delay * 1.5);
        }
        throw err;
    }
}

export const useMockData = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]); 
  const [establishments, setEstablishments] = useState<Map<string, Establishment>>(new Map());
  const [customerProfiles, setCustomerProfiles] = useState<Map<string, CustomerProfile>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);
  
  // FIX 4: Rastreia sessões ativas (EstID:TableNum) localmente para permitir múltiplas mesas
  const [activeSessions, setActiveSessions] = useState<Set<string>>(new Set());

  useEffect(() => {
      // Timeout de segurança: Se o Supabase demorar demais ou falhar silenciosamente,
      // força a inicialização para que o app abra (mesmo que deslogado)
      const safetyTimeout = setTimeout(() => {
          if (!isInitialized) {
              console.warn("Inicialização forçada por timeout.");
              setIsInitialized(true);
          }
      }, 3000);

      const client = initSupabase();
      
      const checkSession = async () => {
          if (!client || !client.auth) {
              setIsInitialized(true); 
              return;
          }

          try {
              const { data: { session }, error } = await client.auth.getSession();
              if (error) throw error;
              
              if (session?.user) {
                 await fetchUserProfile(session.user.id, session.user.email!);
              }
          } catch (error: any) {
              console.warn("Session check failed (pode ser token expirado):", error);
              // Se o erro for crítico, limpa o token local para evitar travamento eterno
              if (error.message && (error.message.includes("invalid claim") || error.message.includes("JWT"))) {
                   await client.auth.signOut();
              }
          } finally {
              setIsInitialized(true);
              clearTimeout(safetyTimeout);
          }
      };
      
      checkSession();
      
      let authListener: any = null;
      if (client && client.auth) {
          const { data } = client.auth.onAuthStateChange(async (event: any, session: any) => {
              if (event === 'SIGNED_IN' && session?.user) {
                  await fetchUserProfile(session.user.id, session.user.email!);
              } else if (event === 'SIGNED_OUT') {
                  setCurrentUser(null);
                  setEstablishments(new Map());
                  setActiveSessions(new Set()); // Limpa sessões locais ao deslogar
              }
          });
          authListener = data;
      }

      return () => {
          clearTimeout(safetyTimeout);
          if (authListener && authListener.subscription) {
              authListener.subscription.unsubscribe();
          }
      }
  }, []);

  const fetchUserProfile = async (userId: string, email: string) => {
      if (!supabase) return;
      
      try {
          const { data: profile, error } = await withRetry<any>(() => supabase!.from('profiles').select('*').eq('id', userId).single());
          
          if (error) {
              if (error.code === 'PGRST116') {
                  await supabase.auth.signOut();
                  setCurrentUser(null);
                  return;
              }
              console.error('Error fetching profile:', error);
              return;
          }

          if (profile) {
              const user: User = {
                  id: profile.id,
                  email: email, 
                  password: '', 
                  role: profile.role as Role,
                  name: profile.name,
                  status: profile.status as UserStatus
              };

              if (user.role === Role.ESTABLISHMENT) {
                  const { data: est } = await supabase.from('establishments').select('*').eq('owner_id', userId).single();
                  if (est) {
                      user.establishmentId = est.id;
                      await loadEstablishmentData(est.id);
                  }
              } 
              
              if (user.role === Role.CUSTOMER) {
                  await loadCustomerData(userId);
              }

              setCurrentUser(user);
          }
      } catch (e) {
          console.error("Failed to load user profile", e);
      }
  };

  const loadEstablishmentData = async (estId: string) => {
      if (!supabase) return;
      
      // Fetch establishment details
      const { data: est, error: estError } = await supabase.from('establishments').select('*').eq('id', estId).single();
      if (estError || !est) {
          console.error("Erro ao carregar estabelecimento:", estError);
          return;
      }

      // Fetch calls
      const { data: calls } = await supabase.from('calls').select('*').eq('establishment_id', estId);
      
      const tablesMap = new Map<string, Table>();
      
      if (calls) {
          calls.forEach((c: DBCall) => {
              const existing = tablesMap.get(c.table_number) || { number: c.table_number, calls: [] };
              existing.calls.push({
                  id: c.id,
                  type: c.type,
                  status: c.status,
                  createdAt: c.created_at_ts
              });
              tablesMap.set(c.table_number, existing);
          });
      }

      const totalTables = est.settings?.totalTables || DEFAULT_SETTINGS.totalTables;
      for(let i=1; i<=totalTables; i++) {
          const numStr = i.toString().padStart(3, '0');
          const numSimple = i.toString();
          if(!tablesMap.has(numSimple)) {
             tablesMap.set(numSimple, { number: numSimple, calls: [] });
          }
      }

      const fullEst: Establishment = {
          id: est.id,
          ownerId: est.owner_id,
          name: est.name,
          phone: est.phone,
          photoUrl: est.photo_url,
          phrase: est.phrase,
          settings: est.settings || DEFAULT_SETTINGS,
          tables: tablesMap,
          eventLog: [],
          isOpen: est.is_open === true // Force boolean
      };

      setEstablishments(prev => {
          const newMap = new Map(prev);
          newMap.set(estId, fullEst);
          return newMap;
      });
      return fullEst;
  };

  const loadCustomerData = async (userId: string) => {
      if (!supabase) return;
      try {
        const { data: details } = await supabase.from('customer_details').select('*').eq('user_id', userId).maybeSingle();
        const { data: favs } = await supabase.from('customer_favorites').select('establishment_id').eq('user_id', userId);
        const favIds = favs?.map((f: any) => f.establishment_id) || [];

        // Carrega dados de todos os favoritos para ter status atualizado
        await Promise.allSettled(favIds.map((id: string) => loadEstablishmentData(id)));

        const profile: CustomerProfile = {
            userId: userId,
            favoritedEstablishmentIds: favIds,
            phone: details?.phone,
            cep: details?.cep
        };

        setCustomerProfiles(prev => new Map(prev).set(userId, profile));
      } catch (e) {
          console.error("Erro ao carregar dados do cliente", e);
      }
  };

  // --- REALTIME SUBSCRIPTION ---
  const subscribeToEstablishmentCalls = useCallback((estId: string) => {
      if (!supabase) return () => {};
      
      console.log(`📡 Inscrevendo em Realtime para Est: ${estId}`);

      const channel = supabase.channel(`est_room:${estId}`)
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'calls', filter: `establishment_id=eq.${estId}` }, 
            (payload: any) => {
                console.log("🔔 Mudança em CALLS recebida:", payload);
                loadEstablishmentData(estId);
            }
        )
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'establishments', filter: `id=eq.${estId}` },
            (payload: any) => {
                console.log("🔔 Mudança em ESTABLISHMENT recebida:", payload);
                loadEstablishmentData(estId);
            }
        )
        .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
                console.log(`✅ Conectado em tempo real: ${estId}`);
            }
        });

      return () => { 
          console.log(`🛑 Desconectando Realtime: ${estId}`);
          supabase?.removeChannel(channel); 
      }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
      if (!supabase) throw new Error("Supabase não configurado");
      try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          
          if (data.user) {
              const { data: est } = await supabase.from('establishments').select('id').eq('owner_id', data.user.id).single();
              if (est) {
                  try {
                    await supabase.from('establishments').update({ is_open: true }).eq('id', est.id);
                  } catch (e) {
                    console.error("Falha ao definir is_open=true. Verifique se a coluna existe.", e);
                  }
                  await loadEstablishmentData(est.id);
              }

              return { id: data.user.id, email, role: Role.CUSTOMER } as User; 
          }
          throw new Error("Erro desconhecido no login");
      } catch (err: any) {
          throw new Error(handleCommonErrors(err));
      }
  }, []);

  const logout = useCallback(async () => {
      if (!supabase) {
          setCurrentUser(null);
          return;
      }
      
      if (currentUser?.role === Role.ESTABLISHMENT && currentUser.establishmentId) {
          try {
             console.log("Fechando estabelecimento...");
             await supabase.from('establishments').update({ is_open: false }).eq('id', currentUser.establishmentId);
          } catch (e) { 
              console.error("Erro ao fechar estabelecimento no logout", e); 
          }
      }

      await supabase.auth.signOut();
      setCurrentUser(null);
      setEstablishments(new Map());
      setActiveSessions(new Set()); // Limpa sessões
  }, [currentUser]);

  const registerEstablishment = useCallback(async (name: string, phone: string, email: string, password: string, photoUrl: string | null, phrase: string) => {
      if (!supabase) throw new Error("Supabase não iniciado.");
      
      const cleanPhone = sanitizePhone(phone);
      let userId = '';

      try {
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        
        if (authError) {
            if (authError.message?.includes("already registered") || authError.code === 'user_already_exists') {
                 const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
                 if (!loginError && loginData.user) {
                     userId = loginData.user.id;
                     const { data: prof } = await supabase.from('profiles').select('role').eq('id', userId).single();
                     if (prof && prof.role === Role.ESTABLISHMENT) throw new Error("Conta já existente. Faça login.");
                 } else {
                     throw new Error("E-mail já cadastrado.");
                 }
            } else {
                throw new Error(authError.message);
            }
        } else {
            userId = authData.user!.id;
        }

        await new Promise(r => setTimeout(r, 1000));

        await supabase.from('profiles').upsert({
            id: userId,
            email,
            role: Role.ESTABLISHMENT,
            name,
            status: UserStatus.TESTING
        });

        const estPayload = {
            owner_id: userId,
            name,
            phone: cleanPhone,
            photo_url: photoUrl || `https://picsum.photos/seed/${Date.now()}/400/200`,
            phrase,
            settings: DEFAULT_SETTINGS,
            is_open: true 
        };

        const { data: estData, error: estError } = await supabase.from('establishments').insert(estPayload).select().single();
        if (estError) throw new Error(estError.message);
        return { id: userId, email, role: Role.ESTABLISHMENT, name, establishmentId: estData.id } as User;

      } catch (err: any) {
          throw new Error(handleCommonErrors(err));
      }
  }, []);

  const registerCustomer = useCallback(async (name: string, email: string, password: string, phone?: string, cep?: string) => {
      if (!supabase) throw new Error("Supabase não iniciado.");
      let userId = '';
      try {
          const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
          if (authError) {
              if (authError.code === 'user_already_exists') {
                  const { data: loginData } = await supabase.auth.signInWithPassword({ email, password });
                  if (loginData.user) userId = loginData.user.id;
                  else throw new Error("Email já existe.");
              } else throw new Error(authError.message);
          } else userId = authData.user!.id;

          await new Promise(r => setTimeout(r, 1000));
          await supabase.from('profiles').upsert({ id: userId, email, role: Role.CUSTOMER, name, status: UserStatus.TESTING });
          if (phone || cep) {
              await supabase.from('customer_details').upsert({ user_id: userId, phone: phone ? sanitizePhone(phone) : null, cep });
          }
          return { id: userId, email, role: Role.CUSTOMER, name } as User;
      } catch (err: any) {
          throw new Error(handleCommonErrors(err));
      }
  }, []);

  // FIX 4: Função para rastrear mesa ativa sem criar nada no banco (apenas memória local)
  const trackTableSession = useCallback((estId: string, tableNumber: string) => {
      const key = `${estId}:${tableNumber}`;
      setActiveSessions(prev => {
          const newSet = new Set(prev);
          newSet.add(key);
          return newSet;
      });
  }, []);

  const addCall = useCallback(async (establishmentId: string, tableNumber: string, type: CallType) => {
      if (!supabase) return;
      
      // Sempre garante que a sessão está rastreada ao fazer um chamado
      trackTableSession(establishmentId, tableNumber);

      try {
        await supabase.from('calls').insert({
            establishment_id: establishmentId,
            table_number: tableNumber,
            type,
            status: CallStatus.SENT,
            created_at_ts: Date.now()
        });
        
        await loadEstablishmentData(establishmentId);
      } catch (e) {
          console.error(e);
          alert("Erro ao enviar chamado.");
      }
  }, [trackTableSession]);

  const updateCallStatus = async (estId: string, callId: string, status: CallStatus) => {
      if (!supabase) return;
      await supabase.from('calls').update({ status }).eq('id', callId);
      await loadEstablishmentData(estId);
  };
  
  // Encerra a mesa: Cancela chamados pendentes
  const leaveTable = useCallback(async (estId: string, tableNumber: string) => {
      if (!supabase) return;
      try {
        await supabase.from('calls')
            .update({ status: CallStatus.CANCELED })
            .eq('establishment_id', estId)
            .eq('table_number', tableNumber)
            .in('status', [CallStatus.SENT, CallStatus.VIEWED]);
        
        // Remove da sessão ativa local
        const key = `${estId}:${tableNumber}`;
        setActiveSessions(prev => {
            const newSet = new Set(prev);
            newSet.delete(key);
            return newSet;
        });

        await loadEstablishmentData(estId);
      } catch (e) {
          console.error("Erro ao limpar mesa:", e);
      }
  }, []);

  // FIX 4: Função para limpar TODAS as sessões ativas (usado no Logout)
  const clearAllSessions = useCallback(async () => {
      const sessions = Array.from(activeSessions);
      console.log("Limpando sessões abertas:", sessions);
      for (const session of sessions) {
          const [estId, tableNum] = (session as string).split(':');
          if (estId && tableNum) {
              await leaveTable(estId, tableNum);
          }
      }
      setActiveSessions(new Set());
  }, [activeSessions, leaveTable]);


  const viewAllCallsForTable = useCallback(async (estId: string, tableNumber: string) => {
      if (!supabase) return;
      const { data } = await supabase.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNumber).eq('status', CallStatus.SENT);
      if (data && data.length > 0) {
          const ids = data.map((c: any) => c.id);
          await supabase.from('calls').update({ status: CallStatus.VIEWED }).in('id', ids);
          await loadEstablishmentData(estId); 
      }
  }, []);

  const cancelOldestCallByType = useCallback(async (estId: string, tableNumber: string, callType: CallType) => {
     if (!supabase) return;
     const { data } = await supabase.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNumber).eq('type', callType).in('status', ['SENT', 'VIEWED']).order('created_at_ts', { ascending: true }).limit(1);
    if (data && data.length > 0) {
        await updateCallStatus(estId, data[0].id, CallStatus.CANCELED);
    }
  }, []);

  const attendOldestCallByType = useCallback(async (estId: string, tableNumber: string, callType: CallType) => {
      if (!supabase) return;
       const { data } = await supabase.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNumber).eq('type', callType).in('status', ['SENT', 'VIEWED']).order('created_at_ts', { ascending: true }).limit(1);
    if (data && data.length > 0) {
        await updateCallStatus(estId, data[0].id, CallStatus.ATTENDED);
    }
  }, []);

  const closeTable = useCallback(async (estId: string, tableNumber: string) => {
      if (!supabase) return;
      await supabase.from('calls').update({ status: CallStatus.ATTENDED }).eq('establishment_id', estId).eq('table_number', tableNumber).in('status', ['SENT', 'VIEWED']);
      await loadEstablishmentData(estId);
  }, []);

  const updateSettings = useCallback(async (estId: string, newSettings: Settings) => {
      if (!supabase) return;
      await supabase.from('establishments').update({ settings: newSettings }).eq('id', estId);
  }, []);

  const getEstablishmentByPhone = useCallback((phone: string) => {
      const cleanSearch = sanitizePhone(phone);
      return Array.from(establishments.values()).find((e: Establishment) => e.phone === cleanSearch);
  }, [establishments]);

  const searchEstablishmentByPhone = async (phone: string) => {
      if (!supabase) return null;
      const cleanSearch = sanitizePhone(phone);
      try {
        const { data, error } = await supabase.from('establishments').select('*').eq('phone', cleanSearch).limit(1);
        if (error) throw error;
        if (data && data.length > 0) {
            return await loadEstablishmentData(data[0].id);
        }
      } catch (e) {
          console.error("Erro na busca:", e);
      }
      return null;
  }

  const favoriteEstablishment = useCallback(async (userId: string, establishmentId: string) => {
      if (!supabase) return;
      const { count } = await supabase.from('customer_favorites').select('*', { count: 'exact', head: true }).eq('user_id', userId);
      if (count !== null && count >= 3) throw new Error("Você atingiu o máximo de 3 estabelecimentos favoritos.");

      const { error } = await supabase.from('customer_favorites').insert({ user_id: userId, establishment_id: establishmentId });
      if (error && error.code !== '23505') throw error;
      await loadCustomerData(userId);
  }, []);

  const unfavoriteEstablishment = useCallback(async (userId: string, establishmentId: string) => {
      if (!supabase) return;
      await supabase.from('customer_favorites').delete().eq('user_id', userId).eq('establishment_id', establishmentId);
      await loadCustomerData(userId);
  }, []);

  // --- Helpers UI ---
  const getTableSemaphoreStatus = useCallback((table: Table, settings: Settings): SemaphoreStatus => {
    const activeCalls = table.calls.filter(c => c.status !== CallStatus.ATTENDED && c.status !== CallStatus.CANCELED);
    if (activeCalls.length === 0) return SemaphoreStatus.IDLE;
    const oldestCall = activeCalls.reduce((oldest, current) => current.createdAt < oldest.createdAt ? current : oldest);
    const timeElapsed = (Date.now() - oldestCall.createdAt) / 1000;
    const { timeGreen, timeYellow, qtyGreen, qtyYellow } = settings;
    if (timeElapsed > timeYellow) return SemaphoreStatus.RED;
    if (timeElapsed > timeGreen) return SemaphoreStatus.YELLOW;
    if (activeCalls.length > qtyYellow) return SemaphoreStatus.RED;
    if (activeCalls.length > qtyGreen) return SemaphoreStatus.YELLOW;
    return SemaphoreStatus.GREEN;
  }, []);

  const getCallTypeSemaphoreStatus = useCallback((table: Table, callType: CallType, settings: Settings): SemaphoreStatus => {
    const callsOfType = table.calls.filter(c => c.type === callType && (c.status === CallStatus.SENT || c.status === CallStatus.VIEWED));
    if (callsOfType.length === 0) return SemaphoreStatus.IDLE;
    const oldestCall = callsOfType.reduce((oldest, current) => current.createdAt < oldest.createdAt ? current : oldest, callsOfType[0]);
    const timeElapsed = (Date.now() - oldestCall.createdAt) / 1000;
    const { timeGreen, timeYellow, qtyGreen, qtyYellow } = settings;
    if (timeElapsed > timeYellow) return SemaphoreStatus.RED;
    if (timeElapsed > timeGreen) return SemaphoreStatus.YELLOW;
    if (callsOfType.length > qtyYellow) return SemaphoreStatus.RED;
    if (callsOfType.length > qtyGreen) return SemaphoreStatus.YELLOW;
    return SemaphoreStatus.GREEN;
  }, []);

  const checkTableAvailability = async (establishmentId: string, tableNumber: string): Promise<boolean> => {
      const est = establishments.get(establishmentId);
      if (est && est.isOpen === false) {
          throw new Error("O estabelecimento fechou.");
      }

      if (!supabase) return false;
      const { data } = await supabase.from('calls').select('id').eq('establishment_id', establishmentId).eq('table_number', tableNumber).in('status', ['SENT', 'VIEWED']).limit(1);
      return !data || data.length === 0;
  }
  
  const updateUserStatus = useCallback(async (userId: string, newStatus: UserStatus) => {
       if (!supabase) return;
       await supabase.from('profiles').update({ status: newStatus }).eq('id', userId);
       setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
  }, []);
  
  const loginAsAdminBackdoor = useCallback(async () => {}, []);
  const deleteCurrentUser = useCallback(async () => {
       if(currentUser) {
           await supabase?.from('profiles').delete().eq('id', currentUser.id);
           await logout();
       }
  }, [currentUser, logout]);


  const currentEstablishment = useMemo(() => {
      if (currentUser?.role === Role.ESTABLISHMENT && currentUser.establishmentId) {
          return establishments.get(currentUser.establishmentId) ?? null;
      }
      return null;
  }, [currentUser, establishments]);

  const currentCustomerProfile = useMemo(() => {
      if (currentUser?.role === Role.CUSTOMER) {
          return customerProfiles.get(currentUser.id) ?? null;
      }
      return null;
  }, [currentUser, customerProfiles]);

  return { 
    isInitialized,
    users,
    currentUser,
    establishments,
    currentEstablishment,
    currentCustomerProfile,
    activeSessions, // Exportado para UI
    login,
    logout,
    loginAsAdminBackdoor,
    registerCustomer,
    registerEstablishment,
    addCall,
    cancelOldestCallByType,
    attendOldestCallByType,
    viewAllCallsForTable,
    closeTable,
    leaveTable,
    clearAllSessions, // Exportado para Logout Seguro
    trackTableSession, // Exportado para Entrada na Mesa
    updateSettings, 
    getTableSemaphoreStatus,
    getCallTypeSemaphoreStatus,
    getEstablishmentByPhone,
    searchEstablishmentByPhone,
    favoriteEstablishment,
    unfavoriteEstablishment,
    updateUserStatus,
    deleteCurrentUser,
    subscribeToEstablishmentCalls,
    checkTableAvailability,
  };
};
