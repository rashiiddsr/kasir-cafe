import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Filter, Search, Eye, Pencil } from 'lucide-react';
import { api, Transaction, TransactionItem, User } from '../lib/api';
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
  const POLL_INTERVAL = 15000;
  const today = useMemo(() => new Date(), []);
  const [startDate, setStartDate] = useState(getDateInputValue(today));
  const [endDate, setEndDate] = useState(getDateInputValue(today));
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState('self');
  const [searchTerm, setSearchTerm] = useState('');
  const [detailTransaction, setDetailTransaction] =
    useState<Transaction | null>(null);
  const [detailItems, setDetailItems] = useState<TransactionItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(
    null
  );
  const [editPaymentMethod, setEditPaymentMethod] = useState<'cash' | 'non-cash'>(
    'cash'
  );
  const [editPaymentAmount, setEditPaymentAmount] = useState('');
  const [editNotes, setEditNotes] = useState('');

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

  const resolveUserFilter = useCallback(() => {
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
  }, [canViewAllUsers, selectedUser, user.id]);

  const toStartOfDay = (value: string) => `${value} 00:00:00`;

  const toEndOfDay = (value: string) => `${value} 23:59:59`;

  const loadTransactions = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true);
      }
      try {
        const data = await api.getTransactions({
          from: toStartOfDay(startDate),
          to: toEndOfDay(endDate),
          userId: resolveUserFilter(),
          search: searchTerm.trim() || undefined,
        });
        setTransactions(data || []);
      } catch (error) {
        console.error('Error loading transactions:', error);
        if (!options?.silent) {
          showToast('Gagal memuat transaksi.');
        }
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [startDate, endDate, searchTerm, showToast, resolveUserFilter]
  );

  useEffect(() => {
    loadTransactions();
    const interval = window.setInterval(() => {
      loadTransactions({ silent: true });
    }, POLL_INTERVAL);
    const handleFocus = () => {
      loadTransactions({ silent: true });
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadTransactions]);

  const canEditTransaction = (transaction: Transaction) =>
    transaction.user_id === user.id || canViewAllUsers;

  const openDetailModal = async (transaction: Transaction) => {
    setDetailTransaction(transaction);
    setDetailItems([]);
    setDetailLoading(true);
    try {
      const items = await api.getTransactionItems({
        transactionId: transaction.id,
      });
      setDetailItems(items || []);
    } catch (error) {
      console.error('Error loading transaction detail:', error);
      showToast('Gagal memuat detail transaksi.');
    } finally {
      setDetailLoading(false);
    }
  };

  const openEditModal = (transaction: Transaction) => {
    setEditTransaction(transaction);
    setEditPaymentMethod(
      transaction.payment_method === 'non-cash' ? 'non-cash' : 'cash'
    );
    setEditPaymentAmount(String(transaction.payment_amount || 0));
    setEditNotes(transaction.notes || '');
  };

  const handleUpdateTransaction = async () => {
    if (!editTransaction) return;
    const paymentAmount =
      editPaymentMethod === 'cash'
        ? parseFloat(editPaymentAmount) || 0
        : Number(editTransaction.total_amount || 0);
    if (editPaymentMethod === 'cash' && paymentAmount < editTransaction.total_amount) {
      showToast('Jumlah pembayaran kurang.', 'info');
      return;
    }
    try {
      const changeAmount =
        editPaymentMethod === 'cash'
          ? paymentAmount - Number(editTransaction.total_amount || 0)
          : 0;
      const updated = await api.updateTransaction(editTransaction.id, {
        payment_method: editPaymentMethod,
        payment_amount: paymentAmount,
        change_amount: changeAmount,
        notes: editNotes.trim() ? editNotes.trim() : null,
      });
      setTransactions((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      setEditTransaction(null);
      showToast('Transaksi berhasil diperbarui.', 'success');
    } catch (error) {
      console.error('Error updating transaction:', error);
      showToast('Gagal memperbarui transaksi.');
    }
  };

  const formatPaymentMethod = (method: string) => {
    if (method === 'non-cash') return 'non-tunai';
    if (method === 'cash') return 'tunai';
    return method;
  };

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
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-slate-500">Total transaksi</p>
            <p className="text-xl font-semibold text-slate-900">
              {transactions.length}
            </p>
          </div>
          <div className="flex flex-1 flex-col gap-3 text-right md:flex-row md:items-center md:justify-end">
            <div className="relative w-full md:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Cari transaksi..."
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
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
                <th className="px-6 py-3 text-center font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    Memuat transaksi...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
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
                      {formatPaymentMethod(transaction.payment_method)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openDetailModal(transaction)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Detail
                        </button>
                        {canEditTransaction(transaction) && (
                          <button
                            onClick={() => openEditModal(transaction)}
                            className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-2xl w-full rounded-lg bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Detail Transaksi
                </h3>
                <p className="text-sm text-slate-500">
                  {detailTransaction.transaction_number}
                </p>
              </div>
              <button
                onClick={() => {
                  setDetailTransaction(null);
                  setDetailItems([]);
                }}
                className="rounded p-2 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Kasir</p>
                  <p className="font-medium text-slate-900">
                    {detailTransaction.user_name || 'Tidak diketahui'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Tanggal</p>
                  <p className="font-medium text-slate-900">
                    {formatDateTime(detailTransaction.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Metode Pembayaran</p>
                  <p className="font-medium text-slate-900 capitalize">
                    {formatPaymentMethod(detailTransaction.payment_method)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Total</p>
                  <p className="font-medium text-slate-900">
                    {formatCurrency(Number(detailTransaction.total_amount))}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Jumlah Dibayar</p>
                  <p className="font-medium text-slate-900">
                    {formatCurrency(Number(detailTransaction.payment_amount))}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Kembalian</p>
                  <p className="font-medium text-slate-900">
                    {formatCurrency(Number(detailTransaction.change_amount))}
                  </p>
                </div>
              </div>

              {detailTransaction.notes && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-800 mb-1">Catatan</p>
                  <p>{detailTransaction.notes}</p>
                </div>
              )}

              <div>
                <p className="text-sm font-semibold text-slate-800 mb-2">
                  Detail Pesanan
                </p>
                {detailLoading ? (
                  <p className="text-sm text-slate-500">Memuat item...</p>
                ) : detailItems.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Tidak ada item pada transaksi ini.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detailItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col gap-1 rounded-md border border-slate-200 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-slate-900">
                            {item.product_name}
                          </p>
                          <p className="font-semibold text-slate-900">
                            {formatCurrency(Number(item.subtotal))}
                          </p>
                        </div>
                        <p className="text-slate-500">
                          {item.quantity} x {formatCurrency(Number(item.unit_price))}
                        </p>
                        {item.variant_name && (
                          <p className="text-slate-500">
                            Varian: {item.variant_name}
                          </p>
                        )}
                        {Array.isArray(item.extras) && item.extras.length > 0 && (
                          <p className="text-slate-500">
                            Extra: {item.extras.map((extra) => extra.name).join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {editTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md w-full rounded-lg bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">
                Edit Transaksi
              </h3>
              <button
                onClick={() => setEditTransaction(null)}
                className="rounded p-2 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Metode Pembayaran
                </label>
                <select
                  value={editPaymentMethod}
                  onChange={(event) => {
                    const value = event.target.value as 'cash' | 'non-cash';
                    setEditPaymentMethod(value);
                    if (value === 'non-cash' && editTransaction) {
                      setEditPaymentAmount(String(editTransaction.total_amount));
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="cash">Tunai</option>
                  <option value="non-cash">Non-tunai</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Jumlah Dibayar
                </label>
                <input
                  type="number"
                  value={editPaymentAmount}
                  onChange={(event) => setEditPaymentAmount(event.target.value)}
                  disabled={editPaymentMethod === 'non-cash'}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Catatan (Opsional)
                </label>
                <textarea
                  value={editNotes}
                  onChange={(event) => setEditNotes(event.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditTransaction(null)}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  onClick={handleUpdateTransaction}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Simpan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
