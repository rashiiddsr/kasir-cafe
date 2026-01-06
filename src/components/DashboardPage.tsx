import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  CreditCard,
  Package,
  Receipt,
  Tags,
  TrendingUp,
  Users,
} from 'lucide-react';
import { api, TransactionItem, User } from '../lib/api';

type DashboardPageProps = {
  user: User;
  onNavigate: (page: PageId) => void;
  menuItems: Array<{ id: PageId; name: string }>;
};

type PageId =
  | 'dashboard'
  | 'cashier'
  | 'categories'
  | 'products'
  | 'reports'
  | 'profile'
  | 'users';

type DashboardStats = {
  totalRevenue: number;
  totalTransactions: number;
  totalProducts: number;
  totalCategories: number;
  totalUsers: number;
  totalProfit: number;
};

const currencyFormatter = new Intl.NumberFormat('id-ID');

const roleHighlights: Record<string, string> = {
  superadmin:
    'Anda memiliki akses penuh untuk mengelola user, laporan, dan operasional kasir.',
  admin:
    'Kelola katalog produk dan kategori agar kasir selalu siap melayani.',
  manager:
    'Pantau performa penjualan dan stok untuk pengambilan keputusan yang cepat.',
  staf: 'Fokus pada transaksi harian dan layanan pelanggan terbaik.',
};

export default function DashboardPage({
  user,
  onNavigate,
  menuItems,
}: DashboardPageProps) {
  const roleKey = user.role === 'manajer' ? 'manager' : user.role;
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    totalTransactions: 0,
    totalProducts: 0,
    totalCategories: 0,
    totalUsers: 0,
    totalProfit: 0,
  });
  const [loading, setLoading] = useState(true);

  const startOfDay = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
  }, []);

  const allowedActions = useMemo(
    () => menuItems.filter((item) => item.id !== 'dashboard'),
    [menuItems]
  );

  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        const shouldLoadUsers = roleKey === 'superadmin';
        const shouldLoadReports =
          roleKey === 'manager' || roleKey === 'superadmin';

        const [transactions, products, categories, users, transactionItems] =
          await Promise.all([
            api.getTransactions(startOfDay),
            api.getProducts(),
            api.getCategories(),
            shouldLoadUsers ? api.getUsers() : Promise.resolve([]),
            shouldLoadReports
              ? api.getTransactionItems(startOfDay)
              : Promise.resolve([]),
          ]);

        const totalRevenue = transactions.reduce(
          (sum, transaction) => sum + Number(transaction.total_amount || 0),
          0
        );
        const totalTransactions = transactions.length;
        const totalProducts = products.length;
        const totalCategories = categories.length;
        const totalUsers = users.length;
        const totalProfit = (transactionItems as TransactionItem[]).reduce(
          (sum, item) => {
            const cost = item.products?.cost ?? 0;
            return sum + (Number(item.unit_price) - cost) * item.quantity;
          },
          0
        );

        setStats({
          totalRevenue,
          totalTransactions,
          totalProducts,
          totalCategories,
          totalUsers,
          totalProfit,
        });
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [roleKey, startOfDay]);

  const statCards = useMemo(() => {
    const baseCards = [
      {
        label: 'Transaksi Hari Ini',
        value: stats.totalTransactions.toLocaleString('id-ID'),
        icon: Receipt,
        helper: 'Jumlah transaksi',
      },
      {
        label: 'Omzet Hari Ini',
        value: `Rp ${currencyFormatter.format(stats.totalRevenue)}`,
        icon: CreditCard,
        helper: 'Total pemasukan',
      },
    ];

    const catalogCards = [
      {
        label: 'Total Produk',
        value: stats.totalProducts.toLocaleString('id-ID'),
        icon: Package,
        helper: 'Produk terdaftar',
      },
      {
        label: 'Total Kategori',
        value: stats.totalCategories.toLocaleString('id-ID'),
        icon: Tags,
        helper: 'Kategori aktif',
      },
    ];

    const managerCards = [
      {
        label: 'Estimasi Laba',
        value: `Rp ${currencyFormatter.format(stats.totalProfit)}`,
        icon: TrendingUp,
        helper: 'Berdasarkan HPP',
      },
    ];

    const superadminCards = [
      {
        label: 'Total User',
        value: stats.totalUsers.toLocaleString('id-ID'),
        icon: Users,
        helper: 'Akun aktif',
      },
    ];

    if (roleKey === 'staf') {
      return baseCards;
    }

    if (roleKey === 'admin') {
      return [...baseCards, ...catalogCards];
    }

    if (roleKey === 'manager') {
      return [...baseCards, ...catalogCards, ...managerCards];
    }

    return [...baseCards, ...catalogCards, ...managerCards, ...superadminCards];
  }, [roleKey, stats]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-sky-500 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-white/80">Selamat datang,</p>
            <h2 className="text-2xl font-semibold">{user.name}</h2>
            <p className="mt-2 max-w-xl text-sm text-white/90">
              {roleHighlights[roleKey] ||
                'Pantau aktivitas toko Anda hari ini.'}
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white/15 px-4 py-3 text-sm">
            <CalendarDays className="h-5 w-5" />
            <span>
              {new Date().toLocaleDateString('id-ID', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                  <Icon className="h-5 w-5" />
                </div>
                <BadgeCheck className="h-5 w-5 text-emerald-500" />
              </div>
              <p className="mt-4 text-sm text-slate-500">{card.label}</p>
              <p className="text-2xl font-semibold text-slate-900">
                {loading ? '...' : card.value}
              </p>
              <p className="text-xs text-slate-400">{card.helper}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">
            Akses Cepat
          </h3>
          <p className="text-sm text-slate-500">
            Pintasan untuk halaman yang sering Anda gunakan.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {allowedActions.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className="group flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-blue-500 hover:bg-blue-50"
              >
                <div>
                  <p className="font-medium text-slate-900">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    Buka halaman {item.name.toLowerCase()}
                  </p>
                </div>
                <ArrowUpRight className="h-5 w-5 text-slate-400 group-hover:text-blue-600" />
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">
            Highlight Hari Ini
          </h3>
          <ul className="mt-4 space-y-4 text-sm text-slate-600">
            <li className="flex items-start gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
              <span>
                {loading
                  ? 'Memuat ringkasan transaksi...'
                  : `Total omzet hari ini Rp ${currencyFormatter.format(
                      stats.totalRevenue
                    )}.`}
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
              <span>
                {loading
                  ? 'Memuat informasi produk...'
                  : `${stats.totalProducts} produk siap dijual dan ${
                      stats.totalCategories
                    } kategori aktif.`}
              </span>
            </li>
            {(roleKey === 'manager' || roleKey === 'superadmin') && (
              <li className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-indigo-500" />
                <span>
                  Estimasi laba kotor hari ini Rp{' '}
                  {currencyFormatter.format(stats.totalProfit)}.
                </span>
              </li>
            )}
            {roleKey === 'superadmin' && (
              <li className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-purple-500" />
                <span>
                  Total {stats.totalUsers} akun aktif terdaftar di sistem.
                </span>
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
