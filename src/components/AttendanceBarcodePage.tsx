const ATTENDANCE_QR_CODE = 'MERINDU-CAFE-ABSEN';
const SHIFT_WINDOWS = [
  { label: 'Pagi', time: '08.00 - 09.00' },
  { label: 'Sore', time: '15.45 - 17.00' },
];

export default function AttendanceBarcodePage() {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
    ATTENDANCE_QR_CODE
  )}`;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="text-center">
          <p className="text-sm text-slate-500">Absensi Merindu Cafe</p>
          <h1 className="text-2xl font-semibold text-slate-900 mt-2">
            QR Code Absensi
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Silakan scan QR ini pada menu Absen.
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center gap-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <img
              src={qrUrl}
              alt="QR Absensi"
              className="h-64 w-64 object-contain"
            />
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <h2 className="text-base font-semibold text-slate-800">
            Jam Absen
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            {SHIFT_WINDOWS.map((shift) => (
              <li key={shift.label} className="flex items-center justify-between">
                <span>{shift.label}</span>
                <span className="font-medium text-slate-800">{shift.time}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
