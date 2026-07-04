/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Package, 
  ShoppingCart, 
  History, 
  Send, 
  Plus, 
  Minus, 
  AlertCircle, 
  CheckCircle2, 
  LogOut, 
  Shield, 
  User as UserIcon,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Loader2,
  Truck,
  Trash2,
  Edit2,
  ChevronRight,
  ChevronLeft,
  Calendar,
  PackagePlus,
  PackageMinus,
  X,
  Lock,
  LayoutGrid,
  List as ListIcon,
  UserPlus,
  Settings,
  FileDown,
  Upload,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import * as XLSXModule from 'xlsx-js-style';
const XLSX = (XLSXModule as any).default || XLSXModule;
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  getDoc,
  setDoc,
  getDocFromServer,
  where,
  getDocs
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from './firebase';

import { parseUserRequest } from './services/gemini';
import { 
  User, 
  InventoryItem, 
  Transaction, 
  Order, 
  AIAction, 
  UserRole 
} from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Initial Mock Data
const INITIAL_ITEMS: InventoryItem[] = [];

export default function App() {
  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginData, setLoginData] = useState({ username: '', password: '' });

  // App State
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // UI State
  const [activeTab, setActiveTab] = useState<'inventory' | 'transactions' | 'orders' | 'reports' | 'users' | 'settings'>('inventory');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [command, setCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'available' | 'low' | 'critical'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [reportsPage, setReportsPage] = useState(1);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [ordersPage, setOrdersPage] = useState(1);
  const ITEMS_PER_PAGE = 100;
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [isAddOrderModalOpen, setIsAddOrderModalOpen] = useState(false);
  const [adjustModal, setAdjustModal] = useState<{ isOpen: boolean, item: InventoryItem | null, type: 'receive' | 'withdraw' | 'return' }>({ 
    isOpen: false, 
    item: null, 
    type: 'receive' 
  });
  const [historyModal, setHistoryModal] = useState<{ isOpen: boolean, item: InventoryItem | null }>({ isOpen: false, item: null });
  const [adjustQuantity, setAdjustQuantity] = useState(1);
  const [newItemData, setNewItemData] = useState({ name: '', quantity: 0, unit: 'قطعة', lowThreshold: 10, criticalThreshold: 5 });
  const [thresholdModal, setThresholdModal] = useState<{ isOpen: boolean, item: InventoryItem | null }>({ isOpen: false, item: null });
  const [thresholdValues, setThresholdValues] = useState({ low: 10, critical: 5 });
  const [newOrderData, setNewOrderData] = useState({ item: '', quantity: 1 });
  const [deleteOrderModal, setDeleteOrderModal] = useState<{ isOpen: boolean, order: Order | null }>({ isOpen: false, order: null });
  const [editOrderModal, setEditOrderModal] = useState<{ isOpen: boolean, order: Order | null }>({ isOpen: false, order: null });
  const [editOrderQuantity, setEditOrderQuantity] = useState<number>(1);

  // Excel Import States
  const [isImportExcelModalOpen, setIsImportExcelModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreviewItems, setImportPreviewItems] = useState<{
    name: string;
    quantity: number;
    unit: string;
    oldQuantity: number | null;
    isNew: boolean;
  }[]>([]);

  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUserData, setNewUserData] = useState({ username: '', password: '', name: '', email: '', role: 'user' as UserRole });
  const [editUserData, setEditUserData] = useState({ username: '', password: '', name: '', email: '', role: 'user' as UserRole });

  // Password visibility states
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showAddUserPassword, setShowAddUserPassword] = useState(false);
  const [showEditUserPassword, setShowEditUserPassword] = useState(false);

  const [reportStartDate, setReportStartDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [reportEndDate, setReportEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  // Persistence & Firebase Sync
  useEffect(() => {
    const checkInitialAdmin = async () => {
      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', 'ashraf'));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          // Create initial admin with correct requested password
          await addDoc(usersRef, {
            username: 'ashraf',
            password: 'ashrafbadawy',
            name: 'Ashraf',
            email: 'AshrafBadawy33@gmail.com',
            role: 'admin'
          });
          console.log("Initial admin 'ashraf' created with password 'ashrafbadawy'.");
        } else {
          // If already exists but has old password "11111", update it to "ashrafbadawy" in Firestore
          const adminDoc = querySnapshot.docs[0];
          const adminData = adminDoc.data();
          if (adminData.password === '11111') {
            await updateDoc(doc(db, 'users', adminDoc.id), {
              password: 'ashrafbadawy'
            });
            console.log("Admin 'ashraf' password updated from '11111' to 'ashrafbadawy'.");
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'users');
      }
    };
    checkInitialAdmin();

    const savedUserId = sessionStorage.getItem('inventory_user_id');
    if (savedUserId) {
      const fetchUser = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', savedUserId));
          if (userDoc.exists()) {
            const userData = { ...userDoc.data(), id: userDoc.id } as User;
            setCurrentUser(userData);
            localStorage.setItem('inventory_cached_user', JSON.stringify(userData));
          } else {
            sessionStorage.removeItem('inventory_user_id');
            localStorage.removeItem('inventory_cached_user');
          }
        } catch (error) {
          console.error("Error fetching user:", error);
          // Try offline fallback
          const cachedUserStr = localStorage.getItem('inventory_cached_user');
          if (cachedUserStr) {
            try {
              const cachedUser = JSON.parse(cachedUserStr) as User;
              if (cachedUser.id === savedUserId) {
                setCurrentUser(cachedUser);
                setFeedback({ type: 'info', message: 'تم تشغيل النظام في الوضع غير المتصل (Offline Mode)' });
              }
            } catch (e) {
              console.error("Failed to parse cached user:", e);
            }
          }
        } finally {
          setIsAuthReady(true);
        }
      };
      fetchUser();
    } else {
      setIsAuthReady(true);
    }
  }, []);

  // Auto Logout after 5 minutes of inactivity
  useEffect(() => {
    if (!currentUser) return;

    let inactivityTimer: NodeJS.Timeout;

    const logoutSilently = () => {
      setCurrentUser(null);
      sessionStorage.removeItem('inventory_user_id');
      setActiveTab('inventory');
    };

    const resetTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(logoutSilently, 5 * 60 * 1000); // 5 minutes
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    resetTimer();

    return () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setItems([]);
      setTransactions([]);
      setOrders([]);
      setUsers([]);
      return;
    }

    const userPath = 'users/admin-1';

    const unsubItems = onSnapshot(collection(db, userPath, 'items'), (snapshot) => {
      const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setItems(itemsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `${userPath}/items`));

    const unsubTransactions = onSnapshot(query(collection(db, userPath, 'transactions'), orderBy('date', 'desc')), (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `${userPath}/transactions`));

    const unsubOrders = onSnapshot(query(collection(db, userPath, 'orders'), orderBy('order_date', 'desc')), (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `${userPath}/orders`));

    // Only admin can see all users (for management)
    let unsubUsers = () => {};
    if (currentUser.role === 'admin') {
      unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));
    }

    return () => {
      unsubItems();
      unsubTransactions();
      unsubOrders();
      unsubUsers();
    };
  }, [currentUser]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
    setReportsPage(1);
    setTransactionsPage(1);
    setOrdersPage(1);
  }, [activeTab]);

  // Command Processing
  const handleCommand = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!command.trim() || !currentUser) return;

    setIsProcessing(true);
    setFeedback(null);

    try {
      const action = await parseUserRequest(command, currentUser.role);
      await executeAction(action);
      setCommand('');
    } catch (error) {
      console.error("Command error:", error);
      setFeedback({ type: 'error', message: 'حدث خطأ أثناء معالجة الطلب.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const executeAction = async (action: AIAction) => {
    if (!currentUser) return;
    const userPath = 'users/admin-1';

    if (action.action === 'unauthorized') {
      setFeedback({ type: 'error', message: 'عذراً، ليس لديك الصلاحية للقيام بهذه العملية.' });
      return;
    }

    switch (action.action) {
      case 'add_item':
        if (action.name) {
          const newItem: Omit<InventoryItem, 'id'> = {
            name: action.name,
            quantity: action.quantity || 0,
            unit: action.unit || 'قطعة',
            lowThreshold: 10,
            criticalThreshold: 5
          };
          try {
            const docRef = await addDoc(collection(db, userPath, 'items'), newItem);
            
            // Create initial transaction
            if (newItem.quantity > 0) {
              await addDoc(collection(db, userPath, 'transactions'), {
                itemId: docRef.id,
                itemName: newItem.name,
                quantity: newItem.quantity,
                user: currentUser.name,
                date: new Date().toISOString(),
                type: 'receive'
              });
            }

            setFeedback({ type: 'success', message: `تم إضافة الصنف: ${action.name}` });
            setActiveTab('inventory');
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, `${userPath}/items`);
          }
        }
        break;

      case 'withdraw':
        if (action.item && action.quantity) {
          const item = items.find(i => i.name.includes(action.item!) || action.item!.includes(i.name));
          if (item) {
            if (item.quantity >= action.quantity) {
              try {
                const newQuantity = item.quantity - action.quantity!;
                await updateDoc(doc(db, userPath, 'items', item.id), { quantity: newQuantity });
                const newTransaction: Omit<Transaction, 'id'> = {
                  itemId: item.id,
                  itemName: item.name,
                  quantity: action.quantity,
                  user: currentUser.name || 'مستخدم',
                  date: action.date || format(new Date(), 'yyyy-MM-dd'),
                  type: 'withdraw'
                };
                await addDoc(collection(db, userPath, 'transactions'), newTransaction);
                
                let feedbackMessage = `تم سحب ${action.quantity} ${item.unit} من ${item.name}`;
                let feedbackType: 'success' | 'error' | 'info' = 'success';
                
                if (newQuantity <= item.criticalThreshold) {
                  feedbackMessage += ` - تنبيه: المخزون حرج جداً (${newQuantity})`;
                  feedbackType = 'error';
                } else if (newQuantity <= item.lowThreshold) {
                  feedbackMessage += ` - تنبيه: المخزون منخفض (${newQuantity})`;
                  feedbackType = 'info';
                }
                
                setFeedback({ type: feedbackType, message: feedbackMessage });
                setActiveTab('transactions');
              } catch (error) {
                handleFirestoreError(error, OperationType.WRITE, `${userPath}/items/transactions`);
              }
            } else {
              setFeedback({ type: 'error', message: `المخزون غير كافٍ. المتوفر: ${item.quantity}` });
            }
          } else {
            setFeedback({ type: 'error', message: `الصنف "${action.item}" غير موجود.` });
          }
        }
        break;

      case 'return_item':
        if (action.item && action.quantity) {
          const item = items.find(i => i.name.includes(action.item!) || action.item!.includes(i.name));
          if (item) {
            try {
              const newQuantity = item.quantity + action.quantity!;
              await updateDoc(doc(db, userPath, 'items', item.id), { quantity: newQuantity });
              const newTransaction: Omit<Transaction, 'id'> = {
                itemId: item.id,
                itemName: item.name,
                quantity: action.quantity,
                user: currentUser.name || 'مستخدم',
                date: action.date || format(new Date(), 'yyyy-MM-dd'),
                type: 'return'
              };
              await addDoc(collection(db, userPath, 'transactions'), newTransaction);
              setFeedback({ type: 'success', message: `تم إرجاع ${action.quantity} ${item.unit} إلى ${item.name}` });
              setActiveTab('transactions');
            } catch (error) {
              handleFirestoreError(error, OperationType.WRITE, `${userPath}/items/transactions`);
            }
          } else {
            setFeedback({ type: 'error', message: `الصنف "${action.item}" غير موجود.` });
          }
        }
        break;

      case 'create_order':
        if (action.item && action.quantity) {
          const newOrder: Omit<Order, 'id'> = {
            item: action.item,
            quantity: action.quantity,
            order_date: action.order_date || format(new Date(), 'yyyy-MM-dd'),
            delivery_date: null,
            status: 'pending'
          };
          try {
            await addDoc(collection(db, userPath, 'orders'), newOrder);
            setFeedback({ type: 'success', message: `تم إنشاء طلبية لـ ${action.quantity} من ${action.item}` });
            setActiveTab('orders');
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, `${userPath}/orders`);
          }
        }
        break;

      case 'receive_order':
        if (action.item && action.quantity) {
          const item = items.find(i => i.name.includes(action.item!) || action.item!.includes(i.name));
          if (item) {
            try {
              await updateDoc(doc(db, userPath, 'items', item.id), { quantity: item.quantity + action.quantity! });
              const newTransaction: Omit<Transaction, 'id'> = {
                itemId: item.id,
                itemName: item.name,
                quantity: action.quantity,
                user: currentUser.name,
                date: action.date || format(new Date(), 'yyyy-MM-dd'),
                type: 'receive'
              };
              await addDoc(collection(db, userPath, 'transactions'), newTransaction);
              setFeedback({ type: 'success', message: `تم استلام ${action.quantity} من ${item.name}` });
              setActiveTab('inventory');
            } catch (error) {
              handleFirestoreError(error, OperationType.WRITE, `${userPath}/items/transactions`);
            }
          } else {
            const newItem: Omit<InventoryItem, 'id'> = {
              name: action.item,
              quantity: action.quantity,
              unit: 'قطعة',
              lowThreshold: 10,
              criticalThreshold: 5
            };
            try {
              await addDoc(collection(db, userPath, 'items'), newItem);
              setFeedback({ type: 'success', message: `تم إضافة واستلام صنف جديد: ${action.item}` });
              setActiveTab('inventory');
            } catch (error) {
              handleFirestoreError(error, OperationType.CREATE, `${userPath}/items`);
            }
          }
        }
        break;

      case 'check_stock':
        if (action.item) {
          const item = items.find(i => i.name.includes(action.item!) || action.item!.includes(i.name));
          if (item) {
            setFeedback({ type: 'info', message: `المخزون الحالي لـ ${item.name} هو ${item.quantity} ${item.unit}` });
            setSearchQuery(item.name);
            setActiveTab('inventory');
          } else {
            setFeedback({ type: 'error', message: `الصنف "${action.item}" غير موجود.` });
          }
        }
        break;

      case 'report':
        setActiveTab('reports');
        setFeedback({ type: 'info', message: 'تم فتح صفحة التقارير.' });
        break;

      default:
        setFeedback({ type: 'error', message: 'لم أفهم هذا الطلب جيداً.' });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    const enteredUsername = loginData.username.trim();
    const enteredPassword = loginData.password.trim();

    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', enteredUsername));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        setLoginError('اسم المستخدم غير موجود');
        setIsLoggingIn(false);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data() as User;

      if (userData.password.trim() === enteredPassword) {
        const userWithId = { ...userData, id: userDoc.id };
        setCurrentUser(userWithId);
        sessionStorage.setItem('inventory_user_id', userDoc.id);
        localStorage.setItem('inventory_cached_user', JSON.stringify(userWithId));
        setFeedback({ type: 'success', message: 'تم تسجيل الدخول بنجاح' });
      } else {
        setLoginError('كلمة المرور غير صحيحة');
      }
    } catch (error) {
      console.error("Login error:", error);
      // Offline fallback login check
      const cachedUserStr = localStorage.getItem('inventory_cached_user');
      if (cachedUserStr) {
        try {
          const cachedUser = JSON.parse(cachedUserStr) as User;
          if (cachedUser.username.trim().toLowerCase() === enteredUsername.toLowerCase() && cachedUser.password.trim() === enteredPassword) {
            setCurrentUser(cachedUser);
            sessionStorage.setItem('inventory_user_id', cachedUser.id);
            setFeedback({ type: 'info', message: 'تم تسجيل الدخول في الوضع غير المتصل (Offline Mode)' });
            setIsLoggingIn(false);
            return;
          }
        } catch (e) {
          console.error("Error checking offline cached login:", e);
        }
      }

      handleFirestoreError(error, OperationType.GET, 'users');
      setLoginError('تعذر الاتصال بالخادم. تأكد من اتصال الإنترنت وحاول مجدداً.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem('inventory_user_id');
    localStorage.removeItem('inventory_cached_user');
    setFeedback({ type: 'info', message: 'تم تسجيل الخروج بنجاح' });
    setActiveTab('inventory');
  };

  const exportMovementsToExcel = (fileName: string) => {
    const parseDate = (dStr: string) => {
      if (!dStr) return new Date(0);
      const d = new Date(dStr);
      return isNaN(d.getTime()) ? new Date(0) : d;
    };

    const formatMovementDate = (dStr: string) => {
      if (!dStr) return '';
      if (dStr.includes('T')) {
        try {
          return format(new Date(dStr), 'yyyy-MM-dd HH:mm:ss');
        } catch {
          return dStr;
        }
      }
      return dStr;
    };

    const aoa: any[][] = [];
    interface ExcelRowMetadata {
      type: 'header' | 'receive_tx' | 'withdraw_tx' | 'return_tx' | 'order' | 'pre_order_stock' | 'post_order_stock' | 'summary' | 'empty';
      itemName?: string;
    }
    const metadata: ExcelRowMetadata[] = [];

    // 1. Add Sheet Header
    aoa.push(["اسم الصنف", "التاريخ والوقت", "نوع الحركة", "الوارد (+)", "المنصرف (-)", "رصيد المخزن", "المستخدم", "ملاحظات / حالة الحركة"]);
    metadata.push({ type: 'header' });

    // 2. Iterate through each item to generate its separate section
    items.forEach(item => {
      // Find transactions of this item
      const itemTransactions = transactions.filter(t => {
        const matchesName = t.itemName && t.itemName.trim() === item.name.trim();
        const matchesId = t.itemId === item.id;
        return matchesName || matchesId;
      });

      // Find orders of this item
      const itemOrders = orders.filter(o => o.item && o.item.trim() === item.name.trim());

      // Smart Matching to prevent double counting:
      // We match delivered orders with their corresponding 'receive' transactions.
      const matchedTxIds = new Set<string>();
      const matchedOrderIds = new Set<string>();
      const orderTxPairs: { order: Order; tx: Transaction }[] = [];

      const deliveredOrders = itemOrders.filter(o => o.status === 'delivered');
      const receiveTransactions = itemTransactions.filter(t => t.type === 'receive');

      deliveredOrders.forEach(o => {
        // Find an unmatched 'receive' transaction of the same quantity and close delivery date
        const match = receiveTransactions.find(t => 
          !matchedTxIds.has(t.id) &&
          t.quantity === o.quantity &&
          (
            t.date.startsWith(o.delivery_date || '') || 
            (o.delivery_date && o.delivery_date.startsWith(t.date)) ||
            Math.abs(parseDate(t.date).getTime() - parseDate(o.delivery_date || '').getTime()) <= 24 * 60 * 60 * 1000
          )
        );

        if (match) {
          matchedTxIds.add(match.id);
          matchedOrderIds.add(o.id);
          orderTxPairs.push({ order: o, tx: match });
        }
      });

      // Define our unified movement interface
      interface UnifiedMovement {
        itemName: string;
        dateStr: string;
        dateObj: Date;
        type: string;
        incoming: number;
        outgoing: number;
        isPhysical: boolean;
        user: string;
        notes: string;
        rowType: 'receive_tx' | 'withdraw_tx' | 'return_tx' | 'order';
      }

      const movements: UnifiedMovement[] = [];

      // Add normal (unmatched) transactions
      itemTransactions.forEach(t => {
        if (matchedTxIds.has(t.id)) return; // Skip because it is represented as a delivered order

        movements.push({
          itemName: item.name,
          dateStr: formatMovementDate(t.date),
          dateObj: parseDate(t.date),
          type: t.type === 'receive' ? 'إيداع مخزون' : t.type === 'withdraw' ? 'سحب مخزون' : 'مرتجع صنف',
          incoming: t.type === 'receive' || t.type === 'return' ? t.quantity : 0,
          outgoing: t.type === 'withdraw' ? t.quantity : 0,
          isPhysical: true,
          user: t.user || 'غير محدد',
          notes: t.type === 'receive' ? 'إضافة إلى الرفوف' : t.type === 'withdraw' ? 'صرف من المستودع' : 'إرجاع إلى الرفوف',
          rowType: t.type === 'receive' ? 'receive_tx' : t.type === 'withdraw' ? 'withdraw_tx' : 'return_tx'
        });
      });

      // Add matched delivered orders (unified representation)
      orderTxPairs.forEach(pair => {
        movements.push({
          itemName: item.name,
          dateStr: formatMovementDate(pair.order.delivery_date || pair.order.order_date),
          dateObj: parseDate(pair.order.delivery_date || pair.order.order_date),
          type: 'استلام طلبية (تم التوصيل)',
          incoming: pair.order.quantity,
          outgoing: 0,
          isPhysical: true,
          user: pair.tx.user || 'إضافة طلبية',
          notes: `طلبية تم طلبها بتاريخ ${pair.order.order_date} وتم استلامها وإضافتها للمستودع`,
          rowType: 'order'
        });
      });

      // Add other unmatched orders (pending, cancelled, or unmatched delivered)
      itemOrders.forEach(o => {
        if (matchedOrderIds.has(o.id)) return; // Already unified and handled

        if (o.status === 'pending') {
          movements.push({
            itemName: item.name,
            dateStr: formatMovementDate(o.order_date),
            dateObj: parseDate(o.order_date),
            type: 'طلب شحنة جديدة (طلبية قيد الانتظار)',
            incoming: 0,
            outgoing: 0,
            isPhysical: false,
            user: 'إضافة طلبية',
            notes: 'طلبية معلقة وبانتظار الاستلام',
            rowType: 'order'
          });
        } else if (o.status === 'delivered') {
          // If delivered but unmatched with a transaction, keep it as delivered
          movements.push({
            itemName: item.name,
            dateStr: formatMovementDate(o.delivery_date || o.order_date),
            dateObj: parseDate(o.delivery_date || o.order_date),
            type: 'استلام طلبية (تم التوصيل)',
            incoming: o.quantity,
            outgoing: 0,
            isPhysical: true,
            user: 'إضافة طلبية',
            notes: `طلبية تم طلبها بتاريخ ${o.order_date} وتم استلامها`,
            rowType: 'order'
          });
        } else {
          movements.push({
            itemName: item.name,
            dateStr: formatMovementDate(o.order_date),
            dateObj: parseDate(o.order_date),
            type: 'طلبية ملغاة / غير مستلمة',
            incoming: 0,
            outgoing: 0,
            isPhysical: false,
            user: 'إضافة طلبية',
            notes: 'طلبية ملغاة',
            rowType: 'order'
          });
        }
      });

      // Sort all movements chronologically (from oldest to newest)
      const sortedMovements = movements.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

      // Current stock is item.quantity
      const currentStock = item.quantity;

      // Work backwards to find initialStock (Opening Balance)
      let netChange = 0;
      sortedMovements.forEach(m => {
        if (m.isPhysical) {
          netChange += (m.incoming - m.outgoing);
        }
      });

      let initialStock = currentStock - netChange;
      if (initialStock < 0) {
        initialStock = 0;
      }

      // We track running physical stock to represent history accurately
      let runningStock = initialStock;

      // Add Opening Balance Row (رصيد أول المدة) if there is any movement history
      if (sortedMovements.length > 0) {
        aoa.push([
          item.name,
          sortedMovements[0].dateStr,
          "رصيد أول المدة (الرصيد الافتتاحي)",
          "",
          "",
          initialStock,
          "النظام",
          "الرصيد الافتتاحي في بداية الحركات"
        ]);
        metadata.push({
          type: 'pre_order_stock',
          itemName: item.name
        });
      }

      // 3. Add movement rows to aoa
      sortedMovements.forEach(m => {
        const isOrder = m.rowType === 'order' && m.isPhysical && m.incoming > 0;

        if (isOrder) {
          // Add row BEFORE order showing the stock level before the order was received
          aoa.push([
            item.name,
            m.dateStr,
            "إجمالي الكمية الموجودة بالمخزن قبل الطلبية مباشرة",
            "",
            "",
            runningStock,
            "النظام",
            "رصيد المخزن المحتسب قبل التوريد مباشرة"
          ]);
          metadata.push({
            type: 'pre_order_stock',
            itemName: item.name
          });
        }

        if (m.isPhysical) {
          runningStock += (m.incoming - m.outgoing);
        }

        aoa.push([
          m.itemName,
          m.dateStr,
          m.type,
          m.incoming > 0 ? m.incoming : "",
          m.outgoing > 0 ? m.outgoing : "",
          runningStock,
          m.user,
          m.notes
        ]);
        metadata.push({ 
          type: m.rowType, 
          itemName: item.name 
        });

        if (isOrder) {
          // Add row AFTER order showing the stock level after the order was received
          aoa.push([
            item.name,
            m.dateStr,
            "مجموع المخزن بعد استلام الطلبية مباشرة",
            "",
            "",
            runningStock,
            "النظام",
            "رصيد المخزن المحتسب بعد توريد الكمية"
          ]);
          metadata.push({
            type: 'post_order_stock',
            itemName: item.name
          });
        }
      });

      // 4. Add Summary Row showing current stock
      aoa.push([
        item.name,
        "",
        "إجمالي الرصيد الحالي بالمخزن",
        "",
        "",
        item.quantity,
        "",
        "مخزون متوفر حالياً بالمستودع"
      ]);
      metadata.push({ 
        type: 'summary', 
        itemName: item.name 
      });

      // 5. Add an empty separator row
      aoa.push(["", "", "", "", "", "", "", ""]);
      metadata.push({ type: 'empty' });
    });

    // Create Worksheet
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Set column widths for 8 columns
    ws['!cols'] = [
      { wch: 20 }, // اسم الصنف
      { wch: 20 }, // التاريخ والوقت
      { wch: 25 }, // نوع الحركة
      { wch: 12 }, // الوارد (+)
      { wch: 12 }, // المنصرف (-)
      { wch: 15 }, // رصيد المخزن
      { wch: 15 }, // المستخدم
      { wch: 35 }  // ملاحظات / حالة الحركة
    ];

    // Apply styles to each cell based on metadata
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const rowMeta = metadata[R];
      if (!rowMeta) continue;

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell_ref = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cell_ref];
        if (!cell) continue;

        // Base styles
        cell.s = {
          font: { name: "Calibri", sz: 11 },
          alignment: { vertical: "center", horizontal: "center", wrapText: true },
          border: {
            top: { style: "thin", color: { rgb: "CBD5E1" } },
            bottom: { style: "thin", color: { rgb: "CBD5E1" } },
            left: { style: "thin", color: { rgb: "CBD5E1" } },
            right: { style: "thin", color: { rgb: "CBD5E1" } }
          }
        };

        if (rowMeta.type === 'header') {
          cell.s.fill = { fgColor: { rgb: "1E293B" } }; // Deep Slate
          cell.s.font = { name: "Calibri", sz: 12, bold: true, color: { rgb: "FFFFFF" } };
        } else if (rowMeta.type === 'order') {
          // Soft Yellow/Amber for Orders
          cell.s.fill = { fgColor: { rgb: "FEF3C7" } }; 
          cell.s.font = { name: "Calibri", sz: 11, bold: true, color: { rgb: "92400E" } };
        } else if (rowMeta.type === 'pre_order_stock') {
          // Soft Orange/Peach for Stock before Orders
          cell.s.fill = { fgColor: { rgb: "FFEDD5" } }; 
          cell.s.font = { name: "Calibri", sz: 11, bold: true, color: { rgb: "9A3412" } };
        } else if (rowMeta.type === 'post_order_stock') {
          // Soft Indigo/Blue for Stock after Orders
          cell.s.fill = { fgColor: { rgb: "E0E7FF" } }; 
          cell.s.font = { name: "Calibri", sz: 11, bold: true, color: { rgb: "3730A3" } };
        } else if (rowMeta.type === 'receive_tx' || rowMeta.type === 'return_tx') {
          // Distinct Soft Green/Mint for Received/Returned Quantities
          cell.s.fill = { fgColor: { rgb: "DCFCE7" } }; 
          cell.s.font = { name: "Calibri", sz: 11, bold: true, color: { rgb: "15803D" } };
        } else if (rowMeta.type === 'summary') {
          // Soft Green/Emerald for Current Stock Balance
          cell.s.fill = { fgColor: { rgb: "D1FAE5" } }; 
          cell.s.font = { name: "Calibri", sz: 11, bold: true, color: { rgb: "065F46" } };
        } else if (rowMeta.type === 'empty') {
          cell.s = {
            border: {} // Clean empty row
          };
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقرير الحركات والمخزون");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = newUserData.username.trim();
    const cleanPassword = newUserData.password.trim();
    const cleanName = newUserData.name.trim();
    const cleanEmail = newUserData.email.trim();

    if (!cleanUsername || !cleanPassword || !cleanName) return;

    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', cleanUsername));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        setFeedback({ type: 'error', message: 'اسم المستخدم موجود بالفعل' });
        return;
      }

      await addDoc(usersRef, {
        username: cleanUsername,
        password: cleanPassword,
        name: cleanName,
        email: cleanEmail,
        role: newUserData.role
      });
      setFeedback({ type: 'success', message: `تم إضافة المستخدم ${cleanName} بنجاح` });
      setIsAddUserModalOpen(false);
      setNewUserData({ username: '', password: '', name: '', email: '', role: 'user' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = editUserData.username.trim();
    const cleanPassword = editUserData.password.trim();
    const cleanName = editUserData.name.trim();
    const cleanEmail = editUserData.email.trim();

    if (!editingUser || !cleanUsername || !cleanPassword || !cleanName) return;

    try {
      const userRef = doc(db, 'users', editingUser.id);
      const updatedData = {
        username: cleanUsername,
        password: cleanPassword,
        name: cleanName,
        email: cleanEmail,
        role: editUserData.role
      };
      await updateDoc(userRef, updatedData);
      
      // If editing self, update local state
      if (editingUser.id === currentUser?.id) {
        setCurrentUser({ ...currentUser, ...updatedData });
      }

      setFeedback({ type: 'success', message: `تم تحديث بيانات ${cleanName} بنجاح` });
      setIsEditUserModalOpen(false);
      setEditingUser(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${editingUser.id}`);
    }
  };

  const openEditUserModal = (user: User) => {
    setEditingUser(user);
    setEditUserData({
      username: user.username,
      password: user.password,
      name: user.name,
      email: user.email || '',
      role: user.role
    });
    setIsEditUserModalOpen(true);
  };

  const handleDeleteUser = async (id: string) => {
    if (id === currentUser?.id) {
      setFeedback({ type: 'error', message: 'لا يمكنك حذف حسابك الحالي' });
      return;
    }
    try {
      await deleteDoc(doc(db, 'users', id));
      setFeedback({ type: 'success', message: 'تم حذف المستخدم بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'users');
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!currentUser || currentUser.role !== 'admin') {
      setFeedback({ type: 'error', message: 'فقط المدير يمكنه مسح الأصناف' });
      return;
    }
    const userPath = 'users/admin-1';
    try {
      await deleteDoc(doc(db, userPath, 'items', id));
      setFeedback({ type: 'success', message: 'تم مسح الصنف بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${userPath}/items`);
    }
  };

  const handleOpenAdjustModal = (item: InventoryItem, type: 'receive' | 'withdraw' | 'return') => {
    setAdjustModal({ isOpen: true, item, type });
    setAdjustQuantity(1);
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModal.item || adjustQuantity <= 0 || !currentUser) return;

    const userPath = 'users/admin-1';
    const amount = adjustModal.type === 'withdraw' ? -adjustQuantity : adjustQuantity;
    const item = adjustModal.item;

    if (amount < 0 && item.quantity + amount < 0) {
      setFeedback({ type: 'error', message: 'المخزون غير كافٍ' });
      return;
    }

    try {
      const newQuantity = item.quantity + amount;
      await updateDoc(doc(db, userPath, 'items', item.id), { quantity: newQuantity });
      
      const newTransaction: Omit<Transaction, 'id'> = {
        itemId: item.id,
        itemName: item.name,
        quantity: Math.abs(amount),
        user: currentUser.name || 'مستخدم',
        date: format(new Date(), 'yyyy-MM-dd'),
        type: adjustModal.type
      };
      await addDoc(collection(db, userPath, 'transactions'), newTransaction);
      
      let feedbackMessage = `تم ${adjustModal.type === 'receive' ? 'إضافة' : adjustModal.type === 'withdraw' ? 'سحب' : 'إرجاع'} ${Math.abs(amount)} ${item.unit}`;
      let feedbackType: 'success' | 'error' | 'info' = 'success';
      
      if (amount < 0) {
        if (newQuantity <= item.criticalThreshold) {
          feedbackMessage += ` - تنبيه: المخزون حرج جداً (${newQuantity})`;
          feedbackType = 'error';
        } else if (newQuantity <= item.lowThreshold) {
          feedbackMessage += ` - تنبيه: المخزون منخفض (${newQuantity})`;
          feedbackType = 'info';
        }
      }
      
      setFeedback({ type: feedbackType, message: feedbackMessage });
      setAdjustModal({ isOpen: false, item: null, type: 'receive' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${userPath}/items/transactions`);
    }
  };

  const handleQuickAdjust = (itemId: string, amount: number) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    handleOpenAdjustModal(item, amount > 0 ? 'receive' : 'withdraw');
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const bstr = event.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData = XLSX.utils.sheet_to_json(ws);

        if (!rawData || rawData.length === 0) {
          setFeedback({ type: 'error', message: 'الملف فارغ أو غير صالح.' });
          return;
        }

        const parsedItems: {
          name: string;
          quantity: number;
          unit: string;
          oldQuantity: number | null;
          isNew: boolean;
        }[] = [];

        rawData.forEach((row: any) => {
          const nameKey = Object.keys(row).find(k => 
            ['نوع الصنف', 'اسم الصنف', 'الصنف', 'الاسم', 'name', 'item', 'Item', 'Name'].includes(k.trim())
          );
          const qtyKey = Object.keys(row).find(k => 
            ['العدد النهائي', 'الكمية', 'العدد', 'الكميه', 'quantity', 'qty', 'Quantity', 'Qty'].includes(k.trim())
          );

          if (nameKey) {
            const name = String(row[nameKey]).trim();
            const quantity = qtyKey ? parseInt(row[qtyKey]) || 0 : 0;
            const unit = row['الوحدة'] || row['unit'] || 'قطعة';

            if (name) {
              const existingItem = items.find(i => i.name.toLowerCase() === name.toLowerCase());
              parsedItems.push({
                name,
                quantity: Math.max(0, quantity),
                unit,
                oldQuantity: existingItem ? existingItem.quantity : null,
                isNew: !existingItem
              });
            }
          }
        });

        if (parsedItems.length === 0) {
          setFeedback({ type: 'error', message: 'لم يتم العثور على أعمدة صالحة للاسم والكمية في الملف. تأكد من وجود عمود باسم "نوع الصنف" أو "اسم الصنف" و "العدد النهائي" أو "الكمية".' });
          return;
        }

        setImportPreviewItems(parsedItems);
        setIsImportExcelModalOpen(true);
      } catch (err) {
        console.error("Excel import error:", err);
        setFeedback({ type: 'error', message: 'حدث خطأ أثناء قراءة ملف Excel.' });
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!currentUser || importPreviewItems.length === 0) return;
    setIsImporting(true);
    const userPath = 'users/admin-1';
    let addedCount = 0;
    let updatedCount = 0;

    try {
      for (const pItem of importPreviewItems) {
        const existingItem = items.find(i => i.name.toLowerCase() === pItem.name.toLowerCase());
        
        if (existingItem) {
          if (existingItem.quantity !== pItem.quantity) {
            await updateDoc(doc(db, userPath, 'items', existingItem.id), {
              quantity: pItem.quantity
            });

            const diff = pItem.quantity - existingItem.quantity;
            await addDoc(collection(db, userPath, 'transactions'), {
              itemId: existingItem.id,
              itemName: existingItem.name,
              quantity: Math.abs(diff),
              user: currentUser.name || 'مستورد',
              date: new Date().toISOString(),
              type: diff > 0 ? 'receive' : 'withdraw'
            });
            updatedCount++;
          }
        } else {
          const newItemRef = await addDoc(collection(db, userPath, 'items'), {
            name: pItem.name,
            quantity: pItem.quantity,
            unit: pItem.unit || 'قطعة',
            lowThreshold: 10,
            criticalThreshold: 5
          });

          if (pItem.quantity > 0) {
            await addDoc(collection(db, userPath, 'transactions'), {
              itemId: newItemRef.id,
              itemName: pItem.name,
              quantity: pItem.quantity,
              user: currentUser.name || 'مستورد',
              date: new Date().toISOString(),
              type: 'receive'
            });
          }
          addedCount++;
        }
      }

      setFeedback({ 
        type: 'success', 
        message: `تم الاستيراد بنجاح! تم إضافة ${addedCount} صنف جديد وتحديث ${updatedCount} صنف موجود دون المساس بباقي البيانات.` 
      });
      setIsImportExcelModalOpen(false);
      setImportPreviewItems([]);
    } catch (error) {
      console.error("Error during import:", error);
      setFeedback({ type: 'error', message: 'حدث خطأ أثناء حفظ التعديلات في قاعدة البيانات.' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleManualAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemData.name || !currentUser) return;

    const userPath = 'users/admin-1';
    const newItem: Omit<InventoryItem, 'id'> = {
      name: newItemData.name,
      quantity: newItemData.quantity,
      unit: newItemData.unit,
      lowThreshold: newItemData.lowThreshold,
      criticalThreshold: newItemData.criticalThreshold
    };

    try {
      const docRef = await addDoc(collection(db, userPath, 'items'), newItem);
      
      // Create initial transaction
      if (newItem.quantity > 0) {
        await addDoc(collection(db, userPath, 'transactions'), {
          itemId: docRef.id,
          itemName: newItem.name,
          quantity: newItem.quantity,
          user: currentUser.name,
          date: new Date().toISOString(),
          type: 'receive'
        });
      }

      setIsAddItemModalOpen(false);
      setNewItemData({ name: '', quantity: 0, unit: 'قطعة', lowThreshold: 10, criticalThreshold: 5 });
      setFeedback({ type: 'success', message: `تم إضافة ${newItemData.name} بنجاح` });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${userPath}/items`);
    }
  };

  const handleOpenThresholdModal = (item: InventoryItem) => {
    setThresholdModal({ isOpen: true, item });
    setThresholdValues({ low: item.lowThreshold, critical: item.criticalThreshold });
  };

  const handleUpdateThresholds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thresholdModal.item || !currentUser) return;

    const userPath = 'users/admin-1';
    try {
      await updateDoc(doc(db, userPath, 'items', thresholdModal.item.id), { 
        lowThreshold: thresholdValues.low, 
        criticalThreshold: thresholdValues.critical 
      });
      setThresholdModal({ isOpen: false, item: null });
      setFeedback({ type: 'success', message: `تم تحديث حدود المخزون لـ ${thresholdModal.item.name}` });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${userPath}/items`);
    }
  };

  const handleManualAddOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderData.item || newOrderData.quantity <= 0 || !currentUser) return;

    const userPath = 'users/admin-1';
    const newOrder: Omit<Order, 'id'> = {
      item: newOrderData.item,
      quantity: newOrderData.quantity,
      order_date: format(new Date(), 'yyyy-MM-dd'),
      delivery_date: null,
      status: 'pending'
    };

    try {
      await addDoc(collection(db, userPath, 'orders'), newOrder);
      setIsAddOrderModalOpen(false);
      setNewOrderData({ item: '', quantity: 1 });
      setFeedback({ type: 'success', message: `تم إنشاء طلبية لـ ${newOrderData.quantity} من ${newOrderData.item}` });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${userPath}/orders`);
    }
  };

  const handleReceiveOrder = async (order: Order) => {
    if (!currentUser || currentUser.role !== 'admin') {
      setFeedback({ type: 'error', message: 'فقط المدير يمكنه استلام الطلبيات' });
      return;
    }

    const userPath = 'users/admin-1';
    try {
      const item = items.find(i => i.name === order.item);
      if (item) {
        await updateDoc(doc(db, userPath, 'items', item.id), { quantity: item.quantity + order.quantity });
        
        const newTransaction: Omit<Transaction, 'id'> = {
          itemId: item.id,
          itemName: item.name,
          quantity: order.quantity,
          user: currentUser.name,
          date: format(new Date(), 'yyyy-MM-dd'),
          type: 'receive'
        };
        await addDoc(collection(db, userPath, 'transactions'), newTransaction);
      } else {
        const newItem: Omit<InventoryItem, 'id'> = {
          name: order.item,
          quantity: order.quantity,
          unit: 'قطعة',
          lowThreshold: 10,
          criticalThreshold: 5
        };
        await addDoc(collection(db, userPath, 'items'), newItem);
      }

      await updateDoc(doc(db, userPath, 'orders', order.id), { 
        status: 'delivered', 
        delivery_date: format(new Date(), 'yyyy-MM-dd') 
      });
      setFeedback({ type: 'success', message: `تم استلام الطلبية وإضافتها للمخزون: ${order.item}` });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${userPath}/items/orders/transactions`);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!currentUser || currentUser.role !== 'admin') {
      setFeedback({ type: 'error', message: 'فقط المدير يمكنه إلغاء أو حذف الطلبيات' });
      return;
    }

    const userPath = 'users/admin-1';
    try {
      await deleteDoc(doc(db, userPath, 'orders', orderId));
      setFeedback({ type: 'success', message: 'تم إلغاء وحذف الطلبية بنجاح' });
      setDeleteOrderModal({ isOpen: false, order: null });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${userPath}/orders/${orderId}`);
    }
  };

  const handleEditOrderQuantity = async (orderId: string, newQty: number) => {
    if (!currentUser || currentUser.role !== 'admin') {
      setFeedback({ type: 'error', message: 'فقط المدير يمكنه تعديل كميات الطلبيات' });
      return;
    }

    if (newQty <= 0) {
      setFeedback({ type: 'error', message: 'الكمية يجب أن تكون أكبر من صفر' });
      return;
    }

    const userPath = 'users/admin-1';
    try {
      await updateDoc(doc(db, userPath, 'orders', orderId), {
        quantity: newQty
      });
      setFeedback({ type: 'success', message: 'تم تعديل كمية الطلبية بنجاح' });
      setEditOrderModal({ isOpen: false, order: null });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${userPath}/orders/${orderId}`);
    }
  };

  const filteredItems = items.filter(i => {
    const matchesSearch = i.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = 
      stockFilter === 'all' ? true :
      stockFilter === 'available' ? i.quantity > i.lowThreshold :
      stockFilter === 'low' ? (i.quantity <= i.lowThreshold && i.quantity > i.criticalThreshold) :
      stockFilter === 'critical' ? i.quantity <= i.criticalThreshold : true;
    
    return matchesSearch && matchesFilter;
  });
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = filteredItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-4 font-sans" dir="rtl">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-200 animate-pulse">
            <Package className="text-white w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">جاري تحميل النظام...</h1>
          <p className="text-gray-500">يرجى الانتظار قليلاً</p>
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mx-auto mt-8" />
        </motion.div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4 font-sans" dir="rtl">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={loginError ? { x: [-10, 10, -10, 10, 0], opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
          transition={loginError ? { duration: 0.4 } : {}}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-gray-100"
        >
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-200">
              <Package className="text-white w-10 h-10" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Al-Mashreq Inv</h1>
            <p className="text-gray-900 text-[23px] font-bold">Hi, Ashraf</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {loginError}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 block">اسم المستخدم</label>
              <div className="relative">
                <input 
                  type="text"
                  required
                  value={loginData.username}
                  onChange={(e) => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 pr-10 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="أدخل اسم المستخدم"
                />
                <UserIcon className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 block">كلمة المرور</label>
              <div className="relative">
                <input 
                  type={showLoginPassword ? "text" : "password"}
                  required
                  value={loginData.password}
                  onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 pr-10 pl-10 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="••••••••"
                />
                <Lock className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  title={showLoginPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {showLoginPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 mt-6"
            >
              {isLoggingIn ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <LogOut className="w-5 h-5 rotate-180" />
                  <span>تسجيل الدخول</span>
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col font-sans" dir="rtl">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-100">
              <Package className="text-white w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Al-Mashreq Inv</h2>
              <p className="text-xs text-gray-500">نظام إدارة مدعوم بالذكاء الاصطناعي</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-bold text-gray-900">Hi, {currentUser.name}</span>
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider",
                currentUser.role === 'admin' ? "bg-emerald-100 text-emerald-700" : 
                currentUser.role === 'user' ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
              )}>
                {currentUser.role === 'admin' ? 'مدير' : 
                 currentUser.role === 'user' ? 'موظف' : 'مراقب'}
              </span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">
        <section className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="text-indigo-600 w-4 h-4" />
            </div>
            <h3 className="font-bold text-gray-900">مركز الأوامر الذكي</h3>
          </div>
          <form onSubmit={handleCommand} className="relative">
            <input 
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="مثلاً: 'ضيف 50 لابتوب جديد' أو 'اسحب 2 ماوس لسارة'"
              className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl py-4 pr-12 pl-16 transition-all text-gray-900 placeholder:text-gray-400"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
              <Search className="w-5 h-5" />
            </div>
            <button 
              type="submit"
              disabled={isProcessing || !command.trim()}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white p-2.5 rounded-xl transition-all shadow-lg shadow-indigo-100"
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </form>
          
          <AnimatePresence>
            {feedback && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={cn(
                  "mt-4 p-4 rounded-2xl flex items-center gap-3",
                  feedback.type === 'success' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                  feedback.type === 'error' ? "bg-red-50 text-red-700 border border-red-100" :
                  "bg-blue-50 text-blue-700 border border-blue-100"
                )}
              >
                {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> :
                 feedback.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> :
                 <BarChart3 className="w-5 h-5 shrink-0" />}
                <p className="text-sm font-medium">{feedback.message}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <div className="flex items-center gap-2 p-1 bg-gray-200/50 rounded-2xl w-fit overflow-x-auto max-w-full">
          {[
            { id: 'inventory', label: 'المخزون', icon: Package, roles: ['admin', 'user', 'observer'] },
            { id: 'transactions', label: 'الحركات', icon: History, roles: ['admin', 'observer'] },
            { id: 'orders', label: 'الطلبيات', icon: ShoppingCart, roles: ['admin', 'observer'] },
            { id: 'reports', label: 'التقارير', icon: BarChart3, roles: ['admin', 'observer'] },
            { id: 'users', label: 'المستخدمين', icon: UserIcon, roles: ['admin'] },
            { id: 'settings', label: 'الإعدادات', icon: Settings, roles: ['admin', 'user', 'observer'] },
          ].filter(tab => tab.roles.includes(currentUser?.role || 'user')).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
                activeTab === tab.id 
                  ? "bg-white text-gray-900 shadow-sm" 
                  : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
              )}
            >
              <tab.icon className={cn("w-4 h-4", activeTab === tab.id ? "text-emerald-500" : "text-gray-400")} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1">
          <AnimatePresence mode="wait">
            {activeTab === 'inventory' && (
              <motion.div 
                key="inventory"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <h3 className="text-xl font-bold text-gray-900">قائمة الأصناف</h3>
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
                      <button 
                        onClick={() => setViewMode('grid')}
                        className={cn(
                          "p-1.5 rounded-lg transition-all",
                          viewMode === 'grid' ? "bg-emerald-50 text-emerald-600" : "text-gray-400 hover:text-gray-600"
                        )}
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setViewMode('list')}
                        className={cn(
                          "p-1.5 rounded-lg transition-all",
                          viewMode === 'list' ? "bg-emerald-50 text-emerald-600" : "text-gray-400 hover:text-gray-600"
                        )}
                      >
                        <ListIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1">
                      <select 
                        value={stockFilter}
                        onChange={(e) => setStockFilter(e.target.value as any)}
                        className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer pr-8"
                      >
                        <option value="all">الكل</option>
                        <option value="available">متوفر</option>
                        <option value="low">منخفض</option>
                        <option value="critical">حرج</option>
                      </select>
                    </div>
                    <div className="relative flex-1 sm:w-64">
                      <input 
                        type="text"
                        placeholder="بحث في الأصناف..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-xl py-2 pr-10 pl-4 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    </div>
                    {currentUser.role === 'admin' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <label 
                          className="bg-sky-600 hover:bg-sky-700 text-white p-2.5 rounded-xl transition-all shadow-lg shadow-sky-100 shrink-0 cursor-pointer flex items-center justify-center"
                          title="استيراد من Excel"
                        >
                          <Upload className="w-5 h-5" />
                          <input 
                            type="file" 
                            accept=".xlsx,.xls" 
                            onChange={handleImportExcel} 
                            className="hidden" 
                          />
                        </label>
                        <button 
                          onClick={() => setIsAddItemModalOpen(true)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white p-2.5 rounded-xl transition-all shadow-lg shadow-emerald-100 shrink-0 flex items-center justify-center"
                          title="إضافة صنف جديد"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {paginatedItems.map((item) => (
                      <div key={item.id} className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition-all group">
                        <div 
                          className="flex items-start justify-between mb-4 cursor-pointer"
                          onClick={() => setHistoryModal({ isOpen: true, item })}
                        >
                          <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                            <Package className="text-gray-400 group-hover:text-emerald-500 transition-colors w-6 h-6" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-xs font-bold px-2 py-1 rounded-lg",
                              item.quantity > item.lowThreshold ? "bg-emerald-100 text-emerald-700" :
                              item.quantity > item.criticalThreshold ? "bg-orange-100 text-orange-700" :
                              "bg-red-100 text-red-700"
                            )}>
                              {item.quantity > item.lowThreshold ? 'متوفر' : item.quantity > item.criticalThreshold ? 'منخفض' : 'حرج'}
                            </span>
                            {currentUser.role === 'admin' && (
                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleOpenThresholdModal(item); }}
                                  className="p-1 text-gray-300 hover:text-indigo-500 transition-colors"
                                  title="تعديل حدود المخزون"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}
                                  className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <h4 
                          className="font-bold text-gray-900 mb-1 cursor-pointer hover:text-emerald-600 transition-colors"
                          onClick={() => setHistoryModal({ isOpen: true, item })}
                        >
                          {item.name}
                        </h4>
                        <div className="flex items-end justify-between">
                          <div>
                            <span className="text-2xl font-black text-gray-900">{item.quantity}</span>
                            <span className="text-sm text-gray-500 mr-1">{item.unit}</span>
                          </div>
                          {currentUser.role !== 'observer' && (
                            <div className="flex gap-2">
                              <button 
                                onClick={() => handleOpenAdjustModal(item, 'receive')}
                                className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="إيداع"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleOpenAdjustModal(item, 'withdraw')}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="سحب"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleOpenAdjustModal(item, 'return')}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="مرتجع"
                              >
                                <History className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-right">
                        <thead className="bg-gray-50 border-bottom border-gray-200">
                          <tr>
                            <th className="px-6 py-4 text-sm font-bold text-gray-500">الصنف</th>
                            <th className="px-6 py-4 text-sm font-bold text-gray-500">الكمية</th>
                            <th className="px-6 py-4 text-sm font-bold text-gray-500">الحالة</th>
                            <th className="px-6 py-4 text-sm font-bold text-gray-500 text-left">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {paginatedItems.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                              <td className="px-6 py-4">
                                <div 
                                  className="flex items-center gap-3 cursor-pointer group/item"
                                  onClick={() => setHistoryModal({ isOpen: true, item })}
                                >
                                  <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                                    <Package className="text-gray-400 group-hover:text-emerald-500 w-4 h-4" />
                                  </div>
                                  <span className="font-bold text-gray-900 group-hover/item:text-emerald-600 transition-colors">{item.name}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-black text-gray-900">{item.quantity}</span>
                                <span className="text-xs text-gray-500 mr-1">{item.unit}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className={cn(
                                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                  item.quantity > item.lowThreshold ? "bg-emerald-100 text-emerald-700" :
                                  item.quantity > item.criticalThreshold ? "bg-orange-100 text-orange-700" :
                                  "bg-red-100 text-red-700"
                                )}>
                                  {item.quantity > item.lowThreshold ? 'متوفر' : item.quantity > item.criticalThreshold ? 'منخفض' : 'حرج'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-left">
                                <div className="flex items-center justify-end gap-2">
                                  {currentUser.role !== 'observer' && (
                                    <>
                                      <button 
                                        onClick={() => handleOpenAdjustModal(item, 'receive')}
                                        className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                        title="إيداع"
                                      >
                                        <Plus className="w-4 h-4" />
                                      </button>
                                      <button 
                                        onClick={() => handleOpenAdjustModal(item, 'withdraw')}
                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        title="سحب"
                                      >
                                        <Minus className="w-4 h-4" />
                                      </button>
                                      <button 
                                        onClick={() => handleOpenAdjustModal(item, 'return')}
                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="مرتجع"
                                      >
                                        <History className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                  {currentUser.role === 'admin' && (
                                    <>
                                      <button 
                                        onClick={() => handleOpenThresholdModal(item)}
                                        className="p-1.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                                        title="تعديل حدود المخزون"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                      <button 
                                        onClick={() => handleDeleteItem(item.id)}
                                        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                                        title="حذف"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 order-2 sm:order-1">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="p-2 text-gray-500 hover:text-emerald-600 disabled:text-gray-300 disabled:hover:bg-transparent hover:bg-emerald-50 rounded-xl transition-all"
                        title="الصفحة السابقة"
                      >
                        <ChevronRight className="w-6 h-6" />
                      </button>
                      
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 text-gray-500 hover:text-emerald-600 disabled:text-gray-300 disabled:hover:bg-transparent hover:bg-emerald-50 rounded-xl transition-all"
                        title="الصفحة التالية"
                      >
                        <ChevronLeft className="w-6 h-6" />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-2 order-1 sm:order-2">
                      <span className="text-sm font-bold text-gray-900">صفحة {currentPage} من {totalPages}</span>
                      <span className="text-xs text-gray-400">({filteredItems.length} صنف)</span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'transactions' && (
              <motion.div 
                key="transactions"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white rounded-3xl border border-gray-200 overflow-hidden"
              >
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-900">سجل الحركات</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                        <th className="px-6 py-4 font-bold">الصنف</th>
                        <th className="px-6 py-4 font-bold">الكمية</th>
                        <th className="px-6 py-4 font-bold">النوع</th>
                        <th className="px-6 py-4 font-bold">المستخدم</th>
                        <th className="px-6 py-4 font-bold">التاريخ</th>
                        <th className="px-6 py-4 font-bold text-left">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {transactions.slice((transactionsPage - 1) * ITEMS_PER_PAGE, transactionsPage * ITEMS_PER_PAGE).map((t) => (
                        <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 font-bold text-gray-900">{t.itemName}</td>
                          <td className="px-6 py-4 text-gray-600">{t.quantity}</td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase",
                              t.type === 'receive' ? "bg-emerald-100 text-emerald-700" : 
                              t.type === 'withdraw' ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                            )}>
                              {t.type === 'receive' ? <ArrowDownRight className="w-3 h-3" /> : 
                               t.type === 'withdraw' ? <ArrowUpRight className="w-3 h-3" /> : <History className="w-3 h-3" />}
                              {t.type === 'receive' ? 'استلام' : 
                               t.type === 'withdraw' ? 'سحب' : 'مرتجع'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-600">{t.user}</td>
                          <td className="px-6 py-4 text-gray-500 text-sm">{t.date}</td>
                          <td className="px-6 py-4 text-left">
                            {t.type === 'withdraw' && currentUser.role !== 'observer' && (
                              <button
                                onClick={() => {
                                  const item = items.find(i => i.id === t.itemId);
                                  if (item) handleOpenAdjustModal(item, 'return');
                                }}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-bold"
                                title="عمل مرتجع"
                              >
                                <History className="w-3 h-3" />
                                مرتجع
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {transactions.length > ITEMS_PER_PAGE && (
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 p-6 border-t border-gray-100">
                    <div className="flex items-center gap-2 order-2 sm:order-1">
                      <button
                        onClick={() => setTransactionsPage(prev => Math.max(1, prev - 1))}
                        disabled={transactionsPage === 1}
                        className="p-2 text-gray-500 hover:text-emerald-600 disabled:text-gray-300 disabled:hover:bg-transparent hover:bg-emerald-50 rounded-xl transition-all"
                        title="الصفحة السابقة"
                      >
                        <ChevronRight className="w-6 h-6" />
                      </button>
                      
                      <button
                        onClick={() => setTransactionsPage(prev => Math.min(Math.ceil(transactions.length / ITEMS_PER_PAGE), prev + 1))}
                        disabled={transactionsPage === Math.ceil(transactions.length / ITEMS_PER_PAGE)}
                        className="p-2 text-gray-500 hover:text-emerald-600 disabled:text-gray-300 disabled:hover:bg-transparent hover:bg-emerald-50 rounded-xl transition-all"
                        title="الصفحة التالية"
                      >
                        <ChevronLeft className="w-6 h-6" />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-2 order-1 sm:order-2">
                      <span className="text-sm font-bold text-gray-900">صفحة {transactionsPage} من {Math.ceil(transactions.length / ITEMS_PER_PAGE)}</span>
                      <span className="text-xs text-gray-400">({transactions.length} حركة)</span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'orders' && (
              <motion.div 
                key="orders"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-900">طلبيات التوريد</h3>
                  {currentUser.role === 'admin' && (
                    <button 
                      onClick={() => setIsAddOrderModalOpen(true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-100 flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      إنشاء طلبية
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {orders.slice((ordersPage - 1) * ITEMS_PER_PAGE, ordersPage * ITEMS_PER_PAGE).map((order) => (
                    <div key={order.id} className="bg-white p-6 rounded-3xl border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center",
                          order.status === 'delivered' ? "bg-emerald-100 text-emerald-600" : "bg-orange-100 text-orange-600"
                        )}>
                          <Truck className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900">{order.item}</h4>
                          <p className="text-sm text-gray-500">الكمية المطلوبة: {order.quantity}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className="text-xs text-gray-400 uppercase font-bold">تاريخ الطلب</p>
                          <p className="text-sm font-bold text-gray-700">{order.order_date}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400 uppercase font-bold">الحالة</p>
                          <span className={cn(
                            "text-xs font-bold px-3 py-1 rounded-full",
                            order.status === 'delivered' ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"
                          )}>
                            {order.status === 'delivered' ? 'تم التوصيل' : 'قيد الانتظار'}
                          </span>
                        </div>
                        {currentUser.role === 'admin' && order.status === 'pending' && (
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handleReceiveOrder(order)}
                              className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-sm"
                            >
                              استلام
                            </button>
                            <button 
                              onClick={() => {
                                setEditOrderModal({ isOpen: true, order });
                                setEditOrderQuantity(order.quantity);
                              }}
                              className="bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 border border-blue-100 px-3 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5"
                              title="تعديل كمية الطلبية"
                            >
                              <Edit2 className="w-4 h-4" />
                              تعديل
                            </button>
                            <button 
                              onClick={() => setDeleteOrderModal({ isOpen: true, order })}
                              className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border border-red-100 px-3 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5"
                              title="حذف أو إلغاء الطلبية"
                            >
                              <Trash2 className="w-4 h-4" />
                              حذف
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {orders.length === 0 && (
                    <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-300">
                      <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 font-medium">لا توجد طلبيات حالياً</p>
                    </div>
                  )}
                </div>

                {orders.length > ITEMS_PER_PAGE && (
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 order-2 sm:order-1">
                      <button
                        onClick={() => setOrdersPage(prev => Math.max(1, prev - 1))}
                        disabled={ordersPage === 1}
                        className="p-2 text-gray-500 hover:text-emerald-600 disabled:text-gray-300 disabled:hover:bg-transparent hover:bg-emerald-50 rounded-xl transition-all"
                        title="الصفحة السابقة"
                      >
                        <ChevronRight className="w-6 h-6" />
                      </button>
                      
                      <button
                        onClick={() => setOrdersPage(prev => Math.min(Math.ceil(orders.length / ITEMS_PER_PAGE), prev + 1))}
                        disabled={ordersPage === Math.ceil(orders.length / ITEMS_PER_PAGE)}
                        className="p-2 text-gray-500 hover:text-emerald-600 disabled:text-gray-300 disabled:hover:bg-transparent hover:bg-emerald-50 rounded-xl transition-all"
                        title="الصفحة التالية"
                      >
                        <ChevronLeft className="w-6 h-6" />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-2 order-1 sm:order-2">
                      <span className="text-sm font-bold text-gray-900">صفحة {ordersPage} من {Math.ceil(orders.length / ITEMS_PER_PAGE)}</span>
                      <span className="text-xs text-gray-400">({orders.length} طلبية)</span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'reports' && (
              <motion.div 
                key="reports"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                {/* Report Controls */}
                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-400 font-bold mr-2">من تاريخ</label>
                      <input 
                        type="date" 
                        value={reportStartDate}
                        onChange={(e) => setReportStartDate(e.target.value)}
                        className="px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-400 font-bold mr-2">إلى تاريخ</label>
                      <input 
                        type="date" 
                        value={reportEndDate}
                        onChange={(e) => setReportEndDate(e.target.value)}
                        className="px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                    <div className="flex items-end gap-2 h-full pt-5">
                      <button 
                        onClick={() => {
                          setReportStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
                          setReportEndDate(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
                        }}
                        className="px-3 py-2 text-xs font-bold text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                      >
                        الشهر الحالي
                      </button>
                      <button 
                        onClick={() => {
                          const lastMonth = subMonths(new Date(), 1);
                          setReportStartDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
                          setReportEndDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
                        }}
                        className="px-3 py-2 text-xs font-bold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        الشهر الماضي
                      </button>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => {
                      exportMovementsToExcel(`تقرير_حركات_ومخزون_الأصناف_${reportStartDate}_إلى_${reportEndDate}`);
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-lg shadow-gray-200"
                  >
                    <FileDown className="w-5 h-5" />
                    تصدير Excel
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                  <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between">
                    <p className="text-xs text-gray-400 font-bold mb-1">إجمالي الأصناف</p>
                    <h4 className="text-2xl font-black text-gray-900">{items.length}</h4>
                  </div>
                  <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between">
                    <p className="text-xs text-gray-400 font-bold mb-1">عمليات الإيداع (الفترة)</p>
                    <h4 className="text-2xl font-black text-emerald-600">
                      {transactions.filter(t => {
                        const date = t.date.split('T')[0];
                        return (t.type === 'receive' || t.type === 'return') && date >= reportStartDate && date <= reportEndDate;
                      }).length}
                    </h4>
                  </div>
                  <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between">
                    <p className="text-xs text-gray-400 font-bold mb-1">عمليات السحب (الفترة)</p>
                    <h4 className="text-2xl font-black text-red-600">
                      {transactions.filter(t => {
                        const date = t.date.split('T')[0];
                        return t.type === 'withdraw' && date >= reportStartDate && date <= reportEndDate;
                      }).length}
                    </h4>
                  </div>
                  <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between">
                    <p className="text-xs text-gray-400 font-bold mb-1">الكميات المودعة (الفترة)</p>
                    <h4 className="text-2xl font-black text-emerald-700">
                      {transactions.filter(t => {
                        const date = t.date.split('T')[0];
                        return (t.type === 'receive' || t.type === 'return') && date >= reportStartDate && date <= reportEndDate;
                      }).reduce((sum, t) => sum + t.quantity, 0)}
                    </h4>
                  </div>
                  <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between">
                    <p className="text-xs text-gray-400 font-bold mb-1">الكميات المسحوبة (الفترة)</p>
                    <h4 className="text-2xl font-black text-red-700">
                      {transactions.filter(t => {
                        const date = t.date.split('T')[0];
                        return t.type === 'withdraw' && date >= reportStartDate && date <= reportEndDate;
                      }).reduce((sum, t) => sum + t.quantity, 0)}
                    </h4>
                  </div>
                  <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between">
                    <p className="text-xs text-gray-400 font-bold mb-1">طلبيات معلقة</p>
                    <h4 className="text-2xl font-black text-amber-600">
                      {orders.filter(o => o.status === 'pending').length}
                    </h4>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
                    <h4 className="text-lg font-bold text-gray-900 mb-6">حركة المخزون (الفترة المختارة)</h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={
                          ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'].map(day => ({
                            name: day,
                            value: transactions.filter(t => {
                              const d = new Date(t.date);
                              const date = t.date.split('T')[0];
                              const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
                              return days[d.getDay()] === day && date >= reportStartDate && date <= reportEndDate;
                            }).length
                          }))
                        }>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94A3B8' }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94A3B8' }} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            cursor={{ fill: '#F8F9FA' }}
                          />
                          <Bar dataKey="value" fill="#10B981" radius={[4, 4, 0, 0]} barSize={32} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
                    <h4 className="text-lg font-bold text-gray-900 mb-6">توزيع المخزون</h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={items.slice(0, 4).map(i => ({ name: i.name, value: i.quantity }))}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {items.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={['#10B981', '#3B82F6', '#F59E0B', '#6366F1'][index % 4]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
                  <h4 className="text-lg font-bold text-gray-900 mb-6">تقرير المخزون التفصيلي لكل صنف</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="px-6 py-4 text-xs text-gray-400 uppercase font-bold text-right">نوع الصنف</th>
                          <th className="px-6 py-4 text-xs text-gray-400 uppercase font-bold text-right">الطلبية</th>
                          <th className="px-6 py-4 text-xs text-gray-400 uppercase font-bold text-right">المتبقي من الطلبية</th>
                          <th className="px-6 py-4 text-xs text-gray-400 uppercase font-bold text-right">العدد النهائي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.slice((reportsPage - 1) * ITEMS_PER_PAGE, reportsPage * ITEMS_PER_PAGE).map(item => {
                          const itemOrders = orders.filter(o => o.item === item.name && o.status === 'delivered');
                          const lastOrder = itemOrders[0] || null;
                          const lastOrderQty = lastOrder ? lastOrder.quantity : 0;

                          const totalReceived = transactions
                            .filter(t => t.itemId === item.id && t.type === 'receive')
                            .reduce((sum, t) => sum + t.quantity, 0);

                          const originalQty = lastOrder ? Math.max(0, totalReceived - lastOrderQty) : totalReceived;
                          const remainingFromOrder = lastOrder ? Math.max(0, Math.min(lastOrderQty, item.quantity - originalQty)) : 0;

                          return (
                            <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                              <td className="px-6 py-4 font-bold text-gray-900">{item.name}</td>
                              <td className="px-6 py-4 font-black text-blue-600">{lastOrderQty}</td>
                              <td className="px-6 py-4 font-black text-purple-600">{remainingFromOrder}</td>
                              <td className="px-6 py-4">
                                <span className="font-black text-emerald-600">{item.quantity}</span>
                                <span className="text-xs text-gray-500 mr-1">{item.unit}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {items.length > ITEMS_PER_PAGE && (
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8 pt-6 border-t border-gray-100">
                      <div className="flex items-center gap-2 order-2 sm:order-1">
                        <button
                          onClick={() => setReportsPage(prev => Math.max(1, prev - 1))}
                          disabled={reportsPage === 1}
                          className="p-2 text-gray-500 hover:text-emerald-600 disabled:text-gray-300 disabled:hover:bg-transparent hover:bg-emerald-50 rounded-xl transition-all"
                          title="الصفحة السابقة"
                        >
                          <ChevronRight className="w-6 h-6" />
                        </button>
                        
                        <button
                          onClick={() => setReportsPage(prev => Math.min(Math.ceil(items.length / ITEMS_PER_PAGE), prev + 1))}
                          disabled={reportsPage === Math.ceil(items.length / ITEMS_PER_PAGE)}
                          className="p-2 text-gray-500 hover:text-emerald-600 disabled:text-gray-300 disabled:hover:bg-transparent hover:bg-emerald-50 rounded-xl transition-all"
                          title="الصفحة التالية"
                        >
                          <ChevronLeft className="w-6 h-6" />
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-2 order-1 sm:order-2">
                        <span className="text-sm font-bold text-gray-900">صفحة {reportsPage} من {Math.ceil(items.length / ITEMS_PER_PAGE)}</span>
                        <span className="text-xs text-gray-400">({items.length} صنف)</span>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'users' && currentUser?.role === 'admin' && (
              <motion.div 
                key="users"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-black text-gray-900">إدارة المستخدمين</h3>
                    <p className="text-gray-500">إضافة وحذف وتعديل صلاحيات الموظفين</p>
                  </div>
                  <button 
                    onClick={() => setIsAddUserModalOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-100 flex items-center gap-2"
                  >
                    <UserPlus className="w-5 h-5" />
                    <span>إضافة مستخدم</span>
                  </button>
                </div>

                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-right">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50">
                          <th className="px-6 py-4 text-xs text-gray-400 uppercase font-bold">الاسم</th>
                          <th className="px-6 py-4 text-xs text-gray-400 uppercase font-bold">اسم المستخدم</th>
                          <th className="px-6 py-4 text-xs text-gray-400 uppercase font-bold">الدور</th>
                          <th className="px-6 py-4 text-xs text-gray-400 uppercase font-bold">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(user => (
                          <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 font-bold text-gray-900">{user.name}</td>
                            <td className="px-6 py-4 text-gray-500">{user.username}</td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider",
                                user.role === 'admin' ? "bg-emerald-100 text-emerald-700" : 
                                user.role === 'user' ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                              )}>
                                {user.role === 'admin' ? 'مدير' : 
                                 user.role === 'user' ? 'موظف' : 'مراقب'}
                              </span>
                            </td>
                            <td className="px-6 py-4 flex items-center gap-2">
                              <button 
                                onClick={() => openEditUserModal(user)}
                                className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-xl transition-all"
                                title="تعديل"
                              >
                                <Edit2 className="w-5 h-5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteUser(user.id)}
                                disabled={user.id === currentUser.id}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                                title="حذف"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-2xl mx-auto"
              >
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">إعدادات الحساب</h3>
                      <p className="text-sm text-gray-500">بيانات حسابك الشخصي</p>
                    </div>
                    <button 
                      onClick={() => openEditUserModal(currentUser)}
                      className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all flex items-center gap-2"
                      title="تعديل البيانات"
                    >
                      <Edit2 className="w-5 h-5" />
                      <span className="text-sm font-bold">تعديل</span>
                    </button>
                  </div>
                  <div className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700">الاسم</label>
                        <div className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-gray-900">
                          {currentUser.name}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700">اسم المستخدم</label>
                        <div className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-gray-900">
                          {currentUser.username}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700">الدور الوظيفي</label>
                      <div className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-gray-900">
                        {currentUser.role === 'admin' ? 'مدير النظام' : 
                         currentUser.role === 'user' ? 'موظف' : 'مراقب'}
                      </div>
                    </div>

                    <div className="pt-6 border-t border-gray-100">
                      <p className="text-xs text-gray-400 text-center">
                        نظام إدارة المخزون v2.0 - تسجيل دخول محلي
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="bg-white border-t border-gray-200 py-4 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-[10px] text-gray-400 uppercase tracking-widest font-bold">
          <div className="flex items-center gap-4">
            <span>حالة النظام: متصل</span>
            <span>المخزن: الرئيسي</span>
          </div>
          <div>
            © 2026 نظام المخزون الذكي AI
          </div>
        </div>
      </footer>

      {/* Edit User Modal */}
      <AnimatePresence>
        {isEditUserModalOpen && editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditUserModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">تعديل بيانات المستخدم</h3>
                <button 
                  onClick={() => setIsEditUserModalOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">الاسم الكامل</label>
                  <input 
                    type="text"
                    required
                    value={editUserData.name}
                    onChange={(e) => setEditUserData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">اسم المستخدم</label>
                  <input 
                    type="text"
                    required
                    value={editUserData.username}
                    onChange={(e) => setEditUserData(prev => ({ ...prev, username: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">كلمة المرور</label>
                  <div className="relative">
                    <input 
                      type={showEditUserPassword ? "text" : "password"}
                      required
                      value={editUserData.password}
                      onChange={(e) => setEditUserData(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 pl-10 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditUserPassword(!showEditUserPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                    >
                      {showEditUserPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">الدور الوظيفي</label>
                  <select 
                    required
                    disabled={currentUser.role !== 'admin'}
                    value={editUserData.role}
                    onChange={(e) => setEditUserData(prev => ({ ...prev, role: e.target.value as any }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="user">موظف (سحب فقط)</option>
                    <option value="admin">مدير (صلاحيات كاملة)</option>
                    <option value="observer">مراقب (عرض فقط)</option>
                  </select>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-emerald-100 mt-4"
                >
                  حفظ التغييرات
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add User Modal */}
      <AnimatePresence>
        {isAddUserModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddUserModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">إضافة مستخدم جديد</h3>
                <button 
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">الاسم الكامل</label>
                  <input 
                    type="text"
                    required
                    value={newUserData.name}
                    onChange={(e) => setNewUserData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    placeholder="مثلاً: أحمد محمد"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">اسم المستخدم</label>
                  <input 
                    type="text"
                    required
                    value={newUserData.username}
                    onChange={(e) => setNewUserData(prev => ({ ...prev, username: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    placeholder="اسم الدخول"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">كلمة المرور</label>
                  <div className="relative">
                    <input 
                      type={showAddUserPassword ? "text" : "password"}
                      required
                      value={newUserData.password}
                      onChange={(e) => setNewUserData(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 pl-10 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAddUserPassword(!showAddUserPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                    >
                      {showAddUserPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">الدور الوظيفي</label>
                  <select 
                    required
                    value={newUserData.role}
                    onChange={(e) => setNewUserData(prev => ({ ...prev, role: e.target.value as any }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  >
                    <option value="user">موظف (سحب فقط)</option>
                    <option value="admin">مدير (صلاحيات كاملة)</option>
                    <option value="observer">مراقب (عرض فقط)</option>
                  </select>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-emerald-100 mt-4"
                >
                  إنشاء الحساب
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isAddItemModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddItemModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">إضافة صنف جديد</h3>
                <button 
                  onClick={() => setIsAddItemModalOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleManualAddItem} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">اسم الصنف</label>
                  <input 
                    type="text"
                    required
                    value={newItemData.name}
                    onChange={(e) => setNewItemData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    placeholder="مثلاً: طابعة ليزر"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">الكمية الأولية</label>
                    <input 
                      type="number"
                      required
                      min="0"
                      value={newItemData.quantity}
                      onChange={(e) => setNewItemData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">الوحدة</label>
                    <select 
                      value={newItemData.unit}
                      onChange={(e) => setNewItemData(prev => ({ ...prev, unit: e.target.value }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    >
                      <option value="قطعة">قطعة</option>
                      <option value="متر">متر</option>
                      <option value="كيلو">كيلو</option>
                      <option value="كرتونة">كرتونة</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">حد المخزون المنخفض</label>
                    <input 
                      type="number"
                      required
                      min="1"
                      value={newItemData.lowThreshold}
                      onChange={(e) => setNewItemData(prev => ({ ...prev, lowThreshold: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">حد المخزون الحرج</label>
                    <input 
                      type="number"
                      required
                      min="1"
                      value={newItemData.criticalThreshold}
                      onChange={(e) => setNewItemData(prev => ({ ...prev, criticalThreshold: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-emerald-100 mt-4"
                >
                  حفظ الصنف
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Import Excel Preview Modal */}
      <AnimatePresence>
        {isImportExcelModalOpen && importPreviewItems.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isImporting) { setIsImportExcelModalOpen(false); setImportPreviewItems([]); } }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-8 overflow-hidden max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between mb-6 shrink-0">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">مراجعة استيراد Excel</h3>
                  <p className="text-sm text-gray-500 mt-1">يرجى مراجعة الأصناف والتغييرات التي سيتم تطبيقها قبل تأكيد الحفظ</p>
                </div>
                <button 
                  onClick={() => { if (!isImporting) { setIsImportExcelModalOpen(false); setImportPreviewItems([]); } }}
                  disabled={isImporting}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 my-2 pr-1 text-right" dir="rtl">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
                  ⚠️ <strong>ملاحظة هامة:</strong> التعديلات لن تؤثر على الأصناف أو البيانات الحالية غير الموجودة في ملف Excel. سيتم فقط تحديث كميات الأصناف المطابقة وإضافة الأصناف الجديدة.
                </div>

                <div className="border border-gray-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-right">الصنف</th>
                        <th className="px-4 py-3 text-right">الحالة</th>
                        <th className="px-4 py-3 text-right">الكمية السابقة</th>
                        <th className="px-4 py-3 text-right">الكمية الجديدة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {importPreviewItems.map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-semibold text-gray-900">{item.name}</td>
                          <td className="px-4 py-3">
                            {item.isNew ? (
                              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-100">
                                صنف جديد
                              </span>
                            ) : item.oldQuantity === item.quantity ? (
                              <span className="px-2.5 py-1 bg-gray-50 text-gray-600 text-xs font-bold rounded-lg border border-gray-100">
                                بدون تغيير
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 bg-sky-50 text-sky-700 text-xs font-bold rounded-lg border border-sky-100">
                                تحديث كمية
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {item.isNew ? '-' : `${item.oldQuantity} ${item.unit}`}
                          </td>
                          <td className="px-4 py-3 font-bold text-gray-900">
                            {item.quantity} {item.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-3 mt-6 shrink-0">
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={isImporting}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      جاري الاستيراد والتحديث...
                    </>
                  ) : (
                    'تأكيد واستيراد البيانات'
                  )}
                </button>
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={() => { setIsImportExcelModalOpen(false); setImportPreviewItems([]); }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 font-bold py-3.5 rounded-xl transition-all"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Adjust Stock Modal */}
      <AnimatePresence>
        {adjustModal.isOpen && adjustModal.item && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAdjustModal({ ...adjustModal, isOpen: false })}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    adjustModal.type === 'receive' ? "bg-emerald-100 text-emerald-600" : 
                    adjustModal.type === 'withdraw' ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                  )}>
                    {adjustModal.type === 'receive' ? <ArrowDownRight className="w-6 h-6" /> : 
                     adjustModal.type === 'withdraw' ? <ArrowUpRight className="w-6 h-6" /> : <History className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {adjustModal.type === 'receive' ? 'إيداع مخزون' : 
                       adjustModal.type === 'withdraw' ? 'سحب مخزون' : 'إرجاع مخزون'}
                    </h3>
                    <p className="text-xs text-gray-500">{adjustModal.item.name}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setAdjustModal({ ...adjustModal, isOpen: false })}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAdjustStock} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    الكمية المراد {adjustModal.type === 'receive' ? 'إيداعها' : adjustModal.type === 'withdraw' ? 'سحبها' : 'إرجاعها'}
                  </label>
                  <div className="flex items-center gap-4">
                    <button 
                      type="button"
                      onClick={() => setAdjustQuantity(prev => Math.max(1, prev - 1))}
                      className="w-12 h-12 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center transition-colors"
                    >
                      <Minus className="w-5 h-5 text-gray-600" />
                    </button>
                    <input 
                      type="number"
                      required
                      min="1"
                      value={adjustQuantity}
                      onChange={(e) => setAdjustQuantity(parseInt(e.target.value) || 1)}
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-center text-xl font-black focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                    <button 
                      type="button"
                      onClick={() => setAdjustQuantity(prev => prev + 1)}
                      className="w-12 h-12 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-5 h-5 text-gray-600" />
                    </button>
                  </div>
                  <p className="text-center text-xs text-gray-400 mt-2">
                    المخزون الحالي: {adjustModal.item.quantity} {adjustModal.item.unit}
                  </p>
                </div>

                <button 
                  type="submit"
                  className={cn(
                    "w-full text-white font-bold py-4 rounded-xl transition-all shadow-lg mt-4",
                    adjustModal.type === 'receive' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100" : 
                    adjustModal.type === 'withdraw' ? "bg-red-600 hover:bg-red-700 shadow-red-100" : "bg-blue-600 hover:bg-blue-700 shadow-blue-100"
                  )}
                >
                  تأكيد العملية
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Item History Modal */}
      <AnimatePresence>
        {historyModal.isOpen && historyModal.item && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryModal({ isOpen: false, item: null })}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div>
                  <h3 className="text-2xl font-black text-gray-900">سجل عمليات: {historyModal.item.name}</h3>
                  <p className="text-gray-500">تفاصيل السحب والاستلام والمرتجع</p>
                </div>
                <button 
                  onClick={() => setHistoryModal({ isOpen: false, item: null })}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 overflow-y-auto flex-1 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
                    <p className="text-sm text-emerald-600 font-bold mb-1">العدد الأصلي (إجمالي الاستلام)</p>
                    <h4 className="text-2xl font-black text-emerald-700">
                      {transactions
                        .filter(t => t.itemId === historyModal.item?.id && t.type === 'receive')
                        .reduce((sum, t) => sum + t.quantity, 0)}
                    </h4>
                  </div>
                  <div className="bg-red-50 p-6 rounded-3xl border border-red-100">
                    <p className="text-sm text-red-600 font-bold mb-1">إجمالي السحب (الصافي)</p>
                    <h4 className="text-2xl font-black text-red-700">
                      {(() => {
                        const w = transactions
                          .filter(t => t.itemId === historyModal.item?.id && t.type === 'withdraw')
                          .reduce((sum, t) => sum + t.quantity, 0);
                        const r = transactions
                          .filter(t => t.itemId === historyModal.item?.id && t.type === 'return')
                          .reduce((sum, t) => sum + t.quantity, 0);
                        return w - r;
                      })()}
                    </h4>
                  </div>
                  <div className="bg-orange-50 p-6 rounded-3xl border border-orange-100">
                    <p className="text-sm text-orange-600 font-bold mb-1">الكمية الحالية</p>
                    <h4 className="text-2xl font-black text-orange-700">
                      {historyModal.item.quantity}
                    </h4>
                  </div>
                  <div className="bg-gray-900 p-6 rounded-3xl border border-gray-800 text-white">
                    <p className="text-sm text-gray-400 font-bold mb-1">الاستهلاك الصافي (الفرق)</p>
                    <h4 className="text-2xl font-black">
                      {(() => {
                        const totalReceived = transactions
                          .filter(t => t.itemId === historyModal.item?.id && t.type === 'receive')
                          .reduce((sum, t) => sum + t.quantity, 0);
                        return totalReceived - historyModal.item.quantity;
                      })()}
                    </h4>
                  </div>
                </div>

                <div className="bg-gray-50 p-6 rounded-3xl border border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-bold text-gray-900">الكمية النهائية الحالية</h4>
                    <span className="text-2xl font-black text-emerald-600">{historyModal.item.quantity} {historyModal.item.unit}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-lg font-bold text-gray-900">تاريخ العمليات</h4>
                  <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden">
                    <table className="w-full text-right">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-6 py-4 text-xs text-gray-400 uppercase font-bold">التاريخ</th>
                          <th className="px-6 py-4 text-xs text-gray-400 uppercase font-bold">النوع</th>
                          <th className="px-6 py-4 text-xs text-gray-400 uppercase font-bold">الكمية</th>
                          <th className="px-6 py-4 text-xs text-gray-400 uppercase font-bold">المستخدم</th>
                          <th className="px-6 py-4 text-xs text-gray-400 uppercase font-bold text-left">إجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions
                          .filter(t => t.itemId === historyModal.item?.id)
                          .map(t => (
                            <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                              <td className="px-6 py-4 text-gray-500 font-medium">{t.date}</td>
                              <td className="px-6 py-4">
                                <span className={cn(
                                  "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider",
                                  t.type === 'receive' ? "bg-emerald-100 text-emerald-700" : 
                                  t.type === 'withdraw' ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                                )}>
                                  {t.type === 'receive' ? 'استلام' : 
                                   t.type === 'withdraw' ? 'سحب' : 'مرتجع'}
                                </span>
                              </td>
                              <td className={cn(
                                "px-6 py-4 font-black",
                                t.type === 'receive' ? "text-emerald-600" : 
                                t.type === 'withdraw' ? "text-red-600" : "text-blue-600"
                              )}>
                                {t.type === 'withdraw' ? '-' : '+'}{t.quantity}
                              </td>
                              <td className="px-6 py-4 text-gray-900 font-bold">{t.user}</td>
                              <td className="px-6 py-4 text-left">
                                {t.type === 'withdraw' && currentUser.role !== 'observer' && (
                                  <button
                                    onClick={() => handleOpenAdjustModal(historyModal.item!, 'return')}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-bold"
                                    title="عمل مرتجع"
                                  >
                                    <History className="w-3 h-3" />
                                    مرتجع
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        {transactions.filter(t => t.itemId === historyModal.item?.id).length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-gray-400 font-bold">
                              لا توجد عمليات مسجلة لهذا الصنف
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              
              <div className="p-8 border-t border-gray-100 bg-gray-50 flex justify-end">
                <button 
                  onClick={() => setHistoryModal({ isOpen: false, item: null })}
                  className="bg-gray-900 text-white px-8 py-3 rounded-2xl font-bold hover:bg-gray-800 transition-all"
                >
                  إغلاق
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Add Order Modal */}
      <AnimatePresence>
        {isAddOrderModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddOrderModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">إنشاء طلبية توريد</h3>
                <button 
                  onClick={() => setIsAddOrderModalOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleManualAddOrder} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">اختر الصنف</label>
                  <select 
                    required
                    value={newOrderData.item}
                    onChange={(e) => setNewOrderData(prev => ({ ...prev, item: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  >
                    <option value="">اختر صنفاً...</option>
                    {items.map(item => (
                      <option key={item.id} value={item.name}>{item.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">الكمية المطلوبة</label>
                  <input 
                    type="number"
                    required
                    min="1"
                    value={newOrderData.quantity}
                    onChange={(e) => setNewOrderData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-emerald-100 mt-4"
                >
                  إنشاء الطلبية
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Update Thresholds Modal */}
      <AnimatePresence>
        {thresholdModal.isOpen && thresholdModal.item && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setThresholdModal({ isOpen: false, item: null })}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">تعديل حدود المخزون</h3>
                  <p className="text-xs text-gray-500">{thresholdModal.item.name}</p>
                </div>
                <button 
                  onClick={() => setThresholdModal({ isOpen: false, item: null })}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateThresholds} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">حد المخزون المنخفض</label>
                    <input 
                      type="number"
                      required
                      min="1"
                      value={thresholdValues.low}
                      onChange={(e) => setThresholdValues(prev => ({ ...prev, low: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">حد المخزون الحرج</label>
                    <input 
                      type="number"
                      required
                      min="1"
                      value={thresholdValues.critical}
                      onChange={(e) => setThresholdValues(prev => ({ ...prev, critical: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>
                <button 
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-100 mt-4"
                >
                  تحديث الحدود
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Order Confirmation Modal */}
      <AnimatePresence>
        {deleteOrderModal.isOpen && deleteOrderModal.order && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteOrderModal({ isOpen: false, order: null })}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 overflow-hidden font-sans"
              dir="rtl"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">تأكيد إلغاء / حذف الطلبية</h3>
                  <p className="text-xs text-gray-500">{deleteOrderModal.order.item}</p>
                </div>
                <button 
                  onClick={() => setDeleteOrderModal({ isOpen: false, order: null })}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-gray-600 text-sm leading-relaxed">
                  هل أنت متأكد من رغبتك في إلغاء أو حذف هذه الطلبية لصنف <strong className="text-gray-900">{deleteOrderModal.order.item}</strong> (الكمية: {deleteOrderModal.order.quantity})؟ هذه العملية لا يمكن التراجع عنها.
                </p>

                <div className="flex gap-3 mt-6">
                  <button 
                    onClick={() => handleDeleteOrder(deleteOrderModal.order!.id)}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-red-100 flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    تأكيد الحذف
                  </button>
                  <button 
                    type="button"
                    onClick={() => setDeleteOrderModal({ isOpen: false, order: null })}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 px-4 rounded-xl transition-all text-center"
                  >
                    تراجع
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Order Modal */}
      <AnimatePresence>
        {editOrderModal.isOpen && editOrderModal.order && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditOrderModal({ isOpen: false, order: null })}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 overflow-hidden font-sans"
              dir="rtl"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">تعديل كمية الطلبية</h3>
                  <p className="text-xs text-gray-500">{editOrderModal.order.item}</p>
                </div>
                <button 
                  onClick={() => setEditOrderModal({ isOpen: false, order: null })}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={(e) => {
                e.preventDefault();
                handleEditOrderQuantity(editOrderModal.order!.id, editOrderQuantity);
              }} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">الكمية الجديدة</label>
                  <div className="flex items-center gap-3">
                    <button 
                      type="button"
                      onClick={() => setEditOrderQuantity(prev => Math.max(1, prev - 1))}
                      className="p-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-all"
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                    <input 
                      type="number"
                      required
                      min="1"
                      value={editOrderQuantity}
                      onChange={(e) => setEditOrderQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-center font-bold text-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                    />
                    <button 
                      type="button"
                      onClick={() => setEditOrderQuantity(prev => prev + 1)}
                      className="p-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-all"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button 
                    type="submit"
                    className="flex-1 bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-gray-200 flex items-center justify-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    حفظ التعديل
                  </button>
                  <button 
                    type="button"
                    onClick={() => setEditOrderModal({ isOpen: false, order: null })}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 px-4 rounded-xl transition-all text-center"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
