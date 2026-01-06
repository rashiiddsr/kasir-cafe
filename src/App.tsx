import { useEffect, useMemo, useRef, useState } from 'react';
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
  ChevronDown,
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

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
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
    setIsProfileMenuOpen(false);
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

  useEffect(() => {
    if (!isProfileMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProfileMenuOpen]);

  if (!authReady) {
    return null;
  }

  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {isSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-slate-900/20 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Tutup menu"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 bg-white text-slate-700 border-r border-slate-200 transform transition-all duration-200 ease-in-out lg:static lg:inset-auto overflow-hidden ${
          isSidebarOpen
            ? 'w-64 translate-x-0'
            : 'w-0 -translate-x-full lg:translate-x-0 border-r-0'
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
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                className="inline-flex items-center justify-center p-2 rounded-lg text-slate-600 hover:bg-slate-100"
                aria-label={isSidebarOpen ? 'Tutup menu' : 'Buka menu'}
              >
                {isSidebarOpen ? (
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
            <div
              className="relative flex items-center gap-4 text-sm text-slate-600"
              ref={profileMenuRef}
            >
              <button
                onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 hover:bg-slate-50"
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
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
                <div className="text-left hidden sm:block">
                  <p className="text-xs text-slate-500">Masuk sebagai</p>
                  <p className="text-sm font-medium text-slate-800">
                    {currentUser.name}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 text-slate-500" />
              </button>

              {isProfileMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-slate-200 bg-white shadow-lg">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-900">
                      {currentUser.name}
                    </p>
                    <p className="text-xs text-slate-500 capitalize">
                      {currentUser.role}
                    </p>
                  </div>
                  <div className="py-2">
                    <button
                      onClick={() => handleNavigation('profile')}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Pengaturan Profil
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 px-6 py-6 lg:py-8">{renderPage()}</main>
      </div>
    </div>
  );
}

export default App;
