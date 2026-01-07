import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, MapPin, QrCode } from 'lucide-react';
import { api, AttendanceRecord, User } from '../lib/api';
import { useToast } from './ToastProvider';

const ATTENDANCE_QR_CODE = 'MERINDU-CAFE-ABSEN';
const SHIFT_WINDOWS = [
  { label: 'Pagi', time: '08.00 - 09.00' },
  { label: 'Sore', time: '15.15 - 16.15' },
];

type AttendancePageProps = {
  user: User;
};

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

const formatTime = (dateString: string) =>
  new Date(dateString).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });

const getTodayDate = () => new Date().toISOString().split('T')[0];

export default function AttendancePage({ user }: AttendancePageProps) {
  const { showToast } = useToast();
  const [qrInput, setQrInput] = useState('');
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const todayDate = useMemo(() => getTodayDate(), []);

  const fetchTodayRecord = useCallback(async () => {
    setIsChecking(true);
    try {
      const data = await api.getAttendance(todayDate);
      const record = data.find((item) => item.user_id === user.id) || null;
      setTodayRecord(record);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setIsChecking(false);
    }
  }, [todayDate, user.id]);

  useEffect(() => {
    fetchTodayRecord();
  }, [fetchTodayRecord]);

  const requestLocation = () =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation tidak tersedia.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, (error) => {
        reject(new Error(error.message || 'Gagal mendapatkan lokasi.'));
      }, {
        enableHighAccuracy: true,
        timeout: 10000,
      });
    });

  const handleScan = async () => {
    if (!qrInput.trim()) {
      showToast('Masukkan kode QR terlebih dahulu.');
      return;
    }

    setIsSubmitting(true);
    try {
      const position = await requestLocation();
      const result = await api.scanAttendance({
        user_id: user.id,
        qr_code: qrInput.trim(),
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setTodayRecord(result);
      showToast('Absen berhasil dicatat.', 'success');
    } catch (error) {
      console.error('Error scanning attendance:', error);
      if (error instanceof Error) {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed?.message) {
            showToast(parsed.message);
            return;
          }
        } catch (parseError) {
          console.warn('Error parsing attendance error:', parseError);
        }
        showToast(error.message);
      } else {
        showToast('Gagal menyimpan absensi.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusText = todayRecord
    ? `Sudah absen pada ${formatTime(todayRecord.scanned_at)}`
    : 'Belum ada absen hari ini.';

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Absensi</p>
          <h2 className="text-2xl font-semibold text-slate-900">
            Absen Harian Staff & Admin
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Tanggal {formatDate(new Date().toISOString())}
          </p>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-xs text-blue-600">Status hari ini</p>
          <p className="text-sm font-semibold text-blue-800">
            {isChecking ? 'Memeriksa...' : statusText}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">
                Scan QR Absen
              </h3>
              <p className="text-sm text-slate-500">
                Gunakan barcode tetap yang telah disediakan.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Kode hasil scan
              </label>
              <input
                type="text"
                value={qrInput}
                onChange={(event) => setQrInput(event.target.value)}
                placeholder="Tempel hasil scan QR"
                className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-2 text-xs text-slate-500">
                QR kode tetap: {ATTENDANCE_QR_CODE}
              </p>
            </div>

            <button
              type="button"
              onClick={handleScan}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <QrCode className="h-4 w-4" />
              {isSubmitting ? 'Memproses...' : 'Scan & Absen'}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-500" />
              <h3 className="text-base font-semibold text-slate-800">
                Jam Absen
              </h3>
            </div>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              {SHIFT_WINDOWS.map((shift) => (
                <li key={shift.label} className="flex items-center justify-between">
                  <span>{shift.label}</span>
                  <span className="font-medium text-slate-800">{shift.time}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-emerald-500" />
              <h3 className="text-base font-semibold text-slate-800">
                Ketentuan Lokasi
              </h3>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Absen hanya diterima jika berada dalam radius 100 meter dari lokasi
              cafe. Pastikan izin lokasi aktif saat melakukan scan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
