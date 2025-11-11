// LocalStorage管理ユーティリティ

import { Order } from '../types/order';

const ORDERS_KEY = 'brick_sys_orders';
const ORDER_COUNTER_KEY = 'brick_sys_order_counter';

export const localStorageUtil = {
  // 次の注文番号を取得して更新
  getNextOrderNumber: (): number => {
    if (typeof window === 'undefined') return 1;
    try {
      const currentCounter = localStorage.getItem(ORDER_COUNTER_KEY);
      const nextNumber = currentCounter ? Number.parseInt(currentCounter, 10) + 1 : 1;
      localStorage.setItem(ORDER_COUNTER_KEY, String(nextNumber));
      return nextNumber;
    } catch (error) {
      console.error('Failed to get next order number:', error);
      return 1;
    }
  },

  // 全ての注文を取得
  getOrders: (): Order[] => {
    if (typeof window === 'undefined') return [];
    try {
      const data = localStorage.getItem(ORDERS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to get orders:', error);
      return [];
    }
  },

  // 注文を保存
  saveOrder: (order: Order): void => {
    if (typeof window === 'undefined') return;
    try {
      const orders = localStorageUtil.getOrders();
      const existingIndex = orders.findIndex((o) => o.id === order.id);
      
      if (existingIndex >= 0) {
        orders[existingIndex] = order;
      } else {
        orders.push(order);
      }
      
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    } catch (error) {
      console.error('Failed to save order:', error);
    }
  },

  // 注文をIDで取得
  getOrderById: (id: string): Order | null => {
    const orders = localStorageUtil.getOrders();
    return orders.find((order) => order.id === id) || null;
  },

  // 注文を更新
  updateOrder: (id: string, updates: Partial<Order>): void => {
    if (typeof window === 'undefined') return;
    try {
      const orders = localStorageUtil.getOrders();
      const index = orders.findIndex((o) => o.id === id);
      
      if (index >= 0) {
        orders[index] = {
          ...orders[index],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
      }
    } catch (error) {
      console.error('Failed to update order:', error);
    }
  },

  // 注文を削除
  deleteOrder: (id: string): void => {
    if (typeof window === 'undefined') return;
    try {
      const orders = localStorageUtil.getOrders();
      const filtered = orders.filter((o) => o.id !== id);
      localStorage.setItem(ORDERS_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Failed to delete order:', error);
    }
  },

  // 全ての注文をクリア(開発用)
  clearAll: (): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(ORDERS_KEY);
  },
};
