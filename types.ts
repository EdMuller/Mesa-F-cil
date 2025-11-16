export enum CallType {
  WAITER = 'WAITER',
  MENU = 'MENU',
  BILL = 'BILL',
}

export enum CallStatus {
  SENT = 'SENT',
  VIEWED = 'VIEWED',
  ATTENDED = 'ATTENDED',
  CANCELED = 'CANCELED',
}

export enum SemaphoreStatus {
  GREEN = 'GREEN',
  YELLOW = 'YELLOW',
  RED = 'RED',
  IDLE = 'IDLE',
}

export enum Role {
  CUSTOMER = 'CUSTOMER',
  ESTABLISHMENT = 'ESTABLISHMENT',
  ADMIN = 'ADMIN',
}

export enum UserStatus {
  TESTING = 'TESTING',
  SUBSCRIBER = 'SUBSCRIBER',
  DISCONNECTED = 'DISCONNECTED',
}


export interface Call {
  id: string;
  type: CallType;
  status: CallStatus;
  createdAt: number;
}

export interface Table {
  number: string;
  calls: Call[];
}

export interface Settings {
  timeGreen: number; // in seconds
  timeYellow: number; // in seconds
  qtyGreen: number;
  qtyYellow: number;
  totalTables: number;
}

export interface User {
  id: string;
  email: string;
  password: string; // In a real app, this would be hashed
  role: Role;
  name: string;
  status: UserStatus;
  establishmentId?: string; // For establishment users
}

export interface CustomerProfile {
  userId: string;
  favoritedEstablishmentIds: string[];
}

export type EventLogType = 'CALL_ATTENDED' | 'CALL_CANCELED' | 'TABLE_CLOSED';

export interface EventLogItem {
    timestamp: number;
    type: EventLogType;
    callType?: CallType;
    tableNumber?: string;
}

export interface Establishment {
  id: string; 
  ownerId: string;
  name: string;
  phone: string;
  photoUrl: string;
  phrase: string;
  tables: Map<string, Table>;
  settings: Settings;
  eventLog: EventLogItem[];
}