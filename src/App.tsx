import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ShoppingCart,
  Package,
  BarChart3,
  Menu,
  X,
  LayoutDashboard,
  Tags,
  Users,
  UserCircle,
  ChevronDown,
  LogOut,
  FileText,
  QrCode,
  ClipboardList,
  BadgePercent,
} from 'lucide-react';
import CashierPage from './components/CashierPage';
import ProductsPage from './components/ProductsPage';
import ReportsPage from './components/ReportsPage';
import CategoriesPage from './components/CategoriesPage';
import UsersPage from './components/UsersPage';
import LoginPage from './components/LoginPage';
import ProfilePage from './components/ProfilePage';
import DashboardPage from './components/DashboardPage';
import TransactionsPage from './components/TransactionsPage';
import DiscountsPage from './components/DiscountsPage';
import AttendancePage from './components/AttendancePage';
import AttendanceReportsPage from './components/AttendanceReportsPage';
import AttendanceBarcodePage from './components/AttendanceBarcodePage';
import { User } from './lib/api';

type Page =
  | 'dashboard'
  | 'cashier'
  | 'transactions'
  | 'discounts'
  | 'products'
  | 'categories'
  | 'users'
  | 'reports'
  | 'attendance'
  | 'attendance-report'
  | 'profile';

const STORAGE_KEY = 'kasir-cafe-user';
const SESSION_KEY = 'kasir-cafe-session';
const SESSION_DURATION = 1000 * 60 * 60 * 6;
const REMEMBER_DURATION = 1000 * 60 * 60 * 12;

