import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Search, Download, Eye, Pencil } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api, CashierSessionHistory, User } from '../lib/api';
import { formatJakartaDate, formatJakartaDateTime } from '../lib/date';
import { useToast } from './ToastProvider';

type CashierHistoryPageProps = {
  user: User;
};

const formatDateTime = (dateString?: string | null) =>
  dateString ? formatJakartaDateTime(new Date(dateString)) : '-';

const formatCurrency = (value: number) =>
  `Rp ${value.toLocaleString('id-ID')}`;

const formatOptionalCurrency = (value?: number | null) =>
  value === null || value === undefined ? '-' : formatCurrency(Number(value));

const getDateInputValue = (date: Date) => formatJakartaDate(date);

const normalizeAmount = (value: string | number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

const parseProductsSummary = (
  summary?: CashierSessionHistory['products_summary'] | string | null
) => {
  if (!summary) {
    return [];
  }
  if (Array.isArray(summary)) {
    return summary;
  }
  if (typeof summary === 'string') {
    try {
      const parsed = JSON.parse(summary);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.warn('Error parsing products summary:', error);
    }
  }
  return [];
};

export default function CashierHistoryPage({ user }: CashierHistoryPageProps) {
  const { showToast } = useToast();
  const today = useMemo(() => new Date(), []);
  const roleKey = user.role === 'manajer' ? 'manager' : user.role;
  const POLL_INTERVAL = 15000;
  const [startDate, setStartDate] = useState(getDateInputValue(today));
  const [endDate, setEndDate] = useState(getDateInputValue(today));
  const [sessions, setSessions] = useState<CashierSessionHistory[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailSession, setDetailSession] =
    useState<CashierSessionHistory | null>(null);
  const [editSession, setEditSession] =
    useState<CashierSessionHistory | null>(null);
  const [editOpeningBalance, setEditOpeningBalance] = useState('');
  const [editClosingCash, setEditClosingCash] = useState('');
  const [editClosingNonCash, setEditClosingNonCash] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const loadSessions = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true);
      }
      try {
        const data = await api.getCashierSessions({
          start_date: startDate,
          end_date: endDate,
        });
        setSessions(data || []);
      } catch (error) {
        console.error('Error loading cashier history:', error);
        if (!options?.silent) {
          showToast('Gagal memuat histori kasir.');
        }
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [endDate, showToast, startDate]
  );

  useEffect(() => {
    loadSessions();
    const interval = window.setInterval(() => {
      loadSessions({ silent: true });
    }, POLL_INTERVAL);
    const handleFocus = () => {
      loadSessions({ silent: true });
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadSessions, POLL_INTERVAL]);

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

  const canDownloadReport = useMemo(
    () => ['superadmin', 'manager'].includes(roleKey),
    [roleKey]
  );

  const canManageHistory = useMemo(
    () => ['superadmin', 'manager'].includes(roleKey),
    [roleKey]
  );

  const openDetailModal = (session: CashierSessionHistory) => {
    setDetailSession(session);
  };

  const openEditModal = (session: CashierSessionHistory) => {
    if (!session.closed_at) {
      showToast('Histori kasir masih terbuka dan tidak bisa diedit.', 'info');
      return;
    }
    setEditSession(session);
    setEditOpeningBalance(String(session.opening_balance ?? 0));
    setEditClosingCash(String(session.closing_cash ?? 0));
    setEditClosingNonCash(String(session.closing_non_cash ?? 0));
  };

  const handleSaveEdit = async () => {
    if (!editSession) return;
    if (
      editOpeningBalance.trim() === '' ||
      editClosingCash.trim() === '' ||
      editClosingNonCash.trim() === ''
    ) {
      showToast('Kas awal, tunai, dan non-tunai wajib diisi.');
      return;
    }
    setIsSavingEdit(true);
    try {
      const updated = await api.updateCashierSession(editSession.id, {
        opening_balance: normalizeAmount(editOpeningBalance),
        closing_cash: normalizeAmount(editClosingCash),
        closing_non_cash: normalizeAmount(editClosingNonCash),
      });
      setSessions((prev) =>
        prev.map((session) =>
          session.id === updated.id ? { ...session, ...updated } : session
        )
      );
      setDetailSession((prev) =>
        prev && prev.id === updated.id ? { ...prev, ...updated } : prev
      );
      setEditSession(null);
      showToast('Histori kasir berhasil diperbarui.', 'success');
    } catch (error) {
      console.error('Error updating cashier history:', error);
      showToast('Gagal memperbarui histori kasir.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDownload = () => {
    const data = filteredSessions.map((session) => ({
      'Tanggal buka': formatDateTime(session.opened_at),
      'Tanggal tutup': formatDateTime(session.closed_at),
      Pembuka: session.opened_by_name || '-',
      Penutup: session.closed_by_name || '-',
      'Kas awal': Number(session.opening_balance || 0),
      'Total transaksi': session.total_transactions ?? 0,
      Omset: Number(session.total_revenue || 0),
      Tunai: Number(session.total_cash || 0),
      'Non-tunai': Number(session.total_non_cash || 0),
      Selisih: Number(session.variance_total || 0),
      Status: session.closed_at ? 'Tutup' : 'Buka',
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Kasir');
    const fileSuffix = `${startDate}-sd-${endDate}`;
    XLSX.writeFile(workbook, `laporan-buka-tutup-kasir-${fileSuffix}.xlsx`);
  };

  const editVariance = useMemo(() => {
    if (!editSession) {
      return null;
    }
    const opening = normalizeAmount(editOpeningBalance);
    const cash = normalizeAmount(editClosingCash);
    const nonCash = normalizeAmount(editClosingNonCash);
    const expectedCash = normalizeAmount(opening + Number(editSession.total_cash || 0));
    const expectedNonCash = normalizeAmount(Number(editSession.total_non_cash || 0));
    return {
      expectedCash,
      expectedNonCash,
      varianceCash: normalizeAmount(cash - expectedCash),
      varianceNonCash: normalizeAmount(nonCash - expectedNonCash),
      varianceTotal: normalizeAmount(cash + nonCash - (expectedCash + expectedNonCash)),
    };
  }, [editClosingCash, editClosingNonCash, editOpeningBalance, editSession]);

  const detailProducts = useMemo(
    () => (detailSession ? parseProductsSummary(detailSession.products_summary as any) : []),
    [detailSession]
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
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          {canDownloadReport && (
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Unduh XLSX
            </button>
          )}
          <span>
            Login sebagai <span className="font-semibold">{user.name}</span>
          </span>
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
                <th className="px-6 py-3 text-center font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={12}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    Memuat histori kasir...
                  </td>
                </tr>
              ) : filteredSessions.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
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
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openDetailModal(session)}
                            className="rounded p-2 text-slate-600 hover:bg-slate-100"
                            aria-label={`Lihat detail histori kasir ${session.id}`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {canManageHistory && isClosed && (
                            <button
                              type="button"
                              onClick={() => openEditModal(session)}
                              className="rounded p-2 text-blue-600 hover:bg-blue-50"
                              aria-label={`Edit histori kasir ${session.id}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Detail Histori Kasir
                </h3>
                <p className="text-sm text-slate-500">{detailSession.id}</p>
              </div>
              <button
                onClick={() => setDetailSession(null)}
                className="rounded p-2 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 p-6 text-sm">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-slate-500">Pembuka</p>
                  <p className="font-medium text-slate-900">
                    {detailSession.opened_by_name || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Penutup</p>
                  <p className="font-medium text-slate-900">
                    {detailSession.closed_by_name || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Tanggal buka</p>
                  <p className="font-medium text-slate-900">
                    {formatDateTime(detailSession.opened_at)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Tanggal tutup</p>
                  <p className="font-medium text-slate-900">
                    {formatDateTime(detailSession.closed_at)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Kas awal</p>
                  <p className="font-medium text-slate-900">
                    {formatCurrency(Number(detailSession.opening_balance || 0))}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Total transaksi</p>
                  <p className="font-medium text-slate-900">
                    {detailSession.total_transactions ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Omset</p>
                  <p className="font-medium text-slate-900">
                    {formatCurrency(Number(detailSession.total_revenue || 0))}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Tunai (transaksi)</p>
                  <p className="font-medium text-slate-900">
                    {formatCurrency(Number(detailSession.total_cash || 0))}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Non-tunai (transaksi)</p>
                  <p className="font-medium text-slate-900">
                    {formatCurrency(Number(detailSession.total_non_cash || 0))}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Tunai aktual</p>
                  <p className="font-medium text-slate-900">
                    {formatOptionalCurrency(detailSession.closing_cash)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Non-tunai aktual</p>
                  <p className="font-medium text-slate-900">
                    {formatOptionalCurrency(detailSession.closing_non_cash)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Selisih tunai</p>
                  <p className="font-medium text-slate-900">
                    {formatCurrency(Number(detailSession.variance_cash || 0))}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Selisih non-tunai</p>
                  <p className="font-medium text-slate-900">
                    {formatCurrency(Number(detailSession.variance_non_cash || 0))}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Selisih total</p>
                  <p className="font-medium text-slate-900">
                    {formatCurrency(Number(detailSession.variance_total || 0))}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="font-semibold text-slate-800">Catatan penutup</p>
                <p className="text-slate-700">
                  {detailSession.closing_notes?.trim()
                    ? detailSession.closing_notes
                    : 'Tidak ada catatan.'}
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Rincian Produk
                </p>
                {detailProducts.length === 0 ? (
                  <p className="text-slate-500">
                    Tidak ada ringkasan produk pada sesi ini.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {detailProducts.map((product) => (
                      <div
                        key={product.name}
                        className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2"
                      >
                        <p className="font-medium text-slate-900">
                          {product.name}
                        </p>
                        <p className="text-slate-600">
                          {product.quantity} item
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {editSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Edit Histori Kasir
                </h3>
                <p className="text-sm text-slate-500">{editSession.id}</p>
              </div>
              <button
                onClick={() => setEditSession(null)}
                className="rounded p-2 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 p-6 text-sm">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-slate-600">Kas awal</label>
                  <input
                    type="number"
                    value={editOpeningBalance}
                    onChange={(event) => setEditOpeningBalance(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-slate-600">Tunai aktual</label>
                  <input
                    type="number"
                    value={editClosingCash}
                    onChange={(event) => setEditClosingCash(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-slate-600">Non-tunai aktual</label>
                  <input
                    type="number"
                    value={editClosingNonCash}
                    onChange={(event) => setEditClosingNonCash(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <p className="font-semibold text-slate-700">Perhitungan</p>
                  <p>
                    Ekspektasi tunai:{' '}
                    {formatCurrency(Number(editVariance?.expectedCash || 0))}
                  </p>
                  <p>
                    Ekspektasi non-tunai:{' '}
                    {formatCurrency(Number(editVariance?.expectedNonCash || 0))}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">Selisih terbaru</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <p>
                    Tunai:{' '}
                    {formatCurrency(Number(editVariance?.varianceCash || 0))}
                  </p>
                  <p>
                    Non-tunai:{' '}
                    {formatCurrency(Number(editVariance?.varianceNonCash || 0))}
                  </p>
                  <p>
                    Total:{' '}
                    {formatCurrency(Number(editVariance?.varianceTotal || 0))}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditSession(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-70"
                >
                  {isSavingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
