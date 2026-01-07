import { useEffect, useMemo, useState } from 'react';
import { Calendar, Download, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api, AttendanceRecord, User } from '../lib/api';
import { useToast } from './ToastProvider';

const SHIFT_WINDOWS = [
  { label: 'Pagi', startMinutes: 8 * 60, endMinutes: 9 * 60 },
  { label: 'Sore', startMinutes: 15 * 60 + 15, endMinutes: 16 * 60 + 15 },
];

const getShiftLabel = (dateString?: string) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const minutes = date.getHours() * 60 + date.getMinutes();
  const shift = SHIFT_WINDOWS.find(
    (window) => minutes >= window.startMinutes && minutes <= window.endMinutes
  );
  return shift?.label ?? 'Di luar shift';
};

const getStatus = (record?: AttendanceRecord) => {
  if (!record) return 'Tidak hadir';
  return getShiftLabel(record.scanned_at) === 'Di luar shift'
    ? 'Terlambat'
    : 'Sudah absen';
};

const formatTime = (dateString?: string) =>
  dateString
    ? new Date(dateString).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

const formatDate = (dateString?: string) =>
  dateString
    ? new Date(dateString).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '-';

const getTodayDate = () => new Date().toISOString().split('T')[0];

export default function AttendanceReportsPage() {
  const { showToast } = useToast();
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [users, setUsers] = useState<User[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [userData, attendanceData] = await Promise.all([
        api.getUsers(),
        api.getAttendance(selectedDate),
      ]);
      setUsers(userData || []);
      setAttendanceRecords(attendanceData || []);
    } catch (error) {
      console.error('Error loading attendance report:', error);
      showToast('Gagal memuat laporan absensi.');
    } finally {
      setLoading(false);
    }
  };

  const eligibleUsers = useMemo(() => {
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);
    return users.filter((user) => {
      if (!['staf', 'admin'].includes(user.role)) {
        return false;
      }
      return new Date(user.created_at) <= endOfDay;
    });
  }, [selectedDate, users]);

  const reportRows = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return eligibleUsers
      .filter((user) => {
        if (!term) return true;
        return (
          user.name.toLowerCase().includes(term) ||
          user.username.toLowerCase().includes(term)
        );
      })
      .map((user) => {
        const record = attendanceRecords.find(
          (item) => item.user_id === user.id
        );
        return {
          user,
          record,
          status: getStatus(record),
          shift: getShiftLabel(record?.scanned_at),
        };
      });
  }, [attendanceRecords, eligibleUsers, searchTerm]);

  const handleDownload = () => {
    const data = reportRows.map((row) => ({
      Tanggal: formatDate(selectedDate),
      Nama: row.user.name,
      Username: row.user.username,
      Role: row.user.role,
      'Jam Absen': formatTime(row.record?.scanned_at),
      Shift: row.shift,
      Status: row.status,
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Absensi');
    XLSX.writeFile(
      workbook,
      `laporan-absensi-${selectedDate}.xlsx`
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Laporan Absensi</p>
          <h2 className="text-2xl font-semibold text-slate-900">
            Rekap Absensi Staff & Admin
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Filter tanggal untuk melihat status absensi.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <Download className="h-4 w-4" />
          Unduh XLSX
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Calendar className="h-4 w-4" />
          <span>Tanggal</span>
        </div>
        <input
          type="date"
          value={selectedDate}
          onChange={(event) => setSelectedDate(event.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Cari nama atau username"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 pl-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Nama</th>
                <th className="px-6 py-3 font-medium">Role</th>
                <th className="px-6 py-3 font-medium">Jam Absen</th>
                <th className="px-6 py-3 font-medium">Shift</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-slate-500">
                    Memuat data...
                  </td>
                </tr>
              ) : reportRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-slate-500">
                    Tidak ada data absensi.
                  </td>
                </tr>
              ) : (
                reportRows.map((row) => (
                  <tr key={row.user.id}>
                    <td className="px-6 py-4 font-medium text-slate-800">
                      {row.user.name}
                      <p className="text-xs text-slate-500">
                        @{row.user.username}
                      </p>
                    </td>
                    <td className="px-6 py-4 capitalize text-slate-600">
                      {row.user.role}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {formatTime(row.record?.scanned_at)}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{row.shift}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                          row.status === 'Sudah absen'
                            ? 'bg-emerald-100 text-emerald-700'
                            : row.status === 'Terlambat'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {row.status}
                      </span>
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
