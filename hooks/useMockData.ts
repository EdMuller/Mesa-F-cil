import { useState, useEffect, useCallback, useMemo } from 'react';
import { Establishment, Table, Call, CallType, CallStatus, Settings, SemaphoreStatus, User, Role, CustomerProfile, UserStatus, EventLogItem } from '../types';
import { POLLING_INTERVAL, DEFAULT_SETTINGS, SEED_ESTABLISHMENT } from '../constants';

const LOCAL_STORAGE_KEY = 'mesa-ativa-data';

interface AppData {
  users: User[];
  establishments: (Omit<Establishment, 'tables'> & { tables: [string, Table][] })[];
  customerProfiles: CustomerProfile[];
}

// A simple hashing function for demonstration purposes.
const simpleHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString();
};

export const useMockData = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [establishments, setEstablishments] = useState<Map<string, Establishment>>(new Map());
  const [customerProfiles, setCustomerProfiles] = useState<Map<string, CustomerProfile>>(new Map());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    try {
      const savedData = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      const adminUser: User = { id: 'admin-root', email: 'eduardo_j_muller@yahoo.com.br', password: simpleHash('Eduardoj'), role: Role.ADMIN, name: 'Admin', status: UserStatus.SUBSCRIBER };

      if (savedData) {
        const parsed: AppData = JSON.parse(savedData);
        let loadedUsers = parsed.users || [];
        // Ensure admin user exists and has correct credentials
        const existingAdminIndex = loadedUsers.findIndex(u => u.role === Role.ADMIN);
        if (existingAdminIndex !== -1) {
            loadedUsers[existingAdminIndex] = adminUser;
        } else {
            loadedUsers.push(adminUser);
        }
        
        // Ensure all users have a status
        loadedUsers.forEach(u => {
            if (!u.status) {
                u.status = u.role === Role.ADMIN ? UserStatus.SUBSCRIBER : UserStatus.TESTING;
            }
        })

        setUsers(loadedUsers);
        // FIX: Reconstruct establishment object to avoid spread and ensure correct typing from parsed data.
        setEstablishments(new Map(parsed.establishments?.map((e: Omit<Establishment, 'tables' | 'eventLog'> & { tables: [string, Table][], eventLog: EventLogItem[] }) => [e.id, {
            id: e.id,
            ownerId: e.ownerId,
            name: e.name,
            phone: e.phone,
            photoUrl: e.photoUrl,
            phrase: e.phrase,
            settings: { ...DEFAULT_SETTINGS, ...e.settings },
            tables: new Map(e.tables),
            eventLog: e.eventLog || []
        }]) ?? []));
        setCustomerProfiles(new Map(parsed.customerProfiles?.map(p => [p.userId, p]) || []));
      } else {
         const establishmentUser: User = { id: SEED_ESTABLISHMENT.ownerId, email: 'admin@ze.com', password: simpleHash('1234'), role: Role.ESTABLISHMENT, name: 'Zé', establishmentId: SEED_ESTABLISHMENT.id, status: UserStatus.TESTING };
         setUsers([adminUser, establishmentUser]);
         setEstablishments(new Map([[SEED_ESTABLISHMENT.id, { ...SEED_ESTABLISHMENT, tables: new Map(), eventLog: [] }]]));
      }
    } catch (error) {
      console.error("Failed to load from localStorage", error);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    try {
      const dataToSave: AppData = {
        users,
        // FIX: Replaced spread operator with explicit property assignment to avoid type errors during serialization.
        establishments: Array.from(establishments.values()).map(e => ({
          id: e.id,
          ownerId: e.ownerId,
          name: e.name,
          phone: e.phone,
          photoUrl: e.photoUrl,
          phrase: e.phrase,
          settings: e.settings,
          tables: Array.from(e.tables.entries()),
          eventLog: e.eventLog,
        })),
        customerProfiles: Array.from(customerProfiles.values()),
      };
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (error) {
      console.error("Failed to save to localStorage", error);
    }
  }, [users, establishments, customerProfiles, isInitialized]);

  const registerEstablishment = useCallback((name: string, phone: string, email: string, password: string, photoUrl: string | null): User => {
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error("Email já cadastrado.");
    }
     if (Array.from(establishments.values()).some((e: Establishment) => e.phone === phone)) {
      throw new Error("Telefone já cadastrado por outro estabelecimento.");
    }
    const newEstablishmentId = `est-${Date.now()}`;
    const newUserId = `user-${Date.now()}`;
    
    const newUser: User = { id: newUserId, email, password: simpleHash(password), role: Role.ESTABLISHMENT, name, establishmentId: newEstablishmentId, status: UserStatus.TESTING };
    
    const newEstablishment: Establishment = {
      id: newEstablishmentId,
      ownerId: newUserId,
      name,
      phone,
      photoUrl: photoUrl || `https://picsum.photos/seed/${newEstablishmentId}/400/200`,
      phrase: "Seu novo slogan incrível aqui!",
      tables: new Map(),
      settings: DEFAULT_SETTINGS,
      eventLog: [],
    };

    setUsers(prev => [...prev, newUser]);
    setEstablishments(prev => new Map(prev).set(newEstablishmentId, newEstablishment));
    
    // Log in as the new user unless an admin is logged in
    if (currentUser?.role !== Role.ADMIN) {
        setCurrentUser(newUser);
    }
    return newUser;
  }, [users, establishments, currentUser]);

  const registerCustomer = useCallback((name: string, email: string, password: string): User => {
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error("Email já cadastrado.");
    }
    const newUserId = `user-${Date.now()}`;
    const newUser: User = { id: newUserId, email, password: simpleHash(password), role: Role.CUSTOMER, name, status: UserStatus.TESTING };

    const newProfile: CustomerProfile = { userId: newUserId, favoritedEstablishmentIds: [] };

    setUsers(prev => [...prev, newUser]);
    setCustomerProfiles(prev => new Map(prev).set(newUserId, newProfile));
    
    if (currentUser?.role !== Role.ADMIN) {
        setCurrentUser(newUser);
    }
    return newUser;
  }, [users, currentUser]);
  
  const login = useCallback((email: string, password: string): User => {
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user || user.password !== simpleHash(password)) {
      throw new Error("Email ou senha inválidos.");
    }
    setCurrentUser(user);
    return user;
  }, [users]);

  const logout = useCallback(() => {
    setCurrentUser(null);
  }, []);

  const addCall = useCallback((establishmentId: string, tableNumber: string, type: CallType) => {
    setEstablishments(prev => {
      const newEstablishments = new Map<string, Establishment>(prev);
      const establishment = newEstablishments.get(establishmentId);
      if (!establishment) return prev;
      
      const newTables = new Map<string, Table>(establishment.tables);
      const table = newTables.get(tableNumber);
      const newCall: Call = { id: `${tableNumber}-${type}-${Date.now()}`, type, status: CallStatus.SENT, createdAt: Date.now() };
      
      const newTable: Table = { number: tableNumber, calls: table ? [...table.calls, newCall] : [newCall] };
      newTables.set(tableNumber, newTable);
      
      // FIX: Reconstruct the establishment object instead of spreading to avoid type errors.
      const newEstablishment: Establishment = {
        id: establishment.id,
        ownerId: establishment.ownerId,
        name: establishment.name,
        phone: establishment.phone,
        photoUrl: establishment.photoUrl,
        phrase: establishment.phrase,
        settings: establishment.settings,
        tables: newTables,
        eventLog: establishment.eventLog,
      };
      newEstablishments.set(establishmentId, newEstablishment);
      return newEstablishments;
    });
  }, []);
  
  const updateCallsByPredicate = (establishmentId: string, tableNumber: string, predicate: (call: Call) => boolean, update: (call: Call) => Call) => {
      setEstablishments(prev => {
          const newEstablishments = new Map<string, Establishment>(prev);
          const establishment = newEstablishments.get(establishmentId);
          if (!establishment) return prev;
          const table = establishment.tables.get(tableNumber);
          if (table) {
              const newTables = new Map<string, Table>(establishment.tables);
              const newCalls = table.calls.map(c => predicate(c) ? update(c) : c);
              const newTable: Table = { number: table.number, calls: newCalls };
              newTables.set(tableNumber, newTable);
              // FIX: Reconstruct the establishment object instead of spreading to avoid type errors.
              const newEstablishment: Establishment = {
                id: establishment.id,
                ownerId: establishment.ownerId,
                name: establishment.name,
                phone: establishment.phone,
                photoUrl: establishment.photoUrl,
                phrase: establishment.phrase,
                settings: establishment.settings,
                tables: newTables,
                eventLog: establishment.eventLog,
              };
              newEstablishments.set(establishmentId, newEstablishment);
              return newEstablishments;
          }
          return prev;
      });
  };

  const cancelOldestCallByType = useCallback((establishmentId: string, tableNumber: string, callType: CallType) => {
    setEstablishments(prev => {
        const newEstablishments = new Map<string, Establishment>(prev);
        const establishment = newEstablishments.get(establishmentId);
        if (!establishment) return prev;
        const table = establishment.tables.get(tableNumber);
        if (!table) return prev;

        const callsOfType = table.calls
            .filter(c => c.type === callType && (c.status === CallStatus.SENT || c.status === CallStatus.VIEWED))
            .sort((a, b) => a.createdAt - b.createdAt);
        
        if (callsOfType.length > 0) {
            const callToCancel = callsOfType[0];
            const newTables = new Map<string, Table>(establishment.tables);
            const newCalls = table.calls.filter(c => c.id !== callToCancel.id);
            const newTable: Table = { number: table.number, calls: newCalls };
            newTables.set(tableNumber, newTable);
            const newEventLog: EventLogItem[] = [...(establishment.eventLog || []), { timestamp: Date.now(), type: 'CALL_CANCELED', callType }];

            // FIX: Reconstruct the establishment object instead of spreading to avoid type errors.
            const newEstablishment: Establishment = {
              id: establishment.id,
              ownerId: establishment.ownerId,
              name: establishment.name,
              phone: establishment.phone,
              photoUrl: establishment.photoUrl,
              phrase: establishment.phrase,
              settings: establishment.settings,
              tables: newTables,
              eventLog: newEventLog
            };
            newEstablishments.set(establishmentId, newEstablishment);
            return newEstablishments;
        }
        return prev;
    });
  }, []);

  const attendOldestCallByType = useCallback((establishmentId: string, tableNumber: string, callType: CallType) => {
    setEstablishments(prev => {
        const newEstablishments = new Map<string, Establishment>(prev);
        const establishment = newEstablishments.get(establishmentId);
        if (!establishment) return prev;
        const table = establishment.tables.get(tableNumber);
        if (!table) return prev;

        const callsOfType = table.calls
            .filter(c => c.type === callType && (c.status === CallStatus.SENT || c.status === CallStatus.VIEWED))
            .sort((a, b) => a.createdAt - b.createdAt);
        
        if (callsOfType.length > 0) {
            const callToAttend = callsOfType[0];
            const newTables = new Map<string, Table>(establishment.tables);
            const newCalls = table.calls.filter(c => c.id !== callToAttend.id);
            const newTable: Table = { number: table.number, calls: newCalls };
            newTables.set(tableNumber, newTable);
            const newEventLog: EventLogItem[] = [...(establishment.eventLog || []), { timestamp: Date.now(), type: 'CALL_ATTENDED', callType }];
            
            // FIX: Reconstruct the establishment object instead of spreading to avoid type errors.
            const newEstablishment: Establishment = {
              id: establishment.id,
              ownerId: establishment.ownerId,
              name: establishment.name,
              phone: establishment.phone,
              photoUrl: establishment.photoUrl,
              phrase: establishment.phrase,
              settings: establishment.settings,
              tables: newTables,
              eventLog: newEventLog,
            };
            newEstablishments.set(establishmentId, newEstablishment);
            return newEstablishments;
        }
        return prev;
    });
  }, []);

  const viewAllCallsForTable = useCallback((establishmentId: string, tableNumber: string) => {
    updateCallsByPredicate(establishmentId, tableNumber, 
      (call) => call.status === CallStatus.SENT,
      (call) => ({ ...call, status: CallStatus.VIEWED })
    );
  }, []);

  const closeTable = useCallback((establishmentId: string, tableNumber: string) => {
    setEstablishments(prev => {
      const newEstablishments = new Map<string, Establishment>(prev);
      const establishment = newEstablishments.get(establishmentId);
      if (!establishment) return prev;
      const newTables = new Map<string, Table>(establishment.tables);
      newTables.delete(tableNumber);
      const newEventLog: EventLogItem[] = [...(establishment.eventLog || []), { timestamp: Date.now(), type: 'TABLE_CLOSED', tableNumber }];
      
      // FIX: Reconstruct the establishment object instead of spreading to avoid type errors.
      const newEstablishment: Establishment = {
        id: establishment.id,
        ownerId: establishment.ownerId,
        name: establishment.name,
        phone: establishment.phone,
        photoUrl: establishment.photoUrl,
        phrase: establishment.phrase,
        settings: establishment.settings,
        tables: newTables,
        eventLog: newEventLog,
      };
      newEstablishments.set(establishmentId, newEstablishment);
      return newEstablishments;
    });
  }, []);

  const updateSettings = useCallback((establishmentId: string, newSettings: Settings) => {
     setEstablishments(prev => {
      const newEstablishments = new Map<string, Establishment>(prev);
      const establishment = newEstablishments.get(establishmentId);
      if (establishment) {
        // FIX: Reconstruct the establishment object instead of spreading to avoid type errors.
        const newEstablishment: Establishment = {
          id: establishment.id,
          ownerId: establishment.ownerId,
          name: establishment.name,
          phone: establishment.phone,
          photoUrl: establishment.photoUrl,
          phrase: establishment.phrase,
          settings: newSettings,
          tables: establishment.tables,
          eventLog: establishment.eventLog,
        };
        newEstablishments.set(establishmentId, newEstablishment);
      }
      return newEstablishments;
    });
  }, []);
  
  const getEstablishmentByPhone = useCallback((phone: string) => {
      return Array.from(establishments.values()).find((e: Establishment) => e.phone === phone);
  }, [establishments]);

  const favoriteEstablishment = useCallback((userId: string, establishmentId: string) => {
      setCustomerProfiles(prev => {
          const newProfiles = new Map<string, CustomerProfile>(prev);
          const profile = newProfiles.get(userId);
          if (!profile) return prev;
  
          if (profile.favoritedEstablishmentIds.includes(establishmentId)) {
            return prev;
          }

          if (profile.favoritedEstablishmentIds.length >= 3) {
              throw new Error("Você pode ter no máximo 3 estabelecimentos favoritos.");
          }
  
          // FIX: Reconstruct the profile object instead of spreading to avoid type errors.
          const newProfile: CustomerProfile = {
            userId: profile.userId,
            favoritedEstablishmentIds: [...profile.favoritedEstablishmentIds, establishmentId],
          };
          newProfiles.set(userId, newProfile);
          return newProfiles;
      })
  }, []);

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

  const updateUserStatus = useCallback((userId: string, newStatus: UserStatus) => {
    setUsers(prevUsers => 
        prevUsers.map(user => 
            user.id === userId ? { ...user, status: newStatus } : user
        )
    );
  }, []);

  const deleteCurrentUser = useCallback(() => {
    if (!currentUser) return;

    setUsers(prev => prev.filter(u => u.id !== currentUser.id));

    if (currentUser.role === Role.CUSTOMER) {
        setCustomerProfiles(prev => {
            const newProfiles = new Map(prev);
            newProfiles.delete(currentUser.id);
            return newProfiles;
        });
    }

    if (currentUser.role === Role.ESTABLISHMENT && currentUser.establishmentId) {
        setEstablishments(prev => {
            const newEstablishments = new Map(prev);
            newEstablishments.delete(currentUser.establishmentId!);
            return newEstablishments;
        });
    }

    logout();
  }, [currentUser, logout]);

  useEffect(() => {
    const interval = setInterval(() => {
      setEstablishments(prev => new Map(prev));
    }, POLLING_INTERVAL);
    return () => clearInterval(interval);
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
    favoriteEstablishment,
    updateUserStatus,
    deleteCurrentUser,
  };
};