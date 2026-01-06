import { useEffect, useMemo, useState } from 'react';
import {
  ShoppingCart,
  Package,
  BarChart3,
  Menu,
  X,
  LayoutGrid,
  Tags,
  Users,
  UserCircle,
  LogOut,
} from 'lucide-react';
import CashierPage from './components/CashierPage';
import ProductsPage from './components/ProductsPage';
import ReportsPage from './components/ReportsPage';
import CategoriesPage from './components/CategoriesPage';
import UsersPage from './components/UsersPage';
import LoginPage from './components/LoginPage';
import ProfilePage from './components/ProfilePage';
import { User } from './lib/api';

type Page = 'cashier' | 'products' | 'categories' | 'users' | 'reports' | 'profile';

const STORAGE_KEY = 'kasir-cafe-user';
const SESSION_KEY = 'kasir-cafe-session';

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>('cashier');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);

  useEffect(() => {
    const storedUser =
      localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser) as User;
        setCurrentUser(parsedUser);
        setRememberSession(Boolean(localStorage.getItem(STORAGE_KEY)));
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
    setAuthReady(true);
  }, []);

  const pages = useMemo(() => {
    const items = [
      { id: 'cashier' as Page, name: 'Kasir', icon: ShoppingCart },
      { id: 'products' as Page, name: 'Produk', icon: Package },
      { id: 'categories' as Page, name: 'Kategori', icon: Tags },
      { id: 'reports' as Page, name: 'Laporan', icon: BarChart3 },
      { id: 'profile' as Page, name: 'Profil', icon: UserCircle },
    ];

    if (currentUser?.role === 'superadmin') {
      items.splice(3, 0, { id: 'users' as Page, name: 'User', icon: Users });
    }
    return items;
  }, [currentUser]);

  const handleNavigation = (page: Page) => {
    setCurrentPage(page);
    setIsMobileMenuOpen(false);
  };

  const handleLogin = (user: User, remember: boolean) => {
    setCurrentUser(user);
    setCurrentPage('cashier');
    setRememberSession(remember);
    if (remember) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  };

  const handleProfileUpdated = (user: User) => {
    setCurrentUser(user);
    if (rememberSession) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    }
  };

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
      case 'profile':
        if (!currentUser) return null;
        return (
          <ProfilePage
            user={currentUser}
            onProfileUpdated={handleProfileUpdated}
          />
        );
      default:
        return <CashierPage />;
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    if (!pages.find((page) => page.id === currentPage)) {
      setCurrentPage('cashier');
    }
  }, [currentUser, currentPage, pages]);

  if (!authReady) {
    return null;
  }

  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {isMobileMenuOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-slate-900/20 z-30 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-label="Tutup menu"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white text-slate-700 border-r border-slate-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-auto ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center space-x-3 px-6 py-6 border-b border-slate-200">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <LayoutGrid className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">POS System</h1>
            <p className="text-xs text-slate-500">Kasir Cafe</p>
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
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/15'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{page.name}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto px-6 py-4 text-xs text-slate-500 border-t border-slate-200">
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
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <button
                onClick={() => handleNavigation('profile')}
                className="hidden sm:flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 hover:bg-slate-50"
              >
                <img
                  src={
                    currentUser.profile ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      currentUser.name
                    )}`
                  }
                  alt={currentUser.name}
                  className="h-7 w-7 rounded-full object-cover"
                />
                <div className="text-left">
                  <p className="text-xs text-slate-500">Masuk sebagai</p>
                  <p className="text-sm font-medium text-slate-800">
                    {currentUser.name}
                  </p>
                </div>
              </button>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-50"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-6 py-6 lg:py-8">{renderPage()}</main>
      </div>
    </div>
  );
}

export default App;
