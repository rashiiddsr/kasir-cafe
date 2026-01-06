import { useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Package,
  Calendar,
  ArrowUpRight,
} from 'lucide-react';
import { api } from '../lib/api';

interface DashboardStats {
  totalRevenue: number;
  totalTransactions: number;
  totalProfit: number;
  totalProducts: number;
  todayRevenue: number;
  todayTransactions: number;
}

interface TopProduct {
  product_name: string;
  total_quantity: number;
  total_revenue: number;
}

interface RecentTransaction {
  id: string;
  transaction_number: string;
  total_amount: number;
  payment_method: string;
  created_at: string;
}

export default function ReportsPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    totalTransactions: 0,
    totalProfit: 0,
    totalProducts: 0,
    todayRevenue: 0,
    todayTransactions: 0,
  });
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<
    RecentTransaction[]
  >([]);
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>(
    'all'
  );

  const getExtrasCostTotal = (extras?: any[]) => {
    if (!Array.isArray(extras)) {
      return 0;
    }
    return extras.reduce(
      (sum, extra) => sum + Number(extra?.cost ?? 0),
      0
    );
  };

  useEffect(() => {
    loadDashboardData();
  }, [dateRange]);

  const getDateFilter = () => {
    const now = new Date();
    switch (dateRange) {
      case 'today':
        return new Date(now.setHours(0, 0, 0, 0)).toISOString();
      case 'week':
        return new Date(now.setDate(now.getDate() - 7)).toISOString();
      case 'month':
        return new Date(now.setMonth(now.getMonth() - 1)).toISOString();
      default:
        return '2000-01-01';
    }
  };

  const loadDashboardData = async () => {
    const dateFilter = getDateFilter();

    try {
      const [transactions, allTransactionItems, products] = await Promise.all([
        api.getTransactions({ from: dateFilter }),
        api.getTransactionItems({ from: dateFilter }),
        api.getProducts(),
      ]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayTransactions = await api.getTransactions({
        from: today.toISOString(),
      });

      const totalRevenue =
        transactions?.reduce((sum, t) => sum + Number(t.total_amount), 0) || 0;

      let totalProfit = 0;
      if (allTransactionItems) {
        allTransactionItems.forEach((item: any) => {
          const cost = item.products?.cost || 0;
          const extrasTotal = Number(item.extras_total || 0);
          const extrasCost = getExtrasCostTotal(item.extras);
          const profit =
            (Number(item.unit_price) + extrasTotal - (cost + extrasCost)) *
            item.quantity;
          totalProfit += profit;
        });
      }

      const todayRevenue =
        todayTransactions?.reduce((sum, t) => sum + Number(t.total_amount), 0) ||
        0;

      setStats({
        totalRevenue,
        totalTransactions: transactions?.length || 0,
        totalProfit,
        totalProducts: products?.length || 0,
        todayRevenue,
        todayTransactions: todayTransactions?.length || 0,
      });

      if (allTransactionItems) {
        const productMap = new Map<
          string,
          { total_quantity: number; total_revenue: number }
        >();

        allTransactionItems.forEach((item: any) => {
          const existing = productMap.get(item.product_name) || {
            total_quantity: 0,
            total_revenue: 0,
          };
          productMap.set(item.product_name, {
            total_quantity: existing.total_quantity + item.quantity,
            total_revenue: existing.total_revenue + Number(item.subtotal),
          });
        });

        const topProductsList = Array.from(productMap.entries())
          .map(([name, data]) => ({
            product_name: name,
            ...data,
          }))
          .sort((a, b) => b.total_revenue - a.total_revenue)
          .slice(0, 5);

        setTopProducts(topProductsList);
      }

      setRecentTransactions(transactions?.slice(0, 10) || []);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard Laporan</h2>
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-gray-500" />
          <select
            value={dateRange}
            onChange={(e) =>
              setDateRange(e.target.value as 'today' | 'week' | 'month' | 'all')
            }
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="today">Hari Ini</option>
            <option value="week">7 Hari Terakhir</option>
            <option value="month">30 Hari Terakhir</option>
            <option value="all">Semua Waktu</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-8 h-8 opacity-80" />
            <TrendingUp className="w-5 h-5" />
          </div>
          <p className="text-sm opacity-90 mb-1">Total Pendapatan</p>
          <p className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</p>
          <p className="text-xs opacity-75 mt-2">
            Hari ini: {formatCurrency(stats.todayRevenue)}
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-8 h-8 opacity-80" />
            <ArrowUpRight className="w-5 h-5" />
          </div>
          <p className="text-sm opacity-90 mb-1">Total Profit</p>
          <p className="text-2xl font-bold">{formatCurrency(stats.totalProfit)}</p>
          <p className="text-xs opacity-75 mt-2">
            Dari {stats.totalTransactions} transaksi
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <ShoppingBag className="w-8 h-8 opacity-80" />
            <TrendingUp className="w-5 h-5" />
          </div>
          <p className="text-sm opacity-90 mb-1">Total Transaksi</p>
          <p className="text-2xl font-bold">{stats.totalTransactions}</p>
          <p className="text-xs opacity-75 mt-2">
            Hari ini: {stats.todayTransactions} transaksi
          </p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <Package className="w-8 h-8 opacity-80" />
            <TrendingUp className="w-5 h-5" />
          </div>
          <p className="text-sm opacity-90 mb-1">Total Produk</p>
          <p className="text-2xl font-bold">{stats.totalProducts}</p>
          <p className="text-xs opacity-75 mt-2">Aktif di katalog</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            Produk Terlaris
          </h3>
          <div className="space-y-3">
            {topProducts.length > 0 ? (
              topProducts.map((product, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {product.product_name}
                      </p>
                      <p className="text-sm text-gray-600">
                        Terjual: {product.total_quantity} unit
                      </p>
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <p className="font-semibold text-green-600">
                      {formatCurrency(product.total_revenue)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                Belum ada data penjualan
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            Transaksi Terakhir
          </h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {recentTransactions.length > 0 ? (
              recentTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">
                      {transaction.transaction_number}
                    </p>
                    <p className="text-sm text-gray-600">
                      {formatDate(transaction.created_at)}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="font-semibold text-blue-600">
                      {formatCurrency(transaction.total_amount)}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">
                      {transaction.payment_method}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                Belum ada transaksi
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          Ringkasan Periode {dateRange === 'today' ? 'Hari Ini' : dateRange === 'week' ? '7 Hari' : dateRange === 'month' ? '30 Hari' : 'Semua Waktu'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-700 font-medium mb-1">
              Rata-rata per Transaksi
            </p>
            <p className="text-xl font-bold text-blue-900">
              {formatCurrency(
                stats.totalTransactions > 0
                  ? stats.totalRevenue / stats.totalTransactions
                  : 0
              )}
            </p>
          </div>
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm text-green-700 font-medium mb-1">
              Margin Profit
            </p>
            <p className="text-xl font-bold text-green-900">
              {stats.totalRevenue > 0
                ? ((stats.totalProfit / stats.totalRevenue) * 100).toFixed(1)
                : 0}
              %
            </p>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <p className="text-sm text-purple-700 font-medium mb-1">
              Total Produk
            </p>
            <p className="text-xl font-bold text-purple-900">
              {stats.totalProducts} item
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
