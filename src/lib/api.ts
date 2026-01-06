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
  stock: number;
  min_stock: number;
  category_id: string | null;
  barcode: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  transaction_number: string;
  total_amount: number;
  payment_method: string;
  payment_amount: number;
  change_amount: number;
  notes: string | null;
  created_at: string;
}

export interface TransactionItem {
  id: string;
  transaction_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
  products?: {
    cost: number;
  } | null;
}

export interface CartItem {
  product: Product;
  quantity: number;
  subtotal: number;
}

export const api = {
  getCategories: () => request<Category[]>('/categories'),
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
  deleteProduct: (id: string) =>
    request<void>(`/products/${id}`, { method: 'DELETE' }),
  updateProductStock: (id: string, stock: number) =>
    request<Product>(`/products/${id}/stock`, {
      method: 'PATCH',
      body: { stock },
    }),
  getTransactions: (from?: string) => {
    const params = new URLSearchParams();
    if (from) {
      params.set('from', from);
    }
    const query = params.toString();
    return request<Transaction[]>(`/transactions${query ? `?${query}` : ''}`);
  },
  createTransaction: (payload: Omit<Transaction, 'id' | 'created_at'>) =>
    request<Transaction>('/transactions', { method: 'POST', body: payload }),
  getTransactionItems: (from?: string) => {
    const params = new URLSearchParams();
    if (from) {
      params.set('from', from);
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
};
