
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Establishment, Table, CallType, CallStatus, Settings, SemaphoreStatus, User, Role, CustomerProfile, UserStatus } from '../types';
import { DEFAULT_SETTINGS, SUPABASE_CONFIG, POLLING_INTERVAL } from '../constants';

// --- Tipagem para chamadas do Banco ---
interface DBCall {
    id: string;
    establishment_id: string;
    table_number: string;
    type: CallType;
    status: CallStatus;
    created_at_ts: number;
}

// --- Inicialização do Supabase Singleton ---
let supabaseInstance: any = null;

const initSupabase = () => {
    if (supabaseInstance) return supabaseInstance;
    try {
        const url = SUPABASE_CONFIG.url?.trim() || localStorage.getItem('supabase_url')?.trim();
        const key = SUPABASE_CONFIG.anonKey?.trim() || localStorage.getItem('supabase_key')?.trim();

        if (url && key && url.startsWith('http')) {
            console.log("[System] Inicializando cliente Supabase...");
            supabaseInstance = createClient(url, key, {
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
            });
        }
    } catch (e) {
        console.error("[System] Erro crítico na inicialização do Supabase:", e);
    }
    return supabaseInstance;
}

const withTimeout = <T>(promise: Promise<T>, ms: number = 8000, label: string = 'Operation'): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms))
    ]);
};

const sanitizePhone = (phone: string) => phone.replace(/\D/g, '');

