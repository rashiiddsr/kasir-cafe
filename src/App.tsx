import { useState } from 'react';
import {
  ShoppingCart,
  Package,
  BarChart3,
  Menu,
  X,
  LayoutGrid,
  Tags,
  Users,
} from 'lucide-react';
import CashierPage from './components/CashierPage';
import ProductsPage from './components/ProductsPage';
import ReportsPage from './components/ReportsPage';
import CategoriesPage from './components/CategoriesPage';
import UsersPage from './components/UsersPage';

type Page = 'cashier' | 'products' | 'categories' | 'users' | 'reports';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('cashier');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const pages = [
    { id: 'cashier' as Page, name: 'Kasir', icon: ShoppingCart },
    { id: 'products' as Page, name: 'Produk', icon: Package },
    { id: 'categories' as Page, name: 'Kategori', icon: Tags },
    { id: 'users' as Page, name: 'User', icon: Users },
    { id: 'reports' as Page, name: 'Laporan', icon: BarChart3 },
  ];

  const renderPage = () => {
    switch (currentPage) {
      case 'cashier':
        return <CashierPage />;
      case 'products':
        return <ProductsPage />;
      case 'categories':
        return <CategoriesPage />;
      case 'users':
        return <UsersPage />;
      case 'reports':
        return <ReportsPage />;
      default:
        return <CashierPage />;
    }
  };

  const handleNavigation = (page: Page) => {
    setCurrentPage(page);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {isMobileMenuOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-label="Tutup menu"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-100 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-auto ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center space-x-3 px-6 py-6 border-b border-slate-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20 text-blue-300">
            <LayoutGrid className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">POS System</h1>
            <p className="text-xs text-slate-400">Kasir Cafe</p>
          </div>
        </div>

        <nav className="px-4 py-6 space-y-1">
          {pages.map((page) => {
            const Icon = page.icon;
            const isActive = currentPage === page.id;
            return (
              <button
                key={page.id}
                onClick={() => handleNavigation(page.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors font-medium ${
                  isActive
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{page.name}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto px-6 py-4 text-xs text-slate-500 border-t border-slate-800">
          © 2024 Kasir Cafe
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden inline-flex items-center justify-center p-2 rounded-lg text-slate-600 hover:bg-slate-100"
                aria-label="Buka menu"
              >
                {isMobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
              <div>
                <p className="text-sm text-slate-500">Panel Kasir</p>
                <h2 className="text-lg font-semibold text-slate-900">
                  {pages.find((page) => page.id === currentPage)?.name}
                </h2>
              </div>
            </div>
            <div className="hidden sm:flex items-center space-x-2 text-sm text-slate-500">
              <ShoppingCart className="w-4 h-4" />
              <span>Kasir Cafe</span>
            </div>
          </div>
        </header>

        <main className="flex-1 px-6 py-6 lg:py-8">{renderPage()}</main>
      </div>
    </div>
  );
}

export default App;
