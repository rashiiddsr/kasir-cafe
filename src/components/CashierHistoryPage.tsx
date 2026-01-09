import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Search } from 'lucide-react';
import { api, CashierSessionHistory, User } from '../lib/api';
import { useToast } from './ToastProvider';

type CashierHistoryPageProps = {
  user: User;
};

const formatDateTime = (dateString?: string | null) =>
  dateString
    ? new Date(dateString).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

const formatCurrency = (value: number) =>
  `Rp ${value.toLocaleString('id-ID')}`;

const getDateInputValue = (date: Date) =>
  date.toLocaleDateString('en-CA');

export default function CashierHistoryPage({ user }: CashierHistoryPageProps) {
  const { showToast } = useToast();
  const today = useMemo(() => new Date(), []);
  const [startDate, setStartDate] = useState(getDateInputValue(today));
  const [endDate, setEndDate] = useState(getDateInputValue(today));
  const [sessions, setSessions] = useState<CashierSessionHistory[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getCashierSessions({
        start_date: startDate,
        end_date: endDate,
      });
      setSessions(data || []);
    } catch (error) {
      console.error('Error loading cashier history:', error);
      showToast('Gagal memuat histori kasir.');
    } finally {
      setLoading(false);
    }
  }, [endDate, showToast, startDate]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const filteredSessions = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (!term) {
      return sessions;
    }
    return sessions.filter((session) => {
      const openedName = session.opened_by_name || '';
      const openedUsername = session.opened_by_username || '';
      const closedName = session.closed_by_name || '';
      const closedUsername = session.closed_by_username || '';
      return (
        openedName.toLowerCase().includes(term) ||
        openedUsername.toLowerCase().includes(term) ||
        closedName.toLowerCase().includes(term) ||
        closedUsername.toLowerCase().includes(term) ||
        session.id.toLowerCase().includes(term)
      );
    });
  }, [searchTerm, sessions]);

  const totalRevenue = filteredSessions.reduce(
    (sum, session) => sum + Number(session.total_revenue || 0),
    0
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Histori Buka Tutup Kasir
          </h1>
          <p className="text-gray-600">
            Pantau riwayat sesi kasir untuk evaluasi harian tim.
          </p>
        </div>
        <div className="text-sm text-slate-600">
          Login sebagai <span className="font-semibold">{user.name}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="text-sm font-medium text-slate-600">
            Tanggal mulai
          </label>
          <div className="relative mt-2">
            <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">
            Tanggal selesai
          </label>
          <div className="relative mt-2">
            <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">
            Cari sesi
          </label>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Nama kasir, username, atau ID"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-slate-500">Total sesi</p>
            <p className="text-xl font-semibold text-slate-900">
              {filteredSessions.length}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Total omzet</p>
            <p className="text-xl font-semibold text-slate-900">
              {formatCurrency(totalRevenue)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Tanggal buka</th>
                <th className="px-6 py-3 text-left font-semibold">Tanggal tutup</th>
                <th className="px-6 py-3 text-left font-semibold">Pembuka</th>
                <th className="px-6 py-3 text-left font-semibold">Penutup</th>
                <th className="px-6 py-3 text-right font-semibold">Kas awal</th>
                <th className="px-6 py-3 text-right font-semibold">Total transaksi</th>
                <th className="px-6 py-3 text-right font-semibold">Omset</th>
                <th className="px-6 py-3 text-right font-semibold">Tunai</th>
                <th className="px-6 py-3 text-right font-semibold">Non-tunai</th>
                <th className="px-6 py-3 text-right font-semibold">Selisih</th>
                <th className="px-6 py-3 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    Memuat histori kasir...
                  </td>
                </tr>
              ) : filteredSessions.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    Belum ada histori kasir pada rentang tanggal ini.
                  </td>
                </tr>
              ) : (
                filteredSessions.map((session) => {
                  const isClosed = Boolean(session.closed_at);
                  return (
                    <tr key={session.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-slate-600">
                        {formatDateTime(session.opened_at)}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {formatDateTime(session.closed_at)}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {session.opened_by_name || '-'}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {session.closed_by_name || '-'}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-slate-900">
                        {formatCurrency(Number(session.opening_balance || 0))}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-700">
                        {session.total_transactions ?? 0}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-700">
                        {formatCurrency(Number(session.total_revenue || 0))}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-700">
                        {formatCurrency(Number(session.total_cash || 0))}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-700">
                        {formatCurrency(Number(session.total_non_cash || 0))}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-700">
                        {formatCurrency(Number(session.variance_total || 0))}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            isClosed
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {isClosed ? 'Tutup' : 'Buka'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
