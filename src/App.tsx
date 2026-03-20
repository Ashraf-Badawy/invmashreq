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
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
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
  const [currentPage, setCurrentPage] = useState(1);
  const [reportsPage, setReportsPage] = useState(1);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [ordersPage, setOrdersPage] = useState(1);
  const ITEMS_PER_PAGE = 100;
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [isAddOrderModalOpen, setIsAddOrderModalOpen] = useState(false);
  const [adjustModal, setAdjustModal] = useState<{ isOpen: boolean, item: InventoryItem | null, type: 'receive' | 'withdraw' }>({ 
    isOpen: false, 
    item: null, 
    type: 'receive' 
  });
  const [adjustQuantity, setAdjustQuantity] = useState(1);
  const [newItemData, setNewItemData] = useState({ name: '', quantity: 0, unit: 'قطعة', lowThreshold: 10, criticalThreshold: 5 });
  const [thresholdModal, setThresholdModal] = useState<{ isOpen: boolean, item: InventoryItem | null }>({ isOpen: false, item: null });
  const [thresholdValues, setThresholdValues] = useState({ low: 10, critical: 5 });
  const [newOrderData, setNewOrderData] = useState({ item: '', quantity: 1 });

  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUserData, setNewUserData] = useState({ username: '', password: '', name: '', email: '', role: 'user' as UserRole });
  const [editUserData, setEditUserData] = useState({ username: '', password: '', name: '', email: '', role: 'user' as UserRole });

  // Persistence & Firebase Sync
  useEffect(() => {
    const checkInitialAdmin = async () => {
      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', 'ashraf'));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          // Create initial admin
          await addDoc(usersRef, {
            username: 'ashraf',
            password: '11111',
            name: 'أشرف',
            email: 'AshrafBadawy33@gmail.com',
            role: 'admin'
          });
          console.log("Initial admin 'ashraf' created.");
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'users');
      }
    };
    checkInitialAdmin();

    const savedUserId = localStorage.getItem('inventory_user_id');
    if (savedUserId) {
      const fetchUser = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', savedUserId));
          if (userDoc.exists()) {
            setCurrentUser(userDoc.data() as User);
          } else {
            localStorage.removeItem('inventory_user_id');
          }
        } catch (error) {
          console.error("Error fetching user:", error);
        } finally {
          setIsAuthReady(true);
        }
      };
      fetchUser();
    } else {
      setIsAuthReady(true);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setItems([]);
      setTransactions([]);
      setOrders([]);
      setUsers([]);
      return;
    }

    const userPath = `users/${currentUser.id}`;

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
    const userPath = `users/${currentUser.id}`;

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
            await addDoc(collection(db, userPath, 'items'), newItem);
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
                await updateDoc(doc(db, userPath, 'items', item.id), { quantity: item.quantity - action.quantity! });
                const newTransaction: Omit<Transaction, 'id'> = {
                  itemId: item.id,
                  itemName: item.name,
                  quantity: action.quantity,
                  user: currentUser.name || 'مستخدم',
                  date: action.date || format(new Date(), 'yyyy-MM-dd'),
                  type: 'withdraw'
                };
                await addDoc(collection(db, userPath, 'transactions'), newTransaction);
                setFeedback({ type: 'success', message: `تم سحب ${action.quantity} ${item.unit} من ${item.name}` });
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

    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', loginData.username));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        setLoginError('اسم المستخدم غير موجود');
        setIsLoggingIn(false);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data() as User;

      if (userData.password === loginData.password) {
        const userWithId = { ...userData, id: userDoc.id };
        setCurrentUser(userWithId);
        localStorage.setItem('inventory_user_id', userDoc.id);
        setFeedback({ type: 'success', message: 'تم تسجيل الدخول بنجاح' });
      } else {
        setLoginError('كلمة المرور غير صحيحة');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'users');
      setLoginError('حدث خطأ أثناء تسجيل الدخول');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('inventory_user_id');
    setFeedback({ type: 'info', message: 'تم تسجيل الخروج بنجاح' });
    setActiveTab('inventory');
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserData.username || !newUserData.password || !newUserData.name) return;

    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', newUserData.username));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        setFeedback({ type: 'error', message: 'اسم المستخدم موجود بالفعل' });
        return;
      }

      await addDoc(usersRef, newUserData);
      setFeedback({ type: 'success', message: `تم إضافة المستخدم ${newUserData.name} بنجاح` });
      setIsAddUserModalOpen(false);
      setNewUserData({ username: '', password: '', name: '', email: '', role: 'user' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editUserData.username || !editUserData.password || !editUserData.name) return;

    try {
      const userRef = doc(db, 'users', editingUser.id);
      await updateDoc(userRef, editUserData);
      
      // If editing self, update local state
      if (editingUser.id === currentUser?.id) {
        setCurrentUser({ ...currentUser, ...editUserData });
      }

      setFeedback({ type: 'success', message: `تم تحديث بيانات ${editUserData.name} بنجاح` });
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
    const userPath = `users/${currentUser.id}`;
    try {
      await deleteDoc(doc(db, userPath, 'items', id));
      setFeedback({ type: 'success', message: 'تم مسح الصنف بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${userPath}/items`);
    }
  };

  const handleOpenAdjustModal = (item: InventoryItem, type: 'receive' | 'withdraw') => {
    setAdjustModal({ isOpen: true, item, type });
    setAdjustQuantity(1);
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModal.item || adjustQuantity <= 0 || !currentUser) return;

    const userPath = `users/${currentUser.id}`;
    const amount = adjustModal.type === 'receive' ? adjustQuantity : -adjustQuantity;
    const item = adjustModal.item;

    if (amount < 0 && item.quantity + amount < 0) {
      setFeedback({ type: 'error', message: 'المخزون غير كافٍ' });
      return;
    }

    try {
      await updateDoc(doc(db, userPath, 'items', item.id), { quantity: item.quantity + amount });
      
      const newTransaction: Omit<Transaction, 'id'> = {
        itemId: item.id,
        itemName: item.name,
        quantity: Math.abs(amount),
        user: currentUser.name || 'مستخدم',
        date: format(new Date(), 'yyyy-MM-dd'),
        type: adjustModal.type
      };
      await addDoc(collection(db, userPath, 'transactions'), newTransaction);
      setFeedback({ type: 'success', message: `تم ${amount > 0 ? 'إضافة' : 'سحب'} ${Math.abs(amount)} ${item.unit}` });
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

  const handleManualAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemData.name || !currentUser) return;

    const userPath = `users/${currentUser.id}`;
    const newItem: Omit<InventoryItem, 'id'> = {
      name: newItemData.name,
      quantity: newItemData.quantity,
      unit: newItemData.unit,
      lowThreshold: newItemData.lowThreshold,
      criticalThreshold: newItemData.criticalThreshold
    };

    try {
      await addDoc(collection(db, userPath, 'items'), newItem);
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

    const userPath = `users/${currentUser.id}`;
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

    const userPath = `users/${currentUser.id}`;
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

    const userPath = `users/${currentUser.id}`;
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

  const filteredItems = items.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
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
            <h1 className="text-3xl font-bold text-gray-900 mb-2">نظام المخزون الذكي</h1>
            <p className="text-gray-500">سجل دخولك للبدء في إدارة مخزنك</p>
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
                  type="password"
                  required
                  value={loginData.password}
                  onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 pr-10 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="••••••••"
                />
                <Lock className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
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
              <h2 className="text-lg font-bold text-gray-900">المخزون الذكي</h2>
              <p className="text-xs text-gray-500">نظام إدارة مدعوم بالذكاء الاصطناعي</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-bold text-gray-900">{currentUser.name}</span>
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
                      <button 
                        onClick={() => setIsAddItemModalOpen(true)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl transition-all shadow-lg shadow-emerald-100 shrink-0"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {paginatedItems.map((item) => (
                      <div key={item.id} className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition-all group">
                        <div className="flex items-start justify-between mb-4">
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
                                  onClick={() => handleOpenThresholdModal(item)}
                                  className="p-1 text-gray-300 hover:text-indigo-500 transition-colors"
                                  title="تعديل حدود المخزون"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <h4 className="font-bold text-gray-900 mb-1">{item.name}</h4>
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
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleOpenAdjustModal(item, 'withdraw')}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Minus className="w-4 h-4" />
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
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                                    <Package className="text-gray-400 group-hover:text-emerald-500 w-4 h-4" />
                                  </div>
                                  <span className="font-bold text-gray-900">{item.name}</span>
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
                                {currentUser.role !== 'observer' && (
                                  <div className="flex items-center justify-end gap-2">
                                    <button 
                                      onClick={() => handleOpenAdjustModal(item, 'receive')}
                                      className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                    >
                                      <Plus className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={() => handleOpenAdjustModal(item, 'withdraw')}
                                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                      <Minus className="w-4 h-4" />
                                    </button>
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
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
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
                              t.type === 'receive' ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"
                            )}>
                              {t.type === 'receive' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                              {t.type === 'receive' ? 'استلام' : 'سحب'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-600">{t.user}</td>
                          <td className="px-6 py-4 text-gray-500 text-sm">{t.date}</td>
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
                          <button 
                            onClick={() => handleReceiveOrder(order)}
                            className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-800 transition-all"
                          >
                            استلام
                          </button>
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                    <p className="text-sm text-gray-500 mb-1">إجمالي الأصناف</p>
                    <h4 className="text-3xl font-black text-gray-900">{items.length}</h4>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                    <p className="text-sm text-gray-500 mb-1">عمليات السحب</p>
                    <h4 className="text-3xl font-black text-gray-900">
                      {transactions.filter(t => t.type === 'withdraw').length}
                    </h4>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                    <p className="text-sm text-gray-500 mb-1">طلبيات معلقة</p>
                    <h4 className="text-3xl font-black text-gray-900">
                      {orders.filter(o => o.status === 'pending').length}
                    </h4>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
                    <h4 className="text-lg font-bold text-gray-900 mb-6">حركة المخزون الأسبوعية</h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={
                          ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'].map(day => ({
                            name: day,
                            value: transactions.filter(t => {
                              const d = new Date(t.date);
                              const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
                              return days[d.getDay()] === day;
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
                  <h4 className="text-lg font-bold text-gray-900 mb-6">تقرير سحب الكميات لكل صنف</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="px-6 py-4 text-xs text-gray-400 uppercase font-bold">اسم الصنف</th>
                          <th className="px-6 py-4 text-xs text-gray-400 uppercase font-bold">إجمالي السحب</th>
                          <th className="px-6 py-4 text-xs text-gray-400 uppercase font-bold">الوحدة</th>
                          <th className="px-6 py-4 text-xs text-gray-400 uppercase font-bold">النسبة من الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.slice((reportsPage - 1) * ITEMS_PER_PAGE, reportsPage * ITEMS_PER_PAGE).map(item => {
                          const totalWithdrawn = transactions
                            .filter(t => t.itemId === item.id && t.type === 'withdraw')
                            .reduce((sum, t) => sum + t.quantity, 0);
                          
                          const allWithdrawals = transactions
                            .filter(t => t.type === 'withdraw')
                            .reduce((sum, t) => sum + t.quantity, 0);
                          
                          const percentage = allWithdrawals > 0 ? (totalWithdrawn / allWithdrawals) * 100 : 0;

                          return (
                            <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                              <td className="px-6 py-4 font-bold text-gray-900">{item.name}</td>
                              <td className="px-6 py-4 text-red-600 font-black">{totalWithdrawn}</td>
                              <td className="px-6 py-4 text-gray-500">{item.unit}</td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-red-500 rounded-full" 
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-bold text-gray-400">{percentage.toFixed(1)}%</span>
                                </div>
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
                  <input 
                    type="text"
                    required
                    value={editUserData.password}
                    onChange={(e) => setEditUserData(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
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
                  <input 
                    type="password"
                    required
                    value={newUserData.password}
                    onChange={(e) => setNewUserData(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    placeholder="••••••••"
                  />
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
                    adjustModal.type === 'receive' ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                  )}>
                    {adjustModal.type === 'receive' ? <ArrowDownRight className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {adjustModal.type === 'receive' ? 'إيداع مخزون' : 'سحب مخزون'}
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
                  <label className="block text-sm font-bold text-gray-700 mb-2">الكمية المراد {adjustModal.type === 'receive' ? 'إيداعها' : 'سحبها'}</label>
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
                    adjustModal.type === 'receive' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100" : "bg-red-600 hover:bg-red-700 shadow-red-100"
                  )}
                >
                  تأكيد العملية
                </button>
              </form>
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
    </div>
  );
}
