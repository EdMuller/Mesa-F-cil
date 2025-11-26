
import { Settings, CallType, CallStatus } from './types';

export const POLLING_INTERVAL = 20000; // 20 seconds

export const CALL_TYPE_INFO: { [key in CallType]: { label: string; verb: string } } = {
  [CallType.WAITER]: { label: 'Garçom', verb: 'Chamar Garçom' },
  [CallType.MENU]: { label: 'Cardápio', verb: 'Pedir Cardápio' },
  [CallType.BILL]: { label: 'Conta', verb: 'Pedir a Conta' },
};

export const CALL_STATUS_TRANSLATION: { [key in CallStatus]: string } = {
  [CallStatus.SENT]: 'Enviado',
  [CallStatus.VIEWED]: 'Visualizado',
  [CallStatus.ATTENDED]: 'Atendido',
  [CallStatus.CANCELED]: 'Cancelado',
};

export const DEFAULT_SETTINGS: Settings = {
  timeGreen: 60, // 1 min
  timeYellow: 180, // 3 min
  qtyGreen: 2,
  qtyYellow: 4,
  totalTables: 20,
};

// This initial data is now used to seed the system if localStorage is empty.
export const SEED_ESTABLISHMENT = {
  id: 'pizzaria-do-ze-123',
  ownerId: 'admin-123',
  name: "Pizzaria do Zé",
  phone: "555-0101",
  photoUrl: "https://picsum.photos/seed/pizzaria/400/200",
  phrase: "A melhor pizza da cidade, direto do forno para sua mesa!",
  settings: DEFAULT_SETTINGS,
};

export const APP_URL = "https://mesa-facil-drab.vercel.app/";

// --- CONFIGURAÇÃO DO SERVIDOR ---
// Preencha aqui para que o aplicativo funcione sem pedir login de configuração.
export const SUPABASE_CONFIG = {
    url: "https://romsbbyupakyqssotygp.supabase.co", // Cole sua URL do Supabase aqui (dentro das aspas)
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvbXNiYnl1cGFreXFzc290eWdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxMzE4OTgsImV4cCI6MjA3OTcwNzg5OH0.qe1QIlNfmjrVtYtb5A65aCKnigWiepSWOyGoiR6SxNo" // Cole sua Anon Key do Supabase aqui (dentro das aspas)
};
