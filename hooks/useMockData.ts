
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

const initSupabase = () => {
    try {
        // Prioridade 1: Configuração fixa no código (constants.ts)
        let url = SUPABASE_CONFIG.url;
        let key = SUPABASE_CONFIG.anonKey;

        // Prioridade 2: LocalStorage (caso não tenha fixo)
        if (!url || !key) {
            url = localStorage.getItem('supabase_url') || '';
            key = localStorage.getItem('supabase_key') || '';
        }

        if (url && key && !supabase) {
            // Basic URL validation to prevent crashes
            if (!url.startsWith('http')) throw new Error("Invalid URL");
            supabase = createClient(url, key);
        }
    } catch (e) {
        console.error("Failed to init supabase", e);
        // Clean bad config from local storage if strictly relying on it
        localStorage.removeItem('supabase_url');
        localStorage.removeItem('supabase_key');
        supabase = null;
    }
    return supabase;
}

// Sanitiza telefone para manter consistência
const sanitizePhone = (phone: string) => {
    return phone.replace(/\D/g, '');
}

// Helper para tratar erros comuns
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

// Função auxiliar para retry
async function withRetry<T>(operation: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
        return await operation();
    } catch (err: any) {
        // Se o erro for crítico de configuração, não adianta tentar de novo
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
  // Core state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]); 
  const [establishments, setEstablishments] = useState<Map<string, Establishment>>(new Map());
  const [customerProfiles, setCustomerProfiles] = useState<Map<string, CustomerProfile>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize Client
  useEffect(() => {
      initSupabase();
      
      const checkSession = async () => {
          if (!supabase) {
              setIsInitialized(true); 
              return;
          }

          try {
              // Timeout race to prevent hanging indefinitely
              const sessionPromise = supabase.auth.getSession();
              const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000));

              const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any;

              if (session?.user) {
                 await fetchUserProfile(session.user.id, session.user.email!);
              }
          } catch (error: any) {
              console.warn("Session check failed or timed out:", error);
              if (error.message?.includes("Invalid API key")) {
                  // Only clear local storage if using local storage
                  if (!SUPABASE_CONFIG.url) {
                    localStorage.removeItem('supabase_url');
                    localStorage.removeItem('supabase_key');
                    window.location.reload();
                  }
              }
          } finally {
              setIsInitialized(true);
          }
      };
      
      checkSession();
      
      const { data: authListener } = supabase?.auth.onAuthStateChange(async (event: any, session: any) => {
          if (event === 'SIGNED_IN' && session?.user) {
              await fetchUserProfile(session.user.id, session.user.email!);
          } else if (event === 'SIGNED_OUT') {
              setCurrentUser(null);
              setEstablishments(new Map());
          }
      }) || { data: { subscription: { unsubscribe: () => {} } } };

      return () => {
          if (authListener && authListener.subscription) {
              authListener.subscription.unsubscribe();
          }
      }
  }, []);

  // --- Helper Fetch Functions ---

  const fetchUserProfile = async (userId: string, email: string) => {
      if (!supabase) return;
      
      // Retry fetching profile to handle network jitters
      try {
          const { data: profile, error } = await withRetry<any>(() => supabase!.from('profiles').select('*').eq('id', userId).single());
          
          if (error) {
              // Handle missing profile (PGRST116) commonly caused by DB resets while logged in
              if (error.code === 'PGRST116') {
                  console.warn("Perfil não encontrado (PGRST116). Realizando logout para limpar sessão.");
                  await supabase.auth.signOut();
                  setCurrentUser(null);
                  return;
              }

              console.error('Error fetching profile:', JSON.stringify(error));
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
                      subscribeToEstablishmentCalls(est.id);
                  }
              } 
              
              if (user.role === Role.CUSTOMER) {
                  await loadCustomerData(userId);
              }

              setCurrentUser(user);
              setUsers(prev => {
                  const filtered = prev.filter(u => u.id !== user.id);
                  return [...filtered, user];
              });
          }
      } catch (e) {
          console.error("Failed to load user profile after retries", e);
      }
  };

  const loadEstablishmentData = async (estId: string) => {
      if (!supabase) return;
      
      const { data: est } = await supabase.from('establishments').select('*').eq('id', estId).single();
      if (!est) return;

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
          eventLog: [] 
      };

      setEstablishments(prev => new Map(prev).set(estId, fullEst));
      return fullEst;
  };

  const loadCustomerData = async (userId: string) => {
      if (!supabase) return;
      
      try {
        const { data: details } = await supabase.from('customer_details').select('*').eq('user_id', userId).maybeSingle();
        const { data: favs } = await supabase.from('customer_favorites').select('establishment_id').eq('user_id', userId);
        const favIds = favs?.map((f: any) => f.establishment_id) || [];

        // Async load establishments to avoid blocking
        favIds.forEach(id => loadEstablishmentData(id));

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

  // --- Realtime ---
  const subscribeToEstablishmentCalls = (estId: string) => {
      if (!supabase) return;
      const channel = supabase.channel('public:calls')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `establishment_id=eq.${estId}` }, 
        () => {
            loadEstablishmentData(estId);
        })
        .subscribe();
      return () => { supabase?.removeChannel(channel); }
  };


  // --- Actions ---

  const login = useCallback(async (email: string, password: string) => {
      if (!supabase) throw new Error("Supabase não configurado");
      try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) {
              throw error;
          }
          if (data.user) {
              return { id: data.user.id, email, password: '', role: Role.CUSTOMER, name: '', status: UserStatus.TESTING } as User; 
          }
          throw new Error("Erro desconhecido no login");
      } catch (err: any) {
          const msg = handleCommonErrors(err);
          throw new Error(msg);
      }
  }, []);

  const loginAsAdminBackdoor = useCallback(async () => {
      const adminUser: User = {
          id: 'admin-backdoor-user',
          email: 'admin@sistema.com',
          password: '',
          role: Role.ADMIN,
          name: 'Super Administrador',
          status: UserStatus.SUBSCRIBER
      };
      setCurrentUser(adminUser);
  }, []);

  const logout = useCallback(async () => {
      if (!supabase) {
          setCurrentUser(null);
          return;
      }
      await supabase.auth.signOut();
      setCurrentUser(null);
  }, []);

  const registerEstablishment = useCallback(async (name: string, phone: string, email: string, password: string, photoUrl: string | null, phrase: string) => {
      if (!supabase) throw new Error("Erro de conexão: Supabase não iniciado.");
      
      const cleanPhone = sanitizePhone(phone);
      let userId = '';

      try {
        // 1. Auth Creation
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        
        if (authError) {
            handleCommonErrors(authError);
            
            const isAlreadyRegistered = 
                authError.message?.toLowerCase().includes("already registered") || 
                authError.status === 422 || 
                authError.code === 'user_already_exists';

            if (isAlreadyRegistered) {
                // Tenta logar e ver se o perfil existe
                const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
                
                if (loginError) throw new Error("Este e-mail já está cadastrado, mas a senha informada está incorreta.");
                
                if (loginData.user) {
                    const { data: existingProfile } = await supabase.from('profiles').select('id').eq('id', loginData.user.id).single();
                    if (existingProfile) throw new Error("Esta conta já existe e está ativa. Por favor, faça login.");
                    userId = loginData.user.id; // Zombie account recovery
                }
            } else {
                 throw new Error(authError.message);
            }
        } else {
            if (!authData.user) throw new Error("Falha ao criar usuário Auth.");
            userId = authData.user.id;

            if (!authData.session) {
                const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
                if (loginError || !loginData.session) {
                    throw new Error("Sua conta foi criada, mas o login automático falhou. Desative 'Confirm Email' no Supabase.");
                }
            }
        }

        await new Promise(resolve => setTimeout(resolve, 1500));

        // 2. Insert Profile
        const { error: profileError } = await withRetry<any>(() => supabase!.from('profiles').upsert({
            id: userId,
            email,
            role: Role.ESTABLISHMENT,
            name,
            status: UserStatus.TESTING
        }).select());
        
        if (profileError) {
             if (profileError.message.includes("row-level security")) {
                 throw new Error("Erro de Permissão (RLS). Rode o script de Policies no Supabase.");
             }
             throw new Error(profileError.message);
        }

        // 3. Insert Establishment
        const { data: estData, error: estError } = await withRetry<any>(() => supabase!.from('establishments').insert({
            owner_id: userId,
            name,
            phone: cleanPhone,
            photo_url: photoUrl || `https://picsum.photos/seed/${Date.now()}/400/200`,
            phrase,
            settings: DEFAULT_SETTINGS
        }).select().single());
        
        if (estError) throw new Error(estError.message);

        return { id: userId, email, role: Role.ESTABLISHMENT, name, status: UserStatus.TESTING, establishmentId: estData.id } as User;
      } catch (err: any) {
          console.error("Erro no registro:", err);
          const msg = handleCommonErrors(err);
          throw new Error(msg);
      }
  }, []);

  const registerCustomer = useCallback(async (name: string, email: string, password: string, phone?: string, cep?: string) => {
      if (!supabase) throw new Error("Erro de conexão: Supabase não iniciado.");

      let userId = '';

      try {
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        
        if (authError) {
            handleCommonErrors(authError);
             const isAlreadyRegistered = 
                authError.message?.toLowerCase().includes("already registered") || 
                authError.status === 422 || 
                authError.code === 'user_already_exists';

            if (isAlreadyRegistered) {
                const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
                if (loginError) throw new Error("Este e-mail já está cadastrado, mas a senha informada está incorreta.");
                
                if (loginData.user) {
                     const { data: existingProfile } = await supabase.from('profiles').select('id').eq('id', loginData.user.id).single();
                     if (existingProfile) throw new Error("Esta conta já existe. Por favor, faça login.");
                     userId = loginData.user.id;
                }
            } else {
                throw new Error(authError.message);
            }
        } else {
            if (!authData.user) throw new Error("Falha ao criar usuário Auth.");
            userId = authData.user.id;
            
            if (!authData.session) {
                const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
                if (loginError || !loginData.session) {
                    throw new Error("Sua conta foi criada, mas o login automático falhou. Desative 'Confirm Email' no Supabase.");
                }
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1500));

        const { error: profileError } = await withRetry<any>(() => supabase!.from('profiles').upsert({
            id: userId,
            email,
            role: Role.CUSTOMER,
            name,
            status: UserStatus.TESTING
        }).select());
        
        if (profileError) {
             if (profileError.message.includes("row-level security")) {
                 throw new Error("Erro de Permissão (RLS). Rode o script de Policies no Supabase.");
             }
             throw new Error(profileError.message);
        }

        if (phone || cep) {
            await withRetry(() => supabase!.from('customer_details').insert({
                user_id: userId,
                phone: phone ? sanitizePhone(phone) : null,
                cep: cep || null
            }));
        }

        return { id: userId, email, role: Role.CUSTOMER, name, status: UserStatus.TESTING } as User;
      } catch (err: any) {
           console.error("Erro no registro:", err);
           const msg = handleCommonErrors(err);
           throw new Error(msg);
      }
  }, []);

  const addCall = useCallback(async (establishmentId: string, tableNumber: string, type: CallType) => {
      if (!supabase) return;
      const { error } = await withRetry<any>(() => supabase!.from('calls').insert({
          establishment_id: establishmentId,
          table_number: tableNumber,
          type,
          status: CallStatus.SENT,
          created_at_ts: Date.now()
      }));
      if (error) console.error("Failed to add call", error);
      else loadEstablishmentData(establishmentId); 
  }, []);

  const updateCallsByPredicate = useCallback(async (establishmentId: string, tableNumber: string, predicate: (call: Call) => boolean, update: (call: Call) => Partial<Call>) => {
     if (!supabase) return;
     const establishment = establishments.get(establishmentId);
     const table = establishment?.tables.get(tableNumber);
     if (!table) return;

     const callsToUpdate = table.calls.filter(predicate);
     const idsToUpdate = callsToUpdate.map(c => c.id);

     if (idsToUpdate.length === 0) return;

     const sampleUpdate = update(callsToUpdate[0]);
     const statusUpdate = sampleUpdate.status;

     if (statusUpdate) {
         await withRetry(() => supabase!.from('calls').update({ status: statusUpdate }).in('id', idsToUpdate));
         loadEstablishmentData(establishmentId);
     }
  }, [establishments]);

  const viewAllCallsForTable = useCallback((establishmentId: string, tableNumber: string) => {
     updateCallsByPredicate(establishmentId, tableNumber, 
        c => c.status === CallStatus.SENT,
        c => ({ ...c, status: CallStatus.VIEWED })
     );
  }, [updateCallsByPredicate]);

  const cancelOldestCallByType = useCallback(async (establishmentId: string, tableNumber: string, callType: CallType) => {
     if (!supabase) return;
     const { data } = await supabase.from('calls')
        .select('id')
        .eq('establishment_id', establishmentId)
        .eq('table_number', tableNumber)
        .eq('type', callType)
        .in('status', ['SENT', 'VIEWED'])
        .order('created_at_ts', { ascending: true })
        .limit(1);
    
    if (data && data.length > 0) {
        await withRetry(() => supabase!.from('calls').update({ status: CallStatus.CANCELED }).eq('id', data[0].id));
        loadEstablishmentData(establishmentId);
    }
  }, []);

  const attendOldestCallByType = useCallback(async (establishmentId: string, tableNumber: string, callType: CallType) => {
      if (!supabase) return;
       const { data } = await supabase.from('calls')
        .select('id')
        .eq('establishment_id', establishmentId)
        .eq('table_number', tableNumber)
        .eq('type', callType)
        .in('status', ['SENT', 'VIEWED'])
        .order('created_at_ts', { ascending: true })
        .limit(1);
    
    if (data && data.length > 0) {
        await withRetry(() => supabase!.from('calls').update({ status: CallStatus.ATTENDED }).eq('id', data[0].id));
        loadEstablishmentData(establishmentId);
    }
  }, []);

  const closeTable = useCallback(async (establishmentId: string, tableNumber: string) => {
      if (!supabase) return;
      await withRetry(() => supabase!.from('calls')
        .update({ status: CallStatus.ATTENDED }) 
        .eq('establishment_id', establishmentId)
        .eq('table_number', tableNumber)
        .in('status', ['SENT', 'VIEWED']));
      
      loadEstablishmentData(establishmentId);
  }, []);

  const updateSettings = useCallback(async (establishmentId: string, newSettings: Settings) => {
      if (!supabase) return;
      await withRetry(() => supabase!.from('establishments').update({ settings: newSettings }).eq('id', establishmentId));
      loadEstablishmentData(establishmentId);
  }, []);

  const getEstablishmentByPhone = useCallback((phone: string) => {
      const cleanSearch = sanitizePhone(phone);
      return Array.from(establishments.values()).find((e: Establishment) => e.phone === cleanSearch);
  }, [establishments]);

  const searchEstablishmentByPhone = async (phone: string) => {
      if (!supabase) return null;
      const cleanSearch = sanitizePhone(phone);
      // Direct retry here
      const { data } = await withRetry<any>(() => supabase!.from('establishments').select('*').eq('phone', cleanSearch).maybeSingle());
      if (data) {
          await loadEstablishmentData(data.id);
          // Return the full object from map, ensuring we have latest calls
          return loadEstablishmentData(data.id);
      }
      return null;
  }

  const favoriteEstablishment = useCallback(async (userId: string, establishmentId: string) => {
      if (!supabase) return;
      
      const { data: profile } = await supabase.from('customer_favorites').select('id').eq('user_id', userId);
      if (profile && profile.length >= 3) {
           throw new Error("Você atingiu o máximo de 3 estabelecimentos favoritos.");
      }

      const { error } = await withRetry<any>(() => supabase!.from('customer_favorites').insert({ user_id: userId, establishment_id: establishmentId }));
      if (error) {
          if (error.code === '23505') return; 
          throw error;
      }
      loadCustomerData(userId);
  }, []);

  const unfavoriteEstablishment = useCallback(async (userId: string, establishmentId: string) => {
      if (!supabase) return;
      await withRetry(() => supabase!.from('customer_favorites').delete().eq('user_id', userId).eq('establishment_id', establishmentId));
      loadCustomerData(userId);
  }, []);

  const updateUserStatus = useCallback(async (userId: string, newStatus: UserStatus) => {
       if (!supabase) return;
       await withRetry(() => supabase!.from('profiles').update({ status: newStatus }).eq('id', userId));
       setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
  }, []);

  const deleteCurrentUser = useCallback(async () => {
      if (!supabase || !currentUser) return;
      await withRetry(() => supabase!.from('profiles').delete().eq('id', currentUser.id));
      await logout();
  }, [currentUser, logout]);

  // --- Logic Re-use ---
  const getTableSemaphoreStatus = useCallback((table: Table, settings: Settings): SemaphoreStatus => {
    const activeCalls = table.calls.filter(c => c.status !== CallStatus.ATTENDED && c.status !== CallStatus.CANCELED);
    if (activeCalls.length === 0) return SemaphoreStatus.IDLE;

    const oldestCall = activeCalls.reduce((oldest, current) => current.createdAt < oldest.createdAt ? current : oldest);
    const timeElapsed = (Date.now() - oldestCall.createdAt) / 1000;

    const { timeGreen, timeYellow, qtyGreen, qtyYellow } = settings;

    const isRedByTime = timeElapsed > timeYellow;
    const isYellowByTime = timeElapsed > timeGreen && timeElapsed <= timeYellow;
    
    const callsByType = activeCalls.reduce((acc, call) => {
        acc[call.type] = (acc[call.type] || 0) + 1;
        return acc;
    }, {} as Record<CallType, number>);

    const isRedByQty = Object.values(callsByType).some(count => count > qtyYellow);
    const isYellowByQty = Object.values(callsByType).some(count => count > qtyGreen && count <= qtyYellow);

    if (isRedByTime || isRedByQty) return SemaphoreStatus.RED;
    if (isYellowByTime || isYellowByQty) return SemaphoreStatus.YELLOW;
    
    return SemaphoreStatus.GREEN;
  }, []);

  const getCallTypeSemaphoreStatus = useCallback((table: Table, callType: CallType, settings: Settings): SemaphoreStatus => {
    const callsOfType = table.calls.filter(c => c.type === callType && (c.status === CallStatus.SENT || c.status === CallStatus.VIEWED));
    if (callsOfType.length === 0) return SemaphoreStatus.IDLE;

    const oldestCall = callsOfType.reduce((oldest, current) => current.createdAt < oldest.createdAt ? current : oldest, callsOfType[0]);
    const timeElapsed = (Date.now() - oldestCall.createdAt) / 1000;

    const { timeGreen, timeYellow, qtyGreen, qtyYellow } = settings;

    const isRedByTime = timeElapsed > timeYellow;
    const isYellowByTime = timeElapsed > timeGreen && timeElapsed <= timeYellow;
    
    const isRedByQty = callsOfType.length > qtyYellow;
    const isYellowByQty = callsOfType.length > qtyGreen && callsOfType.length <= qtyYellow;

    if (isRedByTime || isRedByQty) return SemaphoreStatus.RED;
    if (isYellowByTime || isYellowByQty) return SemaphoreStatus.YELLOW;
    
    return SemaphoreStatus.GREEN;
  }, []);


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

  const checkTableAvailability = async (establishmentId: string, tableNumber: string): Promise<boolean> => {
      if (!supabase) return false;
      const { data } = await supabase.from('calls')
        .select('id')
        .eq('establishment_id', establishmentId)
        .eq('table_number', tableNumber)
        .in('status', ['SENT', 'VIEWED'])
        .limit(1);
      
      return !data || data.length === 0;
  }

  return { 
    isInitialized,
    users,
    currentUser,
    establishments,
    currentEstablishment,
    currentCustomerProfile,
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
