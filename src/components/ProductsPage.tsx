import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Edit,
  Package,
  Search,
  X,
  Trash2,
} from 'lucide-react';
import {
  api,
  Product,
  Category,
  ProductVariant,
  ProductExtra,
} from '../lib/api';
import { useToast } from './ToastProvider';

type VariantGroup = {
  name: string;
  options: string[];
};

export default function ProductsPage() {
  const { showToast } = useToast();
  const VARIANT_SEPARATOR = '::';
  const POLL_INTERVAL = 15000;
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [variantGroups, setVariantGroups] = useState<VariantGroup[]>([]);
  const [extraOptions, setExtraOptions] = useState<
    Array<Pick<ProductExtra, 'name' | 'cost' | 'price'>>
  >([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    cost: '',
    category_id: '',
  });

  const normalizeCurrency = (value: string | number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Math.round((parsed + Number.EPSILON) * 100) / 100;
  };

  const loadProducts = useCallback(
    async (options?: { silent?: boolean }) => {
      try {
        const data = await api.getProducts();
        setProducts(data || []);
      } catch (error) {
        console.error('Error loading products:', error);
        if (!options?.silent) {
          showToast('Gagal memuat data produk.');
        }
      }
    },
    [showToast]
  );

  const loadCategories = useCallback(
    async (options?: { silent?: boolean }) => {
      try {
        const data = await api.getCategories();
        setCategories(data || []);
      } catch (error) {
        console.error('Error loading categories:', error);
        if (!options?.silent) {
          showToast('Gagal memuat data kategori.');
        }
      }
    },
    [showToast]
  );

  useEffect(() => {
    loadProducts();
    loadCategories();
    const interval = window.setInterval(() => {
      loadProducts({ silent: true });
      loadCategories({ silent: true });
    }, POLL_INTERVAL);
    const handleFocus = () => {
      loadProducts({ silent: true });
      loadCategories({ silent: true });
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadCategories, loadProducts]);

  const filteredProducts = products.filter(
    (product) => product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const parseVariantGroups = (variants: ProductVariant[]) => {
    const groups = new Map<string, string[]>();
    variants.forEach((variant) => {
      const [groupName, optionName] = variant.name.split(VARIANT_SEPARATOR);
      const group = optionName !== undefined
        ? groupName.trim() || 'Varian'
        : 'Varian';
      const option =
        optionName !== undefined ? optionName.trim() : variant.name.trim();
      if (!option) return;
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      const options = groups.get(group) as string[];
      if (!options.includes(option)) {
        options.push(option);
      }
    });
    return Array.from(groups.entries()).map(([name, options]) => ({
      name,
      options,
    }));
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      description: '',
      price: '',
      cost: '',
      category_id: '',
    });
    setVariantGroups([]);
    setExtraOptions([]);
    setShowModal(true);
  };

  const openEditModal = async (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      price: product.price.toString(),
      cost: product.cost.toString(),
      category_id: product.category_id || '',
    });
    setVariantGroups([]);
    setExtraOptions([]);
    setShowModal(true);
    try {
      const options = await api.getProductOptionsById(product.id);
      setVariantGroups(
        parseVariantGroups(options.variants || [])
      );
      setExtraOptions(
        (options.extras || []).map((extra) => ({
          name: extra.name,
          cost: extra.cost ?? 0,
          price: extra.price,
        }))
      );
    } catch (error) {
      console.error('Error loading product options:', error);
      showToast('Gagal memuat varian/extra produk.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const priceValue = normalizeCurrency(formData.price);
    const costValue = normalizeCurrency(formData.cost);

    const productData = {
      name: formData.name,
      description: formData.description || null,
      price: priceValue,
      cost: costValue,
      category_id: formData.category_id || null,
      is_active: editingProduct?.is_active ?? true,
      updated_at: new Date().toISOString(),
    };

    const normalizedVariants = variantGroups.flatMap((group) => {
      const groupName = group.name.trim() || 'Varian';
      return group.options
        .map((option) => option.trim())
        .filter((option) => option)
        .map((option) => ({
          name: `${groupName}${VARIANT_SEPARATOR}${option}`,
        }));
    });
    const normalizedExtras = extraOptions
      .map((extra) => ({
        name: extra.name.trim(),
        cost: normalizeCurrency(extra.cost ?? 0),
        price: normalizeCurrency(extra.price ?? 0),
      }))
      .filter((extra) => extra.name);

    if (editingProduct) {
      try {
        const updated = await api.updateProduct(editingProduct.id, productData);
        await api.updateProductOptions(updated.id, {
          variants: normalizedVariants,
          extras: normalizedExtras,
        });
        setShowModal(false);
        loadProducts();
        showToast('Produk berhasil diperbarui.', 'success');
      } catch (error) {
        console.error('Error updating product:', error);
        showToast('Gagal mengupdate produk.');
      }
    } else {
      try {
        const created = await api.createProduct(productData);
        await api.updateProductOptions(created.id, {
          variants: normalizedVariants,
          extras: normalizedExtras,
        });
        setShowModal(false);
        loadProducts();
        showToast('Produk berhasil ditambahkan.', 'success');
      } catch (error) {
        console.error('Error creating product:', error);
        showToast('Gagal menambahkan produk.');
      }
    }
  };

  const handleToggleStatus = async (product: Product) => {
    try {
      await api.updateProduct(product.id, {
        name: product.name,
        description: product.description,
        price: product.price,
        cost: product.cost,
        category_id: product.category_id,
        image_url: product.image_url,
        is_active: !product.is_active,
        updated_at: new Date().toISOString(),
      });
      loadProducts();
      showToast(
        product.is_active
          ? 'Produk berhasil dinonaktifkan.'
          : 'Produk berhasil diaktifkan.',
        'success'
      );
    } catch (error) {
      console.error('Error updating product status:', error);
      showToast('Gagal mengubah status produk.');
    }
  };

  const getCategoryName = (categoryId: string | null) => {
    const category = categories.find((c) => c.id === categoryId);
    return category ? category.name : '-';
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center space-x-3">
            <Package className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">
              Manajemen Produk
            </h2>
          </div>
          <button
            onClick={openAddModal}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>Tambah Produk</span>
          </button>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Cari produk..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  Produk
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                  Kategori
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">
                  Harga
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
              {filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-gray-900">
                        {product.name}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {getCategoryName(product.category_id)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="text-sm font-medium text-gray-900">
                      Rp {product.price.toLocaleString('id-ID')}
                    </div>
                    <div className="text-xs text-gray-500">
                      Modal: Rp {product.cost.toLocaleString('id-ID')}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                        product.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {product.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={() => handleToggleStatus(product)}
                        className="inline-flex items-center"
                        role="switch"
                        aria-checked={product.is_active}
                        aria-label={
                          product.is_active
                            ? 'Nonaktifkan produk'
                            : 'Aktifkan produk'
                        }
                      >
                        <span
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            product.is_active
                              ? 'bg-emerald-500'
                              : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                              product.is_active
                                ? 'translate-x-5'
                                : 'translate-x-1'
                            }`}
                          />
                        </span>
                      </button>
                      <button
                        onClick={() => openEditModal(product)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredProducts.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              Tidak ada produk ditemukan
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">
                {editingProduct ? 'Edit Produk' : 'Tambah Produk'}
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
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nama Produk *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Deskripsi
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Kategori
                  </label>
                  <select
                    value={formData.category_id}
                    onChange={(e) =>
                      setFormData({ ...formData, category_id: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Pilih Kategori</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Harga Modal *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.cost}
                    onChange={(e) =>
                      setFormData({ ...formData, cost: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Harga Jual *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {Number(formData.price) < Number(formData.cost) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  Harga jual di bawah harga modal akan tercatat sebagai margin
                  negatif. Anda tetap bisa menyimpan perubahan ini.
                </div>
              )}

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
                  {editingProduct ? 'Update' : 'Simpan'}
                </button>
              </div>
            </form>
            <div className="border-t border-gray-200 px-6 pb-6">
              <div className="pt-4 space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">
                        Varian Produk
                      </h4>
                      <p className="text-xs text-gray-500">
                        Contoh: Varian "Penyajian" berisi opsi "Panas", "Es".
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setVariantGroups((prev) => [
                          ...prev,
                          { name: '', options: [''] },
                        ])
                      }
                      className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                    >
                      + Tambah Varian
                    </button>
                  </div>
                  <div className="space-y-2">
                    {variantGroups.length === 0 && (
                      <p className="text-xs text-gray-500">
                        Belum ada varian.
                      </p>
                    )}
                    {variantGroups.map((group, groupIndex) => (
                      <div
                        key={`variant-group-${groupIndex}`}
                        className="rounded-lg border border-gray-200 p-3 space-y-3"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            type="text"
                            value={group.name}
                            onChange={(event) =>
                              setVariantGroups((prev) =>
                                prev.map((item, idx) =>
                                  idx === groupIndex
                                    ? { ...item, name: event.target.value }
                                    : item
                                )
                              )
                            }
                            placeholder="Nama varian (contoh: Penyajian)"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setVariantGroups((prev) =>
                                prev.filter((_, idx) => idx !== groupIndex)
                              )
                            }
                            className="p-2 text-red-600 hover:bg-red-50 rounded self-start"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="space-y-2">
                          {group.options.length === 0 && (
                            <p className="text-xs text-gray-500">
                              Tambahkan opsi varian.
                            </p>
                          )}
                          {group.options.map((option, optionIndex) => (
                            <div
                              key={`variant-option-${groupIndex}-${optionIndex}`}
                              className="flex gap-2"
                            >
                              <input
                                type="text"
                                value={option}
                                onChange={(event) =>
                                  setVariantGroups((prev) =>
                                    prev.map((item, idx) =>
                                      idx === groupIndex
                                        ? {
                                            ...item,
                                            options: item.options.map(
                                              (value, optIdx) =>
                                                optIdx === optionIndex
                                                  ? event.target.value
                                                  : value
                                            ),
                                          }
                                        : item
                                    )
                                  )
                                }
                                placeholder="Opsi (contoh: Es)"
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setVariantGroups((prev) =>
                                    prev.map((item, idx) =>
                                      idx === groupIndex
                                        ? {
                                            ...item,
                                            options: item.options.filter(
                                              (_value, optIdx) =>
                                                optIdx !== optionIndex
                                            ),
                                          }
                                        : item
                                    )
                                  )
                                }
                                className="p-2 text-red-600 hover:bg-red-50 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              setVariantGroups((prev) =>
                                prev.map((item, idx) =>
                                  idx === groupIndex
                                    ? {
                                        ...item,
                                        options: [...item.options, ''],
                                      }
                                    : item
                                )
                              )
                            }
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                          >
                            + Tambah Opsi
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">
                        Extra Produk
                      </h4>
                      <p className="text-xs text-gray-500">
                        Tambahkan topping atau tambahan dengan modal & harga jual.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setExtraOptions((prev) => [
                          ...prev,
                          { name: '', cost: 0, price: 0 },
                        ])
                      }
                      className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                    >
                      + Tambah Extra
                    </button>
                  </div>
                  <div className="space-y-2">
                    {extraOptions.length === 0 && (
                      <p className="text-xs text-gray-500">
                        Belum ada extra.
                      </p>
                    )}
                    {extraOptions.map((extra, index) => (
                      <div
                        key={`extra-${index}`}
                        className="flex flex-col gap-2 sm:flex-row"
                      >
                        <input
                          type="text"
                          value={extra.name}
                          onChange={(event) =>
                            setExtraOptions((prev) =>
                              prev.map((item, idx) =>
                                idx === index
                                  ? { ...item, name: event.target.value }
                                  : item
                              )
                            )
                          }
                          placeholder="Nama extra"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={extra.cost}
                          onChange={(event) =>
                            setExtraOptions((prev) =>
                              prev.map((item, idx) =>
                                idx === index
                                  ? { ...item, cost: Number(event.target.value) }
                                  : item
                              )
                            )
                          }
                          placeholder="Modal"
                          className="w-full sm:w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={extra.price}
                          onChange={(event) =>
                            setExtraOptions((prev) =>
                              prev.map((item, idx) =>
                                idx === index
                                  ? { ...item, price: Number(event.target.value) }
                                  : item
                              )
                            )
                          }
                          placeholder="Harga jual"
                          className="w-full sm:w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setExtraOptions((prev) =>
                              prev.filter((_, idx) => idx !== index)
                            )
                          }
                          className="p-2 text-red-600 hover:bg-red-50 rounded self-start"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
