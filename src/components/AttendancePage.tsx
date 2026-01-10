import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Clock, MapPin, QrCode } from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';
import { api, AttendanceRecord, User } from '../lib/api';
import { useToast } from './ToastProvider';

const ATTENDANCE_QR_CODE = 'MERINDU-CAFE-ABSEN';
const LOCATION_CACHE_KEY = 'attendance:last_location';
const LOCATION_CACHE_MAX_AGE_MS = 2 * 60 * 1000;
const SHIFT_WINDOWS = [
  { label: 'Pagi', time: '07.45 - 08.30' },
  { label: 'Sore', time: '15.45 - 16.30' },
];

type AttendancePageProps = {
  user: User;
};

const formatDate = (value: string | Date) =>
  new Date(value).toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

const formatTime = (dateString: string) =>
  new Date(dateString).toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTodayDate = () => formatLocalDate(new Date());

export default function AttendancePage({ user }: AttendancePageProps) {
  const { showToast } = useToast();
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const isSubmittingRef = useRef(false);
  const isMountedRef = useRef(true);
  const zxingControlsRef = useRef<IScannerControls | null>(null);
  const zxingReaderRef = useRef<Awaited<typeof import('@zxing/browser')> | null>(
    null
  );

  const todayDate = useMemo(() => getTodayDate(), []);

  const fetchTodayRecord = useCallback(async () => {
    setIsChecking(true);
    try {
      const data = await api.getAttendance({ date: todayDate });
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

  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

  const requestLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      throw new Error('Geolocation tidak tersedia.');
    }

    const getPosition = (options: PositionOptions) =>
      new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });

    const saveCachedLocation = (position: GeolocationPosition) => {
      const payload = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      };
      localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(payload));
    };

    const readCachedLocation = () => {
      const raw = localStorage.getItem(LOCATION_CACHE_KEY);
      if (!raw) {
        return null;
      }
      try {
        const parsed = JSON.parse(raw) as {
          latitude: number;
          longitude: number;
          accuracy?: number;
          timestamp: number;
        };
        if (!Number.isFinite(parsed.latitude) || !Number.isFinite(parsed.longitude)) {
          return null;
        }
        if (Date.now() - parsed.timestamp > LOCATION_CACHE_MAX_AGE_MS) {
          return null;
        }
        return parsed;
      } catch (error) {
        console.warn('Error reading cached location:', error);
        return null;
      }
    };

    try {
      const position = await getPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
      saveCachedLocation(position);
      return position;
    } catch (error) {
      try {
        const position = await getPosition({
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 5 * 60 * 1000,
        });
        saveCachedLocation(position);
        return position;
      } catch (fallbackError) {
        const cached = readCachedLocation();
        if (cached) {
          return {
            coords: {
              latitude: cached.latitude,
              longitude: cached.longitude,
              accuracy: cached.accuracy ?? 0,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: cached.timestamp,
          } as GeolocationPosition;
        }
        if (
          error instanceof GeolocationPositionError &&
          error.code === error.TIMEOUT
        ) {
          throw new Error(
            'Lokasi tidak ditemukan tepat waktu. Coba lagi sebentar.'
          );
        }
        if (fallbackError instanceof GeolocationPositionError) {
          throw new Error(fallbackError.message || 'Gagal mendapatkan lokasi.');
        }
        throw new Error('Gagal mendapatkan lokasi.');
      }
    }
  }, []);

  const stopScanLoop = useCallback(() => {
    if (scanLoopRef.current) {
      window.clearInterval(scanLoopRef.current);
      scanLoopRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopScanLoop();
    zxingControlsRef.current?.stop();
    zxingControlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
    setIsScanning(false);
    setScanError(null);
  }, [stopScanLoop]);

  const submitAttendance = useCallback(
    async (code: string) => {
      setIsSubmitting(true);
      try {
        if (code !== ATTENDANCE_QR_CODE) {
          showToast('QR tidak sesuai. Gunakan QR absensi yang benar.');
          return;
        }
        const position = await requestLocation();
        const result = await api.scanAttendance({
          user_id: user.id,
          qr_code: code,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setTodayRecord(result);
        showToast('Absen berhasil dicatat.', 'success');
        stopCamera();
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
    },
    [requestLocation, showToast, stopCamera, user.id]
  );

  const startScanLoop = useCallback(() => {
    if (!videoRef.current || !('BarcodeDetector' in window)) {
      return;
    }
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    scanLoopRef.current = window.setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        return;
      }
      if (isSubmittingRef.current) {
        return;
      }
      try {
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes.length === 0) {
          return;
        }
        const detectedValue = barcodes[0]?.rawValue;
        if (!detectedValue || detectedValue === lastScannedRef.current) {
          return;
        }
        lastScannedRef.current = detectedValue;
        await submitAttendance(detectedValue);
      } catch (error) {
        console.error('Error detecting barcode:', error);
      }
    }, 700);
  }, [submitAttendance]);

  const startZxingScanner = useCallback(async () => {
    if (!videoRef.current) {
      return;
    }
    try {
      if (!zxingReaderRef.current) {
        zxingReaderRef.current = await import('@zxing/browser');
      }
      const { BrowserQRCodeReader, NotFoundException } = zxingReaderRef.current;
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        async (result, error) => {
          if (result) {
            if (isSubmittingRef.current) {
              return;
            }
            const detectedValue = result.getText();
            if (detectedValue && detectedValue !== lastScannedRef.current) {
              lastScannedRef.current = detectedValue;
              await submitAttendance(detectedValue);
            }
          } else if (error && !(error instanceof NotFoundException)) {
            console.error('Error detecting barcode:', error);
          }
        }
      );
      if (!isMountedRef.current) {
        controls.stop();
        return;
      }
      zxingControlsRef.current = controls;
      setCameraReady(true);
      setIsScanning(true);
    } catch (error) {
      console.error('Error starting ZXing scanner:', error);
      setScanError('Tidak bisa mengakses kamera.');
    }
  }, [submitAttendance]);

  const startCamera = useCallback(async () => {
    setScanError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanError('Browser tidak mendukung akses kamera.');
      return;
    }
    try {
      if (!('BarcodeDetector' in window)) {
        await startZxingScanner();
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
        setIsScanning(true);
        startScanLoop();
      }
    } catch (error) {
      console.error('Error starting camera:', error);
      setScanError('Tidak bisa mengakses kamera.');
    }
  }, [startScanLoop, startZxingScanner]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!isChecking && !todayRecord) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, [isChecking, startCamera, stopCamera, todayRecord]);

  const statusText = todayRecord
    ? `${todayRecord.status === 'terlambat' ? 'Terlambat' : 'Sudah absen'} pada ${formatTime(
        todayRecord.scanned_at
      )}`
    : 'Belum ada absen hari ini.';
  const isScanReady = !isChecking && !todayRecord;
  const cameraStatusText = scanError
    ? scanError
    : isScanReady
      ? 'Mengaktifkan kamera untuk scan QR absensi...'
      : todayRecord
        ? 'Absensi hari ini sudah selesai.'
        : 'Memeriksa status absensi...';

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Absensi</p>
          <h2 className="text-2xl font-semibold text-slate-900">
            Absen Harian Staff & Admin
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Tanggal {formatDate(new Date())}
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
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
              <video
                ref={videoRef}
                className="h-64 w-full object-cover"
                muted
                playsInline
              />
              {!cameraReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-sm text-white">
                  <Camera className="h-6 w-6" />
                  <p>{cameraStatusText}</p>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500">
              {todayRecord
                ? 'Absen sudah tercatat.'
                : isSubmitting
                  ? 'Menyimpan absensi...'
                  : isScanReady && isScanning
                    ? 'Memindai QR...'
                    : isChecking
                      ? 'Memeriksa status absensi...'
                      : 'Menunggu kamera aktif.'}
            </p>
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
              Lokasi otomatis diverifikasi saat absen. Pastikan izin lokasi aktif
              saat melakukan scan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
