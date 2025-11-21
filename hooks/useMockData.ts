
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Establishment, Table, Call, CallType, CallStatus, Settings, SemaphoreStatus, User, Role, CustomerProfile, UserStatus, EventLogItem } from '../types';
import { DEFAULT_SETTINGS } from '../constants';

// --- Types for DB Tables ---
// This helps mapping SQL results to app types
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
let supabase: SupabaseClient | null = null;

const initSupabase = () => {
    const url = localStorage.getItem('supabase_url');
    const key = localStorage.getItem('supabase_key');
    if (url && key && !supabase) {
        supabase = createClient(url, key);
    }
    return supabase;
}

export const useMockData = () => {
  // Core state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]); // Cache for admin or search, not full DB dump
  const [establishments, setEstablishments] = useState<Map<string, Establishment>>(new Map());
  const [customerProfiles, setCustomerProfiles] = useState<Map<string, CustomerProfile>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize Client
  useEffect(() => {
      initSupabase();
      // Restore session if exists
      const checkSession = async () => {
          if (!supabase) {
              setIsInitialized(true); 
              return;
          }
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
             await fetchUserProfile(session.user.id, session.user.email!);
          }
          setIsInitialized(true);
      };
      checkSession();
      
      // Listen for auth changes
      const { data: authListener } = supabase?.auth.onAuthStateChange(async (event, session) => {
          if (event === 'SIGNED_IN' && session?.user) {
              await fetchUserProfile(session.user.id, session.user.email!);
          } else if (event === 'SIGNED_OUT') {
              setCurrentUser(null);
              setEstablishments(new Map());
          }
      }) || { data: { subscription: { unsubscribe: () => {} } } };

      return () => {
          authListener.data.subscription.unsubscribe();
      }
  }, []);

  // --- Helper Fetch Functions ---

  const fetchUserProfile = async (userId: string, email: string) => {
      if (!supabase) return;
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
          console.error('Error fetching profile:', error);
          return;
      }

      if (profile) {
          const user: User = {
              id: profile.id,
              email: email, // Supabase profile might not have email if we don't duplicate it, but we pass it from auth
              password: '', // Not needed/available
              role: profile.role as Role,
              name: profile.name,
              status: profile.status as UserStatus
          };

          // If Establishment, fetch establishment details
          if (user.role === Role.ESTABLISHMENT) {
              const { data: est } = await supabase.from('establishments').select('*').eq('owner_id', userId).single();
              if (est) {
                  user.establishmentId = est.id;
                  // Also load this establishment into state
                  await loadEstablishmentData(est.id);
                  // Start Realtime Subscription
                  subscribeToEstablishmentCalls(est.id);
              }
          } 
          
          // If Customer, fetch favorites
          if (user.role === Role.CUSTOMER) {
              await loadCustomerData(userId);
          }

          setCurrentUser(user);
          // Update users list primarily for context consistency, though in real app we don't load all
          setUsers(prev => {
              const filtered = prev.filter(u => u.id !== user.id);
              return [...filtered, user];
          });
      }
  };

  const loadEstablishmentData = async (estId: string) => {
      if (!supabase) return;
      
      // 1. Fetch Establishment Info
      const { data: est } = await supabase.from('establishments').select('*').eq('id', estId).single();
      if (!est) return;

      // 2. Fetch Active Calls
      const { data: calls } = await supabase.from('calls').select('*').eq('establishment_id', estId);
      
      // 3. Construct Tables Map
      const tablesMap = new Map<string, Table>();
      
      // Initialize with calls
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

      // Ensure all tables defined in settings exist (even empty ones)
      const totalTables = est.settings?.totalTables || DEFAULT_SETTINGS.totalTables;
      for(let i=1; i<=totalTables; i++) {
          const numStr = i.toString().padStart(3, '0'); // e.g. 001, 002 (optional formatting, keeping simple here)
          const numSimple = i.toString();
          // Check simple first
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
          eventLog: [] // Analytics could be a separate fetch
      };

      setEstablishments(prev => new Map(prev).set(estId, fullEst));
      return fullEst;
  };

  const loadCustomerData = async (userId: string) => {
      if (!supabase) return;
      
      // Fetch details
      const { data: details } = await supabase.from('customer_details').select('*').eq('user_id', userId).single();
      
      // Fetch favorites
      const { data: favs } = await supabase.from('customer_favorites').select('establishment_id').eq('user_id', userId);
      const favIds = favs?.map((f: any) => f.establishment_id) || [];

      // We need to load basic info for these favorited establishments so they appear in the list
      for (const favId of favIds) {
          await loadEstablishmentData(favId);
      }

      const profile: CustomerProfile = {
          userId: userId,
          favoritedEstablishmentIds: favIds,
          phone: details?.phone,
          cep: details?.cep
      };

      setCustomerProfiles(prev => new Map(prev).set(userId, profile));
  };

  // --- Realtime ---
  const subscribeToEstablishmentCalls = (estId: string) => {
      if (!supabase) return;
      
      const channel = supabase.channel('public:calls')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `establishment_id=eq.${estId}` }, 
        (payload) => {
            // Simply reload the establishment data to ensure consistency for now
            // Optimization: update state locally based on payload type (INSERT, UPDATE, DELETE)
            loadEstablishmentData(estId);
        })
        .subscribe();

      return () => {
          supabase?.removeChannel(channel);
      }
  };


  // --- Actions ---

  const login = useCallback(async (email: string, password: string) => {
      if (!supabase) throw new Error("Supabase não configurado");
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.user) {
          // State update happens in onAuthStateChange
          return { id: data.user.id, email, password: '', role: Role.CUSTOMER, name: '', status: UserStatus.TESTING } as User; 
      }
      throw new Error("Erro desconhecido no login");
  }, []);

  const logout = useCallback(async () => {
      if (!supabase) return;
      await supabase.auth.signOut();
      setCurrentUser(null);
  }, []);

  const registerEstablishment = useCallback(async (name: string, phone: string, email: string, password: string, photoUrl: string | null, phrase: string) => {
      if (!supabase) throw new Error("Supabase não configurado");
      
      // 1. SignUp
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) throw authError;
      if (!authData.user) throw new Error("Falha ao criar usuário Auth. Verifique se a confirmação de email está desativada no Supabase.");

      const userId = authData.user.id;

      // 2. Create Profile
      const { error: profileError } = await supabase.from('profiles').insert({
          id: userId,
          email,
          role: Role.ESTABLISHMENT,
          name,
          status: UserStatus.TESTING
      });
      if (profileError) throw profileError;

      // 3. Create Establishment
      const { data: estData, error: estError } = await supabase.from('establishments').insert({
          owner_id: userId,
          name,
          phone,
          photo_url: photoUrl || `https://picsum.photos/seed/${Date.now()}/400/200`,
          phrase,
          settings: DEFAULT_SETTINGS
      }).select().single();
      
      if (estError) throw estError;

      // Return generic User object (will be refreshed by listener)
      return { id: userId, email, role: Role.ESTABLISHMENT, name, status: UserStatus.TESTING, establishmentId: estData.id } as User;
  }, []);

  const registerCustomer = useCallback(async (name: string, email: string, password: string, phone?: string, cep?: string) => {
      if (!supabase) throw new Error("Supabase não configurado");

      // 1. SignUp
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) throw authError;
      if (!authData.user) throw new Error("Falha ao criar usuário Auth. Verifique se a confirmação de email está desativada no Supabase.");
      
      const userId = authData.user.id;

      // 2. Create Profile
      const { error: profileError } = await supabase.from('profiles').insert({
          id: userId,
          email,
          role: Role.CUSTOMER,
          name,
          status: UserStatus.TESTING
      });
      if (profileError) throw profileError;

      // 3. Create Details
      if (phone || cep) {
          await supabase.from('customer_details').insert({
              user_id: userId,
              phone,
              cep
          });
      }

      return { id: userId, email, role: Role.CUSTOMER, name, status: UserStatus.TESTING } as User;
  }, []);

  const addCall = useCallback(async (establishmentId: string, tableNumber: string, type: CallType) => {
      if (!supabase) return;
      const { error } = await supabase.from('calls').insert({
          establishment_id: establishmentId,
          table_number: tableNumber,
          type,
          status: CallStatus.SENT,
          created_at_ts: Date.now()
      });
      if (error) console.error("Failed to add call", error);
      else loadEstablishmentData(establishmentId); // Refresh immediately for sender
  }, []);

  const updateCallsByPredicate = useCallback(async (establishmentId: string, tableNumber: string, predicate: (call: Call) => boolean, update: (call: Call) => Partial<Call>) => {
     // This function is tricky to map 1:1 to SQL without loading all calls first.
     // Simplified: usually used for 'viewAllCalls'
     if (!supabase) return;
     
     // Get current calls to check predicate
     const establishment = establishments.get(establishmentId);
     const table = establishment?.tables.get(tableNumber);
     if (!table) return;

     const callsToUpdate = table.calls.filter(predicate);
     const idsToUpdate = callsToUpdate.map(c => c.id);

     if (idsToUpdate.length === 0) return;

     // Determine what to update (assuming uniform update for the batch)
     const sampleUpdate = update(callsToUpdate[0]);
     const statusUpdate = sampleUpdate.status;

     if (statusUpdate) {
         await supabase.from('calls').update({ status: statusUpdate }).in('id', idsToUpdate);
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
     // Fetch oldest active call
     const { data } = await supabase.from('calls')
        .select('id')
        .eq('establishment_id', establishmentId)
        .eq('table_number', tableNumber)
        .eq('type', callType)
        .in('status', ['SENT', 'VIEWED'])
        .order('created_at_ts', { ascending: true })
        .limit(1);
    
    if (data && data.length > 0) {
        await supabase.from('calls').update({ status: CallStatus.CANCELED }).eq('id', data[0].id);
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
        await supabase.from('calls').update({ status: CallStatus.ATTENDED }).eq('id', data[0].id);
        loadEstablishmentData(establishmentId);
    }
  }, []);

  const closeTable = useCallback(async (establishmentId: string, tableNumber: string) => {
      if (!supabase) return;
      // Close all active calls
      await supabase.from('calls')
        .update({ status: CallStatus.ATTENDED }) // Or some closed status
        .eq('establishment_id', establishmentId)
        .eq('table_number', tableNumber)
        .in('status', ['SENT', 'VIEWED']);
      
      loadEstablishmentData(establishmentId);
  }, []);

  const updateSettings = useCallback(async (establishmentId: string, newSettings: Settings) => {
      if (!supabase) return;
      await supabase.from('establishments').update({ settings: newSettings }).eq('id', establishmentId);
      loadEstablishmentData(establishmentId);
  }, []);

  const getEstablishmentByPhone = useCallback((phone: string) => {
      // This needs to be synchronous in the current app design, but Supabase is async.
      // We will hack this by checking our loaded establishments OR performing a quick async search
      // For the 'Search' button in UI, we need to handle async.
      // Since the UI expects a return value, we might need to rely on the list being populated or
      // change the UI to await. 
      
      // NOTE: The original App assumes this is sync. 
      // To make this work without changing UI too much, we scan 'establishments'. 
      // If not found, we can't find it.
      // BUT, we can pre-fetch in the component.
      
      // Better approach for this request: Return undefined, but provide an async search function
      // The component CustomerHome uses this. We will modify CustomerHome to use a new async function if needed,
      // or just pre-load.
      
      return Array.from(establishments.values()).find((e: Establishment) => e.phone === phone);
  }, [establishments]);

  // Async search helper exposed to components if they want to use it
  const searchEstablishmentByPhone = async (phone: string) => {
      if (!supabase) return null;
      const { data } = await supabase.from('establishments').select('*').eq('phone', phone).single();
      if (data) {
          // Load into state so the sync selector works
          await loadEstablishmentData(data.id);
          return establishments.get(data.id);
      }
      return null;
  }

  const favoriteEstablishment = useCallback(async (userId: string, establishmentId: string) => {
      if (!supabase) return;
      
      const { data: profile } = await supabase.from('customer_favorites').select('id').eq('user_id', userId);
      if (profile && profile.length >= 3) {
           throw new Error("Você pode ter no máximo 3 estabelecimentos favoritos.");
      }

      const { error } = await supabase.from('customer_favorites').insert({ user_id: userId, establishment_id: establishmentId });
      if (error) {
          if (error.code === '23505') return; // Duplicate
          throw error;
      }
      loadCustomerData(userId);
  }, []);

  const unfavoriteEstablishment = useCallback(async (userId: string, establishmentId: string) => {
      if (!supabase) return;
      await supabase.from('customer_favorites').delete().eq('user_id', userId).eq('establishment_id', establishmentId);
      loadCustomerData(userId);
  }, []);

  const updateUserStatus = useCallback(async (userId: string, newStatus: UserStatus) => {
       if (!supabase) return;
       await supabase.from('profiles').update({ status: newStatus }).eq('id', userId);
       // Optimistic update
       setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
  }, []);

  const deleteCurrentUser = useCallback(async () => {
      if (!supabase || !currentUser) return;
      // Supabase Auth delete is usually Admin only or requires specific setup.
      // We will just set status to DISCONNECTED or delete profile data.
      // For this demo, let's just sign out as "deleting" an auth user needs service_role key usually.
      await supabase.from('profiles').delete().eq('id', currentUser.id);
      await logout();
  }, [currentUser, logout]);

  // --- Logic Re-use ---
  // These calculations are client-side, so they stay the same
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

  return { 
    isInitialized,
    users,
    currentUser,
    establishments,
    currentEstablishment,
    currentCustomerProfile,
    login,
    logout,
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
    searchEstablishmentByPhone, // Added this
    favoriteEstablishment,
    unfavoriteEstablishment,
    updateUserStatus,
    deleteCurrentUser,
  };
};
