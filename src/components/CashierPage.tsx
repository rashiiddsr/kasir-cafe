import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
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
  Discount,
  CashierSession,
  CashierSummary,
} from '../lib/api';
import { formatJakartaDate, formatJakartaDateTime } from '../lib/date';
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
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
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
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [selectedDiscountId, setSelectedDiscountId] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [cashierStatus, setCashierStatus] = useState<
    'loading' | 'needs-open' | 'needs-close' | 'open' | 'closed' | 'error'
  >('loading');
  const [cashierSession, setCashierSession] = useState<CashierSession | null>(null);
  const [cashierSummary, setCashierSummary] = useState<CashierSummary | null>(null);
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [closingNonCash, setClosingNonCash] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [isOpeningCashier, setIsOpeningCashier] = useState(false);
  const [isClosingCashier, setIsClosingCashier] = useState(false);
  const [closePreviewAt, setClosePreviewAt] = useState<Date | null>(null);

  const VARIANT_SEPARATOR = '::';
  const POLL_INTERVAL = 15000;
  const todayDate = useMemo(() => formatJakartaDate(new Date()), []);
  const isSessionFromPreviousDay = useMemo(() => {
    if (!cashierSession?.opened_at) return false;
    const openedDate = formatJakartaDate(new Date(cashierSession.opened_at));
    return openedDate < todayDate;
  }, [cashierSession?.opened_at, todayDate]);

  const roundCurrency = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100;

  const getNumericPrice = (price: number) => {
    const normalized = Number(price);
    if (Number.isNaN(normalized)) return 0;
    return roundCurrency(normalized);
  };

  const parseAmount = (value: string) => {
    const cleaned = value.replace(/[^\d.-]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatCurrency = (value: number) =>
    `Rp ${value.toLocaleString('id-ID')}`;

  const formatDateTime = (value?: string | Date | null) => {
    if (!value) return '-';
    const date = typeof value === 'string' ? new Date(value) : value;
    return formatJakartaDateTime(date);
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

  const loadCashierGate = useCallback(async () => {
    setCashierStatus('loading');
    try {
      const statusData = await api.getCashierSessionStatus(todayDate, user.id);
      setCashierSession(statusData.session ?? null);
      setCashierSummary(statusData.summary ?? null);
      setClosePreviewAt(
        statusData.status === 'needs-close' ? new Date() : null
      );
      setCashierStatus(statusData.status);
    } catch (error) {
      console.error('Error loading cashier status:', error);
      showToast('Gagal memuat status kasir.');
      setCashierStatus('error');
    }
  }, [showToast, todayDate, user.id]);

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
        return data || [];
      } catch (error) {
        console.error('Error loading saved carts:', error);
        if (!options?.silent) {
          showToast('Gagal memuat pesanan tersimpan.');
        }
        return [];
      }
    },
    [showToast, user.id]
  );

  const loadDiscounts = useCallback(
    async (options?: { silent?: boolean }) => {
      try {
        const data = await api.getDiscounts({ active: true });
        setDiscounts(data || []);
      } catch (error) {
        console.error('Error loading discounts:', error);
        if (!options?.silent) {
          showToast('Gagal memuat diskon.');
        }
      }
    },
    [showToast]
  );

  useEffect(() => {
    loadCashierGate();
  }, [loadCashierGate]);

  useEffect(() => {
    setShowOpenModal(cashierStatus === 'needs-open');
    if (cashierStatus === 'needs-close' && isSessionFromPreviousDay) {
      setShowCloseModal(true);
    }
  }, [cashierStatus, isSessionFromPreviousDay]);

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadProductOptions();
    loadSavedCarts({ silent: true });
    loadDiscounts({ silent: true });
  }, [
    loadCategories,
    loadProducts,
    loadProductOptions,
    loadSavedCarts,
    loadDiscounts,
  ]);

  useEffect(() => {
    if (cashierStatus !== 'open') {
      return;
    }
    const interval = window.setInterval(() => {
      loadProducts({ silent: true });
      loadCategories({ silent: true });
      loadProductOptions({ silent: true });
      loadDiscounts({ silent: true });
    }, POLL_INTERVAL);
    const handleFocus = () => {
      loadProducts({ silent: true });
      loadCategories({ silent: true });
      loadProductOptions({ silent: true });
      loadDiscounts({ silent: true });
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [
    cashierStatus,
    loadCategories,
    loadProducts,
    loadProductOptions,
    loadDiscounts,
  ]);

  useEffect(() => {
    if (cart.length === 0) {
      setSelectedDiscountId('');
    }
  }, [cart.length]);

  const handleOpenCashier = async () => {
    if (openingBalance.trim() === '') {
      showToast('Uang kas awal wajib diisi.');
      return;
    }
    const openingValue = parseAmount(openingBalance);
    setIsOpeningCashier(true);
    try {
      await api.openCashierSession({
        user_id: user.id,
        opening_balance: openingValue,
      });
      setOpeningBalance('');
      setShowOpenModal(false);
      await loadCashierGate();
      showToast('Kasir berhasil dibuka.', 'success');
    } catch (error) {
      console.error('Error opening cashier:', error);
      if (error instanceof Error) {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed?.message) {
            showToast(parsed.message);
            return;
          }
        } catch (parseError) {
          console.warn('Error parsing cashier error:', parseError);
        }
        showToast(error.message);
      } else {
        showToast('Gagal membuka kasir.');
      }
    } finally {
      setIsOpeningCashier(false);
    }
  };

  const handleCloseCashier = async () => {
    if (!cashierSession) return;
    if (closingCash.trim() === '' || closingNonCash.trim() === '') {
      showToast('Tunai dan non-tunai aktual wajib diisi.');
      return;
    }
    const cashValue = parseAmount(closingCash);
    const nonCashValue = parseAmount(closingNonCash);
    setIsClosingCashier(true);
    try {
      const result = await api.closeCashierSession(cashierSession.id, {
        user_id: user.id,
        closing_cash: cashValue,
        closing_non_cash: nonCashValue,
        notes: closingNotes?.trim() || null,
      });
      setClosingCash('');
      setClosingNonCash('');
      setClosingNotes('');
      setShowCloseModal(false);
      setCashierSummary(result.summary);
      setCashierSession(result.session);
      setClosePreviewAt(null);
      await loadCashierGate();
      showToast('Kasir berhasil ditutup.', 'success');
    } catch (error) {
      console.error('Error closing cashier:', error);
      if (error instanceof Error) {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed?.message) {
            showToast(parsed.message);
            return;
          }
        } catch (parseError) {
          console.warn('Error parsing cashier error:', parseError);
        }
        showToast(error.message);
      } else {
        showToast('Gagal menutup kasir.');
      }
    } finally {
      setIsClosingCashier(false);
    }
  };

  const expectedCash =
    cashierSummary && cashierSession
      ? roundCurrency(
          getNumericPrice(cashierSession.opening_balance || 0) +
            getNumericPrice(cashierSummary.total_cash || 0)
        )
      : 0;
  const expectedNonCash = cashierSummary
    ? roundCurrency(getNumericPrice(cashierSummary.total_non_cash || 0))
    : 0;
  const actualCashValue = parseAmount(closingCash);
  const actualNonCashValue = parseAmount(closingNonCash);
  const varianceCash = roundCurrency(actualCashValue - expectedCash);
  const varianceNonCash = roundCurrency(actualNonCashValue - expectedNonCash);
  const varianceTotal = roundCurrency(
    actualCashValue + actualNonCashValue - (expectedCash + expectedNonCash)
  );

  const getVarianceLabel = (value: number) => {
    if (value === 0) return 'Pas';
    return value > 0 ? 'Lebih' : 'Minus';
  };

  const isCashierOpen =
    cashierStatus === 'open' ||
    (cashierStatus === 'needs-close' && !isSessionFromPreviousDay);

  const requestCloseCashier = async () => {
    const latestSaved = await loadSavedCarts({ silent: true });
    if (latestSaved.length > 0) {
      showToast('Selesaikan semua pesanan tersimpan sebelum menutup kasir.');
      return;
    }
    if (!cashierSession) {
      await loadCashierGate();
      return;
    }
    try {
      const summaryResponse = await api.getCashierSessionSummary(
        cashierSession.id
      );
      setCashierSummary(summaryResponse.summary);
      setCashierSession(summaryResponse.session);
      setClosePreviewAt(new Date(summaryResponse.end_at));
      setShowCloseModal(true);
    } catch (error) {
      console.error('Error fetching cashier summary:', error);
      showToast('Gagal memuat ringkasan kasir.');
    }
  };

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

  const calculateTotal = useCallback(
    () => roundCurrency(cart.reduce((sum, item) => sum + item.subtotal, 0)),
    [cart]
  );

  const selectedDiscount = useMemo(
    () => discounts.find((discount) => discount.id === selectedDiscountId),
    [discounts, selectedDiscountId]
  );

  const evaluateDiscount = useCallback(
    (discount: Discount | undefined | null) => {
      if (!discount) {
        return {
          amount: 0,
          isEligible: false,
          message: 'Belum ada diskon dipilih.',
        };
      }

      if (!discount.is_active) {
        return {
          amount: 0,
          isEligible: false,
          message: 'Diskon tidak aktif.',
        };
      }

      if (
        discount.stock !== null &&
        discount.stock !== undefined &&
        discount.stock <= 0
      ) {
        return {
          amount: 0,
          isEligible: false,
          message: 'Stok diskon sudah habis.',
        };
      }

      const now = new Date();
      if (discount.valid_from) {
        const start = new Date(discount.valid_from);
        if (now < start) {
          return {
            amount: 0,
            isEligible: false,
            message: 'Diskon belum mulai berlaku.',
          };
        }
      }
      if (discount.valid_until) {
        const end = new Date(discount.valid_until);
        end.setHours(23, 59, 59, 999);
        if (now > end) {
          return {
            amount: 0,
            isEligible: false,
            message: 'Diskon sudah berakhir.',
          };
        }
      }

      const total = calculateTotal();
      const normalizedValue = Math.max(0, Number(discount.value || 0));
      const valueType = discount.value_type || 'amount';
      const safeValue =
        valueType === 'percent'
          ? Math.min(normalizedValue, 100)
          : normalizedValue;

      const productTotals = cart.reduce<Record<string, { quantity: number; subtotal: number }>>(
        (acc, item) => {
          const productId = item.product.id;
          if (!acc[productId]) {
            acc[productId] = { quantity: 0, subtotal: 0 };
          }
          acc[productId].quantity += item.quantity;
          acc[productId].subtotal += item.subtotal;
          return acc;
        },
        {}
      );

      const calculateAmount = (baseAmount: number) => {
        if (valueType === 'percent') {
          return roundCurrency((baseAmount * safeValue) / 100);
        }
        return roundCurrency(safeValue);
      };

      if (discount.discount_type === 'order') {
        let minPurchase = discount.min_purchase ?? 0;
        if (valueType === 'amount') {
          minPurchase =
            minPurchase > 0 ? Math.max(minPurchase, safeValue) : safeValue;
        }
        if (minPurchase > 0 && total < minPurchase) {
          return {
            amount: 0,
            isEligible: false,
            message: `Minimal belanja Rp ${minPurchase.toLocaleString('id-ID')}.`,
          };
        }
        let discountAmount = calculateAmount(total);
        if (valueType === 'percent' && discount.max_discount) {
          discountAmount = Math.min(discountAmount, discount.max_discount);
        }
        return {
          amount: Math.min(discountAmount, total),
          isEligible: true,
          message: 'Diskon transaksi diterapkan.',
        };
      }

      if (discount.discount_type === 'product') {
        const productIds =
          discount.product_ids && discount.product_ids.length > 0
            ? discount.product_ids
            : discount.product_id
              ? [discount.product_id]
              : [];
        if (productIds.length === 0) {
          return {
            amount: 0,
            isEligible: false,
            message: 'Produk diskon belum ditentukan.',
          };
        }
        const minQty = discount.min_quantity ?? 1;
        const isMultiple = discount.is_multiple ?? true;
        let totalDiscount = 0;
        let hasEligibleProduct = false;
        let hasProductInCart = false;
        let hasInsufficientQty = false;

        productIds.forEach((productId) => {
          const productSummary = productTotals[productId];
          if (!productSummary) return;
          hasProductInCart = true;
          if (productSummary.quantity < minQty) {
            hasInsufficientQty = true;
            return;
          }
          const eligibleMultiplier = isMultiple
            ? Math.floor(productSummary.quantity / minQty)
            : 1;
          if (eligibleMultiplier <= 0) return;
          const eligibleQuantity = eligibleMultiplier * minQty;
          const unitPrice =
            productSummary.subtotal / Math.max(productSummary.quantity, 1);
          const eligibleSubtotal = unitPrice * eligibleQuantity;
          const perItemAmount =
            valueType === 'percent'
              ? calculateAmount(eligibleSubtotal)
              : roundCurrency(safeValue * eligibleQuantity);
          totalDiscount += Math.min(perItemAmount, eligibleSubtotal);
          hasEligibleProduct = true;
        });

        if (!hasEligibleProduct) {
          return {
            amount: 0,
            isEligible: false,
            message: hasProductInCart && hasInsufficientQty
              ? `Minimal beli ${minQty} item produk.`
              : 'Produk diskon belum ada di keranjang.',
          };
        }

        return {
          amount: totalDiscount,
          isEligible: true,
          message: 'Diskon produk diterapkan.',
        };
      }

      if (discount.discount_type === 'combo') {
        const comboItems = discount.combo_items || [];
        if (comboItems.length === 0) {
          return {
            amount: 0,
            isEligible: false,
            message: 'Combo diskon belum diatur.',
          };
        }
        const comboTimes = comboItems.reduce((acc, item) => {
          const summary = productTotals[item.product_id];
          if (!summary) return 0;
          const required = item.quantity || 1;
          const times = Math.floor(summary.quantity / required);
          return acc === null ? times : Math.min(acc, times);
        }, null as number | null);

        if (!comboTimes || comboTimes <= 0) {
          return {
            amount: 0,
            isEligible: false,
            message: 'Combo belum terpenuhi.',
          };
        }

        let comboBase = 0;
        comboItems.forEach((item) => {
          const summary = productTotals[item.product_id];
          if (!summary) return;
          const required = item.quantity || 1;
          const unitPrice = summary.subtotal / Math.max(summary.quantity, 1);
          comboBase += unitPrice * required;
        });

        const comboDiscount = calculateAmount(comboBase) * comboTimes;
        return {
          amount: Math.min(comboDiscount, total),
          isEligible: true,
          message: `Diskon combo diterapkan (${comboTimes} paket).`,
        };
      }

      return {
        amount: 0,
        isEligible: false,
        message: 'Diskon tidak dikenali.',
      };
    },
    [cart]
  );

  const discountSummary = useMemo(
    () => evaluateDiscount(selectedDiscount),
    [evaluateDiscount, selectedDiscount]
  );

  const totalBeforeDiscount = calculateTotal();
  const discountAmount = discountSummary.isEligible
    ? roundCurrency(discountSummary.amount)
    : 0;
  const totalAfterDiscount = roundCurrency(
    Math.max(totalBeforeDiscount - discountAmount, 0)
  );

  const handleCheckout = () => {
    if (cart.length === 0) return;
    setShowPaymentModal(true);
    setPaymentAmount(totalAfterDiscount.toString());
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

    if (selectedDiscountId && !discountSummary.isEligible) {
      showToast(discountSummary.message || 'Diskon tidak memenuhi syarat.');
      return;
    }

    const total = totalAfterDiscount;
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
        discount_id: selectedDiscount?.id || null,
        discount_name: selectedDiscount?.name || null,
        discount_code: selectedDiscount?.code || null,
        discount_type: selectedDiscount?.discount_type || null,
        discount_value: selectedDiscount?.value || null,
        discount_value_type: selectedDiscount?.value_type || null,
        discount_amount: discountAmount || 0,
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
        unit_price: getNumericPrice(item.product.price),
        subtotal: roundCurrency(item.subtotal),
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
      setSelectedDiscountId('');
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

  const totalAmount = totalAfterDiscount;
  const lastTotalRef = useRef(totalAmount);

  useEffect(() => {
    if (!showPaymentModal) return;
    if (
      paymentMethod === 'non-cash' ||
      paymentAmount === lastTotalRef.current.toString()
    ) {
      setPaymentAmount(totalAmount.toString());
    }
    lastTotalRef.current = totalAmount;
  }, [paymentAmount, paymentMethod, showPaymentModal, totalAmount]);
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
    <div className="relative">
      <div
        className={`grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[calc(100vh-8rem)] ${
          !isCashierOpen ? 'pointer-events-none opacity-60' : ''
        }`}
      >
        <div className="lg:col-span-2 flex flex-col min-h-0 gap-4">
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

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
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
                    setSelectedVariants({});
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
            <div className="bg-white rounded-lg shadow-md p-12 text-center mt-3">
              <p className="text-gray-500">Tidak ada produk ditemukan</p>
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-1 flex flex-col">
        <div className="bg-white rounded-lg shadow-md p-6 lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <Receipt className="w-6 h-6 mr-2 text-blue-600" />
              Keranjang
            </h2>
            {isCashierOpen && (
              <button
                type="button"
                onClick={requestCloseCashier}
                className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
              >
                Tutup Kasir
              </button>
            )}
          </div>

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

          <div className="space-y-3 mb-4 flex-1 min-h-0 overflow-y-auto">
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
            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center text-sm text-gray-600">
                <span>Subtotal</span>
                <span>Rp {totalBeforeDiscount.toLocaleString('id-ID')}</span>
              </div>
              {selectedDiscount && (
                <div className="flex justify-between items-center text-sm text-rose-600">
                  <span>
                    Diskon ({selectedDiscount.name})
                    {!discountSummary.isEligible && (
                      <span className="ml-1 text-xs text-amber-500">
                        - {discountSummary.message}
                      </span>
                    )}
                  </span>
                  <span>
                    - Rp {discountAmount.toLocaleString('id-ID')}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-gray-700">
                  Total Bayar
                </span>
                <span className="text-2xl font-bold text-blue-600">
                  Rp {totalAmount.toLocaleString('id-ID')}
                </span>
              </div>
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
                {discountAmount > 0 && (
                  <p className="text-sm text-rose-600 mt-1">
                    Hemat Rp {discountAmount.toLocaleString('id-ID')}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pilih Diskon
                </label>
                <select
                  value={selectedDiscountId}
                  onChange={(event) => setSelectedDiscountId(event.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Tanpa diskon</option>
                  {discounts.map((discount) => (
                    <option key={discount.id} value={discount.id}>
                      {discount.name} ({discount.code})
                    </option>
                  ))}
                </select>
                {selectedDiscount && (
                  <p className="text-xs text-slate-500 mt-1">
                    {discountSummary.message}
                  </p>
                )}
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
                    (selectedDiscountId && !discountSummary.isEligible) ||
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

      {cashierStatus === 'loading' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <p className="text-sm text-slate-600">Memeriksa status kasir...</p>
          </div>
        </div>
      )}

      {cashierStatus === 'closed' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-xl max-w-md">
            <p className="text-sm font-semibold text-emerald-700">
              Kasir sudah ditutup hari ini.
            </p>
            <p className="text-sm text-emerald-600 mt-2">
              Buka kasir kembali besok untuk melanjutkan transaksi.
            </p>
          </div>
        </div>
      )}

      {cashierStatus === 'error' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 shadow-xl max-w-md">
            <p className="text-sm font-semibold text-rose-700">
              Gagal memuat status kasir.
            </p>
            <p className="text-sm text-rose-600 mt-2">
              Silakan muat ulang halaman atau coba lagi nanti.
            </p>
          </div>
        </div>
      )}

      {showOpenModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-800">
              Buka Kasir
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Masukkan jumlah uang kas awal sebelum memulai transaksi.
            </p>
            <div className="mt-4">
              <label className="text-sm font-medium text-slate-700">
                Uang kas awal
              </label>
              <input
                type="number"
                min="0"
                value={openingBalance}
                onChange={(event) => setOpeningBalance(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Masukkan jumlah uang kas"
              />
            </div>
            <div className="mt-6 flex items-center justify-end">
              <button
                type="button"
                onClick={handleOpenCashier}
                disabled={isOpeningCashier || openingBalance.trim() === ''}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
              >
                {isOpeningCashier ? 'Membuka...' : 'Buka Kasir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseModal && cashierSummary && cashierSession && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-800">
              Tutup Kasir
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Periksa ringkasan kasir sebelum mengakhiri sesi.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Tanggal buka</p>
                <p className="text-sm font-semibold text-slate-800">
                  {formatDateTime(cashierSession.opened_at)}
                </p>
                <p className="mt-2 text-xs text-slate-500">Uang kas awal</p>
                <p className="text-sm font-semibold text-slate-800">
                  {formatCurrency(getNumericPrice(cashierSession.opening_balance || 0))}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Tanggal tutup</p>
                <p className="text-sm font-semibold text-slate-800">
                  {closePreviewAt
                    ? formatDateTime(closePreviewAt)
                    : '-'}
                </p>
                <p className="mt-2 text-xs text-slate-500">Total transaksi</p>
                <p className="text-sm font-semibold text-slate-800">
                  {cashierSummary.total_transactions}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Omset</p>
                <p className="text-lg font-semibold text-slate-800">
                  {formatCurrency(cashierSummary.total_revenue)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Tunai</p>
                <p className="text-lg font-semibold text-slate-800">
                  {formatCurrency(cashierSummary.total_cash)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Non-tunai</p>
                <p className="text-lg font-semibold text-slate-800">
                  {formatCurrency(cashierSummary.total_non_cash)}
                </p>
              </div>
            </div>

            {cashierSummary.products.length > 0 && (
              <div className="mt-5">
                <p className="text-sm font-semibold text-slate-700">
                  Produk laku
                </p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {cashierSummary.products.slice(0, 6).map((product) => (
                    <li
                      key={product.name}
                      className="flex items-center justify-between"
                    >
                      <span>{product.name}</span>
                      <span className="font-medium text-slate-800">
                        {product.quantity}x
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Tunai aktual
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={closingCash}
                    onChange={(event) => setClosingCash(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Masukkan tunai aktual"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Non-tunai aktual
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={closingNonCash}
                    onChange={(event) => setClosingNonCash(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Masukkan non-tunai aktual"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Catatan (opsional)
                </label>
                <textarea
                  value={closingNotes}
                  onChange={(event) => setClosingNotes(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Tambahkan catatan jika diperlukan"
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Selisih</p>
                <div className="mt-2 grid gap-3 md:grid-cols-3 text-sm">
                  <div>
                    <p className="text-slate-500">Tunai</p>
                    <p className="font-semibold text-slate-800">
                      {getVarianceLabel(varianceCash)} (
                      {formatCurrency(Math.abs(varianceCash))})
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Non-tunai</p>
                    <p className="font-semibold text-slate-800">
                      {getVarianceLabel(varianceNonCash)} (
                      {formatCurrency(Math.abs(varianceNonCash))})
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Total</p>
                    <p className="font-semibold text-slate-800">
                      {getVarianceLabel(varianceTotal)} (
                      {formatCurrency(Math.abs(varianceTotal))})
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end">
              <button
                type="button"
                onClick={handleCloseCashier}
                disabled={
                  isClosingCashier ||
                  closingCash.trim() === '' ||
                  closingNonCash.trim() === ''
                }
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-rose-700 disabled:opacity-60"
              >
                {isClosingCashier ? 'Menutup...' : 'Tutup Kasir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
