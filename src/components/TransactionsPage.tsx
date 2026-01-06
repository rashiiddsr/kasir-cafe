import { useEffect, useMemo, useState } from 'react';
import { Calendar, Filter } from 'lucide-react';
import { api, Transaction, User } from '../lib/api';
import { useToast } from './ToastProvider';

type TransactionsPageProps = {
  user: User;
};

type UserOption = {
  id: string;
  name: string;
};

const formatCurrency = (amount: number) =>
  `Rp ${amount.toLocaleString('id-ID')}`;

const formatDateTime = (dateString: string) =>
  new Date(dateString).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const getDateInputValue = (date: Date) =>
  date.toLocaleDateString('en-CA');

export default function TransactionsPage({ user }: TransactionsPageProps) {
  const { showToast } = useToast();
  const today = useMemo(() => new Date(), []);
  const [startDate, setStartDate] = useState(getDateInputValue(today));
  const [endDate, setEndDate] = useState(getDateInputValue(today));
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState('self');

  const canViewAllUsers = useMemo(() => {
    const role = user.role === 'manajer' ? 'manager' : user.role;
    return ['superadmin', 'admin', 'manager'].includes(role);
  }, [user.role]);

  useEffect(() => {
    if (!canViewAllUsers) return;

    const loadUsers = async () => {
      try {
        const users = await api.getUsers();
        setUserOptions(users.map((item) => ({ id: item.id, name: item.name })));
      } catch (error) {
        console.error('Error loading users:', error);
        showToast('Gagal memuat daftar user.');
      }
    };

    loadUsers();
  }, [canViewAllUsers, showToast]);

  const resolveUserFilter = () => {
    if (!canViewAllUsers) {
      return user.id;
    }
    if (selectedUser === 'all') {
      return undefined;
    }
    if (selectedUser === 'self') {
      return user.id;
    }
    return selectedUser;
  };

  const toStartOfDay = (value: string) =>
    new Date(`${value}T00:00:00`).toISOString();

  const toEndOfDay = (value: string) =>
    new Date(`${value}T23:59:59.999`).toISOString();

  useEffect(() => {
    const loadTransactions = async () => {
      setLoading(true);
      try {
        const data = await api.getTransactions({
          from: toStartOfDay(startDate),
          to: toEndOfDay(endDate),
          userId: resolveUserFilter(),
        });
        setTransactions(data || []);
      } catch (error) {
        console.error('Error loading transactions:', error);
        showToast('Gagal memuat transaksi.');
      } finally {
        setLoading(false);
      }
    };

    loadTransactions();
  }, [startDate, endDate, selectedUser, user.id, canViewAllUsers, showToast]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Histori Transaksi</h2>
          <p className="text-sm text-slate-500">
            Pantau transaksi harian dan histori kasir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Calendar className="h-4 w-4" />
            <span>Filter tanggal</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <span className="text-sm text-slate-500">s/d</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          {canViewAllUsers && (
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <select
                value={selectedUser}
                onChange={(event) => setSelectedUser(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="self">Transaksi saya</option>
                <option value="all">Semua user</option>
                {userOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-sm text-slate-500">Total transaksi</p>
            <p className="text-xl font-semibold text-slate-900">
              {transactions.length}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Total omzet</p>
            <p className="text-xl font-semibold text-slate-900">
              {formatCurrency(
                transactions.reduce(
                  (sum, item) => sum + Number(item.total_amount || 0),
                  0
                )
              )}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">No Transaksi</th>
                <th className="px-6 py-3 text-left font-semibold">Kasir</th>
                <th className="px-6 py-3 text-left font-semibold">Tanggal</th>
                <th className="px-6 py-3 text-right font-semibold">Total</th>
                <th className="px-6 py-3 text-left font-semibold">Pembayaran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    Memuat transaksi...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    Belum ada transaksi pada rentang tanggal ini.
                  </td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {transaction.transaction_number}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {transaction.user_name || 'Tidak diketahui'}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {formatDateTime(transaction.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-900">
                      {formatCurrency(Number(transaction.total_amount))}
                    </td>
                    <td className="px-6 py-4 text-slate-600 capitalize">
                      {transaction.payment_method}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
