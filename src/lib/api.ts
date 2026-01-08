export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

const request = async <T>(path: string, options: RequestOptions = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

export const resolveAssetUrl = (value?: string | null) => {
  if (!value) {
    return '';
  }

  if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  if (value.startsWith('/')) {
    return `${API_BASE_URL}${value}`;
  }

  return value;
};

export interface Category {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  cost: number;
  category_id: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  created_at: string;
}

export interface ProductExtra {
  id: string;
  product_id: string;
  name: string;
  cost: number;
  price: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id?: string | null;
  user_name?: string | null;
  user_username?: string | null;
  transaction_number: string;
  total_amount: number;
  discount_id?: string | null;
  discount_name?: string | null;
  discount_code?: string | null;
  discount_type?: string | null;
  discount_value?: number | null;
  discount_value_type?: string | null;
  discount_amount?: number | null;
  payment_method: string;
  payment_amount: number;
  change_amount: number;
  status?: 'selesai' | 'gagal' | string;
  voided_by?: string | null;
  voided_at?: string | null;
  voided_by_name?: string | null;
  notes: string | null;
  created_at: string;
}

export interface TransactionItem {
  id: string;
  transaction_id: string;
  product_id: string | null;
  product_name: string;
  variant_name?: string | null;
  extras?: ProductExtra[] | null;
  extras_total?: number | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
  products?: {
    cost: number;
  } | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
  phone: string | null;
  profile: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface AuthPayload {
  username: string;
  identifier?: string;
  password: string;
}

export type UserPayload = Partial<User> & { password?: string };

export interface CartItem {
  lineId?: string;
  product: Product;
  quantity: number;
  subtotal: number;
  variants?: ProductVariant[];
  extras?: ProductExtra[];
}

export interface SavedCart {
  id: string;
  user_id: string;
  name: string;
  items: CartItem[];
  total: number;
  created_at: string;
}

export interface Discount {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  discount_type: 'order' | 'product' | 'combo' | string;
  value: number;
  value_type: 'amount' | 'percent' | string;
  min_purchase?: number | null;
  product_id?: string | null;
  product_name?: string | null;
  min_quantity?: number | null;
  is_multiple?: boolean;
  combo_items?: Array<{ product_id: string; quantity: number }>;
  valid_from?: string | null;
  valid_until?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AttendanceRecord {
  id: string;
  user_id: string;
  scanned_at: string;
  latitude: number;
  longitude: number;
  status: string;
  user_name?: string;
  user_username?: string;
  user_role?: string;
}

export interface CashierSession {
  id: string;
  opened_by: string;
  opened_at: string;
  opening_balance: number;
  closed_at?: string | null;
  closed_by?: string | null;
  closing_cash?: number | null;
  closing_non_cash?: number | null;
  closing_notes?: string | null;
  total_transactions?: number;
  total_revenue?: number;
  total_cash?: number;
  total_non_cash?: number;
  variance_cash?: number;
  variance_non_cash?: number;
  variance_total?: number;
  products_summary?: Array<{ name: string; quantity: number }> | null;
}

export interface CashierSummary {
  total_transactions: number;
  total_revenue: number;
  total_cash: number;
  total_non_cash: number;
  products: Array<{ name: string; quantity: number }>;
}

export const api = {
  getCategories: () => request<Category[]>('/categories'),
  createCategory: (payload: Partial<Category>) =>
    request<Category>('/categories', { method: 'POST', body: payload }),
  updateCategory: (id: string, payload: Partial<Category>) =>
    request<Category>(`/categories/${id}`, { method: 'PUT', body: payload }),
  deleteCategory: (id: string) =>
    request<void>(`/categories/${id}`, { method: 'DELETE' }),
  getProducts: (options?: { active?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.active) {
      params.set('active', 'true');
    }
    const query = params.toString();
    return request<Product[]>(`/products${query ? `?${query}` : ''}`);
  },
  createProduct: (payload: Partial<Product>) =>
    request<Product>('/products', { method: 'POST', body: payload }),
  updateProduct: (id: string, payload: Partial<Product>) =>
    request<Product>(`/products/${id}`, { method: 'PUT', body: payload }),
  getProductOptions: (productId?: string) => {
    const params = new URLSearchParams();
    if (productId) {
      params.set('product_id', productId);
    }
    const query = params.toString();
    return request<{ variants: ProductVariant[]; extras: ProductExtra[] }>(
      `/product-options${query ? `?${query}` : ''}`
    );
  },
  getProductOptionsById: (id: string) =>
    request<{ variants: ProductVariant[]; extras: ProductExtra[] }>(
      `/products/${id}/options`
    ),
  updateProductOptions: (
    id: string,
    payload: {
      variants: Array<Pick<ProductVariant, 'name'>>;
      extras: Array<Pick<ProductExtra, 'name' | 'cost' | 'price'>>;
    }
  ) => request(`/products/${id}/options`, { method: 'PUT', body: payload }),
  getTransactions: (filters?: {
    from?: string;
    to?: string;
    userId?: string;
    userUsername?: string;
    search?: string;
    status?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.from) {
      params.set('from', filters.from);
    }
    if (filters?.to) {
      params.set('to', filters.to);
    }
    if (filters?.userId) {
      params.set('user_id', filters.userId);
    }
    if (filters?.userUsername) {
      params.set('user_username', filters.userUsername);
    }
    if (filters?.search) {
      params.set('search', filters.search);
    }
    if (filters?.status) {
      params.set('status', filters.status);
    }
    const query = params.toString();
    return request<Transaction[]>(`/transactions${query ? `?${query}` : ''}`);
  },
  createTransaction: (
    payload: Omit<Transaction, 'id' | 'created_at' | 'user_name'>
  ) =>
    request<Transaction>('/transactions', { method: 'POST', body: payload }),
  updateTransaction: (id: string, payload: Partial<Transaction>) =>
    request<Transaction>(`/transactions/${id}`, { method: 'PUT', body: payload }),
  voidTransaction: (
    id: string,
    payload: { voided_by?: string; voided_by_username?: string }
  ) =>
    request<Transaction>(`/transactions/${id}/void`, {
      method: 'PUT',
      body: payload,
    }),
  getTransactionItems: (filters?: {
    from?: string;
    transactionId?: string;
    status?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.from) {
      params.set('from', filters.from);
    }
    if (filters?.transactionId) {
      params.set('transaction_id', filters.transactionId);
    }
    if (filters?.status) {
      params.set('status', filters.status);
    }
    const query = params.toString();
    return request<TransactionItem[]>(
      `/transaction-items${query ? `?${query}` : ''}`
    );
  },
  createTransactionItems: (items: Array<Omit<TransactionItem, 'id' | 'created_at'>>) =>
    request('/transaction-items', {
      method: 'POST',
      body: { items },
    }),
  getDiscounts: (filters?: { active?: boolean; search?: string; type?: string }) => {
    const params = new URLSearchParams();
    if (filters?.active) {
      params.set('active', 'true');
    }
    if (filters?.search) {
      params.set('search', filters.search);
    }
    if (filters?.type) {
      params.set('type', filters.type);
    }
    const query = params.toString();
    return request<Discount[]>(`/discounts${query ? `?${query}` : ''}`);
  },
  createDiscount: (payload: Partial<Discount>) =>
    request<Discount>('/discounts', { method: 'POST', body: payload }),
  updateDiscount: (id: string, payload: Partial<Discount>) =>
    request<Discount>(`/discounts/${id}`, { method: 'PUT', body: payload }),
  deleteDiscount: (id: string) =>
    request<void>(`/discounts/${id}`, { method: 'DELETE' }),
  getUsers: () => request<User[]>('/users'),
  getUser: (id: string) => request<User>(`/users/${id}`),
  createUser: (payload: UserPayload) =>
    request<User>('/users', { method: 'POST', body: payload }),
  updateUser: (id: string, payload: UserPayload) =>
    request<User>(`/users/${id}`, { method: 'PUT', body: payload }),
  deleteUser: (id: string) =>
    request<void>(`/users/${id}`, { method: 'DELETE' }),
  login: (payload: AuthPayload) =>
    request<User>('/auth/login', { method: 'POST', body: payload }),
  getSavedCarts: (userId: string, userUsername?: string) => {
    const params = new URLSearchParams({ user_id: userId });
    if (userUsername) {
      params.set('user_username', userUsername);
    }
    return request<SavedCart[]>(`/saved-carts?${params.toString()}`);
  },
  createSavedCart: (payload: {
    user_id: string;
    user_username?: string;
    name: string;
    items: CartItem[];
    total: number;
  }) => request<SavedCart>('/saved-carts', { method: 'POST', body: payload }),
  deleteSavedCart: (id: string) =>
    request<void>(`/saved-carts/${id}`, { method: 'DELETE' }),
  getAttendance: (date: string) => {
    const params = new URLSearchParams({ date });
    return request<AttendanceRecord[]>(`/attendance?${params.toString()}`);
  },
  scanAttendance: (payload: {
    user_id: string;
    qr_code: string;
    latitude: number;
    longitude: number;
    accuracy?: number;
  }) => request<AttendanceRecord>('/attendance/scan', {
    method: 'POST',
    body: payload,
  }),
  getCashierSessionStatus: (date?: string) => {
    const params = new URLSearchParams();
    if (date) {
      params.set('date', date);
    }
    const query = params.toString();
    return request<{
      status: 'needs-open' | 'open' | 'needs-close' | 'closed';
      session?: CashierSession;
      summary?: CashierSummary;
    }>(`/cashier/sessions/status${query ? `?${query}` : ''}`);
  },
  openCashierSession: (payload: { user_id: string; opening_balance: number }) =>
    request<CashierSession>('/cashier/sessions/open', {
      method: 'POST',
      body: payload,
    }),
  closeCashierSession: (
    sessionId: string,
    payload: {
      user_id: string;
      closing_cash: number;
      closing_non_cash: number;
      notes?: string | null;
    }
  ) =>
    request<{
      session: CashierSession;
      summary: CashierSummary;
      variance: { cash: number; non_cash: number; total: number };
    }>(`/cashier/sessions/${sessionId}/close`, {
      method: 'POST',
      body: payload,
    }),
};
