
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

const initSupabase = () => {
    try {
        let url = SUPABASE_CONFIG.url;
        let key = SUPABASE_CONFIG.anonKey;

        if (!url || !key) {
            url = localStorage.getItem('supabase_url') || '';
            key = localStorage.getItem('supabase_key') || '';
        }

        // Only initialize if we have creds and no instance, or if instance is invalid
        if (url && key) {
             if (!supabase) {
                if (!url.startsWith('http')) throw new Error("Invalid URL");
                supabase = createClient(url, key);
             }
        } else {
            // If no creds, ensure supabase is null
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

  useEffect(() => {
      // Initialize client
      const client = initSupabase();
      
      const checkSession = async () => {
          // Extra defensive check: Ensure client exists AND has auth property
          if (!client || !client.auth) {
              setIsInitialized(true); 
              return;
          }

          try {
              const sessionPromise = client.auth.getSession();
              const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000));

              const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any;

              if (session?.user) {
                 await fetchUserProfile(session.user.id, session.user.email!);
              }
          } catch (error: any) {
              console.warn("Session check failed or timed out:", error);
              if (error.message?.includes("Invalid API key")) {
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
      
      let authListener: any = null;
      
      // Setup listener only if client is valid
      if (client && client.auth) {
          try {
              const { data } = client.auth.onAuthStateChange(async (event: any, session: any) => {
                  if (event === 'SIGNED_IN' && session?.user) {
                      await fetchUserProfile(session.user.id, session.user.email!);
                  } else if (event === 'SIGNED_OUT') {
                      setCurrentUser(null);
                      setEstablishments(new Map());
                  }
              });
              authListener = data;
          } catch (e) {
              console.error("Error setting up auth listener", e);
          }
      }

      return () => {
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

              try {
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
              } catch (innerError) {
                  console.error("Erro ao carregar dados complementares, mas logando usuário:", innerError);
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
          eventLog: [],
          isOpen: est.is_open || false
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

        // Usar Promise.allSettled para evitar que um erro em um estabelecimento trave todos
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

  const subscribeToEstablishmentCalls = useCallback((estId: string) => {
      if (!supabase) return () => {};
      const channel = supabase.channel(`public:calls:${estId}`)
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'calls', filter: `establishment_id=eq.${estId}` }, 
            (payload: any) => {
                loadEstablishmentData(estId);
            }
        )
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'establishments', filter: `id=eq.${estId}` },
            (payload: any) => {
                loadEstablishmentData(estId);
            }
        )
        .subscribe();
      return () => { supabase?.removeChannel(channel); }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
      if (email === 'eduardo_j_muller@yahoo.com.br' && password === 'Eduardoj') {
          const adminUser: User = {
              id: 'admin-hardcoded',
              email: email,
              password: '',
              role: Role.ADMIN,
              name: 'Eduardo Muller',
              status: UserStatus.SUBSCRIBER
          };
          setCurrentUser(adminUser);
          return adminUser;
      }

      if (!supabase) throw new Error("Supabase não configurado");
      try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          
          if (data.user) {
              const { data: est } = await supabase.from('establishments').select('id').eq('owner_id', data.user.id).single();
              if (est) {
                  await supabase.from('establishments').update({ is_open: true }).eq('id', est.id);
              }

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
      
      if (currentUser?.role === Role.ESTABLISHMENT && currentUser.establishmentId) {
          try {
             await supabase.from('establishments').update({ is_open: false }).eq('id', currentUser.establishmentId);
          } catch (e) { console.error("Error setting offline status", e); }
      }

      try {
        await supabase.auth.signOut();
      } catch(e) { console.error(e); }
      
      setCurrentUser(null);
      setEstablishments(new Map());
  }, [currentUser]);

  const registerEstablishment = useCallback(async (name: string, phone: string, email: string, password: string, photoUrl: string | null, phrase: string) => {
      if (!supabase) throw new Error("Erro de conexão: Supabase não iniciado.");
      
      const cleanPhone = sanitizePhone(phone);
      let userId = '';

      try {
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        
        if (authError) {
            handleCommonErrors(authError);
            const isAlreadyRegistered = 
                authError.message?.toLowerCase().includes("already registered") || 
                authError.code === 'user_already_exists';

            if (isAlreadyRegistered) {
                const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
                if (loginError) throw new Error("Este e-mail já está cadastrado, mas a senha informada está incorreta.");
                if (loginData.user) {
                     // Check if profile exists, if not, proceed to create it (zombie user recovery)
                    const { data: existingProfile } = await supabase.from('profiles').select('id, role').eq('id', loginData.user.id).maybeSingle();
                    if (existingProfile) {
                        if(existingProfile.role === Role.ESTABLISHMENT) {
                            throw new Error("Esta conta já existe e está ativa como Estabelecimento. Por favor, faça login.");
                        } else {
                            throw new Error(`Esta conta já existe como ${existingProfile.role}. Use outro email.`);
                        }
                    }
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
            role: Role.ESTABLISHMENT,
            name,
            status: UserStatus.TESTING
        }).select());
        
        if (profileError) throw new Error(profileError.message);

        // Check if establishment already exists for this user
        const {data: existingEst} = await supabase.from('establishments').select('id').eq('owner_id', userId).maybeSingle();
        
        let estId = existingEst?.id;

        if (!existingEst) {
            const { data: estData, error: estError } = await withRetry<any>(() => supabase!.from('establishments').insert({
                owner_id: userId,
                name,
                phone: cleanPhone,
                photo_url: photoUrl || `https://picsum.photos/seed/${Date.now()}/400/200`,
                phrase,
                settings: DEFAULT_SETTINGS,
                is_open: true 
            }).select().single());
            
            if (estError) throw new Error(estError.message);
            estId = estData.id;
        } else {
            // Update existing establishment details
             await withRetry<any>(() => supabase!.from('establishments').update({
                name,
                phone: cleanPhone,
                photo_url: photoUrl || `https://picsum.photos/seed/${Date.now()}/400/200`,
                phrase,
                is_open: true
            }).eq('id', estId));
        }

        return { id: userId, email, role: Role.ESTABLISHMENT, name, status: UserStatus.TESTING, establishmentId: estId } as User;
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
                authError.code === 'user_already_exists';

            if (isAlreadyRegistered) {
                const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
                if (loginError) throw new Error("Este e-mail já está cadastrado, mas a senha informada está incorreta.");
                if (loginData.user) {
                     const { data: existingProfile } = await supabase.from('profiles').select('id, role').eq('id', loginData.user.id).maybeSingle();
                     if (existingProfile) {
                         if(existingProfile.role === Role.CUSTOMER) {
                             throw new Error("Esta conta já existe. Por favor, faça login.");
                         } else {
                             throw new Error(`Esta conta já existe como ${existingProfile.role}. Use outro email.`);
                         }
                     }
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
        
        if (profileError) throw new Error(profileError.message);

        if (phone || cep) {
            await withRetry(() => supabase!.from('customer_details').upsert({
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
      try {
        const { error } = await withRetry<any>(() => supabase!.from('calls').insert({
            establishment_id: establishmentId,
            table_number: tableNumber,
            type,
            status: CallStatus.SENT,
            created_at_ts: Date.now()
        }));
        if (error) {
            console.error("Failed to add call", error);
            alert("Erro ao enviar chamado. Verifique sua conexão.");
        } else {
            loadEstablishmentData(establishmentId); 
        }
      } catch (e) {
          console.error(e);
          alert("Erro ao enviar chamado.");
      }
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
      // Use .limit(1) and handle potential array return to avoid crashing if duplicates exist
      try {
        const { data, error } = await withRetry<any>(() => supabase!.from('establishments').select('*').eq('phone', cleanSearch).limit(1));
        if (error) throw error;
        
        if (data && data.length > 0) {
            return loadEstablishmentData(data[0].id);
        }
      } catch (e) {
          console.error("Erro ao buscar estabelecimento:", e);
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
      if (error && error.code !== '23505') throw error;
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
      // 1. Check if establishment is online (Open)
      const establishment = establishments.get(establishmentId);
      if (establishment && !establishment.isOpen) {
          throw new Error("Este estabelecimento está fechado ou indisponível no momento.");
      }

      if (!supabase) return false;

      // 2. Check if table is free
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
    loadCustomerData // Exposing this to allow manual refresh
  };
};