export const useMockData = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]); 
  const [establishments, setEstablishments] = useState<Map<string, Establishment>>(new Map());
  const [customerProfiles, setCustomerProfiles] = useState<Map<string, CustomerProfile>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeSessions, setActiveSessions] = useState<Set<string>>(new Set());
  const [isUpdating, setIsUpdating] = useState(false); 
  const [initError, setInitError] = useState<string | null>(null);

  const supabaseRef = useRef<any>(null);

  const getSb = () => {
      if (supabaseRef.current) return supabaseRef.current;
      const client = initSupabase();
      supabaseRef.current = client;
      return client;
  }

  // --- 1. Boot do Aplicativo ---
  useEffect(() => {
      const client = getSb();
      
      const boot = async () => {
          if (!client) { 
              setIsInitialized(true); 
              return; 
          }
          
          try {
              // Verifica sessão. Se falhar, assume deslogado, mas não trava.
              const { data: { session }, error } = await client.auth.getSession();
              
              if (session?.user) {
                  // Tenta carregar perfil. Se der erro 406/400, recria perfil básico na memória para não travar
                  await fetchUserProfile(session.user.id, session.user.email!).catch(err => {
                      console.error("[Boot] Erro ao carregar perfil (Recuperação Ativa):", err);
                      // Fallback: Cria usuário básico na memória para permitir o login
                      const fallbackUser: User = {
                          id: session.user.id,
                          email: session.user.email!,
                          password: '',
                          role: Role.CUSTOMER, // Assume cliente por segurança se falhar
                          name: "Usuário Recuperado",
                          status: UserStatus.TESTING
                      };
                      setCurrentUser(fallbackUser);
                  });
              }
          } catch (e) {
              console.error("[Boot] Exceção:", e);
          } finally {
              setIsInitialized(true);
          }
      };
      
      boot();

      const { data: { subscription } } = client?.auth.onAuthStateChange(async (event: string, session: any) => {
          if (event === 'SIGNED_IN' && session?.user) {
              await fetchUserProfile(session.user.id, session.user.email!);
          }
          if (event === 'SIGNED_OUT') {
              setCurrentUser(null);
              setEstablishments(new Map());
          }
      }) || { data: { subscription: { unsubscribe: () => {} } } };

      return () => subscription.unsubscribe();
  }, []);

  // --- 2. Ciclo de Polling (Defensivo) ---
  useEffect(() => {
      if (!currentUser) return;

      const cycle = async () => {
          if (isUpdating) return;
          setIsUpdating(true); 
          try {
              if (currentUser.role === Role.ESTABLISHMENT) {
                  // Se temos ID, atualiza. Se não, tenta achar o ID.
                  if (currentUser.establishmentId) {
                      await Promise.all([
                          sendHeartbeat(currentUser.establishmentId),
                          loadEstablishmentData(currentUser.establishmentId)
                      ]);
                  } else {
                       const sb = getSb();
                       // Use maybeSingle e colunas específicas para evitar 400/406
                       const { data: est } = await sb.from('establishments').select('id').eq('owner_id', currentUser.id).maybeSingle();
                       if (est) {
                           setCurrentUser(prev => prev ? {...prev, establishmentId: est.id} : null);
                           await loadEstablishmentData(est.id);
                       }
                  }
              } else if (currentUser.role === Role.CUSTOMER) {
                  const profile = customerProfiles.get(currentUser.id);
                  if (profile?.favoritedEstablishmentIds) {
                      // Carrega um por um para que um erro não trave todos
                      for (const id of profile.favoritedEstablishmentIds) {
                          await loadEstablishmentData(id).catch(console.error);
                      }
                  }
              }
          } catch (e) {
              // Silencia erros no polling para não poluir console
          } finally {
              setIsUpdating(false);
          }
      };

      const intervalId = setInterval(cycle, POLLING_INTERVAL);
      cycle(); 
      return () => clearInterval(intervalId);
  }, [currentUser?.id, currentUser?.establishmentId]);

  // --- Funções Principais Blindadas ---

  const sendHeartbeat = async (estId: string) => {
      const sb = getSb();
      if (!sb) return;
      // Envia APENAS o is_open. Se falhar, apenas loga.
      // 400 aqui significa que o ID não bate ou a coluna não existe (impossível se criado via app)
      await sb.from('establishments').update({ is_open: true }).eq('id', estId).then(({error}: any) => {
          if(error) console.warn(`[Heartbeat] Falha silenciosa: ${error.message}`);
      });
  };

  const loadEstablishmentData = async (estId: string) => {
      const sb = getSb();
      if (!sb) return null;
      
      try {
          // SELECT EXPLÍCITO: Evita select(*) que causa erro 400 se houver colunas fantasmas
          const columns = 'id, owner_id, name, phone, photo_url, phrase, is_open, settings';
          const { data: est, error: estError } = await withTimeout(
              sb.from('establishments').select(columns).eq('id', estId).maybeSingle()
          ) as any;

          // MODO DE EMERGÊNCIA: Se o banco falhar (400/406), retornamos um objeto mockado
          // para que o usuário consiga acessar o painel e ver que está logado.
          if (estError || !est) {
              console.warn(`[LoadEst] Falha ao carregar do banco (${estError?.code}). Usando modo offline.`);
              // Se já temos dados na memória, mantemos. Se não, criamos um placeholder.
              if (establishments.has(estId)) return establishments.get(estId)!;
              
              if (currentUser?.role === Role.ESTABLISHMENT && currentUser.establishmentId === estId) {
                  // Cria um estabelecimento "Virtual" para o dono conseguir entrar
                  const fallbackEst: Establishment = {
                      id: estId,
                      ownerId: currentUser.id,
                      name: currentUser.name || "Meu Restaurante (Offline)",
                      phone: "000000000",
                      photoUrl: "",
                      phrase: "Modo de Recuperação",
                      settings: DEFAULT_SETTINGS,
                      tables: new Map(),
                      eventLog: [],
                      isOpen: true
                  };
                  setEstablishments(prev => new Map(prev).set(estId, fallbackEst));
                  return fallbackEst;
              }
              return null;
          }

          // Carrega chamados
          const { data: calls } = await sb.from('calls').select('id, type, status, table_number, created_at_ts').eq('establishment_id', estId).in('status', ['SENT', 'VIEWED']);

          const tablesMap = new Map<string, Table>();
          
          if (calls) {
              (calls as DBCall[]).forEach((c: DBCall) => {
                  const existing = tablesMap.get(c.table_number) || { number: c.table_number, calls: [] };
                  existing.calls.push({ id: c.id, type: c.type, status: c.status, createdAt: c.created_at_ts });
                  tablesMap.set(c.table_number, existing);
              });
          }

          const totalTables = est.settings?.totalTables || DEFAULT_SETTINGS.totalTables;
          for(let i=1; i<=totalTables; i++) {
              const num = i.toString();
              if(!tablesMap.has(num)) tablesMap.set(num, { number: num, calls: [] });
          }

          const fullEst: Establishment = {
              id: est.id, ownerId: est.owner_id, name: est.name, phone: est.phone,
              photoUrl: est.photo_url, phrase: est.phrase, settings: est.settings || DEFAULT_SETTINGS,
              tables: tablesMap, eventLog: [], isOpen: est.is_open === true
          };
          
          setEstablishments(prev => new Map(prev).set(estId, fullEst));
          return fullEst;
      } catch (e) { 
          console.error(`[LoadEst] Erro:`, e);
          return null; 
      }
  };

  const fetchUserProfile = async (userId: string, email: string) => {
      const sb = getSb();
      if (!sb) return;
      
      // SELECT EXPLÍCITO e MAYBESINGLE para evitar 406
      const { data: profile, error } = await sb.from('profiles').select('id, role, name, status').eq('id', userId).maybeSingle();
      
      if (error || !profile) {
          console.warn("[FetchProfile] Perfil não encontrado. Criando perfil temporário.");
          // Se não achar perfil, cria um objeto local para não travar o login
          const tempUser: User = { 
              id: userId, email, password: '', role: Role.CUSTOMER, name: 'Usuário', status: UserStatus.TESTING 
          };
          setCurrentUser(tempUser);
          return;
      }

      const user: User = { 
          id: profile.id, email, password: '', role: profile.role as Role, name: profile.name, status: profile.status as UserStatus 
      };
      
      setCurrentUser(user);

      if (user.role === Role.ESTABLISHMENT) {
          // Tenta achar o link do estabelecimento
          const { data: est } = await sb.from('establishments').select('id').eq('owner_id', userId).maybeSingle();
          if (est) {
              user.establishmentId = est.id;
              setCurrentUser(prev => prev ? { ...prev, establishmentId: est.id } : null);
              await loadEstablishmentData(est.id);
          }
      } else {
          loadCustomerData(userId);
      }
  };

  const loadCustomerData = async (userId: string) => {
      const sb = getSb();
      try {
          const { data: favs } = await sb.from('customer_favorites').select('establishment_id').eq('user_id', userId);
          const favIds = favs?.map((f: any) => f.establishment_id) || [];
          const { data: details } = await sb.from('customer_details').select('phone, cep').eq('user_id', userId).maybeSingle();
          
          const profile: CustomerProfile = { userId, favoritedEstablishmentIds: favIds, phone: details?.phone, cep: details?.cep };
          setCustomerProfiles(prev => new Map(prev).set(userId, profile));
          
          if (favIds.length > 0) {
             favIds.forEach(id => loadEstablishmentData(id));
          }
      } catch (e) {}
  };

  // --- Actions ---

  const login = useCallback(async (email: string, password: string) => {
      const sb = getSb();
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await fetchUserProfile(data.user.id, data.user.email!);
  }, []);

  const logout = useCallback(async () => {
      const sb = getSb();
      if (currentUser?.role === Role.ESTABLISHMENT && currentUser.establishmentId) {
          // Tenta fechar, mas sem await para não travar logout se der 400
          sb.from('establishments').update({ is_open: false }).eq('id', currentUser.establishmentId).then(() => {});
      }
      await sb.auth.signOut();
      setCurrentUser(null);
  }, [currentUser]);

  // Recuperação forçada
  const restoreEstablishment = async () => {
      if(!currentUser) return;
      const sb = getSb();
      // Força inserção básica
      try {
        await sb.from('establishments').insert({ 
            owner_id: currentUser.id, 
            name: currentUser.name, 
            phone: "000000000", 
            settings: DEFAULT_SETTINGS, 
            is_open: true 
        });
        window.location.reload();
      } catch(e) { alert("Erro na restauração"); }
  };

  return {
      isInitialized, setIsInitialized, isUpdating, initError,
      currentUser, users, establishments, customerProfiles, activeSessions,
      currentEstablishment: currentUser?.establishmentId ? establishments.get(currentUser.establishmentId) : null,
      currentCustomerProfile: currentUser?.id ? customerProfiles.get(currentUser.id) : null,
      login, logout, restoreEstablishment,
      
      // Funções de escrita mantidas simples
      registerEstablishment: async (name: string, phone: string, email: string, password: string, photo: string | null, phrase: string) => {
          const sb = getSb();
          const { data, error } = await sb.auth.signUp({ email, password });
          if (error) throw error;
          const uid = data.user!.id;
          await sb.from('profiles').insert({ id: uid, email, role: Role.ESTABLISHMENT, name, status: UserStatus.TESTING });
          await sb.from('establishments').insert({ 
              owner_id: uid, name, phone: sanitizePhone(phone), 
              photo_url: photo, phrase, settings: DEFAULT_SETTINGS, is_open: true 
          });
          return { name };
      },
      registerCustomer: async (name: string, email: string, password: string, phone?: string, cep?: string) => {
          const sb = getSb();
          const { data, error } = await sb.auth.signUp({ email, password });
          if (error) throw error;
          const uid = data.user!.id;
          await sb.from('profiles').insert({ id: uid, email, role: Role.CUSTOMER, name, status: UserStatus.TESTING });
          if (phone || cep) await sb.from('customer_details').insert({ user_id: uid, phone, cep });
          return { name };
      },
      searchEstablishmentByPhone: async (phone: string) => {
          const sb = getSb();
          const clean = sanitizePhone(phone);
          const { data } = await sb.from('establishments').select('id').eq('phone', clean).maybeSingle();
          if (!data) return null;
          return await loadEstablishmentData(data.id);
      },
      addCall: async (estId: string, tableNum: string, type: CallType) => {
          const sb = getSb();
          await sb.from('calls').insert({ establishment_id: estId, table_number: tableNum, type, status: CallStatus.SENT, created_at_ts: Date.now() });
          // Atualiza localmente imediatamente
          loadEstablishmentData(estId);
      },
      closeEstablishmentWorkday: async (id: string) => {
          const sb = getSb();
          await sb.from('establishments').update({ is_open: false }).eq('id', id);
          await sb.from('calls').update({ status: CallStatus.CANCELED }).eq('establishment_id', id).in('status', ['SENT', 'VIEWED']);
          loadEstablishmentData(id);
      },
      checkPendingCallsOnLogin: async (id: string) => {
          const sb = getSb();
          const { count } = await sb.from('calls').select('*', { count: 'exact', head: true }).eq('establishment_id', id).in('status', ['SENT', 'VIEWED']);
          return (count || 0) > 0;
      },
      attendOldestCallByType: async (estId: string, tableNum: string, type: CallType) => {
          const sb = getSb();
          const { data } = await sb.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNum).eq('type', type).in('status', ['SENT', 'VIEWED']).order('created_at_ts', {ascending: true}).limit(1);
          if (data?.[0]) {
              await sb.from('calls').update({ status: CallStatus.ATTENDED }).eq('id', data[0].id);
              loadEstablishmentData(estId);
          }
      },
      cancelOldestCallByType: async (estId: string, tableNum: string, type: CallType) => {
          const sb = getSb();
          const { data } = await sb.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNum).eq('type', type).in('status', ['SENT', 'VIEWED']).order('created_at_ts', {ascending: true}).limit(1);
          if (data?.[0]) {
              await sb.from('calls').update({ status: CallStatus.CANCELED }).eq('id', data[0].id);
              loadEstablishmentData(estId);
          }
      },
      viewAllCallsForTable: async (estId: string, tableNum: string) => {
          const sb = getSb();
          const { data } = await sb.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNum).eq('status', CallStatus.SENT);
          if (data?.length) {
              await sb.from('calls').update({ status: CallStatus.VIEWED }).in('id', data.map((c: any) => c.id));
              loadEstablishmentData(estId);
          }
      },
      closeTable: async (estId: string, tableNum: string) => {
          const sb = getSb();
          await sb.from('calls').update({ status: CallStatus.ATTENDED }).eq('establishment_id', estId).eq('table_number', tableNum).in('status', ['SENT', 'VIEWED']);
          loadEstablishmentData(estId);
      },
      favoriteEstablishment: async (uid: string, estId: string) => { 
          await getSb().from('customer_favorites').insert({ user_id: uid, establishment_id: estId }); 
          loadCustomerData(uid); 
      },
      unfavoriteEstablishment: async (uid: string, estId: string) => { 
          await getSb().from('customer_favorites').delete().eq('user_id', uid).eq('establishment_id', estId); 
          loadCustomerData(uid); 
      },
      updateSettings: async (id: string, s: Settings) => { 
          await getSb().from('establishments').update({ settings: s }).eq('id', id); 
          loadEstablishmentData(id); 
      },
      updateUserStatus: async (userId: string, status: UserStatus) => {
          const sb = getSb();
          await sb.from('profiles').update({ status }).eq('id', userId);
          setUsers(prev => prev.map(u => u.id === userId ? { ...u, status } : u));
      },
      getTableSemaphoreStatus: (table: Table, settings: Settings): SemaphoreStatus => {
          const active = table.calls.filter(c => c.status === 'SENT' || c.status === 'VIEWED');
          if (!active.length) return SemaphoreStatus.IDLE;
          const oldest = active.reduce((a, b) => a.createdAt < b.createdAt ? a : b);
          const elapsed = (Date.now() - oldest.createdAt) / 1000;
          if (elapsed > settings.timeYellow) return SemaphoreStatus.RED;
          if (elapsed > settings.timeGreen) return SemaphoreStatus.YELLOW;
          return SemaphoreStatus.GREEN;
      },
      getCallTypeSemaphoreStatus: (table: Table, type: CallType, settings: Settings): SemaphoreStatus => {
          const active = table.calls.filter(c => c.type === type && (c.status === 'SENT' || c.status === 'VIEWED'));
          if (!active.length) return SemaphoreStatus.IDLE;
          const oldest = active[0]; 
          const elapsed = (Date.now() - oldest.createdAt) / 1000;
          if (elapsed > settings.timeYellow) return SemaphoreStatus.RED;
          return SemaphoreStatus.GREEN;
      },
      trackTableSession: (eid: string, t: string) => setActiveSessions(prev => new Set(prev).add(`${eid}:${t}`)),
      getEstablishmentByPhone: (p: string) => Array.from(establishments.values()).find((e: Establishment) => e.phone === sanitizePhone(p)),
      clearAllSessions: async () => {}, 
      deleteCurrentUser: async () => {
          const sb = getSb();
          if (currentUser) await sb.from('profiles').delete().eq('id', currentUser.id);
          await logout();
      },
      subscribeToEstablishmentCalls: () => () => {}, 
      loadAllUsers: async () => {
          const sb = getSb();
          const { data, error } = await sb.from('profiles').select('*');
          if (!error && data) {
              setUsers(data.map((p: any) => ({
                  id: p.id,
                  email: p.email,
                  password: '',
                  role: p.role as Role,
                  name: p.name,
                  status: p.status as UserStatus
              })));
          }
      } 
  }
};
