import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Eye, Pencil, Trash2, BadgePercent } from 'lucide-react';
import { api, Discount, Product } from '../lib/api';
import { useToast } from './ToastProvider';

type DiscountFormState = {
  name: string;
  code: string;
  description: string;
  discount_type: 'order' | 'product' | 'combo';
  value: string;
  value_type: 'amount' | 'percent';
  min_purchase: string;
  product_id: string;
  min_quantity: string;
  is_multiple: boolean;
  combo_items: Array<{ product_id: string; quantity: string }>;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
};

const emptyForm: DiscountFormState = {
  name: '',
  code: '',
  description: '',
  discount_type: 'order',
  value: '0',
  value_type: 'amount',
  min_purchase: '',
  product_id: '',
  min_quantity: '1',
  is_multiple: true,
  combo_items: [{ product_id: '', quantity: '1' }],
  valid_from: '',
  valid_until: '',
  is_active: true,
};

const formatCurrency = (amount: number) =>
  `Rp ${amount.toLocaleString('id-ID')}`;

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function DiscountsPage() {
  const { showToast } = useToast();
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewDiscount, setViewDiscount] = useState<Discount | null>(null);
  const [editDiscount, setEditDiscount] = useState<Discount | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [formState, setFormState] = useState<DiscountFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadDiscounts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDiscounts();
      setDiscounts(data || []);
    } catch (error) {
      console.error('Error loading discounts:', error);
      showToast('Gagal memuat diskon.');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadProducts = useCallback(async () => {
    try {
      const data = await api.getProducts();
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
      showToast('Gagal memuat daftar produk.');
    }
  }, [showToast]);

  useEffect(() => {
    loadDiscounts();
    loadProducts();
  }, [loadDiscounts, loadProducts]);

  const filteredDiscounts = useMemo(() => {
    if (!searchTerm.trim()) return discounts;
    const term = searchTerm.toLowerCase();
    return discounts.filter(
      (discount) =>
        discount.name.toLowerCase().includes(term) ||
        discount.code.toLowerCase().includes(term)
    );
  }, [discounts, searchTerm]);

  const openCreateModal = () => {
    setEditDiscount(null);
    setFormState(emptyForm);
    setShowFormModal(true);
  };

  const openEditModal = (discount: Discount) => {
    setEditDiscount(discount);
    setFormState({
      name: discount.name,
      code: discount.code,
      description: discount.description || '',
      discount_type: (discount.discount_type || 'order') as
        | 'order'
        | 'product'
        | 'combo',
      value: String(discount.value ?? 0),
      value_type: (discount.value_type || 'amount') as 'amount' | 'percent',
      min_purchase:
        discount.min_purchase !== null && discount.min_purchase !== undefined
          ? String(discount.min_purchase)
          : '',
      product_id: discount.product_id || '',
      min_quantity:
        discount.min_quantity !== null && discount.min_quantity !== undefined
          ? String(discount.min_quantity)
          : '1',
      is_multiple: discount.is_multiple ?? true,
      combo_items:
        discount.combo_items && discount.combo_items.length > 0
          ? discount.combo_items.map((item) => ({
              product_id: item.product_id,
              quantity: String(item.quantity || 1),
            }))
          : [{ product_id: '', quantity: '1' }],
      valid_from: discount.valid_from
        ? new Date(discount.valid_from).toISOString().slice(0, 10)
        : '',
      valid_until: discount.valid_until
        ? new Date(discount.valid_until).toISOString().slice(0, 10)
        : '',
      is_active: Boolean(discount.is_active),
    });
    setShowFormModal(true);
  };

  const handleDelete = async (discount: Discount) => {
    const confirmed = window.confirm(
      `Hapus diskon ${discount.name}? Tindakan ini tidak bisa dibatalkan.`
    );
    if (!confirmed) return;

    try {
      await api.deleteDiscount(discount.id);
      setDiscounts((prev) => prev.filter((item) => item.id !== discount.id));
      showToast('Diskon berhasil dihapus.', 'success');
    } catch (error) {
      console.error('Error deleting discount:', error);
      showToast('Gagal menghapus diskon.');
    }
  };

  const buildDiscountPayload = (discount: Discount): Partial<Discount> => ({
    name: discount.name,
    code: discount.code,
    description: discount.description ?? null,
    discount_type: discount.discount_type,
    value: discount.value ?? 0,
    value_type: discount.value_type,
    min_purchase: discount.min_purchase ?? null,
    product_id: discount.product_id ?? null,
    min_quantity: discount.min_quantity ?? 1,
    is_multiple: discount.is_multiple ?? true,
    combo_items: discount.combo_items ?? [],
    valid_from: discount.valid_from ?? null,
    valid_until: discount.valid_until ?? null,
    is_active: discount.is_active,
  });

  const handleToggleStatus = async (discount: Discount) => {
    const payload = buildDiscountPayload({
      ...discount,
      is_active: !discount.is_active,
    });

    try {
      const updated = await api.updateDiscount(discount.id, payload);
      setDiscounts((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      showToast(
        `Diskon ${updated.is_active ? 'diaktifkan' : 'dinonaktifkan'}.`,
        'success'
      );
    } catch (error) {
      console.error('Error toggling discount status:', error);
      showToast('Gagal mengubah status diskon.');
    }
  };

  const handleComboItemChange = (
    index: number,
    field: 'product_id' | 'quantity',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      combo_items: prev.combo_items.map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const addComboItem = () => {
    setFormState((prev) => ({
      ...prev,
      combo_items: [...prev.combo_items, { product_id: '', quantity: '1' }],
    }));
  };

  const removeComboItem = (index: number) => {
    setFormState((prev) => ({
      ...prev,
      combo_items: prev.combo_items.filter((_, idx) => idx !== index),
    }));
  };

  const handleSave = async () => {
    if (!formState.name.trim() || !formState.code.trim()) {
      showToast('Nama dan kode diskon wajib diisi.', 'info');
      return;
    }

    if (formState.discount_type === 'product' && !formState.product_id) {
      showToast('Pilih produk untuk diskon produk.', 'info');
      return;
    }

    if (
      formState.discount_type === 'combo' &&
      formState.combo_items.filter((item) => item.product_id).length === 0
    ) {
      showToast('Combo diskon membutuhkan minimal satu produk.', 'info');
      return;
    }

    const value = parseFloat(formState.value) || 0;
    const minPurchase = formState.min_purchase
      ? parseFloat(formState.min_purchase)
      : null;
    const minQuantity = formState.min_quantity
      ? parseInt(formState.min_quantity, 10)
      : 1;
    const comboItems = formState.combo_items
      .filter((item) => item.product_id)
      .map((item) => ({
        product_id: item.product_id,
        quantity: parseInt(item.quantity, 10) || 1,
      }));

    const payload: Partial<Discount> = {
      name: formState.name.trim(),
      code: formState.code.trim().toUpperCase(),
      description: formState.description.trim() || null,
      discount_type: formState.discount_type,
      value,
      value_type: formState.value_type,
      min_purchase: formState.discount_type === 'order' ? minPurchase : null,
      product_id: formState.discount_type === 'product' ? formState.product_id : null,
      min_quantity:
        formState.discount_type === 'product' || formState.discount_type === 'combo'
          ? minQuantity
          : 1,
      is_multiple: formState.discount_type === 'product' ? formState.is_multiple : true,
      combo_items: formState.discount_type === 'combo' ? comboItems : [],
      valid_from: formState.valid_from || null,
      valid_until: formState.valid_until || null,
      is_active: formState.is_active,
    };

    setSaving(true);
    try {
      if (editDiscount) {
        const updated = await api.updateDiscount(editDiscount.id, payload);
        setDiscounts((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
        showToast('Diskon berhasil diperbarui.', 'success');
      } else {
        const created = await api.createDiscount(payload);
        setDiscounts((prev) => [created, ...prev]);
        showToast('Diskon berhasil ditambahkan.', 'success');
      }
      setShowFormModal(false);
      setFormState(emptyForm);
      setEditDiscount(null);
    } catch (error) {
      console.error('Error saving discount:', error);
      showToast('Gagal menyimpan diskon.');
    } finally {
      setSaving(false);
    }
  };

  const getTypeLabel = (type?: string) => {
    switch (type) {
      case 'product':
        return 'Diskon Produk';
      case 'combo':
        return 'Diskon Combo';
      default:
        return 'Diskon Transaksi';
    }
  };

  const getValueLabel = (discount: Discount) => {
    if (discount.value_type === 'percent') {
      return `${discount.value}%`;
    }
    return formatCurrency(discount.value || 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Manajemen Diskon</h2>
          <p className="text-sm text-slate-500">
            Atur diskon transaksi, produk, hingga paket combo.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Tambah Diskon
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-slate-500">Total diskon</p>
            <p className="text-xl font-semibold text-slate-900">
              {discounts.length}
            </p>
          </div>
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Cari nama/kode diskon..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Diskon</th>
                <th className="px-6 py-3 text-left font-semibold">Tipe</th>
                <th className="px-6 py-3 text-left font-semibold">Nilai</th>
                <th className="px-6 py-3 text-left font-semibold">Masa Berlaku</th>
                <th className="px-6 py-3 text-left font-semibold">Status</th>
                <th className="px-6 py-3 text-center font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Memuat diskon...
                  </td>
                </tr>
              ) : filteredDiscounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Belum ada diskon.
                  </td>
                </tr>
              ) : (
                filteredDiscounts.map((discount) => (
                  <tr key={discount.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-slate-900">
                        {discount.name}
                      </p>
                      <p className="text-xs text-slate-500">{discount.code}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                        {getTypeLabel(discount.discount_type)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-700">
                      {getValueLabel(discount)}
                      {discount.min_purchase ? (
                        <p className="text-xs text-slate-500">
                          Min: {formatCurrency(discount.min_purchase)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <p>{formatDate(discount.valid_from)}</p>
                      <p className="text-xs text-slate-400">s/d</p>
                      <p>{formatDate(discount.valid_until)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                          discount.is_active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {discount.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleToggleStatus(discount)}
                          className="inline-flex items-center"
                          role="switch"
                          aria-checked={discount.is_active}
                          aria-label={
                            discount.is_active
                              ? 'Nonaktifkan diskon'
                              : 'Aktifkan diskon'
                          }
                        >
                          <span
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              discount.is_active ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                                discount.is_active ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </span>
                        </button>
                        <button
                          onClick={() => setViewDiscount(discount)}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded"
                          aria-label={`Lihat detail diskon ${discount.name}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => openEditModal(discount)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                          aria-label={`Edit diskon ${discount.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(discount)}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded"
                          aria-label={`Hapus diskon ${discount.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewDiscount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <BadgePercent className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-bold text-slate-900">Detail Diskon</h3>
              </div>
              <button
                onClick={() => setViewDiscount(null)}
                className="rounded p-2 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div>
                <p className="text-slate-500">Nama Diskon</p>
                <p className="font-semibold text-slate-900">{viewDiscount.name}</p>
              </div>
              <div>
                <p className="text-slate-500">Kode</p>
                <p className="font-semibold text-slate-900">{viewDiscount.code}</p>
              </div>
              <div>
                <p className="text-slate-500">Tipe</p>
                <p className="font-semibold text-slate-900">
                  {getTypeLabel(viewDiscount.discount_type)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Nilai</p>
                <p className="font-semibold text-slate-900">
                  {getValueLabel(viewDiscount)}
                </p>
              </div>
              {viewDiscount.discount_type === 'product' && (
                <div>
                  <p className="text-slate-500">Produk</p>
                  <p className="font-semibold text-slate-900">
                    {viewDiscount.product_name || 'Produk khusus'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Berlaku kelipatan:{' '}
                    {viewDiscount.is_multiple === false ? 'Tidak' : 'Ya'}
                  </p>
                </div>
              )}
              {viewDiscount.discount_type === 'combo' && (
                <div>
                  <p className="text-slate-500">Combo</p>
                  <div className="mt-2 space-y-2">
                    {(viewDiscount.combo_items || []).map((item, index) => {
                      const product = products.find((p) => p.id === item.product_id);
                      return (
                        <div
                          key={`${item.product_id}-${index}`}
                          className="rounded-md border border-slate-200 px-3 py-2"
                        >
                          <p className="font-medium text-slate-900">
                            {product?.name || 'Produk tidak ditemukan'}
                          </p>
                          <p className="text-xs text-slate-500">
                            Qty: {item.quantity}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {viewDiscount.min_purchase ? (
                <div>
                  <p className="text-slate-500">Minimal Belanja</p>
                  <p className="font-semibold text-slate-900">
                    {formatCurrency(viewDiscount.min_purchase)}
                  </p>
                </div>
              ) : null}
              <div>
                <p className="text-slate-500">Masa Berlaku</p>
                <p className="font-semibold text-slate-900">
                  {formatDate(viewDiscount.valid_from)} -{' '}
                  {formatDate(viewDiscount.valid_until)}
                </p>
              </div>
              {viewDiscount.description && (
                <div>
                  <p className="text-slate-500">Deskripsi</p>
                  <p className="font-semibold text-slate-900">
                    {viewDiscount.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">
                {editDiscount ? 'Edit Diskon' : 'Tambah Diskon'}
              </h3>
              <button
                onClick={() => {
                  setShowFormModal(false);
                  setFormState(emptyForm);
                  setEditDiscount(null);
                }}
                className="rounded p-2 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Nama Diskon
                  </label>
                  <input
                    type="text"
                    value={formState.name}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Kode Diskon
                  </label>
                  <input
                    type="text"
                    value={formState.code}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        code: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Deskripsi (opsional)
                </label>
                <textarea
                  value={formState.description}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Jenis Diskon
                  </label>
                  <select
                    value={formState.discount_type}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        discount_type: event.target.value as
                          | 'order'
                          | 'product'
                          | 'combo',
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="order">Diskon Transaksi</option>
                    <option value="product">Diskon Produk</option>
                    <option value="combo">Diskon Combo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Nilai Diskon
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={formState.value}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          value: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    <select
                      value={formState.value_type}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          value_type: event.target.value as
                            | 'amount'
                            | 'percent',
                        }))
                      }
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="amount">Rupiah</option>
                      <option value="percent">%</option>
                    </select>
                  </div>
                </div>
              </div>

              {formState.discount_type === 'order' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Minimal Belanja (opsional)
                  </label>
                  <input
                    type="number"
                    value={formState.min_purchase}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        min_purchase: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              )}

              {formState.discount_type === 'product' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Produk
                    </label>
                    <select
                      value={formState.product_id}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          product_id: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="">Pilih produk</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Minimal Qty
                    </label>
                    <input
                      type="number"
                      value={formState.min_quantity}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          min_quantity: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div className="md:col-span-2 flex items-center gap-2">
                    <input
                      id="discount-multiple"
                      type="checkbox"
                      checked={formState.is_multiple}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          is_multiple: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    <label
                      htmlFor="discount-multiple"
                      className="text-sm text-slate-700"
                    >
                      Diskon berlaku kelipatan
                    </label>
                  </div>
                </div>
              )}

              {formState.discount_type === 'combo' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-slate-700">
                      Komposisi Combo
                    </label>
                    <button
                      type="button"
                      onClick={addComboItem}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                    >
                      + Tambah Item
                    </button>
                  </div>
                  <div className="space-y-3">
                    {formState.combo_items.map((item, index) => (
                      <div
                        key={`combo-${index}`}
                        className="grid grid-cols-1 md:grid-cols-[1fr_120px_auto] gap-2 items-center"
                      >
                        <select
                          value={item.product_id}
                          onChange={(event) =>
                            handleComboItemChange(
                              index,
                              'product_id',
                              event.target.value
                            )
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        >
                          <option value="">Pilih produk</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(event) =>
                            handleComboItemChange(
                              index,
                              'quantity',
                              event.target.value
                            )
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                        {formState.combo_items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeComboItem(index)}
                            className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Mulai Berlaku (opsional)
                  </label>
                  <input
                    type="date"
                    value={formState.valid_from}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        valid_from: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Berakhir (opsional)
                  </label>
                  <input
                    type="date"
                    value={formState.valid_until}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        valid_until: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowFormModal(false);
                    setFormState(emptyForm);
                    setEditDiscount(null);
                  }}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                  disabled={saving}
                >
                  Batal
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
                  disabled={saving}
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
