import { useEffect, useState } from 'react';
import { Camera, Save } from 'lucide-react';
import { api, User } from '../lib/api';
import { useToast } from './ToastProvider';

type ProfileFormState = {
  name: string;
  email: string;
  username: string;
  phone: string;
  profile: string;
  password: string;
};

type ProfilePageProps = {
  user: User;
  onProfileUpdated: (user: User) => void;
};

export default function ProfilePage({
  user,
  onProfileUpdated,
}: ProfilePageProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState<ProfileFormState>({
    name: '',
    email: '',
    username: '',
    phone: '',
    profile: '',
    password: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFormData({
      name: user.name ?? '',
      email: user.email ?? '',
      username: user.username ?? '',
      phone: user.phone ?? '',
      profile: user.profile ?? '',
      password: '',
    });
  }, [user]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);

    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        username: formData.username,
        phone: formData.phone || null,
        profile: formData.profile || null,
        role: user.role,
        is_active: user.is_active,
        ...(formData.password ? { password: formData.password } : {}),
      };
      const updatedUser = await api.updateUser(user.id, payload);
      onProfileUpdated(updatedUser);
      setFormData((prev) => ({ ...prev, password: '' }));
    } catch (error) {
      console.error('Error updating profile:', error);
      showToast('Gagal memperbarui profil. Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  const handleProfileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        setFormData((prev) => ({ ...prev, profile: result }));
      }
    };
    reader.readAsDataURL(file);
  };

  const profilePreview =
    formData.profile || user.profile || `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.name || user.name)}`;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src={profilePreview}
                alt={formData.name}
                className="h-16 w-16 rounded-full object-cover border border-slate-200"
              />
              <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white">
                <Camera className="h-4 w-4" />
              </span>
            </div>
            <div>
              <p className="text-sm text-slate-500">Profil</p>
              <h2 className="text-xl font-semibold text-slate-900">
                {user.name}
              </h2>
              <p className="text-sm text-slate-500 capitalize">{user.role}</p>
            </div>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl bg-white p-6 shadow-sm border border-slate-200 space-y-5"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Nama Lengkap
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) =>
                setFormData({ ...formData, name: event.target.value })
              }
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(event) =>
                setFormData({ ...formData, email: event.target.value })
              }
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Username
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(event) =>
                setFormData({ ...formData, username: event.target.value })
              }
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              No HP
            </label>
            <input
              type="text"
              value={formData.phone}
              onChange={(event) =>
                setFormData({ ...formData, phone: event.target.value })
              }
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Foto Profil
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleProfileUpload}
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <p className="mt-2 text-xs text-slate-500">
              Unggah foto profil untuk memperbarui tampilan akun Anda.
            </p>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Password Baru
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(event) =>
                setFormData({ ...formData, password: event.target.value })
              }
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Kosongkan jika tidak ingin mengganti"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>
      </form>
    </div>
  );
}
