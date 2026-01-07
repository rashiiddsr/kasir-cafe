import { useEffect, useState } from 'react';
import {
  Edit,
  Plus,
  Search,
  Trash2,
  Users,
  X,
  Eye,
} from 'lucide-react';
import { api, User } from '../lib/api';
import { useToast } from './ToastProvider';

type UserFormState = {
  name: string;
  email: string;
  username: string;
  role: string;
  phone: string;
  password: string;
};

const roles = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'staf', label: 'Staf' },
];

export default function UsersPage() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [detailUser, setDetailUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormState>({
    name: '',
    email: '',
    username: '',
    role: 'staf',
    phone: '',
    password: '',
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await api.getUsers();
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
      showToast('Gagal memuat data user.');
    }
  };

  const filteredUsers = users
    .filter((user) => user.role !== 'superadmin')
    .filter((user) => {
      const term = searchTerm.toLowerCase();
      return (
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        user.username.toLowerCase().includes(term) ||
        user.role.toLowerCase().includes(term) ||
        (user.phone ?? '').toLowerCase().includes(term)
      );
    });

  const openAddModal = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      username: '',
      role: 'staf',
      phone: '',
      password: '',
    });
    setShowModal(true);
  };

  const openEditModal = (user: User) => {
    const normalizedRole = user.role === 'manajer' ? 'manager' : user.role;
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      username: user.username,
      role: normalizedRole,
      phone: user.phone ?? '',
      password: '',
    });
    setShowModal(true);
  };

  const openDetailModal = (user: User) => {
    setDetailUser(user);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      if (editingUser) {
        await api.updateUser(editingUser.id, {
          name: formData.name,
          email: formData.email,
          username: formData.username,
          role: formData.role,
          phone: formData.phone || null,
          profile: editingUser.profile || null,
          ...(formData.password ? { password: formData.password } : {}),
          is_active: editingUser.is_active,
        });
        showToast('User berhasil diperbarui.', 'success');
      } else {
        await api.createUser({
          name: formData.name,
          email: formData.email,
          username: formData.username,
          role: formData.role,
          phone: formData.phone || null,
          profile: null,
          password: formData.password,
          is_active: true,
        });
        showToast('User berhasil ditambahkan.', 'success');
      }
      setShowModal(false);
      loadUsers();
    } catch (error) {
      console.error('Error saving user:', error);
      showToast('Gagal menyimpan user.');
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await api.updateUser(user.id, {
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        phone: user.phone,
        profile: user.profile,
        is_active: !user.is_active,
      });
      loadUsers();
      showToast(
        user.is_active
          ? 'User berhasil dinonaktifkan.'
          : 'User berhasil diaktifkan.',
        'success'
      );
    } catch (error) {
      console.error('Error updating user status:', error);
      showToast('Gagal mengubah status user.');
    }
  };

  const handleDeleteUser = async (user: User) => {
    try {
      await api.deleteUser(user.id);
      loadUsers();
      showToast('User berhasil dihapus.', 'success');
    } catch (error) {
      console.error('Error deleting user:', error);
      showToast('Gagal menghapus user.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center space-x-3">
            <Users className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">
              Manajemen User
            </h2>
          </div>
          <button
            onClick={openAddModal}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>Tambah User</span>
          </button>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Cari user berdasarkan nama, email, username, role, atau no hp..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  Nama
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  Username
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  No HP
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <div className="flex items-center gap-3">
                      <img
                        src={
                          user.profile ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(
                            user.name
                          )}`
                        }
                        alt={user.name}
                        className="h-9 w-9 rounded-full object-cover border border-gray-200"
                      />
                      <span>{user.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {user.email}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    @{user.username}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 capitalize">
                    {user.role}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {user.phone || '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                        user.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {user.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={() => openDetailModal(user)}
                        className="p-2 text-slate-600 hover:bg-slate-100 rounded"
                        aria-label={`Lihat detail ${user.name}`}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(user)}
                        className="inline-flex items-center"
                        role="switch"
                        aria-checked={user.is_active}
                        aria-label={
                          user.is_active ? 'Nonaktifkan user' : 'Aktifkan user'
                        }
                      >
                        <span
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            user.is_active ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                              user.is_active ? 'translate-x-5' : 'translate-x-1'
                            }`}
                          />
                        </span>
                      </button>
                      <button
                        onClick={() => openEditModal(user)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              Belum ada user
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">
                {editingUser ? 'Edit User' : 'Tambah User'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nama Lengkap *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(event) =>
                      setFormData({ ...formData, name: event.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(event) =>
                      setFormData({ ...formData, email: event.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(event) =>
                      setFormData({ ...formData, username: event.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(event) =>
                      setFormData({ ...formData, role: event.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {roles.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    No HP
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(event) =>
                      setFormData({ ...formData, phone: event.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password {editingUser ? '(opsional)' : '*'}
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    value={formData.password}
                    onChange={(event) =>
                      setFormData({ ...formData, password: event.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={
                      editingUser ? 'Kosongkan jika tidak diubah' : ''
                    }
                  />
                </div>
              </div>

              <div className="flex space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  {editingUser ? 'Update' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">Detail User</h3>
              <button
                onClick={() => setDetailUser(null)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm text-gray-700">
              <div className="flex items-center gap-3">
                <img
                  src={
                    detailUser.profile ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      detailUser.name
                    )}`
                  }
                  alt={detailUser.name}
                  className="h-12 w-12 rounded-full object-cover border border-gray-200"
                />
                <div>
                  <p className="text-gray-500">Nama</p>
                  <p className="font-medium text-gray-900">{detailUser.name}</p>
                </div>
              </div>
              <div>
                <p className="text-gray-500">Email</p>
                <p className="font-medium text-gray-900">{detailUser.email}</p>
              </div>
              <div>
                <p className="text-gray-500">Username</p>
                <p className="font-medium text-gray-900">
                  @{detailUser.username}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-500">Role</p>
                  <p className="font-medium text-gray-900 capitalize">
                    {detailUser.role}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Status</p>
                  <p className="font-medium text-gray-900">
                    {detailUser.is_active ? 'Aktif' : 'Nonaktif'}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-gray-500">No HP</p>
                <p className="font-medium text-gray-900">
                  {detailUser.phone || '-'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Dibuat</p>
                <p className="font-medium text-gray-900">
                  {new Date(detailUser.created_at).toLocaleString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
