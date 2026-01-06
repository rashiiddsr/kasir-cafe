import { useCallback, useMemo, useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  Receipt,
  AlertCircle,
  ClipboardList,
  Check,
} from 'lucide-react';
import {
  api,
  Product,
  CartItem,
  User,
  Category,
  ProductVariant,
  ProductExtra,
  SavedCart,
} from '../lib/api';
import { useToast } from './ToastProvider';

type CashierPageProps = {
  user: User;
};

export default function CashierPage({ user }: CashierPageProps) {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'non-cash'>(
    'cash'
  );
  const [paymentNotes, setPaymentNotes] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [showOptionModal, setShowOptionModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [savedCarts, setSavedCarts] = useState<SavedCart[]>([]);
  const [savingCart, setSavingCart] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [productVariants, setProductVariants] = useState<
    Record<string, ProductVariant[]>
  >({});
  const [productExtras, setProductExtras] = useState<
    Record<string, ProductExtra[]>
  >({});
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const VARIANT_SEPARATOR = '::';
  const POLL_INTERVAL = 15000;

  const roundCurrency = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100;

  const getNumericPrice = (price: number) => {
    const normalized = Number(price);
    if (Number.isNaN(normalized)) return 0;
    return roundCurrency(normalized);
  };

  const getSuggestedPayments = (total: number) => {
    if (total <= 0) return [];
    const denominations = [10000, 20000, 50000, 100000];
    const suggestions = denominations
      .map((denomination) => Math.ceil(total / denomination) * denomination)
      .filter((amount) => amount >= total);
    return Array.from(new Set(suggestions)).sort((a, b) => a - b).slice(0, 4);
  };

  const parseVariantName = (name: string) => {
    const [group, option] = name.split(VARIANT_SEPARATOR);
    if (option !== undefined) {
      return {
        group: group.trim() || 'Varian',
        option: option.trim() || name.trim(),
      };
    }
    return { group: 'Varian', option: name.trim() };
  };

  const groupVariants = (variants: ProductVariant[]) => {
    const grouped = new Map<string, ProductVariant[]>();
    variants.forEach((variant) => {
      const { group } = parseVariantName(variant.name);
      if (!grouped.has(group)) {
        grouped.set(group, []);
      }
      grouped.get(group)?.push(variant);
    });
    return Array.from(grouped.entries()).map(([name, options]) => ({
      name,
      options,
    }));
  };

  const formatVariantLabel = (variants: ProductVariant[] = []) => {
    if (!variants.length) return '';
    const grouped = variants.reduce<Record<string, string[]>>((acc, variant) => {
      const { group, option } = parseVariantName(variant.name);
      if (!acc[group]) {
        acc[group] = [];
      }
      acc[group].push(option);
      return acc;
    }, {});
    return Object.entries(grouped)
      .map(([group, options]) => `${group}: ${options.join(', ')}`)
      .join(', ');
  };

  const loadProducts = useCallback(
    async (options?: { silent?: boolean }) => {
      try {
        const data = await api.getProducts({ active: true });
        setProducts(data || []);
      } catch (error) {
        console.error('Error loading products:', error);
        if (!options?.silent) {
          showToast('Gagal memuat produk.');
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
          showToast('Gagal memuat kategori.');
        }
      }
    },
    [showToast]
  );

  const loadProductOptions = useCallback(
    async (options?: { silent?: boolean }) => {
      try {
        const data = await api.getProductOptions();
        const variantsByProduct = (data.variants || []).reduce(
          (acc, variant) => {
            if (!acc[variant.product_id]) {
              acc[variant.product_id] = [];
            }
            acc[variant.product_id].push(variant);
            return acc;
          },
          {} as Record<string, ProductVariant[]>
        );
        const extrasByProduct = (data.extras || []).reduce(
          (acc, extra) => {
            if (!acc[extra.product_id]) {
              acc[extra.product_id] = [];
            }
            acc[extra.product_id].push(extra);
            return acc;
          },
          {} as Record<string, ProductExtra[]>
        );
        setProductVariants(variantsByProduct);
        setProductExtras(extrasByProduct);
      } catch (error) {
        console.error('Error loading product options:', error);
        if (!options?.silent) {
          showToast('Gagal memuat opsi produk.');
        }
      }
    },
    [showToast]
  );

  const loadSavedCarts = useCallback(
    async (options?: { silent?: boolean }) => {
      try {
        const data = await api.getSavedCarts(user.id, user.username);
        setSavedCarts(data || []);
      } catch (error) {
        console.error('Error loading saved carts:', error);
        if (!options?.silent) {
          showToast('Gagal memuat pesanan tersimpan.');
        }
      }
    },
    [showToast, user.id]
  );

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadProductOptions();
    loadSavedCarts({ silent: true });
    const interval = window.setInterval(() => {
      loadProducts({ silent: true });
      loadCategories({ silent: true });
      loadProductOptions({ silent: true });
    }, POLL_INTERVAL);
    const handleFocus = () => {
      loadProducts({ silent: true });
      loadCategories({ silent: true });
      loadProductOptions({ silent: true });
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadCategories, loadProducts, loadProductOptions, loadSavedCarts]);

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === 'all' || product.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getExtrasTotal = (extras: ProductExtra[]) =>
    roundCurrency(
      extras.reduce((sum, extra) => sum + getNumericPrice(extra.price), 0)
    );

  const buildLineId = (
    productId: string,
    variantIds: string[] = [],
    extraIds: string[] = []
  ) =>
    [
      productId,
      variantIds.length > 0 ? variantIds.sort().join(',') : 'none',
      extraIds.sort().join(','),
    ].join('|');

  const addToCart = (
    product: Product,
    variants: ProductVariant[] = [],
    extras: ProductExtra[] = []
  ) => {
    const lineId = buildLineId(
      product.id,
      variants.map((variant) => variant.id),
      extras.map((extra) => extra.id)
    );
    const unitPrice = getNumericPrice(product.price);
    const extrasTotal = getExtrasTotal(extras);
    const existingItem = cart.find((item) => item.lineId === lineId);

    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.lineId === lineId
            ? {
                ...item,
                quantity: item.quantity + 1,
                subtotal: roundCurrency(
                  (item.quantity + 1) * (unitPrice + extrasTotal)
                ),
              }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          lineId,
          product,
          quantity: 1,
          subtotal: roundCurrency(unitPrice + extrasTotal),
          variants,
          extras,
        },
      ]);
    }
  };

  const updateQuantity = (lineId: string, newQuantity: number) => {
    const item = cart.find((entry) => entry.lineId === lineId);
    if (!item) return;
    const unitPrice = getNumericPrice(item.product.price);
    const extrasTotal = getExtrasTotal(item.extras || []);

    if (newQuantity <= 0) {
      removeFromCart(lineId);
    } else {
      setCart(
        cart.map((entry) =>
          entry.lineId === lineId
            ? {
                ...entry,
                quantity: newQuantity,
                subtotal: roundCurrency(newQuantity * (unitPrice + extrasTotal)),
              }
            : entry
        )
      );
    }
  };

  const removeFromCart = (lineId: string) => {
    setCart(cart.filter((item) => item.lineId !== lineId));
  };

  const calculateTotal = () =>
    roundCurrency(cart.reduce((sum, item) => sum + item.subtotal, 0));

  const handleCheckout = () => {
    if (cart.length === 0) return;
    setShowPaymentModal(true);
    setPaymentAmount(calculateTotal().toString());
    setPaymentMethod('cash');
    setPaymentNotes('');
  };

  const handleSaveCart = () => {
    if (cart.length === 0) {
      showToast('Keranjang masih kosong.', 'info');
      return;
    }
    setShowSaveModal(true);
    setSaveName('');
  };

  const confirmSaveCart = async () => {
    if (!saveName.trim()) {
      showToast('Nama penyimpanan wajib diisi.', 'info');
      return;
    }
    setSavingCart(true);
    try {
      const total = calculateTotal();
      const newSaved = await api.createSavedCart({
        user_id: user.id,
        user_username: user.username,
        name: saveName.trim(),
        items: cart,
        total,
      });
      setSavedCarts((prev) => [newSaved, ...prev]);
      setCart([]);
      setShowSaveModal(false);
      setSaveName('');
      showToast('Pesanan berhasil disimpan.', 'success');
    } catch (error) {
      console.error('Error saving cart:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Gagal menyimpan pesanan.';
      showToast(message);
    } finally {
      setSavingCart(false);
    }
  };

  const loadSavedCart = async (saved: SavedCart) => {
    setCart(saved.items);
    try {
      await api.deleteSavedCart(saved.id);
      setSavedCarts((prev) => prev.filter((item) => item.id !== saved.id));
      showToast(`Pesanan "${saved.name}" dimuat ke keranjang.`, 'success');
    } catch (error) {
      console.error('Error deleting saved cart:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Gagal menghapus pesanan tersimpan.';
      showToast(message);
    }
  };

  const deleteSavedCart = async (savedId: string) => {
    try {
      await api.deleteSavedCart(savedId);
      setSavedCarts((prev) => prev.filter((item) => item.id !== savedId));
      showToast('Pesanan tersimpan dihapus.', 'info');
    } catch (error) {
      console.error('Error deleting saved cart:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Gagal menghapus pesanan tersimpan.';
      showToast(message);
    }
  };

  const completeTransaction = async () => {
    if (cart.length === 0) return;

    const total = calculateTotal();
    const payment =
      paymentMethod === 'cash'
        ? parseFloat(paymentAmount) || 0
        : total;

    if (paymentMethod === 'cash' && payment < total) {
      showToast('Jumlah pembayaran kurang.');
      return;
    }

    setLoading(true);

    try {
      const transactionNumber = `TRX-${Date.now()}`;
      const changeAmount = paymentMethod === 'cash' ? payment - total : 0;

      const transaction = await api.createTransaction({
        user_id: user.id,
        user_username: user.username,
        transaction_number: transactionNumber,
        total_amount: total,
        payment_method: paymentMethod,
        payment_amount: payment,
        change_amount: changeAmount,
        notes: paymentNotes.trim() ? paymentNotes.trim() : null,
      });

      const transactionItems = cart.map((item) => ({
        transaction_id: transaction.id,
        product_id: item.product.id,
        product_name: item.product.name,
        variant_name: formatVariantLabel(item.variants || []) || null,
        extras: item.extras || null,
        extras_total: getExtrasTotal(item.extras || []),
        quantity: item.quantity,
        unit_price: item.product.price,
        subtotal: item.subtotal,
      }));

      await api.createTransactionItems(transactionItems);

      setSuccessMessage(
        paymentMethod === 'cash'
          ? `Transaksi berhasil! Nomor: ${transactionNumber}\nKembalian: Rp ${changeAmount.toLocaleString(
              'id-ID'
            )}`
          : `Transaksi berhasil! Nomor: ${transactionNumber}`
      );
      showToast('Transaksi berhasil diproses.', 'success');
      setCart([]);
      setPaymentAmount('');
      setShowPaymentModal(false);
      loadProducts();
      loadProductOptions();

      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error completing transaction:', error);
      showToast('Terjadi kesalahan saat memproses transaksi.');
    } finally {
      setLoading(false);
    }
  };

  const totalAmount = calculateTotal();
  const activeProductVariants =
    activeProduct && productVariants[activeProduct.id]
      ? productVariants[activeProduct.id]
      : [];
  const activeVariantGroups = useMemo(
    () => groupVariants(activeProductVariants),
    [activeProductVariants]
  );
  const activeProductExtras =
    activeProduct && productExtras[activeProduct.id]
      ? productExtras[activeProduct.id]
      : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">
                Pencarian produk
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Cari produk..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">
                Filter kategori
              </label>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <select
                  value={selectedCategory}
                  onChange={(event) => setSelectedCategory(event.target.value)}
                  className="w-full appearance-none pl-10 pr-4 py-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">Semua kategori</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              onClick={() => {
                const variants = productVariants[product.id] || [];
                const extras = productExtras[product.id] || [];
                const groupedVariants = groupVariants(variants);
                if (groupedVariants.length > 0 || extras.length > 0) {
                  setActiveProduct(product);
                  const initialSelections = groupedVariants.reduce(
                    (acc, group) => {
                      if (group.options[0]) {
                        acc[group.name] = group.options[0].id;
                      }
                      return acc;
                    },
                    {} as Record<string, string>
                  );
                  setSelectedVariants(initialSelections);
                  setSelectedExtras([]);
                  setShowOptionModal(true);
                  return;
                }
                addToCart(product);
              }}
              className="bg-white rounded-lg shadow-md p-4 text-left transition-all hover:shadow-lg hover:scale-105"
            >
              <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-2">
                {product.name}
              </h3>
              <p className="text-blue-600 font-bold text-lg mb-2">
                Rp {getNumericPrice(product.price).toLocaleString('id-ID')}
              </p>
            </button>
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <p className="text-gray-500">Tidak ada produk ditemukan</p>
          </div>
        )}
      </div>

      <div className="lg:col-span-1">
        <div className="bg-white rounded-lg shadow-md p-6 sticky top-24">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
            <Receipt className="w-6 h-6 mr-2 text-blue-600" />
            Keranjang
          </h2>

          <div className="flex flex-col gap-3 mb-4">
            <button
              onClick={handleSaveCart}
              disabled={cart.length === 0}
              className="w-full border border-blue-200 text-blue-700 py-2 rounded-lg font-semibold hover:bg-blue-50 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200"
            >
              Simpan Pesanan
            </button>
            <button
              onClick={() => setShowSavedModal(true)}
              disabled={savedCarts.length === 0}
              className="w-full border border-slate-200 text-slate-700 py-2 rounded-lg font-semibold hover:bg-slate-50 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 flex items-center justify-center gap-2"
            >
              <ClipboardList className="w-4 h-4" />
              <span>Lihat Pesanan Tersimpan</span>
              {savedCarts.length > 0 && (
                <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                  {savedCarts.length}
                </span>
              )}
            </button>
          </div>

          {successMessage && (
            <div className="mb-4 p-3 bg-green-100 border border-green-300 rounded-lg">
              <p className="text-sm text-green-800 whitespace-pre-line">
                {successMessage}
              </p>
            </div>
          )}

          <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
            {cart.map((item) => (
              <div
                key={item.lineId || item.product.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 text-sm truncate">
                    {item.product.name}
                  </h4>
                  {item.variants && item.variants.length > 0 && (
                    <p className="text-xs text-slate-500">
                      Varian: {formatVariantLabel(item.variants)}
                    </p>
                  )}
                  {item.extras && item.extras.length > 0 && (
                    <p className="text-xs text-slate-500">
                      Extra:{' '}
                      {item.extras.map((extra) => extra.name).join(', ')}
                    </p>
                  )}
                  <p className="text-sm text-gray-600">
                    Rp{' '}
                    {(
                      getNumericPrice(item.product.price) +
                      getExtrasTotal(item.extras || [])
                    ).toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="flex items-center space-x-2 ml-3">
                  <button
                    onClick={() =>
                      updateQuantity(item.lineId || item.product.id, item.quantity - 1)
                    }
                    className="p-1 rounded bg-gray-200 hover:bg-gray-300"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center font-medium">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() =>
                      updateQuantity(item.lineId || item.product.id, item.quantity + 1)
                    }
                    className="p-1 rounded bg-gray-200 hover:bg-gray-300"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeFromCart(item.lineId || item.product.id)}
                    className="p-1 rounded bg-red-100 hover:bg-red-200 text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {cart.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Keranjang kosong</p>
            </div>
          )}

          <div className="border-t border-gray-200 pt-4 mt-4">
            <div className="flex justify-between items-center mb-4">
              <span className="text-lg font-semibold text-gray-700">Total:</span>
              <span className="text-2xl font-bold text-blue-600">
                Rp {totalAmount.toLocaleString('id-ID')}
              </span>
            </div>

            <button
              onClick={handleCheckout}
              disabled={cart.length === 0}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              <DollarSign className="w-5 h-5" />
              <span>Checkout</span>
            </button>
          </div>
        </div>
      </div>

      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Pembayaran
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Total Belanja
                </label>
                <div className="text-2xl font-bold text-blue-600">
                  Rp {totalAmount.toLocaleString('id-ID')}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Metode Pembayaran
                </label>
                <select
                  value={paymentMethod}
                  onChange={(event) => {
                    const value = event.target.value as 'cash' | 'non-cash';
                    setPaymentMethod(value);
                    if (value === 'non-cash') {
                      setPaymentAmount(totalAmount.toString());
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="cash">Tunai</option>
                  <option value="non-cash">Non-tunai</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Jumlah Bayar
                </label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  disabled={paymentMethod === 'non-cash'}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Masukkan jumlah bayar"
                  autoFocus
                />
              </div>

              {paymentMethod === 'cash' &&
                parseFloat(paymentAmount) >= totalAmount && (
                <div className="bg-green-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-700">Kembalian:</p>
                  <p className="text-xl font-bold text-green-600">
                    Rp{' '}
                    {(
                      parseFloat(paymentAmount) - totalAmount
                    ).toLocaleString('id-ID')}
                  </p>
                </div>
              )}

              {paymentMethod === 'cash' &&
                getSuggestedPayments(totalAmount).length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Rekomendasi uang pelanggan
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {getSuggestedPayments(totalAmount).map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => setPaymentAmount(amount.toString())}
                        className="rounded-full border border-blue-200 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50"
                      >
                        Rp {amount.toLocaleString('id-ID')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Catatan (Opsional)
                </label>
                <textarea
                  value={paymentNotes}
                  onChange={(event) => setPaymentNotes(event.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Contoh: pembayaran via QRIS"
                />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowPaymentModal(false);
                    setPaymentAmount('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  disabled={loading}
                >
                  Batal
                </button>
                <button
                  onClick={completeTransaction}
                  disabled={
                    loading ||
                    (paymentMethod === 'cash' &&
                      parseFloat(paymentAmount) < totalAmount)
                  }
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {loading ? 'Memproses...' : 'Bayar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Simpan Pesanan
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Simpan atas nama
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(event) => setSaveName(event.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Contoh: Meja 3 / Pak Budi"
                  autoFocus
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowSaveModal(false);
                    setSaveName('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  disabled={savingCart}
                >
                  Batal
                </button>
                <button
                  onClick={confirmSaveCart}
                  disabled={savingCart}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
                >
                  {savingCart ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSavedModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                Pesanan Tersimpan
              </h3>
              <button
                onClick={() => setShowSavedModal(false)}
                className="p-2 rounded hover:bg-slate-100"
              >
                <span className="sr-only">Tutup</span>✕
              </button>
            </div>
            <div className="p-6 space-y-3 overflow-y-auto">
              {savedCarts.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Belum ada pesanan tersimpan.
                </p>
              ) : (
                savedCarts.map((saved) => (
                  <div
                    key={saved.id}
                    className="rounded-md border border-slate-200 bg-white p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          {saved.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          Rp {saved.total.toLocaleString('id-ID')} ·{' '}
                          {saved.items.length} item
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            loadSavedCart(saved);
                            setShowSavedModal(false);
                          }}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                        >
                          Lanjutkan
                        </button>
                        <button
                          onClick={() => deleteSavedCart(saved.id)}
                          className="text-xs font-semibold text-red-600 hover:text-red-700"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showOptionModal && activeProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-5">
            <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-blue-50 via-white to-indigo-50 px-5 py-4">
              <h3 className="text-xl font-bold text-slate-900">
                Pilih Varian & Extra
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {activeProduct.name}
              </p>
            </div>
            <div>
              {activeVariantGroups.length > 0 && (
                <div className="mb-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  {activeVariantGroups.map((group) => (
                    <div key={group.name}>
                      <p className="text-sm font-semibold text-slate-700 mb-3">
                        {group.name} (wajib)
                      </p>
                      <div className="space-y-3">
                        {group.options.map((variant) => {
                          const { option } = parseVariantName(variant.name);
                          return (
                            <label
                              key={variant.id}
                              className="block"
                            >
                              <input
                                type="radio"
                                name={`variant-${group.name}`}
                                value={variant.id}
                                checked={selectedVariants[group.name] === variant.id}
                                onChange={() =>
                                  setSelectedVariants((prev) => ({
                                    ...prev,
                                    [group.name]: variant.id,
                                  }))
                                }
                                className="peer sr-only"
                              />
                              <div className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-blue-400 hover:bg-blue-50 peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-700">
                                <span className="flex items-center gap-3">
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white transition group-hover:border-blue-400 peer-checked:border-blue-600 peer-checked:bg-blue-600">
                                    <span className="h-2.5 w-2.5 rounded-full bg-white opacity-0 transition peer-checked:opacity-100" />
                                  </span>
                                  {option}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeProductExtras.length > 0 && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <p className="text-sm font-semibold text-slate-700">
                    Extra (opsional)
                  </p>
                  <div className="space-y-3">
                    {activeProductExtras.map((extra) => (
                      <label key={extra.id} className="block">
                        <input
                          type="checkbox"
                          value={extra.id}
                          checked={selectedExtras.includes(extra.id)}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setSelectedExtras((prev) =>
                              checked
                                ? [...prev, extra.id]
                                : prev.filter((id) => id !== extra.id)
                            );
                          }}
                          className="peer sr-only"
                        />
                        <div className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-blue-400 hover:bg-blue-50 peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-700">
                          <span className="flex items-center gap-3">
                            <span className="flex h-5 w-5 items-center justify-center rounded-md border border-slate-300 bg-white transition group-hover:border-blue-400 peer-checked:border-blue-600 peer-checked:bg-blue-600">
                              <Check className="h-3.5 w-3.5 text-white opacity-0 transition peer-checked:opacity-100" />
                            </span>
                            {extra.name}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">
                            Rp {getNumericPrice(extra.price).toLocaleString('id-ID')}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowOptionModal(false);
                  setActiveProduct(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  const missingVariant = activeVariantGroups.find(
                    (group) => !selectedVariants[group.name]
                  );
                  if (missingVariant) {
                    showToast('Pilih varian terlebih dahulu.', 'info');
                    return;
                  }
                  const selectedVariantData = activeVariantGroups
                    .map((group) =>
                      group.options.find(
                        (variant) => variant.id === selectedVariants[group.name]
                      )
                    )
                    .filter((variant): variant is ProductVariant => Boolean(variant));
                  const selectedExtrasData = activeProductExtras.filter((extra) =>
                    selectedExtras.includes(extra.id)
                  );
                  addToCart(
                    activeProduct,
                    selectedVariantData,
                    selectedExtrasData
                  );
                  setShowOptionModal(false);
                  setActiveProduct(null);
                  setSelectedVariants({});
                  setSelectedExtras([]);
                }}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Tambah ke Keranjang
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
