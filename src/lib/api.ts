const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

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
  voidTransaction: (id: string, payload: { voided_by: string }) =>
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
};