type StoredSession = {
  user: User;
  expiresAt: number;
};

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    setSessionExpiresAt(null);
    setIsProfileMenuOpen(false);
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  useEffect(() => {
    const now = Date.now();
    const parseSession = (raw: string | null, remember: boolean) => {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as StoredSession | User;
        if ('user' in parsed && 'expiresAt' in parsed) {
          if (parsed.expiresAt > now) {
            return { user: parsed.user, expiresAt: parsed.expiresAt, remember };
          }
          return null;
        }
        if ('id' in parsed) {
          return {
            user: parsed,
            expiresAt: now + (remember ? REMEMBER_DURATION : SESSION_DURATION),
            remember,
          };
        }
        return null;
      } catch (error) {
        console.error('Error parsing stored user:', error);
        return null;
      }
    };

    const localSession = parseSession(localStorage.getItem(STORAGE_KEY), true);
    const sessionSession = parseSession(
      sessionStorage.getItem(SESSION_KEY),
      false
    );
    const activeSession = localSession || sessionSession;

    if (activeSession) {
      setCurrentUser(activeSession.user);
      setRememberSession(activeSession.remember);
      setSessionExpiresAt(activeSession.expiresAt);
      const payload = JSON.stringify({
        user: activeSession.user,
        expiresAt: activeSession.expiresAt,
      });
      if (activeSession.remember) {
        localStorage.setItem(STORAGE_KEY, payload);
        sessionStorage.removeItem(SESSION_KEY);
      } else {
        sessionStorage.setItem(SESSION_KEY, payload);
        localStorage.removeItem(STORAGE_KEY);
      }
    } else {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(SESSION_KEY);
    }
    setAuthReady(true);
  }, []);

  useEffect(() => {
    if (!currentUser || !sessionExpiresAt) return;
    const remaining = sessionExpiresAt - Date.now();
    if (remaining <= 0) {
      handleLogout();
      return;
    }
    const timer = window.setTimeout(() => handleLogout(), remaining);
    return () => window.clearTimeout(timer);
  }, [currentUser, sessionExpiresAt, handleLogout]);

  const persistSession = (
    user: User,
    remember: boolean,
    expiresAt: number
  ) => {
    const payload = JSON.stringify({ user, expiresAt });
    if (remember) {
      localStorage.setItem(STORAGE_KEY, payload);
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, payload);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const pages = useMemo(() => {
    const menuConfig = [
      {
        id: 'dashboard' as Page,
        name: 'Dashboard',
        icon: LayoutDashboard,
        roles: ['superadmin', 'admin', 'manager', 'staf'],
      },
      {
        id: 'attendance' as Page,
        name: 'Absen',
        icon: QrCode,
        roles: ['admin', 'staf'],
      },
      {
        id: 'cashier' as Page,
        name: 'Kasir',
        icon: ShoppingCart,
        roles: ['superadmin', 'admin', 'manager', 'staf'],
      },
      {
        id: 'transactions' as Page,
        name: 'Transaksi',
        icon: FileText,
        roles: ['superadmin', 'admin', 'manager', 'staf'],
      },
      {
        id: 'discounts' as Page,
        name: 'Diskon',
        icon: BadgePercent,
        roles: ['superadmin', 'admin', 'manager'],
      },
      {
        id: 'categories' as Page,
        name: 'Kategori',
        icon: Tags,
        roles: ['superadmin', 'admin', 'manager'],
      },
      {
        id: 'products' as Page,
        name: 'Produk',
        icon: Package,
        roles: ['superadmin', 'admin', 'manager'],
      },
      {
        id: 'reports' as Page,
        name: 'Laporan',
        icon: BarChart3,
        roles: ['superadmin', 'manager'],
      },
      {
        id: 'attendance-report' as Page,
        name: 'Laporan Absensi',
        icon: ClipboardList,
        roles: ['superadmin', 'manager'],
      },
      {
        id: 'profile' as Page,
        name: 'Profil',
        icon: UserCircle,
        roles: ['superadmin', 'admin', 'manager', 'staf'],
      },
      {
        id: 'users' as Page,
        name: 'User Management',
        icon: Users,
        roles: ['superadmin'],
      },
    ];

    const role =
      currentUser?.role === 'manajer' ? 'manager' : currentUser?.role;
    return role
      ? menuConfig.filter((item) => item.roles.includes(role))
      : [];
  }, [currentUser]);

  const handleNavigation = (page: Page) => {
    setCurrentPage(page);
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
    setIsProfileMenuOpen(false);
  };

  const handleLogin = (user: User, remember: boolean) => {
    const expiresAt =
      Date.now() + (remember ? REMEMBER_DURATION : SESSION_DURATION);
    setCurrentUser(user);
    setCurrentPage('dashboard');
    setRememberSession(remember);
    setSessionExpiresAt(expiresAt);
    setIsProfileMenuOpen(false);
    persistSession(user, remember, expiresAt);
  };

  const handleProfileUpdated = (user: User) => {
    setCurrentUser(user);
    if (sessionExpiresAt) {
      persistSession(user, rememberSession, sessionExpiresAt);
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'cashier':
        if (!currentUser) return null;
        return <CashierPage user={currentUser} />;
      case 'transactions':
        if (!currentUser) return null;
        return <TransactionsPage user={currentUser} />;
      case 'discounts':
        return <DiscountsPage />;
      case 'dashboard':
        if (!currentUser) return null;
        return (
          <DashboardPage
            user={currentUser}
            onNavigate={handleNavigation}
            menuItems={pages.map((page) => ({
              id: page.id,
              name: page.name,
            }))}
          />
        );
      case 'products':
        return <ProductsPage />;
      case 'categories':
        return <CategoriesPage />;
      case 'users':
        return <UsersPage />;
      case 'reports':
        return <ReportsPage />;
      case 'attendance':
        if (!currentUser) return null;
        return <AttendancePage user={currentUser} />;
      case 'attendance-report':
        return <AttendanceReportsPage />;
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
      setCurrentPage('dashboard');
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

  if (window.location.pathname === '/absensi') {
    return <AttendanceBarcodePage />;
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
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <img
              src="/merindu-cafe.svg"
              alt="Merindu Cafe - POS"
              className="h-8 w-8"
            />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Merindu Cafe</h1>
            <p className="text-xs text-slate-500">Merindu Cafe - POS</p>
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
                <p className="text-sm text-slate-500">Merindu Cafe - POS</p>
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
