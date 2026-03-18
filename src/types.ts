/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'admin' | 'user' | 'observer';

export interface User {
  id: string;
  username: string;
  password?: string;
  email: string;
  role: UserRole;
  name: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  lowThreshold: number;
  criticalThreshold: number;
}

export interface Transaction {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  user: string;
  date: string;
  type: 'withdraw' | 'receive';
}

export interface Order {
  id: string;
  item: string;
  quantity: number;
  order_date: string;
  delivery_date: string | null;
  status: 'pending' | 'delivered' | 'cancelled';
}

export type ActionType = 
  | 'login'
  | 'add_item'
  | 'withdraw'
  | 'create_order'
  | 'receive_order'
  | 'report'
  | 'check_stock'
  | 'unauthorized';

export interface AIAction {
  action: ActionType;
  method?: 'google' | 'email';
  email?: string | null;
  password?: string | null;
  name?: string | null;
  quantity?: number | null;
  unit?: string | null;
  item?: string | null;
  user?: string | null;
  date?: string | null;
  order_date?: string | null;
  delivery_date?: string | null;
  status?: string | null;
  type?: 'monthly' | 'custom' | null;
  from?: string | null;
  to?: string | null;
}
