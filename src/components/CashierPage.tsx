import { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  Receipt,
  AlertCircle,
} from 'lucide-react';
import { api, Product, CartItem } from '../lib/api';
import { useToast } from './ToastProvider';

export default function CashierPage() {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const getNumericPrice = (price: number) => {
    const normalized = Number(price);
    return Number.isNaN(normalized) ? 0 : normalized;
  };

  const getSuggestedPayments = (total: number) => {
    if (total <= 0) return [];
    const denominations = [10000, 20000, 50000, 100000];
    const suggestions = denominations
      .map((denomination) => Math.ceil(total / denomination) * denomination)
      .filter((amount) => amount >= total);
    return Array.from(new Set(suggestions)).sort((a, b) => a - b).slice(0, 4);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const data = await api.getProducts({ active: true });
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
      showToast('Gagal memuat produk.');
    }
  };

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addToCart = (product: Product) => {
    const existingItem = cart.find((item) => item.product.id === product.id);
    const price = getNumericPrice(product.price);

    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.product.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                subtotal: (item.quantity + 1) * price,
              }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          product,
          quantity: 1,
          subtotal: price,
        },
      ]);
    }
  };

  const updateQuantity = (productId: string, newQuantity: number) => {
    const item = cart.find((item) => item.product.id === productId);
    if (!item) return;

    if (newQuantity <= 0) {
      removeFromCart(productId);
    } else {
      setCart(
        cart.map((item) =>
          item.product.id === productId
            ? {
                ...item,
                quantity: newQuantity,
                subtotal: newQuantity * getNumericPrice(item.product.price),
              }
            : item
        )
      );
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((item) => item.product.id !== productId));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + item.subtotal, 0);
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;
    setShowPaymentModal(true);
    setPaymentAmount(calculateTotal().toString());
  };

  const completeTransaction = async () => {
    if (cart.length === 0) return;

    const total = calculateTotal();
    const payment = parseFloat(paymentAmount) || 0;

    if (payment < total) {
      showToast('Jumlah pembayaran kurang.');
      return;
    }

    setLoading(true);

    try {
      const transactionNumber = `TRX-${Date.now()}`;
      const changeAmount = payment - total;

      const transaction = await api.createTransaction({
        transaction_number: transactionNumber,
        total_amount: total,
        payment_method: 'cash',
        payment_amount: payment,
        change_amount: changeAmount,
        notes: null,
      });

      const transactionItems = cart.map((item) => ({
        transaction_id: transaction.id,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price,
        subtotal: item.subtotal,
      }));

      await api.createTransactionItems(transactionItems);

      setSuccessMessage(
        `Transaksi berhasil! Nomor: ${transactionNumber}\nKembalian: Rp ${changeAmount.toLocaleString('id-ID')}`
      );
      showToast('Transaksi berhasil diproses.', 'success');
      setCart([]);
      setPaymentAmount('');
      setShowPaymentModal(false);
      loadProducts();

      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error completing transaction:', error);
      showToast('Terjadi kesalahan saat memproses transaksi.');
    } finally {
      setLoading(false);
    }
  };

  const totalAmount = calculateTotal();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-lg shadow-md p-6">
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

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              onClick={() => addToCart(product)}
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
                key={item.product.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 text-sm truncate">
                    {item.product.name}
                  </h4>
                  <p className="text-sm text-gray-600">
                    Rp {getNumericPrice(item.product.price).toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="flex items-center space-x-2 ml-3">
                  <button
                    onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                    className="p-1 rounded bg-gray-200 hover:bg-gray-300"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center font-medium">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                    className="p-1 rounded bg-gray-200 hover:bg-gray-300"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeFromCart(item.product.id)}
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
                  Jumlah Bayar
                </label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Masukkan jumlah bayar"
                  autoFocus
                />
              </div>

              {parseFloat(paymentAmount) >= totalAmount && (
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

              {getSuggestedPayments(totalAmount).length > 0 && (
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
                    parseFloat(paymentAmount) < totalAmount
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
    </div>
  );
}
