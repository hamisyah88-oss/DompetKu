import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Printer, FileText, FileSpreadsheet, FileJson, TrendingUp, TrendingDown, Eye, X, Wallet, Landmark, 
  Receipt, Trash2, Bot, Loader2, CheckCircle2, PlusCircle, ArrowUpRight, 
  ArrowDownRight, BarChart3, Target, Settings, PieChart,
  ArrowRightLeft, Save, Upload, Home, Target as TargetIcon, User, Camera,
  Calendar, Check, AlertCircle, RefreshCw, SkipForward, ChevronRight,
  KeyRound, LogOut, UserPlus, Phone, ShieldCheck, Mail
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';


const DB_NAME = 'DompetKuDB';
const DB_VERSION = 3;

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('user')) db.createObjectStore('user', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('accounts')) db.createObjectStore('accounts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('transactions')) db.createObjectStore('transactions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('budgets')) db.createObjectStore('budgets', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('goals')) db.createObjectStore('goals', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('recurring')) db.createObjectStore('recurring', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
    };
  });
};

const idb = {
  get: async (storeName, id) => {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = id ? tx.objectStore(storeName).get(id) : tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
    });
  },
  put: async (storeName, data) => {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(data);
      tx.oncomplete = () => resolve(true);
    });
  },
  delete: async (storeName, id) => {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => resolve(true);
    });
  },
  clearAll: async () => {
    const db = await initDB();
    const stores = ['user', 'accounts', 'transactions', 'budgets', 'goals', 'recurring', 'settings'];
    stores.forEach(s => {
       if(db.objectStoreNames.contains(s)) db.transaction(s, 'readwrite').objectStore(s).clear();
    });
  },
  restoreFromJson: async (jsonData) => {
    const data = JSON.parse(jsonData);
    if (!data.appName || data.appName !== 'DompetKu') throw new Error("Invalid Backup File");
    
    await idb.clearAll();
    const db = await initDB();
    for (const storeName of ['user', 'accounts', 'transactions', 'budgets', 'goals', 'recurring', 'settings']) {
      if (data[storeName] && db.objectStoreNames.contains(storeName)) {
        const tx = db.transaction(storeName, 'readwrite');
        data[storeName].forEach(item => tx.objectStore(storeName).put(item));
      }
    }
    return true;
  }
};


const isNativeApp = () => Capacitor.isNativePlatform();

const bytesToBase64 = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const textToBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  return bytesToBase64(bytes);
};

const shareNativeFile = async ({ fileName, base64Data, mimeType, title, text }) => {
  const result = await Filesystem.writeFile({
    path: fileName,
    data: base64Data,
    directory: Directory.Cache,
    recursive: true
  });

  const uriResult = await Filesystem.getUri({
    path: fileName,
    directory: Directory.Cache
  });

  await Share.share({
    title: title || fileName,
    text: text || `File ${fileName}`,
    url: uriResult.uri || result.uri,
    dialogTitle: title || 'Bagikan File DompetKu'
  });

  return uriResult.uri || result.uri;
};

const downloadBrowserFile = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.position = 'fixed';
  link.style.left = '-9999px';
  link.style.top = '0';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1500);
};

const getScopedData = async (storeName, userId) => {
  const all = await idb.get(storeName) || [];
  return all.filter(item => !userId || item.userId === userId);
};

const putScopedData = async (storeName, data, userId) => {
  return idb.put(storeName, { ...data, userId });
};

const cloudTableMap = {
  accounts: 'accounts',
  transactions: 'transactions',
  budgets: 'budgets',
  goals: 'goals',
  recurring: 'recurring'
};

const toCloudRow = (storeName, data, userId) => {
  if (storeName === 'accounts') return {
    id: data.id,
    user_id: userId,
    name: data.name || '',
    type: data.type || 'Bank',
    initial_balance: Number(data.initialBalance) || 0
  };
  if (storeName === 'transactions') return {
    id: data.id,
    user_id: userId,
    timestamp: Number(data.timestamp) || Date.now(),
    type: data.type,
    category: data.category || '',
    note: data.note || '',
    amount: Number(data.amount) || 0,
    account_id: data.accountId || null,
    to_account_id: data.toAccountId || null,
    date_str: data.dateStr || ''
  };
  if (storeName === 'budgets') return {
    id: data.id,
    user_id: userId,
    category: data.category || '',
    limit_amount: Number(data.limit) || 0
  };
  if (storeName === 'goals') return {
    id: data.id,
    user_id: userId,
    name: data.name || '',
    target_amount: Number(data.targetAmount) || 0,
    collected_amount: Number(data.collectedAmount) || 0,
    deadline: data.deadline || null
  };
  if (storeName === 'recurring') return {
    id: data.id,
    user_id: userId,
    type: data.type,
    category: data.category || '',
    note: data.note || '',
    amount: Number(data.amount) || 0,
    account_id: data.accountId || null,
    frequency: data.frequency || 'monthly',
    next_timestamp: data.nextTimestamp ?? null,
    active: data.active !== false
  };
  return null;
};

const fromCloudRow = (storeName, row) => {
  if (storeName === 'accounts') return {
    id: row.id, userId: row.user_id, name: row.name, type: row.type,
    initialBalance: Number(row.initial_balance) || 0
  };
  if (storeName === 'transactions') return {
    id: row.id, userId: row.user_id, timestamp: Number(row.timestamp) || Date.now(),
    type: row.type, category: row.category || '', note: row.note || '',
    amount: Number(row.amount) || 0, accountId: row.account_id || '',
    toAccountId: row.to_account_id || null, dateStr: row.date_str || ''
  };
  if (storeName === 'budgets') return {
    id: row.id, userId: row.user_id, category: row.category,
    limit: Number(row.limit_amount) || 0
  };
  if (storeName === 'goals') return {
    id: row.id, userId: row.user_id, name: row.name,
    targetAmount: Number(row.target_amount) || 0,
    collectedAmount: Number(row.collected_amount) || 0,
    deadline: row.deadline || ''
  };
  if (storeName === 'recurring') return {
    id: row.id, userId: row.user_id, type: row.type, category: row.category || '',
    note: row.note || '', amount: Number(row.amount) || 0,
    accountId: row.account_id || '', frequency: row.frequency || 'monthly',
    nextTimestamp: row.next_timestamp == null ? Date.now() : Number(row.next_timestamp),
    active: row.active !== false
  };
  return row;
};

const saveStoreData = async (storeName, data, userId) => {
  const localData = { ...data, userId };
  await idb.put(storeName, localData);
  const table = cloudTableMap[storeName];
  if (!table || !userId) return localData;
  const row = toCloudRow(storeName, localData, userId);
  if (!row) return localData;
  const { error } = await supabase.from(table).upsert(row);
  if (error) {
    console.error(`Supabase ${storeName} save failed:`, error);
  }
  return localData;
};

const deleteStoreData = async (storeName, id, userId) => {
  await idb.delete(storeName, id);
  const table = cloudTableMap[storeName];
  if (!table || !userId) return;
  const { error } = await supabase.from(table).delete().eq('id', id).eq('user_id', userId);
  if (error) console.error(`Supabase ${storeName} delete failed:`, error);
};

const loadCloudUserData = async (authUser) => {
  const userId = authUser.id;
  const fallbackName = authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Pengguna';

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('user_id,name,phone,profile_pic')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileError) throw profileError;

  if (!profileRow) {
    const { error } = await supabase.from('profiles').upsert({
      user_id: userId,
      name: fallbackName,
      phone: '',
      profile_pic: ''
    });
    if (error) throw error;
  }

  const results = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', userId),
    supabase.from('transactions').select('*').eq('user_id', userId).order('timestamp', { ascending: false }),
    supabase.from('budgets').select('*').eq('user_id', userId),
    supabase.from('goals').select('*').eq('user_id', userId),
    supabase.from('recurring').select('*').eq('user_id', userId)
  ]);
  const firstError = results.find(result => result.error)?.error;
  if (firstError) throw firstError;

  const [accountsResult, txResult, budgetResult, goalResult, recurringResult] = results;
  let accounts = (accountsResult.data || []).map(r => fromCloudRow('accounts', r));
  const transactions = (txResult.data || []).map(r => fromCloudRow('transactions', r));
  const budgets = (budgetResult.data || []).map(r => fromCloudRow('budgets', r));
  const goals = (goalResult.data || []).map(r => fromCloudRow('goals', r));
  const recurring = (recurringResult.data || []).map(r => fromCloudRow('recurring', r));

  if (accounts.length === 0) {
    const defaults = [
      { id: `acc_${userId}_1`, name: 'Dompet Tunai', type: 'Dompet', initialBalance: 0, userId },
      { id: `acc_${userId}_2`, name: 'Rekening Bank', type: 'Bank', initialBalance: 0, userId }
    ];
    for (const acc of defaults) await saveStoreData('accounts', acc, userId);
    accounts = defaults;
  }

  const profile = profileRow || {
    name: fallbackName, phone: '', profile_pic: ''
  };
  const appUser = {
    id: userId,
    email: authUser.email || '',
    name: profile.name || fallbackName,
    phone: profile.phone || '',
    profilePic: profile.profile_pic || ''
  };

  await idb.put('user', appUser);
  for (const item of accounts) await idb.put('accounts', item);
  for (const item of transactions) await idb.put('transactions', item);
  for (const item of budgets) await idb.put('budgets', item);
  for (const item of goals) await idb.put('goals', item);
  for (const item of recurring) await idb.put('recurring', item);

  return { user: appUser, accounts, transactions, budgets, goals, recurring };
};

const saveProfileToCloud = async (appUser) => {
  if (!appUser?.id) return;
  const { error } = await supabase.from('profiles').upsert({
    user_id: appUser.id,
    name: appUser.name || '',
    phone: appUser.phone || '',
    profile_pic: appUser.profilePic || ''
  });
  if (error) throw error;
  await idb.put('user', appUser);
};

const callDomiAI = async (prompt) => {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: prompt })
    });
    if (!response.ok) throw new Error("Serverless API Error");
    const data = await response.json();
    return data.reply;
  } catch (error) {
    return "Laporan diterima. Berdasarkan analisis, pastikan selalu mencadangkan dana minimal 20% dari pemasukan bulanan untuk meminimalisir risiko keuangan.";
  }
};

const CATEGORIES = {
  income: ['Gaji Bulanan', 'Bonus / THR', 'Pemberian', 'Hasil Usaha', 'Pencairan Investasi', 'Lainnya'],
  expense: ['Makanan', 'Transportasi', 'Belanja', 'Tagihan', 'Pendidikan', 'Kesehatan', 'Hiburan', 'Lainnya']
};

const formatIDR = (value) => Number(value || 0).toLocaleString('id-ID');

const normalizeTimestamp = (value) => {
  if (value === null || value === undefined || value === '') return NaN;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.getTime();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return NaN;

    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;

    const iso = new Date(trimmed);
    if (Number.isFinite(iso.getTime())) return iso.getTime();

    const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) {
      const [, day, month, year] = dmy;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day));
      if (Number.isFinite(parsed.getTime())) return parsed.getTime();
    }

    const ymd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (ymd) {
      const [, year, month, day] = ymd;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day));
      if (Number.isFinite(parsed.getTime())) return parsed.getTime();
    }
  }

  return NaN;
};

const getTransactionDate = (transaction) => {
  const timestampValue = normalizeTimestamp(transaction?.timestamp);
  if (Number.isFinite(timestampValue)) return new Date(timestampValue);

  const dateStrValue = transaction?.dateStr;
  if (typeof dateStrValue === 'string') {
    const parsedDateStr = normalizeTimestamp(dateStrValue);
    if (Number.isFinite(parsedDateStr)) return new Date(parsedDateStr);
  }

  if (transaction?.date && !Number.isNaN(Date.parse(transaction.date))) {
    return new Date(transaction.date);
  }

  return new Date(NaN);
};

const Money = ({ value, className = "" }) => (
  <span className={`inline-flex items-baseline gap-1 whitespace-nowrap align-baseline ${className}`}>
    <span className="money-currency">Rp</span>
    <span>{formatIDR(value)}</span>
  </span>
);

const UserAvatar = ({ user, size = 10, textClass = "text-xl" }) => {
  const sizeMap = { 8: 'w-8 h-8', 10: 'w-10 h-10', 12: 'w-12 h-12', 16: 'w-16 h-16', 20: 'w-20 h-20', 24: 'w-24 h-24' };
  const avatarSize = sizeMap[size] || 'w-10 h-10';

  if (user?.profilePic) {
    return <img src={user.profilePic} alt="Foto profil" className={`${avatarSize} rounded-full object-cover border-2 border-[#D4A72C] shadow-md flex-shrink-0`} />;
  }

  return (
    <div className={`${avatarSize} bg-[#0F172A] rounded-full flex items-center justify-center text-[#D4A72C] font-black uppercase shadow-inner flex-shrink-0 ${textClass}`}>
      {user?.name?.trim()?.charAt(0)?.toUpperCase() || '?'}
    </div>
  );
};

const LedgerTableComponent = ({ data, accounts, showPreview, onDelete }) => {
  const initialTotal = accounts.reduce((total, account) => total + (Number(account.initialBalance) || 0), 0);
  let runBal = initialTotal;

  const calcData = [...data].sort((a, b) => (normalizeTimestamp(a.timestamp) || 0) - (normalizeTimestamp(b.timestamp) || 0)).map(t => {
    const amount = Number(t.amount) || 0;
    if (t.type === 'income') runBal += amount;
    if (t.type === 'expense') runBal -= amount;
    return { ...t, runBal };
  }).reverse();

  const renderTypeAmount = (t, type) => {
    if (t.type !== type) return <span className="text-[#64748B]">-</span>;
    return <Money value={t.amount} />;
  };

  return (
    <>
      <div className="hidden md:block w-full print:hidden">
        <div className="dompetku-table-shell">
          <table className="dompetku-table w-full text-left border-collapse bg-white table-fixed">
            <colgroup>
              <col style={{width:'9%'}} />
              <col style={{width:'18%'}} />
              <col style={{width:'12%'}} />
              <col style={{width:'16%'}} />
              <col style={{width:'10%'}} />
              <col style={{width:'10%'}} />
              <col style={{width:'9%'}} />
              <col style={{width:'12%'}} />
              <col style={{width:'7%'}} />
            </colgroup>
            <thead>
              <tr className="bg-[#172033] text-white text-sm border-b-2 border-[#0F172A]">
                <th className="p-3 font-bold whitespace-nowrap">Tanggal</th>
                <th className="p-3 font-bold whitespace-nowrap">Keterangan</th>
                <th className="p-3 font-bold whitespace-nowrap">Kategori</th>
                <th className="p-3 font-bold whitespace-nowrap">Akun</th>
                <th className="p-3 font-bold text-right whitespace-nowrap">Pemasukan</th>
                <th className="p-3 font-bold text-right whitespace-nowrap">Pengeluaran</th>
                <th className="p-3 font-bold text-right whitespace-nowrap">Transfer</th>
                <th className="p-3 font-bold text-right whitespace-nowrap">Saldo</th>
                <th className="p-2 font-bold text-center whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {calcData.length === 0 ? (
                <tr><td colSpan="9" className="p-8 text-center text-[#64748B] italic">Belum ada transaksi.</td></tr>
              ) : calcData.map(t => {
                const isTransfer = t.type === 'transfer';
                const accName = accounts.find(a => a.id === t.accountId)?.name || 'Dihapus';
                const toAccName = accounts.find(a => a.id === t.toAccountId)?.name || 'Dihapus';
                return (
                  <tr key={t.id} className="border-b border-[#E2E8F0] hover:bg-[#F7F8FA] transition align-top">
                    <td className="p-3 text-sm text-[#475569] whitespace-nowrap align-top">{t.dateStr || new Date(t.timestamp).toLocaleDateString('id-ID')}</td>
                    <td className="p-3 font-bold text-[#172033] break-words align-top">{t.note}</td>
                    <td className="p-3 align-top"><span className="inline-block max-w-full whitespace-normal text-[10px] font-bold px-2 py-0.5 rounded bg-[#F7F8FA] text-[#64748B] uppercase border border-[#E2E8F0]">{t.category}</span></td>
                    <td className="p-3 text-xs font-bold whitespace-normal align-top">
                      {isTransfer ? <span className="text-[#4F46E5]">{accName} - {toAccName}</span> : <span className="text-[#475569]">{accName}</span>}
                    </td>
                    <td className="p-3 text-sm font-black text-[#16A34A] text-right whitespace-nowrap align-top">{renderTypeAmount(t,'income')}</td>
                    <td className="p-3 text-sm font-black text-[#DC2626] text-right whitespace-nowrap align-top">{renderTypeAmount(t,'expense')}</td>
                    <td className="p-3 text-sm font-black text-[#4F46E5] text-right whitespace-nowrap align-top">{renderTypeAmount(t,'transfer')}</td>
                    <td className="p-3 text-sm font-bold text-[#172033] text-right whitespace-nowrap align-top">{isTransfer ? <span className="text-[#64748B]">Mutasi</span> : <Money value={t.runBal} />}</td>
                    <td className="p-2 align-top">
                      <div className="flex justify-center">
                        <button
                          type="button"
                          aria-label={`Hapus transaksi ${t.note || ''}`}
                          title="Hapus transaksi"
                          onClick={() => onDelete(t.id)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] hover:text-[#DC2626] hover:border-red-200 hover:bg-red-50 transition-colors shrink-0"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${showPreview ? 'md:hidden' : 'md:hidden'} space-y-3 p-4 bg-[#F7F8FA]`}>
        {calcData.length === 0 ? (
          <div className="p-8 text-center text-[#64748B] italic">Belum ada transaksi.</div>
        ) : calcData.map(t => {
          const isIncome = t.type === 'income';
          const isTransfer = t.type === 'transfer';
          const accName = accounts.find(a => a.id === t.accountId)?.name || 'Dihapus';
          const toAccName = accounts.find(a => a.id === t.toAccountId)?.name || 'Dihapus';
          return (
            <div key={t.id} className="bg-white p-4 rounded-2xl shadow-sm border border-[#E2E8F0] relative overflow-hidden">
              <div className={`absolute inset-y-0 left-0 w-1.5 ${isIncome ? 'bg-[#16A34A]' : isTransfer ? 'bg-[#4F46E5]' : 'bg-[#DC2626]'}`}></div>
              <div className="pl-2 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-[#172033] leading-tight break-words">{t.note}</p>
                    <p className="text-[10px] text-[#64748B] mt-1 uppercase font-bold">{t.dateStr || new Date(t.timestamp).toLocaleDateString('id-ID')}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-[#F7F8FA] text-[#64748B] border border-[#E2E8F0] whitespace-nowrap">{t.category}</span>
                </div>

                <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#64748B] mb-1">Akun</p>
                  <p className="text-sm font-bold text-[#172033] break-words">{isTransfer ? `${accName} -> ${toAccName}` : accName}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 w-full min-w-0">
                  {isTransfer ? (
                    <div className="col-span-2 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                      <p className="text-[10px] uppercase font-bold text-[#64748B] mb-1">Transfer</p>
                      <Money value={t.amount} className="text-[#4F46E5] text-base font-black" />
                    </div>
                  ) : (
                    <div className={`rounded-xl border p-3 ${isIncome ? 'border-green-100 bg-green-50' : 'border-red-100 bg-red-50'}`}>
                      <p className="text-[10px] uppercase font-bold text-[#64748B] mb-1">{isIncome ? 'Pemasukan' : 'Pengeluaran'}</p>
                      <Money value={t.amount} className={`${isIncome ? 'text-[#16A34A]' : 'text-[#DC2626]'} text-base font-black`} />
                    </div>
                  )}
                  <div className="rounded-xl border border-[#E2E8F0] bg-white p-3">
                    <p className="text-[10px] uppercase font-bold text-[#64748B] mb-1">Saldo</p>
                    <Money value={t.runBal} className="text-[#172033] text-base font-black" />
                  </div>
                </div>

                {!showPreview && (
                  <button onClick={() => onDelete(t.id)} className="w-full pt-2 border-t border-[#E2E8F0] text-xs font-bold text-[#64748B] hover:text-[#DC2626]">Hapus transaksi</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

const AddAccountModal = ({ onClose, onSave }) => {
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState('Bank');
  const [initBal, setInitBal] = useState('');

  const handleSave = (e) => {
     e.preventDefault();
     onSave({ name: accName, type: accType, initialBalance: parseInt(initBal) || 0 });
  };

  return (
    <div className="fixed inset-0 bg-[#0F172A]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <form onSubmit={handleSave} className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
         <h3 className="font-black text-xl text-[#172033] mb-4">Tambah Akun/Dompet</h3>
         <div className="space-y-4">
           <div>
             <label className="block text-xs font-bold text-[#475569] uppercase mb-1">Nama Akun</label>
             <input type="text" required value={accName} onChange={e=>setAccName(e.target.value)} placeholder="Contoh: Bank Jago, OVO" className="w-full p-3 bg-[#F7F8FA] border border-[#CBD5E1] rounded-xl focus:border-[#D4A72C] focus:ring-1 focus:ring-[#D4A72C] font-bold outline-none" />
           </div>
           <div>
             <label className="block text-xs font-bold text-[#475569] uppercase mb-1">Jenis</label>
             <select value={accType} onChange={e=>setAccType(e.target.value)} className="w-full p-3 bg-[#F7F8FA] border border-[#CBD5E1] rounded-xl focus:border-[#D4A72C] focus:ring-1 focus:ring-[#D4A72C] font-bold outline-none">
               <option value="Bank">Bank</option>
               <option value="E-Wallet">E-Wallet</option>
               <option value="Dompet">Dompet Tunai</option>
               <option value="Tabungan">Tabungan Khusus</option>
             </select>
           </div>
           <div>
             <label className="block text-xs font-bold text-[#475569] uppercase mb-1">Saldo Awal (Rp)</label>
             <input type="number" min="0" required value={initBal} onChange={e=>setInitBal(e.target.value)} placeholder="0" className="w-full p-3 bg-[#F7F8FA] border border-[#CBD5E1] rounded-xl focus:border-[#D4A72C] focus:ring-1 focus:ring-[#D4A72C] font-bold outline-none text-lg" />
           </div>
           <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-3 bg-white border border-[#D4A72C] text-[#B8860B] font-bold rounded-xl hover:bg-[#F7F8FA]">Batal</button>
              <button type="submit" className="flex-1 py-3 bg-[#D4A72C] text-[#172033] font-black rounded-xl hover:bg-[#F2C94C] shadow-md">Simpan</button>
           </div>
         </div>
      </form>
    </div>
  );
};

const AddBudgetModal = ({ onClose, onSave, initialBudget = null }) => {
  const [bCat, setBCat] = useState(initialBudget?.category || CATEGORIES.expense[0]);
  const [bLimit, setBLimit] = useState(initialBudget?.limit ? String(initialBudget.limit) : '');

  const handleSave = (e) => {
     e.preventDefault();
     onSave({ ...(initialBudget || {}), category: bCat, limit: parseInt(bLimit) || 0 });
  };

  return (
    <div className="fixed inset-0 bg-[#0F172A]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <form onSubmit={handleSave} className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
         <h3 className="font-black text-xl text-[#172033] mb-4">{initialBudget ? 'Edit Anggaran' : 'Set Anggaran Baru'}</h3>
         <div className="space-y-4">
           <div>
             <label className="block text-xs font-bold text-[#475569] uppercase mb-1">Kategori Pengeluaran</label>
             <select value={bCat} onChange={e=>setBCat(e.target.value)} className="w-full p-3 bg-[#F7F8FA] border border-[#CBD5E1] rounded-xl focus:border-[#D4A72C] focus:ring-1 focus:ring-[#D4A72C] font-bold outline-none">
               {CATEGORIES.expense.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
           </div>
           <div>
             <label className="block text-xs font-bold text-[#475569] uppercase mb-1">Batas Maksimal Bulanan (Rp)</label>
             <input type="number" min="1" required value={bLimit} onChange={e=>setBLimit(e.target.value)} placeholder="0" className="w-full p-3 bg-[#F7F8FA] border border-[#CBD5E1] rounded-xl focus:border-[#D4A72C] focus:ring-1 focus:ring-[#D4A72C] font-bold outline-none text-lg" />
           </div>
           <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-3 bg-white border border-[#D4A72C] text-[#B8860B] font-bold rounded-xl hover:bg-[#F7F8FA]">Batal</button>
              <button type="submit" className="flex-1 py-3 bg-[#D4A72C] text-[#172033] font-black rounded-xl hover:bg-[#F2C94C] shadow-md">Simpan</button>
           </div>
         </div>
      </form>
    </div>
  );
};

const AddGoalModal = ({ onClose, onSave }) => {
  const [name, setName] = useState('');
  const [tgtAmount, setTgtAmount] = useState('');
  const [deadline, setDeadline] = useState('');

  const handleSave = (e) => {
     e.preventDefault();
     onSave({ name, targetAmount: parseInt(tgtAmount), collectedAmount: 0, deadline });
  };

  return (
    <div className="fixed inset-0 bg-[#0F172A]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <form onSubmit={handleSave} className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
         <h3 className="font-black text-xl text-[#172033] mb-4">Buat Target Baru</h3>
         <div className="space-y-4">
           <div>
             <label className="block text-xs font-bold text-[#475569] uppercase mb-1">Nama Target</label>
             <input type="text" required value={name} onChange={e=>setName(e.target.value)} placeholder="Contoh: Dana Darurat" className="w-full p-3 bg-[#F7F8FA] border border-[#CBD5E1] rounded-xl focus:border-[#D4A72C] focus:ring-1 focus:ring-[#D4A72C] font-bold outline-none" />
           </div>
           <div>
             <label className="block text-xs font-bold text-[#475569] uppercase mb-1">Jumlah Target (Rp)</label>
             <input type="number" min="1" required value={tgtAmount} onChange={e=>setTgtAmount(e.target.value)} placeholder="0" className="w-full p-3 bg-[#F7F8FA] border border-[#CBD5E1] rounded-xl focus:border-[#D4A72C] focus:ring-1 focus:ring-[#D4A72C] font-bold outline-none" />
           </div>
           <div>
             <label className="block text-xs font-bold text-[#475569] uppercase mb-1">Target Selesai</label>
             <input type="date" required value={deadline} onChange={e=>setDeadline(e.target.value)} className="w-full p-3 bg-[#F7F8FA] border border-[#CBD5E1] rounded-xl focus:border-[#D4A72C] focus:ring-1 focus:ring-[#D4A72C] font-bold outline-none" />
           </div>
           <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-3 bg-white border border-[#D4A72C] text-[#B8860B] font-bold rounded-xl hover:bg-[#F7F8FA]">Batal</button>
              <button type="submit" className="flex-1 py-3 bg-[#D4A72C] text-[#172033] font-black rounded-xl hover:bg-[#F2C94C] shadow-md">Simpan</button>
           </div>
         </div>
      </form>
    </div>
  );
};

const AddRecurringModal = ({ accounts, onClose, onSave }) => {
  const [type, setType] = useState('expense');
  const [cat, setCat] = useState(CATEGORIES.expense[0]);
  const [note, setNote] = useState('');
  const [amt, setAmt] = useState('');
  const [accId, setAccId] = useState('');
  const [freq, setFreq] = useState('monthly');
  const [nextDate, setNextDate] = useState('');

  const handleSave = (e) => {
     e.preventDefault();
     onSave({ type, category: cat, note, amount: parseInt(amt), accountId: accId, frequency: freq, nextTimestamp: new Date(nextDate).getTime(), active: true });
  };

  return (
    <div className="fixed inset-0 bg-[#0F172A]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <form onSubmit={handleSave} className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 h-max max-h-[90vh] overflow-y-auto">
         <h3 className="font-black text-xl text-[#172033] mb-4">Transaksi Berulang Baru</h3>
         <div className="space-y-4">
           <div className="flex gap-2">
              <button type="button" onClick={()=>setType('expense')} className={`flex-1 p-2 rounded-lg font-bold text-sm ${type==='expense'?'bg-[#DC2626] text-white':'bg-[#F7F8FA] border border-[#CBD5E1] text-[#475569]'}`}>Pengeluaran</button>
              <button type="button" onClick={()=>setType('income')} className={`flex-1 p-2 rounded-lg font-bold text-sm ${type==='income'?'bg-[#16A34A] text-white':'bg-[#F7F8FA] border border-[#CBD5E1] text-[#475569]'}`}>Pemasukan</button>
           </div>
           <div className="grid grid-cols-2 gap-2 w-full min-w-0">
             <div>
               <label className="block text-[10px] font-bold text-[#475569] uppercase mb-1">Kategori</label>
               <select value={cat} onChange={e=>setCat(e.target.value)} className="w-full p-2 bg-[#F7F8FA] border border-[#CBD5E1] rounded-xl focus:border-[#D4A72C] focus:ring-1 focus:ring-[#D4A72C] font-bold outline-none text-sm">
                 {CATEGORIES[type].map(c => <option key={c} value={c}>{c}</option>)}
               </select>
             </div>
             <div>
               <label className="block text-[10px] font-bold text-[#475569] uppercase mb-1">Akun</label>
               <select required value={accId} onChange={e=>setAccId(e.target.value)} className="w-full p-2 bg-[#F7F8FA] border border-[#CBD5E1] rounded-xl focus:border-[#D4A72C] focus:ring-1 focus:ring-[#D4A72C] font-bold outline-none text-sm">
                 <option value="" disabled>Pilih Akun</option>
                 {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
               </select>
             </div>
           </div>
           <div>
             <label className="block text-[10px] font-bold text-[#475569] uppercase mb-1">Keterangan</label>
             <input type="text" required value={note} onChange={e=>setNote(e.target.value)} placeholder="Contoh: Tagihan Listrik" className="w-full p-3 bg-[#F7F8FA] border border-[#CBD5E1] rounded-xl focus:border-[#D4A72C] focus:ring-1 focus:ring-[#D4A72C] font-bold outline-none" />
           </div>
           <div>
             <label className="block text-[10px] font-bold text-[#475569] uppercase mb-1">Nominal (Rp)</label>
             <input type="number" min="1" required value={amt} onChange={e=>setAmt(e.target.value)} placeholder="0" className="w-full p-3 bg-[#F7F8FA] border border-[#CBD5E1] rounded-xl focus:border-[#D4A72C] focus:ring-1 focus:ring-[#D4A72C] font-bold outline-none text-xl" />
           </div>
           <div className="grid grid-cols-2 gap-2 w-full min-w-0">
             <div>
               <label className="block text-[10px] font-bold text-[#475569] uppercase mb-1">Frekuensi</label>
               <select value={freq} onChange={e=>setFreq(e.target.value)} className="w-full p-2 bg-[#F7F8FA] border border-[#CBD5E1] rounded-xl focus:border-[#D4A72C] focus:ring-1 focus:ring-[#D4A72C] font-bold outline-none text-sm">
                 <option value="monthly">Bulanan</option>
                 <option value="weekly">Mingguan</option>
               </select>
             </div>
             <div>
               <label className="block text-[10px] font-bold text-[#475569] uppercase mb-1">Tgl Berikutnya</label>
               <input type="date" required value={nextDate} onChange={e=>setNextDate(e.target.value)} className="w-full p-2 bg-[#F7F8FA] border border-[#CBD5E1] rounded-xl focus:border-[#D4A72C] focus:ring-1 focus:ring-[#D4A72C] font-bold outline-none text-sm" />
             </div>
           </div>
           <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-3 bg-white border border-[#D4A72C] text-[#B8860B] font-bold rounded-xl hover:bg-[#F7F8FA]">Batal</button>
              <button type="submit" className="flex-1 py-3 bg-[#D4A72C] text-[#172033] font-black rounded-xl hover:bg-[#F2C94C] shadow-md">Simpan Jadwal</button>
           </div>
         </div>
      </form>
    </div>
  );
};

const TransactionModal = ({ txType, accounts, accountBalances, onClose, onSubmit, isAiLoading }) => {
  const [formData, setFormData] = useState({ category: '', note: '', amount: '', accountId: '', toAccountId: '' });

  if (!txType) return null;

  const title = txType === 'income' ? 'Pemasukan' : txType === 'expense' ? 'Pengeluaran' : 'Transfer';
  const labelBadge = txType === 'income' ? 'UANG MASUK' : txType === 'expense' ? 'UANG KELUAR' : 'MUTASI DANA';
  const accentColor = txType === 'income' ? 'text-[#16A34A]' : txType === 'expense' ? 'text-[#DC2626]' : 'text-[#4F46E5]';
  const bgBadge = txType === 'income' ? 'bg-[#16A34A]/10' : txType === 'expense' ? 'bg-[#DC2626]/10' : 'bg-[#4F46E5]/10';

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-[#172033]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl relative animate-in zoom-in-95 duration-200">
        <button type="button" onClick={onClose} className="absolute top-6 right-6 p-2 bg-[#F7F8FA] rounded-xl text-[#64748B] hover:text-[#172033] hover:bg-[#E2E8F0] transition">
          <X size={20} />
        </button>

        <p className="text-[11px] font-black uppercase text-[#B8860B] tracking-widest mb-1">{labelBadge}</p>
        <h3 className="font-black text-3xl text-[#172033] mb-4">{title}</h3>
        
        <div className="mb-6">
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${bgBadge} ${accentColor}`}>
            {title}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {txType !== 'transfer' && (
            <div>
              <label className="block text-sm font-bold text-[#64748B] mb-1.5">Kategori</label>
              <select required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full p-3.5 bg-white border-2 border-[#E2E8F0] rounded-xl outline-none font-bold text-[#172033] focus:border-[#D4A72C] transition-all">
                <option value="" disabled>Pilih Kategori</option>
                {CATEGORIES[txType].map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-bold text-[#64748B] mb-1.5">Keterangan</label>
            <input type="text" required value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} placeholder={txType === 'income' ? 'Contoh: Gaji bulan Agustus' : txType === 'expense' ? 'Contoh: Beli makan siang' : 'Contoh: Transfer ke tabungan'} className="w-full p-3.5 bg-white border-2 border-[#E2E8F0] rounded-xl outline-none font-bold text-[#172033] focus:border-[#D4A72C] transition-all placeholder-[#94A3B8]" />
          </div>
          <div>
            <label className="block text-sm font-bold text-[#64748B] mb-1.5">Nominal (Rp)</label>
            <input type="number" min="1" required value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} placeholder="0" className="w-full p-3.5 bg-white border-2 border-[#E2E8F0] rounded-xl outline-none font-bold text-[#172033] focus:border-[#D4A72C] transition-all placeholder-[#94A3B8]" />
          </div>
          <div>
            <label className="block text-sm font-bold text-[#64748B] mb-1.5">{txType === 'transfer' ? 'Dari Akun' : 'Akun'}</label>
            <select required value={formData.accountId} onChange={e => setFormData({...formData, accountId: e.target.value})} className="w-full p-3.5 bg-white border-2 border-[#E2E8F0] rounded-xl outline-none font-bold text-[#172033] focus:border-[#D4A72C] transition-all">
              <option value="" disabled>Pilih akun</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} (Rp {(accountBalances[a.id] || 0).toLocaleString('id-ID')})</option>)}
            </select>
          </div>
          {txType === 'transfer' && (
            <div>
              <label className="block text-sm font-bold text-[#64748B] mb-1.5">Ke Akun</label>
              <select required value={formData.toAccountId} onChange={e => setFormData({...formData, toAccountId: e.target.value})} className="w-full p-3.5 bg-white border-2 border-[#E2E8F0] rounded-xl outline-none font-bold text-[#172033] focus:border-[#D4A72C] transition-all">
                <option value="" disabled>Pilih akun tujuan</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          <button type="submit" disabled={isAiLoading} className="w-full py-4 mt-4 bg-[#172033] hover:bg-[#0F172A] text-[#D4A72C] font-black text-lg rounded-xl transition-all shadow-md flex items-center justify-center gap-2">
            {isAiLoading ? <Loader2 size={24} className="animate-spin" /> : 'Simpan Transaksi'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default function App() {
  const [appState, setAppState] = useState('loading');
  const [activeTab, setActiveTab] = useState('dashboard');

  // Autentikasi lokal: nomor WhatsApp + PIN 6 digit.
  // PIN disimpan sebagai hash SHA-256, bukan teks biasa.
  const [authMode, setAuthMode] = useState('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authPin, setAuthPin] = useState('');
  const [authConfirmPin, setAuthConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  const [reportPeriod, setReportPeriod] = useState('Bulan Ini');
  const [customDates, setCustomDates] = useState({ start: '', end: '' });
  
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [recurring, setRecurring] = useState([]);

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showAddRecurring, setShowAddRecurring] = useState(false);
  
  const [txType, setTxType] = useState(null); 
  
  const [aiMessage, setAiMessage] = useState("Selamat datang. Catat transaksi Anda dan Domi AI akan membantu membaca kondisi arus kas berdasarkan data yang tersimpan.");
  const [isAiLoading, setIsAiLoading] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const hydrateSession = async (session) => {
      if (!session?.user || !mounted) return;
      try {
        const data = await loadCloudUserData(session.user);
        if (!mounted) return;

        setUser(data.user);
        setAuthName(data.user.name || '');
        setAuthEmail(data.user.email || '');
        setAuthPhone(data.user.phone || '');
        setAccounts(data.accounts);
        setTransactions([...data.transactions].sort((a, b) => b.timestamp - a.timestamp));
        setBudgets(data.budgets);
        setGoals(data.goals);
        setRecurring(data.recurring);
        sessionStorage.setItem('dompetku_user_id', data.user.id);
        sessionStorage.setItem('dompetku_authenticated', '1');
        setAppState('app');
      } catch (error) {
        console.error('Gagal memuat data Supabase:', error);
        setAuthError('Data akun gagal dimuat. Periksa koneksi internet lalu coba lagi.');
        setAppState('auth');
      }
    };

    const boot = async () => {
      try {
        const hashParams = new URLSearchParams(
          window.location.hash.replace(/^#/, '')
        );
        const searchParams = new URLSearchParams(window.location.search);

        const isRecovery =
          hashParams.get('type') === 'recovery' ||
          searchParams.get('recovery') === '1';

        if (isRecovery) {
          setAuthMode('reset');
          setAuthError('');
          setAppState('auth');
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await hydrateSession(session);
        } else {
          setAuthMode('login');
          setAppState('auth');
        }
      } catch (error) {
        console.error('Auth boot failed:', error);
        setAuthMode('login');
        setAppState('auth');
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setAccounts([]);
        setTransactions([]);
        setBudgets([]);
        setGoals([]);
        setRecurring([]);
        setAppState('auth');
        setAuthMode('login');
      }
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('reset');
        setAuthError('');
        setAppState('auth');
      }
      if (event === 'SIGNED_IN' && session && appState === 'loading') {
        const hashParams = new URLSearchParams(
          window.location.hash.replace(/^#/, '')
        );
        const searchParams = new URLSearchParams(window.location.search);
        const isRecovery =
          hashParams.get('type') === 'recovery' ||
          searchParams.get('recovery') === '1';

        if (!isRecovery) {
          void hydrateSession(session);
        }
      }
    });

    void boot();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthBusy(true);

    try {
      const email = authEmail.trim().toLowerCase();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Email tidak valid. Periksa kembali alamat email Anda.');
      }
      if (authMode !== 'forgot' && !/^\d{6}$/.test(authPin)) {
        throw new Error('PIN harus tepat 6 digit angka.');
      }

      if (authMode === 'register') {
        if (!authName.trim()) throw new Error('Nama pengguna wajib diisi.');
        if (authPin !== authConfirmPin) throw new Error('Konfirmasi PIN tidak sama.');

        const { data, error } = await supabase.auth.signUp({
          email,
          password: authPin,
          options: {
            data: { name: authName.trim() }
          }
        });

        if (error) {
          if (error.message.toLowerCase().includes('already registered')) {
            throw new Error('Email sudah terdaftar. Silakan masuk.');
          }
          throw error;
        }

        if (!data.user) throw new Error('Akun gagal dibuat. Silakan coba lagi.');

        const hydrated = await loadCloudUserData(data.user);
        setUser(hydrated.user);
        setAuthName(hydrated.user.name);
        setAuthEmail(hydrated.user.email);
        setAccounts(hydrated.accounts);
        setTransactions([]);
        setBudgets([]);
        setGoals([]);
        setRecurring([]);
        setAuthPin('');
        setAuthConfirmPin('');
        setAppState('app');
        return;
      }

      if (authMode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/?recovery=1`
        });
        if (error) throw error;

        setAuthError('Link untuk membuat PIN baru sudah dikirim ke email Anda. Buka email tersebut, lalu kembali ke DompetKu.');
        setAuthPin('');
        setAuthConfirmPin('');
        return;
      }

      if (authMode === 'reset') {
        if (authPin !== authConfirmPin) throw new Error('Konfirmasi PIN tidak sama.');

        const { error } = await supabase.auth.updateUser({ password: authPin });
        if (error) throw error;

        await supabase.auth.signOut();
        setAuthMode('login');
        setAuthError('PIN berhasil diubah. Silakan masuk dengan PIN baru.');
        setAuthPin('');
        setAuthConfirmPin('');
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: authPin
      });

      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('invalid login credentials') || msg.includes('invalid')) {
          throw new Error('Email atau PIN salah. Bila belum punya akun, pilih Daftar sekarang.');
        }
        throw error;
      }

      if (!data.user) throw new Error('Sesi login tidak ditemukan. Silakan coba lagi.');

      const hydrated = await loadCloudUserData(data.user);
      setUser(hydrated.user);
      setAuthName(hydrated.user.name);
      setAuthEmail(hydrated.user.email);
      setAuthPhone(hydrated.user.phone);
      setAccounts(hydrated.accounts);
      setTransactions([...hydrated.transactions].sort((a, b) => b.timestamp - a.timestamp));
      setBudgets(hydrated.budgets);
      setGoals(hydrated.goals);
      setRecurring(hydrated.recurring);
      setAuthPin('');
      setAuthError('');
      setAppState('app');
    } catch (error) {
      console.error('Auth error:', error);
      setAuthError(error.message || 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setAuthBusy(false);
    }
  };

  const switchAuthMode = (mode) => {
    setAuthMode(mode);
    setAuthError('');
    setAuthPin('');
    setAuthConfirmPin('');
    if (mode === 'register') {
      setAuthName(user?.name || '');
      setAuthEmail(user?.email || authEmail || '');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    sessionStorage.removeItem('dompetku_authenticated');
    sessionStorage.removeItem('dompetku_user_id');
    setUser(null);
    setAccounts([]);
    setTransactions([]);
    setBudgets([]);
    setGoals([]);
    setRecurring([]);
    setAuthMode('login');
    setAuthEmail('');
    setAuthPin('');
    setAuthConfirmPin('');
    setAuthError('');
    setActiveTab('dashboard');
    setAppState('auth');
  };

  const accountBalances = useMemo(() => {
    const balances = {};
    accounts.forEach(account => { balances[account.id] = Number(account.initialBalance) || 0; });

    [...transactions].sort((a, b) => a.timestamp - b.timestamp).forEach(t => {
      const amount = Number(t.amount) || 0;
      if (t.type === 'income' && balances[t.accountId] !== undefined) balances[t.accountId] += amount;
      if (t.type === 'expense' && balances[t.accountId] !== undefined) balances[t.accountId] -= amount;
      if (t.type === 'transfer') {
        if (t.accountId && balances[t.accountId] !== undefined) balances[t.accountId] -= amount;
        if (t.toAccountId && balances[t.toAccountId] !== undefined) balances[t.toAccountId] += amount;
      }
    });
    return balances;
  }, [transactions, accounts]);

  const netWorth = useMemo(() => Object.values(accountBalances).reduce((total, balance) => total + (Number(balance) || 0), 0), [accountBalances]);

  // OUTPUT laporan memakai periode kalender nyata; filter layar tetap memakai label semula.
  const reportPeriodLabel = useMemo(() => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const formatDate = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    const formatMonth = (d) => d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }).toUpperCase();
    if (reportPeriod === 'Hari Ini') return formatDate(now);
    if (reportPeriod === 'Bulan Ini') return formatMonth(now);
    if (reportPeriod === 'Bulan Lalu') return formatMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    if (reportPeriod === 'Tahun Ini') return `JANUARI–DESEMBER ${now.getFullYear()}`;
    if (reportPeriod === 'Minggu Ini') {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start); end.setDate(end.getDate() + 6);
      return `${formatDate(start)}–${formatDate(end)}`;
    }
    if (reportPeriod === 'Custom') {
      if (customDates.start && customDates.end) {
        return `${formatDate(new Date(`${customDates.start}T00:00:00`))}–${formatDate(new Date(`${customDates.end}T00:00:00`))}`;
      }
      return 'PERIODE CUSTOM';
    }
    return 'SEMUA WAKTU';
  }, [reportPeriod, customDates]);

  const filteredTransactions = useMemo(() => {
    const now = new Date();

    const toDateStart = (date) => {
      const value = new Date(date);
      value.setHours(0, 0, 0, 0);
      return value;
    };

    const toDateEnd = (date) => {
      const value = new Date(date);
      value.setHours(23, 59, 59, 999);
      return value;
    };

    const filtered = transactions.filter((t) => {
      const transactionDate = getTransactionDate(t);
      if (!Number.isFinite(transactionDate.getTime())) return false;

      if (reportPeriod === 'Semua Waktu') return true;
      if (reportPeriod === 'Hari Ini') return transactionDate.toDateString() === now.toDateString();
      if (reportPeriod === 'Minggu Ini') {
        const start = toDateStart(new Date(now));
        start.setDate(start.getDate() - start.getDay());
        const end = toDateEnd(new Date(now));
        return transactionDate >= start && transactionDate <= end;
      }
      if (reportPeriod === 'Bulan Ini') {
        return transactionDate.getMonth() === now.getMonth() && transactionDate.getFullYear() === now.getFullYear();
      }
      if (reportPeriod === 'Bulan Lalu') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return transactionDate.getMonth() === lastMonth.getMonth() && transactionDate.getFullYear() === lastMonth.getFullYear();
      }
      if (reportPeriod === 'Tahun Ini') return transactionDate.getFullYear() === now.getFullYear();
      if (reportPeriod === 'Custom') {
        if (!customDates.start || !customDates.end) return true;
        const start = toDateStart(new Date(`${customDates.start}T00:00:00`));
        const end = toDateEnd(new Date(`${customDates.end}T23:59:59`));
        return transactionDate >= start && transactionDate <= end;
      }
      return true;
    });

    if (import.meta.env.DEV) {
      console.log('[DompetKu][REPORT-FILTER]', {
        reportPeriod,
        transactionsCount: transactions.length,
        filteredCount: filtered.length,
        selectedRange: reportPeriodLabel,
        firstDates: transactions.slice(0, 5).map(t => ({ id: t.id, timestamp: t.timestamp, dateStr: t.dateStr, parsed: getTransactionDate(t).toISOString() }))
      });
    }

    return filtered;
  }, [transactions, reportPeriod, customDates, reportPeriodLabel]);

  useEffect(() => {
    if (!transactions.length || reportPeriod === 'Custom') return;
    if (reportPeriod === 'Semua Waktu') return;
    if (filteredTransactions.length > 0) return;

    if (import.meta.env.DEV) {
      console.log('[DompetKu][REPORT-PERIOD-FALLBACK]', {
        previousPeriod: reportPeriod,
        transactionsCount: transactions.length,
        filteredCount: 0,
        fallbackTo: 'Semua Waktu'
      });
    }

    setReportPeriod('Semua Waktu');
  }, [transactions, reportPeriod, filteredTransactions]);

  const summary = useMemo(() => {
    let income = 0; let expense = 0; let savings = 0; let transfer = 0;
    const sourceTxs = activeTab === 'dashboard' ? transactions : filteredTransactions;

    sourceTxs.forEach(t => {
       if (t.type === 'income') income += Number(t.amount) || 0;
       if (t.type === 'expense') expense += Number(t.amount) || 0;
       if (t.type === 'transfer') {
          transfer += Number(t.amount) || 0;
          const targetAcc = accounts.find(a => a.id === t.toAccountId);
          if(targetAcc && targetAcc.type === 'Tabungan') savings += Number(t.amount) || 0;
       }
    });
    return { income, expense, savings, transfer, netWorth };
  }, [transactions, filteredTransactions, activeTab, accounts, netWorth]);

  const expenseChartData = useMemo(() => {
    const source = activeTab === 'reports' ? filteredTransactions : transactions.filter((t) => {
      const date = getTransactionDate(t);
      return Number.isFinite(date.getTime()) && date.getMonth() === new Date().getMonth() && date.getFullYear() === new Date().getFullYear();
    });
    const expenses = source.filter(t => t.type === 'expense');
    const grouped = expenses.reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
      return acc;
    }, {});
    const totalExp = Object.values(grouped).reduce((a, b) => a + b, 0);
    const maxAmount = Math.max(...Object.values(grouped), 1);
    
    return Object.entries(grouped)
      .map(([cat, amt]) => ({ category: cat, amount: amt, percentage: (amt / (totalExp || 1)) * 100, barWidth: (amt/maxAmount)*100 }))
      .sort((a, b) => b.amount - a.amount);
  }, [transactions, filteredTransactions, activeTab]);

  const pendingRecurring = useMemo(() => {
    const today = new Date().setHours(23,59,59,999); 
    return recurring.filter(r => r.active && r.nextTimestamp <= today);
  }, [recurring]);

  const processRecurring = async (recId, action) => {
    const rec = recurring.find(r => r.id === recId);
    if (!rec) return;

    let updatedRecs = [...recurring];

    if (action === 'confirm') {
      const newTx = {
        id: `tx_${user.id}_${Date.now()}`,
        timestamp: Date.now(),
        type: rec.type,
        category: rec.category,
        note: rec.note,
        amount: rec.amount,
        accountId: rec.accountId,
        toAccountId: rec.toAccountId || null,
        dateStr: new Date().toLocaleDateString('id-ID'),
        userId: user.id
      };
      await saveStoreData('transactions', newTx, user.id);
      setTransactions(prev => [newTx, ...prev]);
    }

    if (action === 'confirm' || action === 'skip') {
      const nextDate = new Date(rec.nextTimestamp);
      if (rec.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
      if (rec.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
      const updatedRec = { ...rec, nextTimestamp: nextDate.getTime() };
      await saveStoreData('recurring', updatedRec, user.id);
      updatedRecs = updatedRecs.map(r => r.id === recId ? updatedRec : r);
    } else if (action === 'disable') {
      const updatedRec = { ...rec, active: false };
      await saveStoreData('recurring', updatedRec, user.id);
      updatedRecs = updatedRecs.map(r => r.id === recId ? updatedRec : r);
    }
    setRecurring(updatedRecs);
  };

  const handleTransactionSubmit = async (formData) => {
    const val = Number(formData.amount);
    if (!Number.isFinite(val) || val <= 0) { alert('Nominal transaksi harus lebih dari Rp0.'); return; }
    if (!formData.accountId) { alert('Pilih akun terlebih dahulu.'); return; }
    if (txType === 'transfer' && !formData.toAccountId) { alert('Pilih akun tujuan transfer.'); return; }
    if (txType === 'transfer' && formData.accountId === formData.toAccountId) { alert('Akun sumber dan akun tujuan tidak boleh sama.'); return; }

    const newTx = {
      id: `tx_${user.id}_${Date.now()}`,
      timestamp: Date.now(),
      type: txType,
      category: txType === 'transfer' ? 'Transfer' : (formData.category || CATEGORIES[txType][0]),
      note: formData.note,
      amount: val,
      accountId: formData.accountId,
      toAccountId: txType === 'transfer' ? formData.toAccountId : null,
      dateStr: new Date().toLocaleDateString('id-ID'),
      userId: user.id
    };

    const updatedTxs = [newTx, ...transactions];
    setTransactions(updatedTxs);
    await saveStoreData('transactions', newTx, user.id);
    setTxType(null); 

    setIsAiLoading(true);
    const topCat = expenseChartData[0] ? `${expenseChartData[0].category} (Rp${expenseChartData[0].amount.toLocaleString('id-ID')})` : 'Belum ada';
    const promptData = `Kekayaan: Rp${summary.netWorth}. Pengeluaran bln ini: Rp${summary.expense}. Top Kategori: ${topCat}. Transaksi Baru: ${newTx.type} Rp${val} untuk "${newTx.note}". Analisis dampaknya bagi kesehatan finansial. Maks 2 kalimat pendek.`;
    
    const reply = await callDomiAI(promptData);
    setAiMessage(typeof reply === 'string' ? reply : 'Analisis AI selesai dan transaksi telah disimpan.');
    setIsAiLoading(false);
  };

  const handleDeleteTransaction = async (id) => {
     if(window.confirm('Hapus histori mutasi ini? Saldo akan disesuaikan kembali otomatis.')) {
       await deleteStoreData('transactions', id, user.id);
       setTransactions(prev => prev.filter(t => t.id !== id));
     }
  };

  const buildReportRows = () => {
    if (import.meta.env.DEV) {
      console.log('[DompetKu][BUILD-REPORT-ROWS]', {
        reportPeriod,
        rawTransactions: transactions.length,
        filteredTransactions: filteredTransactions.length,
        reportRows: filteredTransactions.length
      });
    }

    const sorted = [...filteredTransactions].sort((a, b) => (normalizeTimestamp(a.timestamp) || 0) - (normalizeTimestamp(b.timestamp) || 0));
    const initialTotal = accounts.reduce((total, account) => total + (Number(account.initialBalance) || 0), 0);
    let runningBalance = initialTotal;

    return sorted.map((t, index) => {
      const amount = Number(t.amount) || 0;
      const transactionDate = getTransactionDate(t);
      const dateValue = Number.isFinite(transactionDate.getTime()) ? transactionDate : new Date(Number(t.timestamp) || Date.now());

      if (t.type === 'income') runningBalance += amount;
      if (t.type === 'expense') runningBalance -= amount;
      if (t.type === 'transfer') {
        const sourceExists = !!t.accountId;
        const destExists = !!t.toAccountId;
        if (sourceExists && destExists) {
          // transfer changes internal account balances only; it does not affect net wealth
        }
      }

      const srcAcc = accounts.find(a => a.id === t.accountId)?.name || '-';
      const destAcc = accounts.find(a => a.id === t.toAccountId)?.name || '-';
      const displayId = `TX-${String(index + 1).padStart(3, '0')}`;

      return {
        id: t.id,
        displayId,
        date: dateValue,
        dateText: formatExcelDate(dateValue),
        type: t.type.toUpperCase(),
        note: t.note || '',
        category: t.category || '',
        source: srcAcc,
        destination: destAcc,
        income: t.type === 'income' ? amount : 0,
        expense: t.type === 'expense' ? amount : 0,
        transfer: t.type === 'transfer' ? amount : 0,
        balance: runningBalance
      };
    });
  };

  const formatExcelDate = (value) => {
    if (!value) return '-';
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '-';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  };

  const formatExcelMoneyValue = (value) => {
    const numericValue = Number(value) || 0;
    return numericValue;
  };

  const excelMoneyFormat = '"Rp "#,##0;[Red]-"Rp "#,##0;"Rp "0';

  const applyMoneyFormatToSheet = (sheet, columnIndexes) => {
    const range = Object.keys(sheet).filter(key => !key.startsWith('!'));
    range.forEach((key) => {
      const cell = sheet[key];
      if (!cell || typeof cell !== 'object') return;
      const ref = XLSX.utils.decode_cell(key);
      if (columnIndexes.includes(ref.c) && typeof cell.v === 'number') {
        cell.z = excelMoneyFormat;
      }
    });
  };

  const excelTheme = {
    titleTextColor: 'FF1F5F4A',
    headerBg: 'FF2E7D5E',
    headerText: 'FFFFFFFF',
    totalBg: 'FFDEF0E8',
    totalText: 'FF173F34',
    softRowBg: 'FFF6FAF7',
    borderColor: 'FFB9C9C1',
    strongBorderColor: 'FF7E9D92',
    infoText: 'FF1F2937'
  };

  const applyBorderStyle = (cell, borderStyle = 'thin', color = excelTheme.borderColor) => {
    if (!cell) return;
    cell.s = {
      ...(cell.s || {}),
      border: {
        top: { style: borderStyle, color: { rgb: color } },
        bottom: { style: borderStyle, color: { rgb: color } },
        left: { style: borderStyle, color: { rgb: color } },
        right: { style: borderStyle, color: { rgb: color } }
      }
    };
  };

  const trimSheetToUsedRange = (sheet) => {
    if (!sheet || !sheet['!ref']) return sheet;

    try {
      const range = XLSX.utils.decode_range(sheet['!ref']);
      let endCol = range.e.c;
      let endRow = range.e.r;

      while (endCol >= range.s.c) {
        let hasContent = false;
        for (let row = range.s.r; row <= endRow; row++) {
          const cellRef = XLSX.utils.encode_cell({ c: endCol, r: row });
          if (sheet[cellRef] && sheet[cellRef].v !== undefined && sheet[cellRef].v !== null) {
            hasContent = true;
            break;
          }
        }
        if (hasContent) break;
        endCol -= 1;
      }

      while (endRow >= range.s.r) {
        let hasContent = false;
        for (let col = range.s.c; col <= endCol; col++) {
          const cellRef = XLSX.utils.encode_cell({ c: col, r: endRow });
          if (sheet[cellRef] && sheet[cellRef].v !== undefined && sheet[cellRef].v !== null) {
            hasContent = true;
            break;
          }
        }
        if (hasContent) break;
        endRow -= 1;
      }

      range.e.c = Math.max(range.s.c, endCol);
      range.e.r = Math.max(range.s.r, endRow);
      sheet['!ref'] = XLSX.utils.encode_range(range);
    } catch (error) {
      console.warn('Gagal memotong print area Excel ke data aktual:', error);
    }

    return sheet;
  };

  const applyPrintSettingsToSheet = (sheet, options = {}) => {
    const {
      paperSize = 9,
      orientation = 'landscape',
      fitToWidth = 1,
      fitToHeight = 0
    } = options;

    if (!sheet) return;

    sheet['!margins'] = {
      left: 0.35,
      right: 0.35,
      top: 0.45,
      bottom: 0.45,
      header: 0.15,
      footer: 0.15
    };

    sheet['!page'] = {
      orientation,
      paperSize,
      fitToWidth,
      fitToHeight
    };

    sheet['!pageSetup'] = {
      orientation,
      paperSize,
      fitToWidth,
      fitToHeight
    };

    sheet['!print'] = {
      orientation,
      paperSize,
      fitToWidth,
      fitToHeight
    };

    trimSheetToUsedRange(sheet);
  };

  const getTransactionDateRange = (items) => {
    const validDates = (items || [])
      .map(item => getTransactionDate(item))
      .filter(date => Number.isFinite(date.getTime()));

    if (!validDates.length) {
      return { start: '-', end: '-' };
    }

    const start = new Date(Math.min(...validDates.map(date => date.getTime())));
    const end = new Date(Math.max(...validDates.map(date => date.getTime())));

    return { start: formatExcelDate(start), end: formatExcelDate(end) };
  };

  const buildAccountBalanceRows = () => {
    const baseTransactions = filteredTransactions.length ? filteredTransactions : transactions;

    const rows = accounts.map(account => {
      const initialBalance = Number(account.initialBalance) || 0;
      const income = baseTransactions
        .filter(t => t.accountId === account.id && t.type === 'income')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const expense = baseTransactions
        .filter(t => t.accountId === account.id && t.type === 'expense')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const transferIn = baseTransactions
        .filter(t => t.toAccountId === account.id && t.type === 'transfer')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const transferOut = baseTransactions
        .filter(t => t.accountId === account.id && t.type === 'transfer')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const endingBalance = initialBalance + income + transferIn - expense - transferOut;

      return {
        name: account.name || '-',
        type: account.type || 'Bank',
        initialBalance,
        income,
        expense,
        transferIn,
        transferOut,
        endingBalance
      };
    });

    const totals = rows.reduce((acc, row) => {
      acc.initialBalance += Number(row.initialBalance) || 0;
      acc.income += Number(row.income) || 0;
      acc.expense += Number(row.expense) || 0;
      acc.transferIn += Number(row.transferIn) || 0;
      acc.transferOut += Number(row.transferOut) || 0;
      acc.endingBalance += Number(row.endingBalance) || 0;
      return acc;
    }, { initialBalance: 0, income: 0, expense: 0, transferIn: 0, transferOut: 0, endingBalance: 0 });

    rows.push({
      name: 'TOTAL',
      type: '',
      initialBalance: totals.initialBalance,
      income: totals.income,
      expense: totals.expense,
      transferIn: totals.transferIn,
      transferOut: totals.transferOut,
      endingBalance: totals.endingBalance
    });

    return rows;
  };

  const exportExcel = async () => {
    try {
      const rows = buildReportRows();
      const exportDate = new Date().toLocaleDateString('id-ID');
      const reportPeriodText = reportPeriod || 'Semua Waktu';
      const range = getTransactionDateRange(filteredTransactions.length ? filteredTransactions : transactions);

      const transactionRows = rows.map(r => ({
        'ID Transaksi': r.displayId || 'TX-001',
        'Tanggal': r.dateText,
        'Tipe': r.type,
        'Keterangan': r.note,
        'Kategori': r.category,
        'Akun Sumber': r.source,
        'Akun Tujuan': r.destination,
        'Pemasukan': formatExcelMoneyValue(r.income),
        'Pengeluaran': formatExcelMoneyValue(r.expense),
        'Transfer': formatExcelMoneyValue(r.transfer),
        'Saldo Kumulatif': formatExcelMoneyValue(r.balance)
      }));

      const accountRows = buildAccountBalanceRows();

      const summaryRows = [
        { 'Keterangan': 'Periode', 'Nilai': reportPeriodText },
        { 'Keterangan': 'Rentang Transaksi', 'Nilai': `${range.start} – ${range.end}` },
        { 'Keterangan': 'Total Pemasukan', 'Nilai': Number(summary.income) || 0 },
        { 'Keterangan': 'Total Pengeluaran', 'Nilai': Number(summary.expense) || 0 },
        { 'Keterangan': 'Total Tabungan', 'Nilai': Number(summary.savings) || 0 },
        { 'Keterangan': 'Total Transfer', 'Nilai': Number(summary.transfer) || 0 },
        { 'Keterangan': 'Kekayaan Bersih', 'Nilai': Number(summary.netWorth) || 0 },
        { 'Keterangan': 'Jumlah Transaksi', 'Nilai': rows.length }
      ];

      const workbook = XLSX.utils.book_new();

      const wsTransactions = XLSX.utils.aoa_to_sheet([
        ['DOMPETKU'],
        ['DAFTAR TRANSAKSI KEUANGAN'],
        [],
        ['Pemilik: HAMISAH'],
        [`Periode: ${reportPeriodText}`],
        [`Rentang Transaksi: ${range.start} – ${range.end}`],
        [`Tanggal Cetak: ${exportDate}`],
        [],
        ['ID Transaksi', 'Tanggal', 'Tipe', 'Keterangan', 'Kategori', 'Akun Sumber', 'Akun Tujuan', 'Pemasukan', 'Pengeluaran', 'Transfer', 'Saldo Kumulatif']
      ]);

      const titleStyle = { font: { bold: true, color: { rgb: excelTheme.titleTextColor }, sz: 16 }, alignment: { horizontal: 'center', vertical: 'center' } };
      const subtitleStyle = { font: { bold: true, color: { rgb: excelTheme.titleTextColor }, sz: 12 }, alignment: { horizontal: 'center', vertical: 'center' } };
      const infoStyle = { font: { bold: true, color: { rgb: excelTheme.infoText }, sz: 10 }, alignment: { horizontal: 'left', vertical: 'center' } };

      wsTransactions['A1'].s = titleStyle;
      wsTransactions['A2'].s = subtitleStyle;
      for (let rowIndex = 3; rowIndex <= 6; rowIndex++) {
        const cellRef = XLSX.utils.encode_cell({ c: 0, r: rowIndex });
        if (wsTransactions[cellRef]) {
          wsTransactions[cellRef].s = infoStyle;
        }
      }

      transactionRows.forEach((row) => {
        XLSX.utils.sheet_add_aoa(wsTransactions, [[
          row['ID Transaksi'],
          row['Tanggal'],
          row['Tipe'],
          row['Keterangan'],
          row['Kategori'],
          row['Akun Sumber'],
          row['Akun Tujuan'],
          row['Pemasukan'],
          row['Pengeluaran'],
          row['Transfer'],
          row['Saldo Kumulatif']
        ]], { origin: -1 });
      });

      wsTransactions['!cols'] = [
        { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 28 }, { wch: 18 },
        { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 15 }, { wch: 18 }
      ];
      wsTransactions['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } }
      ];
      wsTransactions['!freeze'] = { ySplit: 8, xSplit: 0 };
      applyPrintSettingsToSheet(wsTransactions, { paperSize: 9, orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 });

      for (let c = 0; c <= 10; c++) {
        const cell = wsTransactions[XLSX.utils.encode_cell({ c, r: 7 })];
        if (cell) {
          cell.s = {
            font: { bold: true, color: { rgb: excelTheme.headerText }, sz: 10 },
            fill: { fgColor: { rgb: excelTheme.headerBg } },
            alignment: { horizontal: c >= 7 ? 'center' : 'center', vertical: 'center' },
            border: {
              top: { style: 'medium', color: { rgb: excelTheme.strongBorderColor } },
              bottom: { style: 'medium', color: { rgb: excelTheme.strongBorderColor } },
              left: { style: 'thin', color: { rgb: excelTheme.borderColor } },
              right: { style: 'thin', color: { rgb: excelTheme.borderColor } }
            }
          };
        }
      }

      for (let rowIndex = 8; rowIndex < 8 + transactionRows.length; rowIndex++) {
        for (let colIndex = 0; colIndex <= 10; colIndex++) {
          const cellRef = XLSX.utils.encode_cell({ c: colIndex, r: rowIndex });
          const cell = wsTransactions[cellRef];
          if (!cell) continue;

          const isAltRow = ((rowIndex - 8) % 2) === 1;
          const isNumberColumn = colIndex >= 7;
          const isCenteredText = colIndex === 1 || colIndex === 2;

          cell.s = {
            ...(cell.s || {}),
            fill: { fgColor: { rgb: isAltRow ? excelTheme.softRowBg : 'FFFFFFFF' } },
            border: {
              top: { style: 'thin', color: { rgb: excelTheme.borderColor } },
              bottom: { style: 'thin', color: { rgb: excelTheme.borderColor } },
              left: { style: 'thin', color: { rgb: excelTheme.borderColor } },
              right: { style: 'thin', color: { rgb: excelTheme.borderColor } }
            },
            alignment: {
              vertical: 'center',
              wrapText: colIndex === 3 || colIndex === 4 || colIndex === 5 || colIndex === 6,
              horizontal: isNumberColumn ? 'right' : isCenteredText ? 'center' : 'left'
            },
            font: { ...((cell.s && cell.s.font) || {}), sz: 9 }
          };
        }
      }

      const moneyCols = [7, 8, 9, 10];
      applyMoneyFormatToSheet(wsTransactions, moneyCols);

      const wsAccounts = XLSX.utils.aoa_to_sheet([
        ['DOMPETKU'],
        ['LAPORAN SALDO AKUN'],
        [],
        ['Pemilik: HAMISAH'],
        [`Periode: ${reportPeriodText}`],
        [`Rentang Transaksi: ${range.start} – ${range.end}`],
        [`Tanggal Cetak: ${exportDate}`],
        [],
        ['Nama Akun', 'Jenis', 'Saldo Awal', 'Pemasukan', 'Pengeluaran', 'Transfer Masuk', 'Transfer Keluar', 'Saldo Akhir']
      ]);

      wsAccounts['A1'].s = titleStyle;
      wsAccounts['A2'].s = subtitleStyle;
      for (let rowIndex = 3; rowIndex <= 6; rowIndex++) {
        const cellRef = XLSX.utils.encode_cell({ c: 0, r: rowIndex });
        if (wsAccounts[cellRef]) {
          wsAccounts[cellRef].s = infoStyle;
        }
      }

      accountRows.forEach((row) => {
        XLSX.utils.sheet_add_aoa(wsAccounts, [[row.name, row.type, row.initialBalance, row.income, row.expense, row.transferIn, row.transferOut, row.endingBalance]], { origin: -1 });
      });

      wsAccounts['!cols'] = [
        { wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }
      ];
      wsAccounts['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } }
      ];
      wsAccounts['!freeze'] = { ySplit: 8, xSplit: 0 };
      applyPrintSettingsToSheet(wsAccounts, { paperSize: 9, orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 });

      for (let c = 0; c <= 7; c++) {
        const cell = wsAccounts[XLSX.utils.encode_cell({ c, r: 7 })];
        if (cell) {
          cell.s = {
            font: { bold: true, color: { rgb: excelTheme.headerText }, sz: 10 },
            fill: { fgColor: { rgb: excelTheme.headerBg } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
              top: { style: 'medium', color: { rgb: excelTheme.strongBorderColor } },
              bottom: { style: 'medium', color: { rgb: excelTheme.strongBorderColor } },
              left: { style: 'thin', color: { rgb: excelTheme.borderColor } },
              right: { style: 'thin', color: { rgb: excelTheme.borderColor } }
            }
          };
        }
      }

      for (let rowIndex = 8; rowIndex < 8 + accountRows.length; rowIndex++) {
        for (let colIndex = 0; colIndex <= 7; colIndex++) {
          const cellRef = XLSX.utils.encode_cell({ c: colIndex, r: rowIndex });
          const cell = wsAccounts[cellRef];
          if (!cell) continue;

          const isAltRow = ((rowIndex - 8) % 2) === 1;
          const isTotalRow = rowIndex === 8 + accountRows.length - 1;
          const isMoneyCol = colIndex >= 2;

          cell.s = {
            ...(cell.s || {}),
            fill: { fgColor: { rgb: isTotalRow ? excelTheme.totalBg : isAltRow ? excelTheme.softRowBg : 'FFFFFFFF' } },
            border: {
              top: { style: isTotalRow ? 'medium' : 'thin', color: { rgb: isTotalRow ? excelTheme.strongBorderColor : excelTheme.borderColor } },
              bottom: { style: isTotalRow ? 'medium' : 'thin', color: { rgb: isTotalRow ? excelTheme.strongBorderColor : excelTheme.borderColor } },
              left: { style: 'thin', color: { rgb: excelTheme.borderColor } },
              right: { style: 'thin', color: { rgb: excelTheme.borderColor } }
            },
            alignment: { vertical: 'center', wrapText: colIndex === 0 || colIndex === 1, horizontal: isMoneyCol ? 'right' : 'left' },
            font: { ...((cell.s && cell.s.font) || {}), sz: 9, bold: isTotalRow || (colIndex === 0 && cell.v === 'TOTAL') }
          };
        }
      }

      const moneyAccountCols = [2, 3, 4, 5, 6, 7];
      applyMoneyFormatToSheet(wsAccounts, moneyAccountCols);

      const wsSummary = XLSX.utils.aoa_to_sheet([
        ['DOMPETKU'],
        ['RINGKASAN KEUANGAN'],
        [],
        ['Pemilik: HAMISAH'],
        [`Periode: ${reportPeriodText}`],
        [`Rentang Transaksi: ${range.start} – ${range.end}`],
        [`Tanggal Cetak: ${exportDate}`],
        [],
        ['Keterangan', 'Nilai']
      ]);

      wsSummary['A1'].s = titleStyle;
      wsSummary['A2'].s = subtitleStyle;
      for (let rowIndex = 3; rowIndex <= 6; rowIndex++) {
        const cellRef = XLSX.utils.encode_cell({ c: 0, r: rowIndex });
        if (wsSummary[cellRef]) {
          wsSummary[cellRef].s = infoStyle;
        }
      }

      summaryRows.forEach((row) => {
        XLSX.utils.sheet_add_aoa(wsSummary, [[row['Keterangan'], row['Nilai']]], { origin: -1 });
      });

      const accountSummaryStartRow = 8 + summaryRows.length + 2;
      XLSX.utils.sheet_add_aoa(wsSummary, [['', '']], { origin: -1 });
      XLSX.utils.sheet_add_aoa(wsSummary, [['Saldo Akhir per Akun', '']], { origin: -1 });
      accounts.forEach((account) => {
        const endingBalance = Number(
          (account.initialBalance || 0) +
          filteredTransactions.filter(t => t.accountId === account.id && t.type === 'income').reduce((sum, t) => sum + (Number(t.amount) || 0), 0) +
          filteredTransactions.filter(t => t.toAccountId === account.id && t.type === 'transfer').reduce((sum, t) => sum + (Number(t.amount) || 0), 0) -
          filteredTransactions.filter(t => t.accountId === account.id && t.type === 'expense').reduce((sum, t) => sum + (Number(t.amount) || 0), 0) -
          filteredTransactions.filter(t => t.accountId === account.id && t.type === 'transfer').reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
        ) || 0;
        XLSX.utils.sheet_add_aoa(wsSummary, [[account.name || '-', endingBalance]], { origin: -1 });
      });

      wsSummary['!cols'] = [{ wch: 34 }, { wch: 22 }];
      wsSummary['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }
      ];
      wsSummary['!freeze'] = { ySplit: 8, xSplit: 0 };
      applyPrintSettingsToSheet(wsSummary, { paperSize: 9, orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 });

      const summaryHeaderCell = wsSummary['A8'];
      const summaryValueHeaderCell = wsSummary['B8'];
      if (summaryHeaderCell) summaryHeaderCell.s = { font: { bold: true, color: { rgb: excelTheme.headerText }, sz: 10 }, fill: { fgColor: { rgb: excelTheme.headerBg } }, alignment: { horizontal: 'center', vertical: 'center' }, border: { top: { style: 'medium', color: { rgb: excelTheme.strongBorderColor } }, bottom: { style: 'medium', color: { rgb: excelTheme.strongBorderColor } }, left: { style: 'thin', color: { rgb: excelTheme.borderColor } }, right: { style: 'thin', color: { rgb: excelTheme.borderColor } } } };
      if (summaryValueHeaderCell) summaryValueHeaderCell.s = { ...summaryHeaderCell.s };

      for (let rowIndex = 9; rowIndex < 9 + summaryRows.length; rowIndex++) {
        const labelCell = wsSummary[XLSX.utils.encode_cell({ c: 0, r: rowIndex })];
        const valueCell = wsSummary[XLSX.utils.encode_cell({ c: 1, r: rowIndex })];
        const label = typeof labelCell?.v === 'string' ? labelCell.v : '';
        const isImportant = label.includes('Kekayaan Bersih') || label.includes('Total Pemasukan') || label.includes('Total Pengeluaran');
        if (labelCell) {
          labelCell.s = {
            ...(labelCell.s || {}),
            fill: { fgColor: { rgb: isImportant ? excelTheme.totalBg : 'FFFFFFFF' } },
            border: { top: { style: 'thin', color: { rgb: excelTheme.borderColor } }, bottom: { style: 'thin', color: { rgb: excelTheme.borderColor } }, left: { style: 'thin', color: { rgb: excelTheme.borderColor } }, right: { style: 'thin', color: { rgb: excelTheme.borderColor } } },
            alignment: { vertical: 'center', horizontal: 'left' },
            font: { ...((labelCell.s && labelCell.s.font) || {}), bold: isImportant }
          };
        }
        if (valueCell && typeof valueCell.v === 'number') {
          valueCell.z = excelMoneyFormat;
          valueCell.s = {
            ...(valueCell.s || {}),
            fill: { fgColor: { rgb: isImportant ? excelTheme.totalBg : 'FFFFFFFF' } },
            border: { top: { style: 'thin', color: { rgb: excelTheme.borderColor } }, bottom: { style: 'thin', color: { rgb: excelTheme.borderColor } }, left: { style: 'thin', color: { rgb: excelTheme.borderColor } }, right: { style: 'thin', color: { rgb: excelTheme.borderColor } } },
            alignment: { vertical: 'center', horizontal: 'right' },
            font: { ...((valueCell.s && valueCell.s.font) || {}), bold: isImportant }
          };
        }
      }

      for (let idx = 0; idx < accounts.length; idx++) {
        const rowIndex = accountSummaryStartRow + idx;
        const valueCell = wsSummary[XLSX.utils.encode_cell({ c: 1, r: rowIndex })];
        if (valueCell && typeof valueCell.v === 'number') {
          valueCell.z = excelMoneyFormat;
        }
      }

      XLSX.utils.book_append_sheet(workbook, wsTransactions, 'Transaksi');
      XLSX.utils.book_append_sheet(workbook, wsAccounts, 'Saldo Akun');
      XLSX.utils.book_append_sheet(workbook, wsSummary, 'Ringkasan');

      const fileName = `Laporan_DompetKu_${(reportPeriod || 'Semua_Waktu').replace(/\s+/g, '_')}.xlsx`;

      if (isNativeApp()) {
        const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
        await shareNativeFile({
          fileName,
          base64Data: base64,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          title: 'Simpan / Bagikan Excel DompetKu',
          text: `Laporan keuangan DompetKu - ${reportPeriodText}`
        });
      } else {
        XLSX.writeFile(workbook, fileName);
      }
    } catch (error) {
      console.error('Gagal membuat Excel:', error);
      alert(`Gagal menyimpan Excel: ${error?.message || 'Silakan coba lagi.'}`);
    }
  };

  const loadLogoDataUrl = async () => {
    try {
      const response = await fetch('/icons/icon-512.png');
      if (!response.ok) throw new Error('Logo DompetKu tidak ditemukan.');
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.warn('Logo PDF tidak dapat dimuat:', error);
      return null;
    }
  };

  const exportPDF = async () => {
    try {
      const rows = buildReportRows();
      if (import.meta.env.DEV) {
        console.log('[DompetKu][PDF-DATA]', {
          reportPeriod,
          rowsCount: rows.length,
          filteredCount: filteredTransactions.length,
          sample: rows.slice(0, 3)
        });
      }
      const logoDataUrl = await loadLogoDataUrl();
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;
      const usableWidth = pageWidth - margin * 2;
      const bottomLimit = pageHeight - 16;
      const navy = [23, 32, 51];
      const gold = [212, 167, 44];
      const slate = [71, 85, 105];
      const lightBorder = [203, 213, 225];
      const lightBg = [247, 248, 250];
      let y = 14;

      const money = (value) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
      const transferAccountLabel = (source, destination) => `${source || '-'} -> ${destination || '-'}`;
      const addFooter = () => {
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.35);
        doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text('DompetKu v1.0 • © 2026 Hamisah • All Rights Reserved', pageWidth / 2, pageHeight - 7, { align: 'center' });
        doc.setTextColor(...navy);
      };

      const columns = [
        { label: 'Tanggal', width: 16 },
        { label: 'Keterangan', width: 27 },
        { label: 'Kategori', width: 18 },
        { label: 'Akun', width: 24 },
        { label: 'Pemasukan', width: 23 },
        { label: 'Pengeluaran', width: 23 },
        { label: 'Transfer', width: 20 },
        { label: 'Saldo', width: 26 }
      ];
      const cellPad = 1.6;
      const headerHeight = 7.5;
      const lineHeight = 2.8;

      const drawTableHeader = () => {
        doc.setFillColor(...navy);
        doc.setDrawColor(...navy);
        doc.rect(margin, y, usableWidth, headerHeight, 'FD');
        let x = margin;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.1);
        doc.setTextColor(255, 255, 255);
        columns.forEach(col => {
          const isMoney = ['Pemasukan', 'Pengeluaran', 'Transfer', 'Saldo'].includes(col.label);
          const align = isMoney ? 'right' : 'left';
          const textX = isMoney ? x + col.width - cellPad : x + cellPad;
          doc.text(col.label, textX, y + 4.9, { align });
          x += col.width;
        });
        y += headerHeight;
        doc.setTextColor(...navy);
      };

      const addReportHeader = () => {
        const headerTop = y;
        const logoSize = 20;
        if (logoDataUrl) {
          doc.addImage(logoDataUrl, 'PNG', margin, headerTop, logoSize, logoSize);
        } else {
          doc.setFillColor(30, 80, 190);
          doc.roundedRect(margin, headerTop, logoSize, logoSize, 3, 3, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6);
          doc.text('DK', margin + logoSize / 2, headerTop + 11, { align: 'center' });
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(...navy);
        doc.text('DOMPETKU', margin + 25, headerTop + 9);
        doc.setFontSize(8.2);
        doc.setTextColor(...slate);
        doc.text('LAPORAN KEUANGAN PRIBADI', margin + 25, headerTop + 15);

        const metaW = 57;
        const metaH = 20;
        const metaX = pageWidth - margin - metaW;
        doc.setFillColor(...lightBg);
        doc.setDrawColor(...lightBorder);
        doc.roundedRect(metaX, headerTop + 1, metaW, metaH, 2.5, 2.5, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...slate);
        doc.text('Pemilik Akun:', metaX + 3, headerTop + 6);
        doc.text('Periode:', metaX + 3, headerTop + 11);
        doc.text('Tanggal Cetak:', metaX + 3, headerTop + 16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...navy);
        doc.text(String(user?.name || '-').toUpperCase(), metaX + 31, headerTop + 6);
        doc.text(String(reportPeriodLabel || '-').toUpperCase(), metaX + 31, headerTop + 11);
        doc.text(new Date().toLocaleDateString('id-ID'), metaX + 31, headerTop + 16);

        y = headerTop + 25;
        doc.setDrawColor(...navy);
        doc.setLineWidth(0.8);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;
      };

      const drawSummaryCard = (x, width, label, value, valueColor, dark = false) => {
        const cardH = 17;
        doc.setFillColor(...(dark ? navy : lightBg));
        doc.setDrawColor(...(dark ? navy : lightBorder));
        doc.roundedRect(x, y, width, cardH, 2.5, 2.5, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.7);
        doc.setTextColor(...(dark ? gold : slate));
        doc.text(label.toUpperCase(), x + 2.5, y + 5);
        doc.setFontSize(8.6);
        doc.setTextColor(...valueColor);
        const valueText = money(value);
        const maxW = width - 5;
        let display = valueText;
        if (doc.getTextWidth(display) > maxW) {
          doc.setFontSize(7.4);
        }
        doc.text(display, x + 2.5, y + 12.5);
      };

      const addContinuationHeader = () => {
        const headerTop = 10;
        const logoSize = 12;
        if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', margin, headerTop, logoSize, logoSize);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...navy);
        doc.text('DOMPETKU', margin + 15, headerTop + 6.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...slate);
        doc.text(`LAPORAN KEUANGAN PRIBADI • ${reportPeriodLabel}`, margin + 15, headerTop + 10.5);
        doc.setDrawColor(...navy);
        doc.setLineWidth(0.55);
        doc.line(margin, 25, pageWidth - margin, 25);
        y = 29;
      };

      const startNewPage = () => {
        addFooter();
        doc.addPage();
        addContinuationHeader();
        drawTableHeader();
      };

      // Halaman pertama: header + ringkasan mengikuti standar visual Web.
      addReportHeader();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...navy);
      doc.text('RINGKASAN KEUANGAN', margin, y);
      y += 4;

      const gap = 2.5;
      const cardWidth = (usableWidth - gap * 3) / 4;
      drawSummaryCard(margin, cardWidth, 'Pemasukan', summary.income, [22, 163, 74]);
      drawSummaryCard(margin + (cardWidth + gap), cardWidth, 'Pengeluaran', summary.expense, [220, 38, 38]);
      drawSummaryCard(margin + (cardWidth + gap) * 2, cardWidth, 'Total Transfer', summary.transfer, [79, 70, 229]);
      drawSummaryCard(margin + (cardWidth + gap) * 3, cardWidth, 'Kekayaan Bersih (Total)', summary.netWorth, [255, 255, 255], true);
      y += 23;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...navy);
      doc.text('BUKU BESAR TRANSAKSI', margin, y);
      y += 4;
      drawTableHeader();

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);

      if (rows.length === 0) {
        const emptyH = 10;
        doc.setDrawColor(...lightBorder);
        doc.rect(margin, y, usableWidth, emptyH, 'S');
        doc.setTextColor(...slate);
        doc.text('Belum ada transaksi.', pageWidth / 2, y + 6.5, { align: 'center' });
        y += emptyH;
      }

      for (const row of rows) {
        const account = row.type === 'TRANSFER'
          ? transferAccountLabel(row.source, row.destination)
          : row.source;
        const values = [
          row.date || '-',
          String(row.note || '-'),
          String(row.category || '-'),
          row.type === 'TRANSFER' ? transferAccountLabel(row.source, row.destination) : (account || '-'),
          row.income ? money(row.income) : '-',
          row.expense ? money(row.expense) : '-',
          row.transfer ? money(row.transfer) : '-',
          row.type === 'TRANSFER' ? 'Mutasi' : money(row.balance)
        ];

        const wrapped = values.map((value, i) => {
          if (i >= 4) return [String(value)];
          return doc.splitTextToSize(String(value), Math.max(10, columns[i].width - cellPad * 2));
        });
        const maxLines = Math.max(1, Math.min(6, Math.max(...wrapped.map(lines => lines.length))));
        const rowHeight = Math.max(6.5, maxLines * lineHeight + (row.type === 'TRANSFER' ? 4.0 : 2.8));

        // KUNCI: satu baris transaksi selalu utuh. Jika tidak cukup ruang,
        // pindahkan seluruh baris ke halaman berikutnya.
        if (y + rowHeight > bottomLimit) {
          startNewPage();
        }

        const rowTop = y;
        let x = margin;
        doc.setLineWidth(0.25);
        doc.setDrawColor(...lightBorder);
        doc.setFillColor(255, 255, 255);
        doc.rect(margin, rowTop, usableWidth, rowHeight, 'FD');

        wrapped.forEach((lines, i) => {
          const col = columns[i];
          const safeLines = lines.slice(0, maxLines);
          const isMoney = i >= 4;
          const align = isMoney ? 'right' : 'left';
          const textX = isMoney ? x + col.width - cellPad : x + cellPad;
          const textColor = i === 4 ? [22, 163, 74] : i === 5 ? [220, 38, 38] : i === 6 ? [79, 70, 229] : i === 7 ? navy : navy;
          doc.setFont('helvetica', i === 1 || i === 3 ? 'bold' : 'normal');
          doc.setFontSize(6.2);
          doc.setTextColor(...textColor);

          doc.text(safeLines.length ? safeLines : ['-'], textX, rowTop + 3.9, {
            align,
            lineHeightFactor: 1.05,
            maxWidth: col.width - cellPad * 2
          });
          x += col.width;
        });

        // Garis vertikal setiap kolom agar grid tabel benar-benar terlihat.
        x = margin;
        columns.forEach((col, index) => {
          x += col.width;
          if (index < columns.length - 1) {
            doc.setDrawColor(...lightBorder);
            doc.line(x, rowTop, x, rowTop + rowHeight);
          }
        });
        y += rowHeight;
      }

      addFooter();

      const fileName = `Laporan_DompetKu_${reportPeriodLabel.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}.pdf`;
      const arrayBuffer = doc.output('arraybuffer');

      if (isNativeApp()) {
        const base64 = bytesToBase64(new Uint8Array(arrayBuffer));
        await shareNativeFile({
          fileName,
          base64Data: base64,
          mimeType: 'application/pdf',
          title: 'Simpan / Bagikan PDF DompetKu',
          text: `Laporan keuangan DompetKu - ${reportPeriod}`
        });
      } else {
        doc.save(fileName);
      }
    } catch (error) {
      console.error('Gagal membuat PDF:', error);
      alert(`Gagal menyimpan PDF: ${error?.message || 'Silakan coba lagi.'}`);
    }
  };

  const executePrint = async () => {
    try {
      if (isNativeApp()) {
        // Android WebView tidak mengandalkan window.print().
        // Buat PDF lalu tampilkan Android Share Sheet sehingga pengguna
        // dapat memilih printer, Files, Drive, WhatsApp, dan aplikasi lain.
        await exportPDF();
      } else {
        window.focus();
        setTimeout(() => window.print(), 50);
      }
    } catch (error) {
      console.error('Gagal mencetak:', error);
      alert(`Cetak gagal: ${error?.message || 'Silakan coba lagi.'}`);
    }
  };

  const renderDashboard = () => (
    <div className="space-y-6 pb-24 animate-in fade-in">
      
      {/* GREETING SECTION */}
      <div className="mb-2">
         <h2 className="text-2xl font-black text-[#172033]">
           Selamat datang, <span className="capitalize">{user?.name?.toLowerCase()}</span> 👋
         </h2>
         <p className="text-[#64748B] text-sm font-bold mt-1">Ringkasan keuangan Anda hari ini.</p>
      </div>

      {pendingRecurring.length > 0 && (
        <div className="bg-[#FFFBEB] border border-[#D4A72C] rounded-2xl p-4 shadow-sm">
           <h3 className="font-bold text-[#B8860B] flex items-center gap-2 mb-2"><AlertCircle size={18}/> Transaksi Menunggu Konfirmasi</h3>
           <div className="space-y-2">
             {pendingRecurring.map(rec => (
               <div key={rec.id} className="flex flex-col md:flex-row md:items-center justify-between bg-white p-3 rounded-xl border border-[#F2C94C]">
                 <div>
                   <p className="font-bold text-[#172033] text-sm">{rec.note}</p>
                   <p className="text-[#DC2626] font-black text-sm"><Money value={rec.amount} /> <span className="text-[10px] text-[#64748B] font-bold uppercase ml-1">({rec.category})</span></p>
                 </div>
                 <div className="flex gap-2 mt-2 md:mt-0">
                    <button onClick={() => processRecurring(rec.id, 'confirm')} className="px-3 py-1.5 bg-[#16A34A] text-white text-xs font-bold rounded-lg shadow hover:bg-green-700 flex items-center gap-1"><Check size={14}/> Setuju</button>
                    <button onClick={() => processRecurring(rec.id, 'skip')} className="px-3 py-1.5 bg-[#F7F8FA] border border-[#CBD5E1] text-[#475569] text-xs font-bold rounded-lg hover:bg-slate-200 flex items-center gap-1"><SkipForward size={14}/> Lewati</button>
                 </div>
               </div>
             ))}
           </div>
        </div>
      )}

      {/* TOTAL KEKAYAAN */}
      <div className="bg-[#172033] rounded-3xl p-6 shadow-xl relative overflow-hidden">
         <div className="absolute top-0 right-0 p-8 opacity-10 transform translate-x-4 -translate-y-4">
            <Landmark size={120} className="text-[#D4A72C]"/>
         </div>
         <p className="text-[#D4A72C] text-xs font-bold uppercase tracking-widest mb-1 relative z-10">Total Kekayaan Bersih</p>
         <h2 className="text-3xl md:text-4xl font-black text-white relative z-10 mb-6 drop-shadow-md whitespace-nowrap"><Money value={summary.netWorth} /></h2>
         <div className="grid grid-cols-2 gap-4 relative z-10 border-t border-[#0F172A] pt-5">
            <div>
               <p className="text-[#94A3B8] text-[10px] font-bold uppercase flex items-center gap-1"><TrendingUp size={12} className="text-[#16A34A]"/> Pemasukan Bulan Ini</p>
               <p className="text-[#16A34A] font-bold text-lg mt-1 whitespace-nowrap"><Money value={summary.income} /></p>
            </div>
            <div>
               <p className="text-[#94A3B8] text-[10px] font-bold uppercase flex items-center gap-1"><TrendingDown size={12} className="text-[#DC2626]"/> Pengeluaran Bulan Ini</p>
               <p className="text-[#DC2626] font-bold text-lg mt-1 whitespace-nowrap"><Money value={summary.expense} /></p>
            </div>
         </div>
      </div>

      {/* ACCOUNT BALANCES */}
      <div>
         <h3 className="font-bold text-[#172033] mb-3 ml-1 flex items-center gap-2"><Wallet size={18} className="text-[#D4A72C]"/> Saldo Akun</h3>
         <div className="flex gap-3 overflow-x-auto pb-4 snap-x hide-scrollbar">
            {accounts.map(acc => (
              <div key={acc.id} className="min-w-[160px] bg-white p-4 rounded-2xl shadow-sm border border-[#E2E8F0] snap-start shrink-0 flex flex-col justify-between">
                 <div>
                   <p className="text-[10px] text-[#64748B] font-bold uppercase mb-1 bg-[#F7F8FA] px-2 py-0.5 rounded-full inline-block border border-[#CBD5E1]">{acc.type}</p>
                   <p className="font-bold text-[#172033] line-clamp-1 mb-2 leading-tight">{acc.name}</p>
                 </div>
                 <p className="font-black text-[#B8860B] whitespace-nowrap overflow-hidden text-ellipsis" title={`Rp ${(accountBalances[acc.id] || 0).toLocaleString('id-ID')}`}>
                   <Money value={(accountBalances[acc.id] || 0)} />
                 </p>
              </div>
            ))}
            <button onClick={() => setShowAddAccount(true)} className="min-w-[140px] border-2 border-dashed border-[#CBD5E1] rounded-2xl flex flex-col items-center justify-center text-[#64748B] bg-[#F7F8FA] hover:bg-white transition snap-start shrink-0 active:scale-95 group">
               <PlusCircle size={20} className="mb-2 group-hover:text-[#D4A72C] transition-colors" />
               <span className="text-[11px] font-bold uppercase">Tambah Akun</span>
            </button>
         </div>
      </div>

      {/* COMPACT FLOATING TRANSACTION BUTTONS (3D GLOSSY) */}
      <div className="mb-6">
        <h3 className="font-bold text-lg text-[#172033] mb-4 flex items-center gap-2">
          <PlusCircle size={18} className="text-[#D4A72C]" /> Catat Transaksi
        </h3>
        <div className="grid grid-cols-3 gap-2.5 w-full px-0">
          {/* TOMBOL PEMASUKAN */}
          <button onClick={() => setTxType('income')} className="relative w-full min-w-0 min-h-[104px] p-2.5 rounded-2xl font-black text-white text-xs sm:text-sm flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-[#22C55E] to-[#16A34A] border border-[#14532D] shadow-[0_6px_0_#14532D,0_10px_10px_rgba(22,163,74,0.4),inset_0_1px_2px_rgba(255,255,255,0.8)] active:translate-y-[6px] active:shadow-[0_0px_0_#14532D,0_0px_0px_rgba(22,163,74,0.4),inset_0_1px_2px_rgba(255,255,255,0.8)] transition-all overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/40 to-transparent pointer-events-none group-active:from-white/20"></div>
            <div className="bg-white/20 p-1.5 rounded-full drop-shadow-md"><ArrowDownRight size={18} strokeWidth={3} /></div>
            <span className="drop-shadow-md tracking-wide">Pemasukan</span>
          </button>

          {/* TOMBOL PENGELUARAN */}
          <button onClick={() => setTxType('expense')} className="relative w-full min-w-0 min-h-[104px] p-2.5 rounded-2xl font-black text-white text-xs sm:text-sm flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-[#EF4444] to-[#DC2626] border border-[#7F1D1D] shadow-[0_6px_0_#7F1D1D,0_10px_10px_rgba(220,38,38,0.4),inset_0_1px_2px_rgba(255,255,255,0.8)] active:translate-y-[6px] active:shadow-[0_0px_0_#7F1D1D,0_0px_0px_rgba(220,38,38,0.4),inset_0_1px_2px_rgba(255,255,255,0.8)] transition-all overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/40 to-transparent pointer-events-none group-active:from-white/20"></div>
            <div className="bg-white/20 p-1.5 rounded-full drop-shadow-md"><ArrowUpRight size={18} strokeWidth={3} /></div>
            <span className="drop-shadow-md tracking-wide">Pengeluaran</span>
          </button>

          {/* TOMBOL TRANSFER */}
          <button onClick={() => setTxType('transfer')} className="relative w-full min-w-0 min-h-[104px] p-2.5 rounded-2xl font-black text-white text-xs sm:text-sm flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-[#6366F1] to-[#4F46E5] border border-[#312E81] shadow-[0_6px_0_#312E81,0_10px_10px_rgba(79,70,229,0.4),inset_0_1px_2px_rgba(255,255,255,0.8)] active:translate-y-[6px] active:shadow-[0_0px_0_#312E81,0_0px_0px_rgba(79,70,229,0.4),inset_0_1px_2px_rgba(255,255,255,0.8)] transition-all overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/40 to-transparent pointer-events-none group-active:from-white/20"></div>
            <div className="bg-white/20 p-1.5 rounded-full drop-shadow-md"><ArrowRightLeft size={18} strokeWidth={3} /></div>
            <span className="drop-shadow-md tracking-wide">Transfer</span>
          </button>
        </div>
      </div>

      <div className="bg-[#172033] rounded-3xl p-6 text-white shadow-xl relative overflow-hidden border border-[#0F172A]">
        <div className="absolute -top-4 -right-4 p-4 opacity-10 transform rotate-12"><Bot size={100} className="text-[#D4A72C]" /></div>
        <div className="flex items-center gap-4 mb-4 relative z-10">
          <div className="bg-gradient-to-b from-[#D4A72C] to-[#B8860B] p-2.5 rounded-xl shadow-inner">
            <Bot className="text-[#172033]" size={24} />
          </div>
          <div>
            <h3 className="font-black text-[#D4A72C] uppercase tracking-widest text-sm drop-shadow-md">Domi AI • Asisten Keuangan</h3>
          </div>
        </div>
        <p className="text-sm leading-relaxed font-medium text-white relative z-10 p-2">
          {aiMessage}
        </p>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-[#E2E8F0] overflow-hidden mt-6">
         <div className="p-5 md:p-6 border-b border-[#E2E8F0] flex justify-between items-center bg-[#F7F8FA]">
            <h3 className="font-black text-lg text-[#172033]">Buku Besar Terkini</h3>
         </div>
         <LedgerTableComponent data={transactions.slice(0, 5)} accounts={accounts} showPreview={showPreview} onDelete={handleDeleteTransaction} />
         <div className="p-4 text-center border-t border-[#E2E8F0] bg-white hover:bg-[#F7F8FA] transition cursor-pointer" onClick={() => setActiveTab('reports')}>
            <span className="text-sm font-bold text-[#B8860B]">Lihat Semua Laporan →</span>
         </div>
      </div>
    </div>
  );

  const handleClearReport = async () => {
    if (filteredTransactions.length === 0) { alert('Tidak ada transaksi pada periode yang dipilih.'); return; }
    const periodLabel = reportPeriod === 'Custom' ? `periode ${customDates.start || '?'} sampai ${customDates.end || '?'}` : reportPeriod;
    if (!window.confirm(`Bersihkan ${filteredTransactions.length} transaksi pada ${periodLabel}? Data yang dihapus tidak dapat dikembalikan kecuali Anda memiliki backup JSON.`)) return;
    if (window.prompt('Untuk menghapus transaksi yang dipilih, ketik HAPUS') !== 'HAPUS') { alert('Penghapusan dibatalkan.'); return; }
    await Promise.all(filteredTransactions.map(t => deleteStoreData('transactions', t.id, user.id)));
    const removed = new Set(filteredTransactions.map(t => t.id));
    setTransactions(prev => prev.filter(t => !removed.has(t.id)));
    setShowPreview(false);
    alert('Transaksi pada periode yang dipilih berhasil dibersihkan.');
  };

  const handleClearAllTransactions = async () => {
    if (transactions.length === 0) { alert('Belum ada transaksi untuk dihapus.'); return; }
    if (!window.confirm(`PERINGATAN: ${transactions.length} transaksi akan dihapus permanen. Anggaran, akun, target, dan profil TIDAK akan dihapus. Lanjutkan?`)) return;
    if (window.prompt('Ketik HAPUS SEMUA untuk menghapus seluruh histori transaksi') !== 'HAPUS SEMUA') { alert('Penghapusan dibatalkan.'); return; }
    await Promise.all(transactions.map(t => deleteStoreData('transactions', t.id, user.id)));
    setTransactions([]);
    setShowPreview(false);
    alert('Seluruh transaksi berhasil dihapus.');
  };

  const renderReports = () => {
    const incomeTotal = summary.income || 0;
    const expenseTotal = summary.expense || 0;
    const maxBar = Math.max(incomeTotal, expenseTotal, 1);
    const incPct = (incomeTotal/maxBar)*100;
    const expPct = (expenseTotal/maxBar)*100;

    return (
      <div className="space-y-6 pb-24 animate-in fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
           <h2 className="text-2xl font-black text-[#172033]">Laporan Keuangan</h2>
           <div className="flex flex-wrap gap-2 w-full md:w-auto">
             <button onClick={() => setShowPreview(true)} className="flex-1 md:flex-none justify-center px-4 py-2 bg-[#172033] text-white hover:bg-[#0F172A] rounded-xl font-bold text-sm shadow-md flex items-center gap-2 transition active:scale-95 border border-[#172033]">
               <Printer size={16}/> Cetak Laporan
             </button>
             <button onClick={exportPDF} className="flex-1 md:flex-none justify-center px-4 py-2 bg-white border-2 border-[#172033] text-[#172033] hover:bg-[#F7F8FA] rounded-xl font-bold text-sm shadow-sm flex items-center gap-2 transition active:scale-95">
               <FileText size={16}/> Simpan PDF
             </button>
             <button onClick={exportExcel} className="flex-1 md:flex-none justify-center px-4 py-2 bg-white border-2 border-[#D4A72C] text-[#B8860B] hover:bg-[#F7F8FA] rounded-xl font-bold text-sm shadow-sm flex items-center gap-2 transition active:scale-95">
               <FileSpreadsheet size={16}/> Simpan Excel
             </button>
             <button onClick={handleClearReport} className="flex-1 md:flex-none justify-center px-4 py-2 bg-white border-2 border-red-200 text-[#DC2626] hover:bg-red-50 rounded-xl font-bold text-sm shadow-sm flex items-center gap-2 transition active:scale-95">
               <Trash2 size={16}/> Bersihkan Periode
             </button>
             <button onClick={handleClearAllTransactions} className="flex-1 md:flex-none justify-center px-4 py-2 bg-[#DC2626] text-white hover:bg-red-700 rounded-xl font-bold text-sm shadow-md flex items-center gap-2 transition active:scale-95">
               <Trash2 size={16}/> Hapus Semua
             </button>
           </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
           {['Hari Ini', 'Minggu Ini', 'Bulan Ini', 'Bulan Lalu', 'Tahun Ini', 'Semua Waktu', 'Custom'].map((f) => (
             <button key={f} onClick={() => setReportPeriod(f)} className={`px-4 py-2 text-xs font-bold rounded-full whitespace-nowrap transition-all border ${reportPeriod === f ? 'bg-[#D4A72C] text-[#172033] border-[#D4A72C] shadow-md' : 'bg-white border-[#CBD5E1] text-[#64748B] hover:bg-[#F7F8FA]'}`}>
               {f}
             </button>
           ))}
        </div>

        {reportPeriod === 'Custom' && (
           <div className="flex gap-2 items-center bg-white p-3 rounded-xl border border-[#E2E8F0] shadow-sm">
              <Calendar size={18} className="text-[#D4A72C]"/>
              <input type="date" value={customDates.start} onChange={e=>setCustomDates({...customDates, start: e.target.value})} className="bg-[#F7F8FA] border border-[#CBD5E1] p-1.5 rounded text-sm font-bold text-[#172033] outline-none"/>
              <span className="text-[#64748B] font-black">-</span>
              <input type="date" value={customDates.end} onChange={e=>setCustomDates({...customDates, end: e.target.value})} className="bg-[#F7F8FA] border border-[#CBD5E1] p-1.5 rounded text-sm font-bold text-[#172033] outline-none"/>
           </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#E2E8F0]">
             <p className="text-[10px] text-[#64748B] font-bold uppercase mb-1">Pemasukan ({reportPeriod})</p>
             <h2 className="text-xl font-black text-[#16A34A] whitespace-nowrap overflow-hidden text-ellipsis"><Money value={summary.income} /></h2>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#E2E8F0]">
             <p className="text-[10px] text-[#64748B] font-bold uppercase mb-1">Pengeluaran ({reportPeriod})</p>
             <h2 className="text-xl font-black text-[#DC2626] whitespace-nowrap overflow-hidden text-ellipsis"><Money value={summary.expense} /></h2>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#E2E8F0]">
             <p className="text-[10px] text-[#64748B] font-bold uppercase mb-1">Total Transfer ({reportPeriod})</p>
             <h2 className="text-xl font-black text-[#4F46E5] whitespace-nowrap overflow-hidden text-ellipsis"><Money value={summary.transfer} /></h2>
          </div>
          <div className="bg-[#172033] p-4 rounded-2xl shadow-sm border border-[#0F172A]">
             <p className="text-[10px] text-[#D4A72C] font-bold uppercase mb-1">Total Kekayaan (Semua Waktu)</p>
             <h2 className="text-xl font-black text-white whitespace-nowrap overflow-hidden text-ellipsis"><Money value={summary.netWorth} /></h2>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#E2E8F0] flex flex-col justify-center">
              <h3 className="font-bold text-[#172033] mb-6 flex items-center gap-2"><BarChart3 size={18} className="text-[#D4A72C]"/> Pemasukan vs Pengeluaran</h3>
              <div className="space-y-6">
                <div>
                   <div className="flex justify-between text-xs font-bold mb-1">
                     <span className="text-[#64748B]">PEMASUKAN</span>
                     <span className="text-[#16A34A]"><Money value={incomeTotal} /></span>
                   </div>
                   <div className="w-full bg-[#F7F8FA] border border-[#E2E8F0] rounded-full h-4"><div className="bg-[#16A34A] h-full rounded-full" style={{width:`${incPct}%`}}></div></div>
                </div>
                <div>
                   <div className="flex justify-between text-xs font-bold mb-1">
                     <span className="text-[#64748B]">PENGELUARAN</span>
                     <span className="text-[#DC2626]"><Money value={expenseTotal} /></span>
                   </div>
                   <div className="w-full bg-[#F7F8FA] border border-[#E2E8F0] rounded-full h-4"><div className="bg-[#DC2626] h-full rounded-full" style={{width:`${expPct}%`}}></div></div>
                </div>
              </div>
           </div>

           <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#E2E8F0]">
              <h3 className="font-bold text-[#172033] mb-6 flex items-center gap-2"><PieChart size={18} className="text-[#D4A72C]"/> Analisis Kategori ({reportPeriod})</h3>
              {expenseChartData.length === 0 ? (
                <p className="text-center text-[#64748B] text-sm font-bold py-8 bg-[#F7F8FA] rounded-xl border border-dashed border-[#CBD5E1]">Tidak ada pengeluaran di periode ini.</p>
              ) : (
                <div className="space-y-4 max-h-48 overflow-y-auto pr-2">
                   {expenseChartData.map((d, i) => (
                     <div key={i}>
                       <div className="flex justify-between text-xs mb-1">
                         <span className="font-bold text-[#172033]">{d.category}</span>
                         <span className="font-black text-[#172033]"><Money value={d.amount} /> <span className="text-[#64748B] font-bold ml-1">({d.percentage.toFixed(1)}%)</span></span>
                       </div>
                       <div className="w-full bg-[#F7F8FA] border border-[#E2E8F0] rounded-full h-2">
                         <div className="bg-[#DC2626] h-full rounded-full" style={{ width: `${d.barWidth}%` }}></div>
                       </div>
                     </div>
                   ))}
                </div>
              )}
           </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-[#E2E8F0] overflow-hidden">
           <div className="p-5 border-b border-[#E2E8F0] bg-[#F7F8FA]">
              <h3 className="font-black text-lg text-[#172033]">Buku Besar Transaksi</h3>
              <p className="text-xs text-[#64748B] font-bold mt-1 uppercase">Filter: {reportPeriod}</p>
           </div>
           <LedgerTableComponent data={filteredTransactions} accounts={accounts} showPreview={showPreview} onDelete={handleDeleteTransaction} />
        </div>
      </div>
    );
  };

  const handleSaveBudget = async (data) => {
    const budget = { id: data.id || `b_${user.id}_${Date.now()}`, category: data.category, limit: Number(data.limit) || 0, userId: user.id };
    await saveStoreData('budgets', budget, user.id);
    setBudgets(prev => data.id ? prev.map(b => b.id === data.id ? budget : b) : [...prev, budget]);
    setShowAddBudget(false);
    setEditingBudget(null);
  };

  const handleDeleteBudget = async (id) => {
    const budget = budgets.find(b => b.id === id);
    if (!budget) return;
    if (!window.confirm(`Hapus anggaran ${budget.category}? Transaksi keuangan tidak akan ikut terhapus.`)) return;
    await deleteStoreData('budgets', id, user.id);
    setBudgets(prev => prev.filter(b => b.id !== id));
  };

  const renderBudgets = () => {
    const budgetsWithUsage = budgets.map(b => {
       const now = new Date();
       const used = transactions.filter(t => t.type === 'expense' && t.category === b.category && new Date(t.timestamp).getMonth() === now.getMonth() && new Date(t.timestamp).getFullYear() === now.getFullYear()).reduce((acc, t) => acc + t.amount, 0);
       const percent = (used / b.limit) * 100;
       return { ...b, used, percent };
    });

    return (
      <div className="space-y-6 pb-24 animate-in fade-in">
        <div className="flex justify-between items-center">
           <h2 className="text-2xl font-black text-[#172033]">Anggaran Bulanan</h2>
           <button onClick={() => { setEditingBudget(null); setShowAddBudget(true); }} className="px-4 py-2 bg-[#D4A72C] text-[#172033] font-bold rounded-xl shadow-md hover:bg-[#F2C94C] transition active:scale-95 flex items-center gap-2">
              <PlusCircle size={16} /> Tambah
           </button>
        </div>
        
        {budgetsWithUsage.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border-2 border-dashed border-[#CBD5E1]">
            <TargetIcon size={40} className="mx-auto text-[#CBD5E1] mb-3" />
            <p className="text-[#475569] font-bold mb-2">Belum Ada Anggaran</p>
            <p className="text-[#64748B] text-sm">Tambahkan anggaran untuk membatasi pengeluaran Anda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {budgetsWithUsage.map(b => {
               const statusColor = b.percent >= 100 ? 'bg-[#DC2626]' : b.percent >= 80 ? 'bg-[#D4A72C]' : 'bg-[#16A34A]';
               const textColor = b.percent >= 100 ? 'text-[#DC2626]' : b.percent >= 80 ? 'text-[#B8860B]' : 'text-[#16A34A]';
               return (
                 <div key={b.id} className="bg-white p-5 rounded-3xl shadow-sm border border-[#E2E8F0] relative overflow-hidden flex flex-col justify-between">
                    <div className={`absolute top-0 left-0 w-2 h-full ${statusColor}`}></div>
                    <div>
                      <div className="flex justify-between items-start mb-4 pl-3">
                         <h3 className="font-bold text-[#172033] text-lg leading-tight">{b.category}</h3>
                         <span className={`text-[10px] font-black px-2.5 py-1 rounded-md uppercase text-white shadow-sm shrink-0 ml-2 ${statusColor}`}>
                           {b.percent >= 100 ? 'Berlebih 🔴' : b.percent >= 80 ? 'Waspada 🟡' : 'Aman 🟢'}
                         </span>
                      </div>
                      <div className="flex justify-between text-xs font-bold text-[#64748B] mb-2 pl-3">
                         <span>Terpakai: <Money value={b.used} /></span>
                         <span>Batas: <Money value={b.limit} /></span>
                      </div>
                      <div className="w-full bg-[#F7F8FA] border border-[#E2E8F0] rounded-full h-4 overflow-hidden ml-3 pr-3">
                        <div className={`${statusColor} h-full rounded-full transition-all duration-1000`} style={{ width: `${Math.min(b.percent, 100)}%` }}></div>
                      </div>
                    </div>
                    <div className="flex justify-between items-end mt-3 pl-3">
                        <p className="text-[10px] text-[#475569] font-bold uppercase">Sisa: <Money value={Math.max(0, b.limit - b.used)} /></p>
                        <p className={`text-right text-xs font-black ${textColor}`}>{b.percent.toFixed(1)}% Terpakai</p>
                     </div>
                     <div className="flex justify-end gap-2 mt-4 pl-3 pt-3 border-t border-[#E2E8F0]">
                        <button type="button" onClick={() => { setEditingBudget(b); setShowAddBudget(true); }} className="px-3 py-1.5 bg-white border border-[#CBD5E1] text-[#475569] text-xs font-bold rounded-lg hover:bg-[#F7F8FA] flex items-center gap-1"><Save size={14}/> Edit</button>
                        <button type="button" onClick={() => handleDeleteBudget(b.id)} className="px-3 py-1.5 bg-red-50 border border-red-100 text-[#DC2626] text-xs font-bold rounded-lg hover:bg-red-100 flex items-center gap-1"><Trash2 size={14}/> Hapus</button>
                     </div>
                 </div>
               )
             })}
          </div>
        )}
      </div>
    );
  };

  const renderGoalsAndRecurring = () => (
    <div className="space-y-8 pb-24 animate-in fade-in">
      <div>
        <div className="flex justify-between items-center mb-4">
           <h2 className="text-2xl font-black text-[#172033] flex items-center gap-2"><Target size={24} className="text-[#D4A72C]"/> Target Keuangan</h2>
           <button onClick={() => setShowAddGoal(true)} className="p-2 bg-white border-2 border-[#D4A72C] text-[#B8860B] rounded-full shadow-sm hover:bg-[#F7F8FA] transition active:scale-95">
              <PlusCircle size={20} />
           </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {goals.length === 0 ? (
              <p className="text-[#64748B] text-sm font-bold italic col-span-2">Belum ada target. (Contoh: Dana Darurat, Beli Rumah)</p>
           ) : (
             goals.map(g => {
               const pct = (g.collectedAmount / g.targetAmount) * 100;
               return (
                 <div key={g.id} className="bg-white p-5 rounded-3xl shadow-sm border border-[#E2E8F0]">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold text-[#172033] text-lg">{g.name}</h3>
                        <p className="text-[10px] text-[#64748B] font-bold uppercase mt-1 flex items-center gap-1"><Calendar size={12}/> Target: {g.deadline}</p>
                      </div>
                      <button onClick={async () => { if(window.confirm('Hapus target ini?')){ await deleteStoreData('goals', g.id, user.id); setGoals(goals.filter(x=>x.id!==g.id));} }} className="text-[#64748B] hover:text-[#DC2626]"><Trash2 size={16}/></button>
                    </div>
                    <div className="w-full bg-[#F7F8FA] border border-[#E2E8F0] rounded-full h-3 mb-2 mt-4 overflow-hidden">
                      <div className="bg-[#16A34A] h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(pct, 100)}%` }}></div>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-[#475569] mb-4">
                       <span>Terkumpul: <span className="text-[#172033]"><Money value={g.collectedAmount} /></span></span>
                       <span>Dari: <span className="text-[#172033]"><Money value={g.targetAmount} /></span></span>
                    </div>
                    <button onClick={async () => {const amt = prompt('Tambah dana (Rp):'); if(amt && !isNaN(amt)){ const updatedGoal = { ...g, collectedAmount: g.collectedAmount + parseInt(amt) }; await saveStoreData('goals', updatedGoal, user.id); setGoals(goals.map(x=>x.id===g.id?updatedGoal:x)); }}} className="w-full py-3 bg-[#172033] text-white text-xs font-bold rounded-xl hover:bg-[#0F172A] transition shadow-md">
                      Update Progress / Tambah Dana
                    </button>
                 </div>
               )
             })
           )}
        </div>
      </div>

      <div className="border-t border-[#E2E8F0] pt-8">
        <div className="flex justify-between items-center mb-4">
           <h2 className="text-2xl font-black text-[#172033] flex items-center gap-2"><RefreshCw size={24} className="text-[#D4A72C]"/> Transaksi Berulang</h2>
           <button onClick={() => setShowAddRecurring(true)} className="p-2 bg-white border-2 border-[#D4A72C] text-[#B8860B] rounded-full shadow-sm hover:bg-[#F7F8FA] transition active:scale-95">
              <PlusCircle size={20} />
           </button>
        </div>
        <div className="space-y-3">
           {recurring.length === 0 ? (
              <p className="text-[#64748B] text-sm font-bold italic">Belum ada transaksi berulang. (Contoh: Bayar Listrik tiap tgl 10)</p>
           ) : (
             recurring.map(r => (
               <div key={r.id} className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${r.active ? 'bg-white border-[#E2E8F0]' : 'bg-[#F7F8FA] border-[#CBD5E1] opacity-60'}`}>
                  <div>
                    <p className="font-bold text-[#172033] text-lg">{r.note}</p>
                    <p className="text-xs font-bold text-[#475569] uppercase mt-1">{r.type} • <Money value={r.amount} /> • {r.frequency}</p>
                    <p className="text-[10px] font-black text-[#B8860B] mt-1.5 bg-[#FFFBEB] inline-block px-2 py-0.5 rounded border border-[#F2C94C]">Next: {new Date(r.nextTimestamp).toLocaleDateString('id-ID')}</p>
                  </div>
                  <div className="flex gap-2">
                     {r.active ? (
                       <button onClick={() => processRecurring(r.id, 'disable')} className="px-3 py-1.5 bg-white border border-[#CBD5E1] text-[#64748B] text-xs font-bold rounded-lg hover:bg-[#F7F8FA]">Nonaktifkan</button>
                     ) : (
                       <button onClick={async () => { const up = {...r, active:true}; await saveStoreData('recurring', up, user.id); setRecurring(recurring.map(x=>x.id===r.id?up:x)); }} className="px-3 py-1.5 bg-[#16A34A] text-white text-xs font-bold rounded-lg hover:bg-green-700">Aktifkan</button>
                     )}
                     <button onClick={async () => { if(window.confirm('Hapus jadwal ini?')){ await deleteStoreData('recurring', r.id, user.id); setRecurring(recurring.filter(x=>x.id!==r.id));} }} className="p-2 text-[#64748B] hover:text-[#DC2626] bg-[#F7F8FA] rounded-lg"><Trash2 size={16}/></button>
                  </div>
               </div>
             ))
           )}
        </div>
      </div>
    </div>
  );

  const renderSettings = () => {
    const handleBackup = async () => {
      try {
        const currentUserId = user?.id;
        const data = {
          appName: 'DompetKu',
          version: '1.0',
          exportedAt: new Date().toISOString(),
          user: currentUserId ? [user] : [],
          accounts: currentUserId ? await getScopedData('accounts', currentUserId) : [],
          transactions: currentUserId ? await getScopedData('transactions', currentUserId) : [],
          budgets: currentUserId ? await getScopedData('budgets', currentUserId) : [],
          goals: currentUserId ? await getScopedData('goals', currentUserId) : [],
          recurring: currentUserId ? await getScopedData('recurring', currentUserId) : [],
          settings: []
        };

        const json = JSON.stringify(data, null, 2);
        const fileName = `DompetKu_Backup_${new Date().toISOString().slice(0, 10)}.json`;

        if (isNativeApp()) {
          await shareNativeFile({
            fileName,
            base64Data: textToBase64(json),
            mimeType: 'application/json',
            title: 'Backup Data DompetKu',
            text: 'Backup seluruh data DompetKu'
          });
        } else {
          downloadBrowserFile(
            new Blob([json], { type: 'application/json;charset=utf-8' }),
            fileName
          );
        }
      } catch (error) {
        console.error('Backup gagal:', error);
        alert(`Backup data gagal: ${error?.message || 'Silakan coba lagi.'}`);
      }
    };

    const handleRestore = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!window.confirm('PERINGATAN: Data saat ini akan ditimpa. Lanjutkan?')) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (!data.appName || data.appName !== 'DompetKu') throw new Error('File backup DompetKu tidak valid.');
          if (!user?.id) throw new Error('Sesi akun tidak ditemukan.');

          const userId = user.id;
          const currentTables = ['accounts', 'transactions', 'budgets', 'goals', 'recurring'];

          for (const storeName of currentTables) {
            const table = cloudTableMap[storeName];
            const { error } = await supabase.from(table).delete().eq('user_id', userId);
            if (error) throw error;

            const existing = await getScopedData(storeName, userId);
            for (const item of existing) await idb.delete(storeName, item.id);
          }

          const backupUser = Array.isArray(data.user) ? data.user[0] : data.user;
          const updatedUser = {
            ...user,
            name: backupUser?.name || user.name,
            phone: backupUser?.phone || user.phone || '',
            profilePic: backupUser?.profilePic || ''
          };
          await saveProfileToCloud(updatedUser);

          for (const storeName of currentTables) {
            const items = Array.isArray(data[storeName]) ? data[storeName] : [];
            for (const item of items) {
              const normalized = { ...item, userId };
              await saveStoreData(storeName, normalized, userId);
            }
          }

          setUser(updatedUser);
          alert("Restore berhasil. Memuat ulang data akun...");
          window.location.reload();
        } catch (err) {
          console.error('Restore failed:', err);
          alert(`GAGAL RESTORE: ${err.message || 'File rusak atau tidak valid.'}`);
        } finally {
          e.target.value = '';
        }
      };
      reader.readAsText(file);
    };

    const handleProfilePicChange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { alert('File harus berupa gambar.'); return; }
      if (file.size > 2 * 1024 * 1024) { alert('Ukuran foto maksimal 2 MB.'); return; }
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const updatedUser = { ...user, profilePic: event.target.result };
          await saveProfileToCloud(updatedUser);
          setUser(updatedUser);
          e.target.value = '';
          alert('Foto profil berhasil diperbarui.');
        } catch (error) { console.error(error); alert('Gagal menyimpan foto profil.'); }
      };
      reader.readAsDataURL(file);
    };

    const handleRemoveProfilePic = async () => {
      if (!user?.profilePic) return;
      if (!window.confirm('Hapus foto profil ini?')) return;
      try {
        const updatedUser = { ...user, profilePic: '' };
        await saveProfileToCloud(updatedUser);
        setUser(updatedUser);
        alert('Foto profil berhasil dihapus.');
      } catch (error) { console.error(error); alert('Gagal menghapus foto profil.'); }
    };

    const handleSaveProfile = async () => {
      const cleanName = user?.name?.trim();
      if (!cleanName) { alert('Nama tidak boleh kosong.'); return; }
      try {
        const updatedUser = { ...user, name: cleanName, phone: user?.phone?.trim() || '' };
        await saveProfileToCloud(updatedUser);
        setUser(updatedUser);
        alert('Profil berhasil disimpan.');
      } catch (error) { console.error(error); alert('Gagal menyimpan profil.'); }
    };

    return (
      <div className="space-y-6 pb-24 animate-in fade-in max-w-lg mx-auto">
        <h2 className="text-2xl font-black text-[#172033] text-center">Pengaturan Akun</h2>
        <div className="bg-white rounded-3xl shadow-sm border border-[#E2E8F0] overflow-hidden">
           <div className="p-8 border-b border-[#E2E8F0] bg-[#F7F8FA]">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <UserAvatar user={user} size={24} textClass="text-4xl" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute bottom-0 right-0 bg-[#D4A72C] p-2.5 rounded-full text-[#172033] border-2 border-white shadow-md hover:bg-[#F2C94C] transition active:scale-95" title="Ganti foto">
                    <Camera size={17} />
                  </button>
                  <input type="file" accept="image/jpeg,image/png,image/webp" ref={fileInputRef} onChange={handleProfilePicChange} className="hidden" />
                </div>
                {user?.profilePic && (
                  <button type="button" onClick={handleRemoveProfilePic} className="text-xs font-bold text-[#DC2626] hover:underline">Hapus foto profil</button>
                )}
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-black text-[#475569] uppercase mb-2">Nama Pengguna</label>
                  <input type="text" value={user?.name || ''} onChange={(e) => setUser({ ...user, name: e.target.value })} placeholder="Masukkan nama Anda" className="w-full p-3.5 bg-white border-2 border-[#E2E8F0] rounded-xl outline-none font-bold text-[#172033] focus:border-[#D4A72C]" />
                </div>
                <div>
                  <label className="block text-xs font-black text-[#475569] uppercase mb-2">Email Akun</label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                    <input type="email" value={user?.email || ''} readOnly className="w-full p-3.5 pl-10 bg-[#F7F8FA] border-2 border-[#E2E8F0] rounded-xl outline-none font-bold text-[#172033]" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-black text-[#475569] uppercase mb-2">Nomor WhatsApp (opsional)</label>
                  <input type="text" value={user?.phone || ''} onChange={(e) => setUser({ ...user, phone: e.target.value })} placeholder="08xxxxxxxxxx" className="w-full p-3.5 bg-white border-2 border-[#E2E8F0] rounded-xl outline-none font-bold text-[#172033] focus:border-[#D4A72C]" />
                </div>
                <button type="button" onClick={handleSaveProfile} className="w-full py-3.5 bg-[#172033] text-[#D4A72C] rounded-xl font-black flex items-center justify-center gap-2 shadow-md hover:bg-[#0F172A] transition active:scale-[0.99]">
                  <Save size={18} /> Simpan Profil
                </button>
                <div className="flex justify-center">
                  <span className="text-[10px] font-bold bg-[#16A34A]/10 text-[#16A34A] px-3 py-1 rounded-full flex items-center justify-center gap-1 border border-[#16A34A]/20"><CheckCircle2 size={12}/> Offline First Ready</span>
                </div>
              </div>
           </div>
           
           <div className="p-3 space-y-1">
              <div className="px-4 pt-2 pb-1"><p className="text-[10px] font-black text-[#94A3B8] uppercase tracking-widest">Data DompetKu</p></div>
              <button onClick={handleBackup} className="w-full p-4 flex justify-between items-center hover:bg-[#F7F8FA] transition border border-transparent rounded-xl">
                 <span className="font-bold text-[#172033] flex items-center gap-3"><FileJson size={20} className="text-[#D4A72C]"/> Backup Data</span>
                 <ArrowUpRight size={16} className="text-[#94A3B8]"/>
              </button>
              <label className="w-full p-4 flex justify-between items-center hover:bg-[#F7F8FA] transition cursor-pointer border border-transparent rounded-xl">
                 <span className="font-bold text-[#172033] flex items-center gap-3"><Upload size={20} className="text-[#D4A72C]"/> Restore Data</span>
                 <input type="file" accept=".json" className="hidden" onChange={handleRestore} />
                 <ArrowUpRight size={16} className="text-[#94A3B8]"/>
              </label>
              <div className="border-t border-[#E2E8F0] my-2"></div>
              <button onClick={handleLogout} className="w-full p-4 flex justify-between items-center hover:bg-red-50 transition border border-transparent rounded-xl group">
                 <span className="font-bold text-[#DC2626] flex items-center gap-3"><LogOut size={20}/> Keluar / Logout</span>
                 <ChevronRight size={16} className="text-[#94A3B8] group-hover:text-[#DC2626]"/>
              </button>
           </div>
        </div>
        <div className="text-center">
           <p className="text-xs font-bold text-[#94A3B8]">DompetKu v1.0 • © 2026 Hamisah • All Rights Reserved</p>
        </div>
      </div>
    );
  };

  if (appState === 'auth') {
    const isRegister = authMode === 'register';
    const isForgot = authMode === 'forgot';
    const isReset = authMode === 'reset';

    return (
      <div className="min-h-screen bg-[#172033] flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md">
          <div className="text-center mb-7">
            <div className="inline-flex w-20 h-20 items-center justify-center rounded-2xl bg-[#172033] shadow-xl mb-4 overflow-hidden border border-white/10">
              <img src="/icons/icon-192.png?v=6" alt="Logo DompetKu" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-3xl font-black text-white">DompetKu</h1>
            <p className="text-[#D4A72C] text-xs font-bold uppercase tracking-widest mt-1">Catat. Kendalikan. Rencanakan.</p>
          </div>

          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-7">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-black text-[#172033]">
                  {isRegister ? 'Buat Akun' : isForgot ? 'Lupa PIN' : isReset ? 'Buat PIN Baru' : 'Selamat Datang'}
                </h2>
                <p className="text-sm text-[#64748B] font-medium mt-1">
                  {isRegister
                    ? 'Daftarkan DompetKu di perangkat ini.'
                    : isForgot
                    ? 'Masukkan email untuk menerima link membuat PIN baru.'
                    : authMode === 'reset'
                    ? 'Buat PIN baru untuk akun DompetKu Anda.'
                    : 'Masuk untuk melihat dan mengelola keuangan Anda.'}
                </p>
              </div>

              {authError && (
                <div className={`mb-4 p-3 rounded-xl text-sm font-bold border ${authError.includes('berhasil') ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                  {authError}
                </div>
              )}

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {isRegister && (
                  <div>
                    <label className="block text-xs font-black text-[#475569] uppercase mb-2">Nama Pengguna</label>
                    <div className="relative">
                      <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                      <input type="text" value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Nama Anda" autoComplete="name"
                        className="w-full p-3.5 pl-10 bg-[#F7F8FA] border-2 border-[#E2E8F0] rounded-xl outline-none font-bold text-[#172033] focus:border-[#D4A72C]" required />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-black text-[#475569] uppercase mb-2">Email</label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                    <input type="email" inputMode="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                      placeholder="nama@email.com" autoComplete="email"
                      className="w-full p-3.5 pl-10 bg-[#F7F8FA] border-2 border-[#E2E8F0] rounded-xl outline-none font-bold text-[#172033] focus:border-[#D4A72C]" required />
                  </div>
                </div>

                {!isForgot && (
                  <>
                    <div>
                      <label className="block text-xs font-black text-[#475569] uppercase mb-2">{authMode === 'reset' ? 'PIN Baru (6 digit)' : 'PIN (6 digit)'}</label>
                      <div className="relative">
                        <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                        <input type={showPin ? 'text' : 'password'} inputMode="numeric" maxLength={6} value={authPin}
                          onChange={e => setAuthPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="••••••" autoComplete={isRegister || authMode === 'reset' ? 'new-password' : 'current-password'}
                          className="w-full p-3.5 pl-10 pr-16 bg-[#F7F8FA] border-2 border-[#E2E8F0] rounded-xl outline-none font-black tracking-[0.4em] text-[#172033] focus:border-[#D4A72C]" required />
                        <button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#64748B]">{showPin ? 'Sembunyikan' : 'Lihat'}</button>
                      </div>
                    </div>

                    {(isRegister || authMode === 'reset') && (
                      <div>
                        <label className="block text-xs font-black text-[#475569] uppercase mb-2">Konfirmasi PIN</label>
                        <div className="relative">
                          <ShieldCheck size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                          <input type={showPin ? 'text' : 'password'} inputMode="numeric" maxLength={6} value={authConfirmPin}
                            onChange={e => setAuthConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="••••••" autoComplete="new-password"
                            className="w-full p-3.5 pl-10 bg-[#F7F8FA] border-2 border-[#E2E8F0] rounded-xl outline-none font-black tracking-[0.4em] text-[#172033] focus:border-[#D4A72C]" required />
                        </div>
                      </div>
                    )}
                  </>
                )}
                <button type="submit" disabled={authBusy}
                  className="w-full py-4 bg-[#172033] text-[#D4A72C] rounded-xl font-black text-lg shadow-lg hover:bg-[#0F172A] disabled:opacity-60 flex items-center justify-center gap-2 transition active:scale-[0.99]">
                  {authBusy ? <Loader2 size={22} className="animate-spin" /> : isRegister ? <><UserPlus size={20}/> Daftar & Masuk</> : isForgot ? <><Mail size={20}/> Kirim Link Reset PIN</> : authMode === 'reset' ? <><KeyRound size={20}/> Simpan PIN Baru</> : 'Masuk'}
                </button>
              </form>

              <div className="mt-6 text-center space-y-3">
                {!isRegister && !isForgot && authMode !== 'reset' && (
                  <>
                    <button type="button" onClick={() => switchAuthMode('forgot')} className="text-sm font-bold text-[#B8860B] hover:underline">Lupa PIN?</button>
                    <div className="text-sm text-[#64748B]">
                      Belum punya akun?{' '}
                      <button type="button" onClick={() => switchAuthMode('register')} className="font-black text-[#172033] hover:underline">Daftar sekarang</button>
                    </div>
                  </>
                )}

                {(isForgot || authMode === 'reset') && (
                  <button type="button" onClick={() => switchAuthMode('login')} className="text-sm font-bold text-[#172033] hover:underline">← Kembali ke Login</button>
                )}

                {isRegister && (
                  <button type="button" onClick={() => switchAuthMode('login')} className="text-sm font-bold text-[#172033] hover:underline">← Kembali ke Login</button>
                )}
              </div>
            </div>

            <div className="bg-[#F7F8FA] border-t border-[#E2E8F0] p-4 text-center">
              <p className="text-[10px] font-bold text-[#94A3B8]">DompetKu v1.0 • Data tersinkronisasi ke akun cloud Anda</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showPreview) {
    const previewRows = [...filteredTransactions].sort((a, b) => (normalizeTimestamp(a.timestamp) || 0) - (normalizeTimestamp(b.timestamp) || 0));
    if (import.meta.env.DEV) {
      console.log('[DompetKu][PREVIEW-DATA]', {
        reportPeriod,
        filteredCount: filteredTransactions.length,
        previewRowsCount: previewRows.length,
        sample: previewRows.slice(0, 3)
      });
    }
    const initialTotal = accounts.reduce((total, account) => total + (Number(account.initialBalance) || 0), 0);
    let previewBalance = initialTotal;
    const rowsWithBalance = previewRows.map((t, index) => {
      const amount = Number(t.amount) || 0;
      if (t.type === 'income') previewBalance += amount;
      if (t.type === 'expense') previewBalance -= amount;
      return { ...t, runBal: previewBalance, displayId: `TX-${String(index + 1).padStart(3, '0')}` };
    });

    const getAccountNames = (t) => ({
      src: accounts.find(a => a.id === t.accountId)?.name || 'Dihapus',
      dest: accounts.find(a => a.id === t.toAccountId)?.name || 'Dihapus'
    });

    return (
      <div className="preview-page min-h-screen bg-[#F1F5F9] font-sans p-0 md:p-6 print:p-0 print:bg-white">
        <style dangerouslySetInnerHTML={{__html: `
          .money-inline { display:inline-flex; align-items:baseline; gap:4px; white-space:nowrap; }
          .money-inline > span:first-child { flex:0 0 auto; }
          .money-inline > span:last-child { flex:0 0 auto; }
          .money-currency { display:inline !important; white-space:nowrap !important; }
          .dompetku-table-shell {
            width:100%;
            max-width:100%;
            overflow-x:auto;
            overflow-y:hidden;
            scrollbar-width:thin;
            scrollbar-color:#94A3B8 #E2E8F0;
            -webkit-overflow-scrolling:touch;
            background:transparent;
            border-radius:16px;
            box-sizing:border-box;
          }
          .dompetku-table-shell::-webkit-scrollbar { height:9px; }
          .dompetku-table-shell::-webkit-scrollbar-track { background:#E2E8F0; border-radius:9999px; }
          .dompetku-table-shell::-webkit-scrollbar-thumb { background:#94A3B8; border-radius:9999px; }
          .dompetku-table {
            width:100%;
            min-width:1020px;
            max-width:100%;
            table-layout:fixed;
            border-collapse:collapse;
            border-spacing:0;
            box-sizing:border-box;
          }
          .dompetku-table th, .dompetku-table td {
            border-collapse:collapse;
            box-sizing:border-box;
            vertical-align:top;
            overflow-wrap:anywhere;
            word-break:break-word;
            min-width:0;
            padding:10px 8px;
          }
          .dompetku-table th {
            white-space:nowrap;
          }
          .dompetku-table td:last-child,
          .dompetku-table th:last-child {
            width:84px;
            min-width:84px;
            max-width:84px;
            text-align:center;
          }
          .dompetku-table td:nth-child(1),
          .dompetku-table th:nth-child(1) { width:9%; }
          .dompetku-table td:nth-child(2),
          .dompetku-table th:nth-child(2) { width:18%; }
          .dompetku-table td:nth-child(3),
          .dompetku-table th:nth-child(3) { width:12%; }
          .dompetku-table td:nth-child(4),
          .dompetku-table th:nth-child(4) { width:16%; }
          .dompetku-table td:nth-child(5),
          .dompetku-table th:nth-child(5) { width:10%; }
          .dompetku-table td:nth-child(6),
          .dompetku-table th:nth-child(6) { width:10%; }
          .dompetku-table td:nth-child(7),
          .dompetku-table th:nth-child(7) { width:9%; }
          .dompetku-table td:nth-child(8),
          .dompetku-table th:nth-child(8) { width:12%; min-width:120px; }
          .dompetku-table .money-cell,
          .dompetku-table td:nth-child(5),
          .dompetku-table td:nth-child(6),
          .dompetku-table td:nth-child(7),
          .dompetku-table td:nth-child(8),
          .dompetku-table th:nth-child(5),
          .dompetku-table th:nth-child(6),
          .dompetku-table th:nth-child(7),
          .dompetku-table th:nth-child(8) {
            text-align:right;
            white-space:nowrap;
            overflow:visible;
          }
          .dompetku-table .money-currency,
          .dompetku-table .money-inline .money-currency {
            white-space:nowrap;
            flex-shrink:0;
          }
          .dompetku-table button {
            max-width:100%;
            min-width:0;
            overflow:visible;
          }
          .report-screen { display:block; }
          .report-print-only { display:none; }
          .report-document-wrapper {
            width:100%;
            max-width:100%;
            overflow-x:auto;
            overflow-y:hidden;
            box-sizing:border-box;
          }
          .report-document-table {
            width:100%;
            min-width:980px;
            max-width:100%;
            table-layout:fixed;
            border-collapse:collapse;
            border-spacing:0;
            box-sizing:border-box;
            background:#fff;
          }
          .report-document-table th, .report-document-table td {
            padding:7px 6px;
            vertical-align:top;
            font-size:11px;
            line-height:1.25;
            overflow-wrap:anywhere;
            word-break:break-word;
            box-sizing:border-box;
            min-width:0;
            overflow:visible;
          }
          .report-document-table .money-cell {
            white-space:nowrap;
            text-align:right;
            max-width:100%;
            overflow:visible;
          }
          .report-document-table .money-inline { font-size:11px !important; gap:3px !important; }
          .report-document-table td, .report-document-table th {
            max-width:none;
            text-overflow:clip;
          }
          @media (min-width: 768px) {
            .report-document-wrapper { width:100%; max-width:100%; overflow:visible !important; }
            .report-document-table { width:100% !important; min-width:0 !important; table-layout:fixed !important; }
            .report-document-table th, .report-document-table td { padding-left:5px !important; padding-right:5px !important; }
          }
          .preview-toolbar { box-sizing:border-box; width:min(1280px, calc(100% - 32px)); margin:16px auto 0; }
          .preview-sheet {
            width:min(1120px, calc(100% - 32px));
            max-width:100%;
            margin:16px auto 24px;
            box-sizing:border-box;
          }
          .preview-screen-table { width:100%; table-layout:fixed; }
          .preview-screen-table th, .preview-screen-table td { overflow-wrap:anywhere; word-break:break-word; box-sizing:border-box; }
          @media (max-width: 767px) {
            html, body, #root { width:100% !important; max-width:100% !important; overflow-x:hidden !important; }
            .preview-page { width:100% !important; max-width:100% !important; min-width:0 !important; overflow-x:hidden !important; display:block !important; }
            .preview-sheet {
              width:100% !important;
              max-width:100% !important;
              min-width:0 !important;
              margin:0 !important;
              padding:16px !important;
              border-radius:0 !important;
              box-shadow:none !important;
              border:0 !important;
              box-sizing:border-box !important;
            }
            .preview-toolbar {
              position:sticky !important;
              top:0 !important;
              left:auto !important;
              right:auto !important;
              width:100% !important;
              max-width:none !important;
              margin:0 !important;
              border-radius:0 !important;
              box-sizing:border-box !important;
              z-index:50 !important;
            }
            .preview-header {
              display:flex !important;
              flex-direction:column !important;
              align-items:stretch !important;
              gap:12px !important;
              width:100% !important;
              box-sizing:border-box !important;
            }
            .preview-header h1 { font-size:2rem !important; letter-spacing:.12em !important; }
            .preview-header p { font-size:.75rem !important; letter-spacing:.08em !important; }
            .preview-header-meta {
              width:100% !important;
              box-sizing:border-box !important;
              text-align:left !important;
            }
            .preview-summary {
              display:grid !important;
              grid-template-columns:1fr 1fr !important;
              gap:10px !important;
            }
            .preview-summary-card { min-width:0 !important; box-sizing:border-box !important; }
            .preview-summary-card .money-inline { font-size:1rem !important; }
            .preview-summary-card.preview-summary-card-networth {
              background:#172033 !important;
              border-color:#172033 !important;
              opacity:1 !important;
              color:#FFFFFF !important;
            }
            .preview-summary-card.preview-summary-card-networth .preview-summary-card-networth-label {
              color:#D4A72C !important;
              opacity:1 !important;
              text-shadow:none !important;
            }
            .preview-summary-card.preview-summary-card-networth .preview-summary-card-networth-value,
            .preview-summary-card.preview-summary-card-networth .preview-summary-card-networth-value .money-currency,
            .preview-summary-card.preview-summary-card-networth .preview-summary-card-networth-value span,
            .preview-summary-card.preview-summary-card-networth .preview-summary-card-networth-value * {
              color:#FFFFFF !important;
              opacity:1 !important;
              text-shadow:none !important;
            }
            .dompetku-table-shell,
            .preview-table-wrap,
            .preview-table-wrap * {
              overflow-x:auto !important;
              overflow-y:hidden !important;
            }
            .dompetku-table,
            .preview-table,
            .preview-screen-table {
              width:100% !important;
              min-width:760px !important;
              max-width:100% !important;
              table-layout:fixed !important;
            }
            .report-screen { width:100% !important; min-width:0 !important; }
            .report-screen > .md\\:hidden { display:block !important; width:100% !important; }
            .report-print-only { display:none !important; }
          }
          @media print {
            html, body, #root {
              background:#fff !important;
              margin:0 !important;
              padding:0 !important;
              width:100% !important;
              max-width:100% !important;
              overflow:visible !important;
            }
            body { background:#fff !important; }
            .print-hidden { display:none !important; }
            .preview-toolbar { display:none !important; }
            .preview-page { display:block !important; width:100% !important; max-width:100% !important; min-width:0 !important; overflow:visible !important; }
            .report-screen { display:none !important; }
            .report-print-only { display:block !important; }
            .print-report {
              width:100% !important;
              max-width:100% !important;
              margin:0 !important;
              padding:12mm 8mm 8mm !important;
              border:0 !important;
              box-shadow:none !important;
              border-radius:0 !important;
              background:#fff !important;
              box-sizing:border-box !important;
            }
            .print-report .preview-header { display:grid !important; grid-template-columns:1fr auto !important; align-items:start !important; gap:12px !important; }
            .print-report .preview-summary { display:grid !important; grid-template-columns:repeat(4, 1fr) !important; gap:8px !important; }
            .print-report .preview-summary-card { padding:9px !important; min-width:0 !important; overflow:visible !important; background:#F7F8FA !important; border:1px solid #CBD5E1 !important; box-sizing:border-box !important; }
            .print-report .preview-summary-card.preview-summary-card-networth {
              background:#172033 !important;
              border-color:#172033 !important;
              color:#FFFFFF !important;
            }
            .print-report .preview-summary-card.preview-summary-card-networth .preview-summary-card-networth-label {
              color:#D4A72C !important;
              opacity:1 !important;
              text-shadow:none !important;
            }
            .print-report .preview-summary-card.preview-summary-card-networth .preview-summary-card-networth-value,
            .print-report .preview-summary-card.preview-summary-card-networth .preview-summary-card-networth-value .money-currency,
            .print-report .preview-summary-card.preview-summary-card-networth .preview-summary-card-networth-value span,
            .print-report .preview-summary-card.preview-summary-card-networth .preview-summary-card-networth-value * {
              color:#FFFFFF !important;
              opacity:1 !important;
              text-shadow:none !important;
            }
            .print-report .preview-summary-card h2 { font-size:14px !important; line-height:1.15 !important; }
            .print-report .preview-section-title { font-size:16px !important; margin:16px 0 8px !important; }
            .print-report-table-wrap {
              width:100% !important;
              overflow:visible !important;
              border:none !important;
              border-radius:0 !important;
              box-shadow:none !important;
              background:transparent !important;
            }
            .print-report-table {
              width:100% !important;
              max-width:100% !important;
              min-width:0 !important;
              table-layout:fixed !important;
              border-collapse:collapse !important;
              border-spacing:0 !important;
              background:#fff !important;
              box-sizing:border-box !important;
            }
            .print-report-table th, .print-report-table td {
              font-size:8px !important;
              padding:5px 4px !important;
              word-break:normal !important;
              overflow-wrap:anywhere !important;
              vertical-align:middle !important;
              border:0.25mm solid #CBD5E1 !important;
              color:#172033 !important;
              box-sizing:border-box !important;
            }
            .print-report-table thead tr { background:#172033 !important; color:#fff !important; }
            .print-report-table thead th { color:#fff !important; font-weight:700 !important; }
            .print-report-table th:nth-child(1), .print-report-table td:nth-child(1) { width:9% !important; text-align:center !important; }
            .print-report-table th:nth-child(2), .print-report-table td:nth-child(2) { width:17% !important; text-align:left !important; }
            .print-report-table th:nth-child(3), .print-report-table td:nth-child(3) { width:12% !important; text-align:left !important; }
            .print-report-table th:nth-child(4), .print-report-table td:nth-child(4) { width:18% !important; text-align:left !important; }
            .print-report-table th:nth-child(5), .print-report-table td:nth-child(5) { width:12% !important; text-align:right !important; }
            .print-report-table th:nth-child(6), .print-report-table td:nth-child(6) { width:12% !important; text-align:right !important; }
            .print-report-table th:nth-child(7), .print-report-table td:nth-child(7) { width:8% !important; text-align:right !important; }
            .print-report-table th:nth-child(8), .print-report-table td:nth-child(8) { width:12% !important; text-align:right !important; }
            .print-report-table thead { display:table-header-group !important; }
            .print-report-table tbody { display:table-row-group !important; }
            .print-report-table tr { break-inside:avoid !important; page-break-inside:avoid !important; }
            .print-report-table td:nth-child(8),
            .print-report-table th:nth-child(8),
            .print-report-table .money-cell {
              white-space:normal !important;
              overflow:visible !important;
              text-overflow:clip !important;
              max-width:100% !important;
              overflow-wrap:anywhere !important;
              word-break:break-word !important;
            }
            .print-report-table td:nth-child(1) { white-space:nowrap !important; }
            .print-report-table .money-inline {
              white-space:normal !important;
              display:inline-block !important;
              font-size:8px !important;
              max-width:100% !important;
            }
            .print-report-table td:nth-child(5),
            .print-report-table td:nth-child(6),
            .print-report-table td:nth-child(7),
            .print-report-table td:nth-child(8) {
              font-size:7.8px !important;
            }
            .print-report .preview-summary-card .money-inline { white-space:nowrap !important; font-size:clamp(11px, 1.55vw, 16px) !important; letter-spacing:-0.02em !important; }
            .print-report .preview-section-title { break-after:avoid !important; page-break-after:avoid !important; }
            .print-report .preview-footer { margin-top:18px !important; padding-top:8px !important; }
            @page { size:A4 portrait; margin:8mm; }
          }
        `}} />

        <div className="preview-toolbar bg-[#172033] text-white p-3 md:p-4 rounded-2xl shadow-2xl z-50 print-hidden flex items-center justify-between gap-3">
          <h2 className="font-black flex items-center gap-2 text-[#D4A72C] text-sm md:text-base"><Eye size={18}/> Preview Cetak</h2>
          <div className="flex gap-2">
            <button onClick={() => setShowPreview(false)} className="px-3 md:px-4 py-2 bg-transparent border border-white text-white rounded-lg font-bold text-xs md:text-sm">Tutup</button>
            <button type="button" onClick={executePrint} className="px-3 md:px-4 py-2 bg-[#D4A72C] text-[#172033] rounded-lg font-bold text-xs md:text-sm flex items-center gap-2"><Printer size={15}/> Cetak / Bagikan</button>
          </div>
        </div>

        <div id="dompetku-report" className="print-report preview-sheet bg-white max-w-5xl w-full shadow-lg mt-20 md:mt-6 p-4 md:p-10 border border-[#E2E8F0] rounded-2xl md:rounded-3xl">
          <div className="preview-header border-b-4 border-[#172033] pb-5 mb-6 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 md:gap-8 items-start">
            <div className="flex items-center gap-4 min-w-0">
              <img src="/icons/icon-192.png?v=6" alt="Logo DompetKu" className="w-20 h-20 md:w-24 md:h-24 rounded-2xl object-contain shrink-0" />
              <div className="min-w-0">
                <h1 className="text-3xl md:text-5xl font-black uppercase tracking-[0.12em] text-[#172033] leading-none">DOMPETKU</h1>
                <p className="text-[#475569] mt-2 font-bold text-sm md:text-lg tracking-[0.08em]">LAPORAN KEUANGAN PRIBADI</p>
              </div>
            </div>
            <div className="preview-header-meta w-full md:w-auto md:min-w-[250px] text-left md:text-right text-xs md:text-sm text-[#475569] font-medium bg-[#F7F8FA] p-4 rounded-lg border border-[#E2E8F0]">
              <p>Pemilik Akun: <span className="font-bold text-[#172033] uppercase">{user?.name}</span></p>
              <p>Periode: <span className="font-bold text-[#172033]">{reportPeriodLabel}</span></p>
              <p>Tanggal Cetak: <span className="font-bold text-[#172033]">{new Date().toLocaleDateString('id-ID')}</span></p>
            </div>
          </div>

          <h3 className="preview-section-title font-black text-xl text-[#172033] mb-4 uppercase tracking-wider">Ringkasan Keuangan</h3>
          <div className="preview-summary grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-7">
            <div className="preview-summary-card border border-[#CBD5E1] p-4 rounded-xl bg-[#F7F8FA]">
              <p className="text-[10px] font-bold uppercase text-[#64748B] mb-1">Pemasukan</p>
              <Money value={summary.income} className="text-[#16A34A] text-lg md:text-xl font-black" />
            </div>
            <div className="preview-summary-card border border-[#CBD5E1] p-4 rounded-xl bg-[#F7F8FA]">
              <p className="text-[10px] font-bold uppercase text-[#64748B] mb-1">Pengeluaran</p>
              <Money value={summary.expense} className="text-[#DC2626] text-lg md:text-xl font-black" />
            </div>
            <div className="preview-summary-card border border-[#CBD5E1] p-4 rounded-xl bg-[#F7F8FA]">
              <p className="text-[10px] font-bold uppercase text-[#64748B] mb-1">Total Transfer</p>
              <Money value={summary.transfer} className="text-[#4F46E5] text-lg md:text-xl font-black" />
            </div>
            <div className="preview-summary-card preview-summary-card-networth border-2 border-[#172033] p-4 rounded-xl bg-[#172033] text-white">
              <p className="preview-summary-card-networth-label text-[10px] font-bold uppercase mb-1">Kekayaan Bersih (Total)</p>
              <Money value={summary.netWorth} className="preview-summary-card-networth-value text-lg md:text-xl font-black" />
            </div>
          </div>

          <h3 className="preview-section-title font-black text-xl text-[#172033] mb-4 uppercase tracking-wider">Buku Besar Transaksi</h3>

          <div className="report-screen">
            <div className="report-document-wrapper border-2 border-[#172033] rounded-xl">
              <table className="report-document-table bg-white">
                <colgroup>
                  <col style={{width:'9%'}}/><col style={{width:'17%'}}/><col style={{width:'11%'}}/><col style={{width:'17%'}}/>
                  <col style={{width:'12%'}}/><col style={{width:'12%'}}/><col style={{width:'10%'}}/><col style={{width:'12%'}}/>
                </colgroup>
                <thead>
                  <tr className="bg-[#172033] text-white text-sm">
                    <th className="text-center whitespace-nowrap px-2 py-3">ID</th><th className="text-center whitespace-nowrap px-2 py-3">Tanggal</th><th className="text-left px-2 py-3">Keterangan</th><th className="text-left px-2 py-3">Kategori</th><th className="text-left px-2 py-3">Akun</th>
                    <th className="text-right whitespace-nowrap px-2 py-3">Pemasukan</th><th className="text-right whitespace-nowrap px-2 py-3">Pengeluaran</th><th className="text-right whitespace-nowrap px-2 py-3">Transfer</th><th className="text-right whitespace-nowrap px-2 py-3">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsWithBalance.length === 0 ? <tr><td colSpan="9" className="p-8 text-center text-[#64748B] italic">Belum ada transaksi.</td></tr> : rowsWithBalance.map(t => {
                    const {src, dest} = getAccountNames(t);
                    const isTransfer = t.type === 'transfer';
                    return <tr key={t.id} className="border-b border-[#E2E8F0]">
                      <td className="text-[#475569] whitespace-nowrap text-center p-3 font-bold">{t.displayId}</td>
                      <td className="text-[#475569] whitespace-nowrap text-center p-3">{t.dateStr || new Date(t.timestamp).toLocaleDateString('id-ID')}</td>
                      <td className="font-bold text-[#172033] break-words p-3 text-left">{t.note}</td>
                      <td className="p-3 text-left"><span className="inline-block whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded bg-[#F7F8FA] text-[#64748B] uppercase border border-[#E2E8F0]">{t.category}</span></td>
                      <td className="font-bold break-words p-3 text-left">{isTransfer ? <span className="text-[#4F46E5]">{src} - {dest}</span> : src}</td>
                      <td className="text-right money-cell text-[#16A34A] font-black p-3">{t.type === 'income' ? <Money value={t.amount}/> : '-'}</td>
                      <td className="text-right money-cell text-[#DC2626] font-black p-3">{t.type === 'expense' ? <Money value={t.amount}/> : '-'}</td>
                      <td className="text-right money-cell text-[#4F46E5] font-black p-3">{t.type === 'transfer' ? <Money value={t.amount}/> : '-'}</td>
                      <td className="text-right money-cell text-[#172033] font-black p-3">{isTransfer ? <span className="text-[#64748B]">Mutasi</span> : <Money value={t.runBal}/>}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="report-print-only print-report-table-wrap border-2 border-[#172033] rounded-xl">
            <table className="print-report-table bg-white">
              <colgroup>
                <col style={{width:'9%'}}/><col style={{width:'17%'}}/><col style={{width:'12%'}}/><col style={{width:'18%'}}/>
                <col style={{width:'12%'}}/><col style={{width:'12%'}}/><col style={{width:'8%'}}/><col style={{width:'12%'}}/>
              </colgroup>
              <thead>
                <tr className="bg-[#172033] text-white">
                  <th className="text-center">ID</th><th className="text-center">Tanggal</th><th className="text-left">Keterangan</th><th className="text-left">Kategori</th><th className="text-left">Akun</th><th className="text-right">Pemasukan</th><th className="text-right">Pengeluaran</th><th className="text-right">Transfer</th><th className="text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {rowsWithBalance.map(t => {
                  const {src,dest} = getAccountNames(t);
                  const isTransfer = t.type === 'transfer';
                  return <tr key={t.id}>
                    <td className="text-center font-bold">{t.displayId}</td>
                    <td className="text-center">{t.dateStr || new Date(t.timestamp).toLocaleDateString('id-ID')}</td>
                    <td className="font-bold text-left">{t.note}</td>
                    <td className="text-left">{t.category}</td>
                    <td className="font-bold text-left">{isTransfer ? `${src} -> ${dest}` : src}</td>
                    <td className="money-cell text-right">{t.type === 'income' ? <Money value={t.amount}/> : '-'}</td>
                    <td className="money-cell text-right">{t.type === 'expense' ? <Money value={t.amount}/> : '-'}</td>
                    <td className="money-cell text-right">{t.type === 'transfer' ? <Money value={t.amount}/> : '-'}</td>
                    <td className="money-cell text-right">{isTransfer ? 'Mutasi' : <Money value={t.runBal}/>}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>

          <div className="preview-footer mt-10 text-center text-xs text-[#64748B] font-bold border-t-2 border-[#E2E8F0] pt-5">
            <p>DompetKu v1.0 • © 2026 Hamisah • All Rights Reserved</p>
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'loading') return <div className="min-h-screen bg-[#172033] flex justify-center items-center"><Loader2 className="animate-spin text-[#D4A72C]" size={40}/></div>;

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#172033] font-sans flex flex-col md:flex-row print-hidden">
      <nav className="hidden md:flex flex-col w-64 bg-[#172033] text-white h-screen sticky top-0 shrink-0 shadow-2xl">
         <div className="p-6 border-b border-[#0F172A]">
           <div className="flex items-center gap-3">
             <img src="/icons/icon-192.png?v=6" alt="Logo DompetKu" className="w-11 h-11 rounded-xl object-contain shrink-0" />
             <div className="min-w-0">
               <h1 className="text-2xl font-black text-white leading-none">DompetKu</h1>
               <p className="text-[9px] uppercase tracking-widest text-[#D4A72C] font-bold mt-1">Catat. Kendalikan. Rencanakan.</p>
             </div>
           </div>
         </div>
         <div className="flex-1 py-6 px-4 space-y-2 overflow-y-auto">
            {[
              { id: 'dashboard', icon: <Home size={20}/>, label: 'Dashboard' },
              { id: 'reports', icon: <BarChart3 size={20}/>, label: 'Laporan Keuangan' },
              { id: 'budgets', icon: <PieChart size={20}/>, label: 'Anggaran Bulanan' },
              { id: 'goals', icon: <TargetIcon size={20}/>, label: 'Target & Berulang' },
              { id: 'settings', icon: <Settings size={20}/>, label: 'Pengaturan' }
            ].map(item => (
              <button 
                key={item.id} 
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 p-4 rounded-xl font-bold transition-all ${activeTab === item.id ? 'bg-[#D4A72C] text-[#172033] shadow-lg' : 'text-[#94A3B8] hover:bg-[#0F172A] hover:text-white'}`}
              >
                {item.icon} {item.label}
              </button>
            ))}
         </div>
         <div className="p-6 border-t border-[#0F172A] flex items-center gap-3 cursor-pointer hover:bg-[#0F172A] transition rounded-xl mx-2 mb-2" onClick={() => setActiveTab('settings')}>
           <UserAvatar user={user} size={10} textClass="text-lg" />
           <div>
             <p className="text-white font-bold text-sm line-clamp-1 capitalize">{user?.name?.toLowerCase()}</p>
             <p className="text-[10px] text-[#94A3B8] uppercase">{user?.phone}</p>
           </div>
         </div>
      </nav>

      <header className="md:hidden bg-[#172033] p-4 flex justify-between items-center sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/icons/icon-192.png?v=6" alt="Logo DompetKu" className="w-9 h-9 rounded-lg object-contain shrink-0" />
          <h1 className="text-lg font-black text-white truncate">DompetKu</h1>
        </div>
        <div onClick={() => setActiveTab('settings')} className="cursor-pointer">
           <UserAvatar user={user} size={8} textClass="text-sm" />
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-8 overflow-x-hidden relative">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'reports' && renderReports()}
        {activeTab === 'budgets' && renderBudgets()}
        {activeTab === 'goals' && renderGoalsAndRecurring()}
        {activeTab === 'settings' && renderSettings()}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-[#172033]/95 backdrop-blur-md border-t border-[#0F172A] flex justify-around p-2 pb-safe z-50">
        {[
          { id: 'dashboard', icon: <Home size={20}/>, label: 'Home' },
          { id: 'reports', icon: <BarChart3 size={20}/>, label: 'Laporan' },
          { id: 'budgets', icon: <PieChart size={20}/>, label: 'Anggaran' },
          { id: 'goals', icon: <TargetIcon size={20}/>, label: 'Target' },
          { id: 'settings', icon: <Settings size={20}/>, label: 'Akun' }
        ].map(item => (
          <button 
            key={item.id} 
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center p-2 rounded-xl transition-all ${activeTab === item.id ? 'text-[#D4A72C] scale-110 drop-shadow-md' : 'text-[#64748B] hover:text-[#94A3B8]'}`}
          >
            {item.icon}
            <span className="text-[9px] font-bold mt-1 uppercase tracking-wider">{item.label}</span>
          </button>
        ))}
      </nav>
      
      {txType && <TransactionModal txType={txType} accounts={accounts} accountBalances={accountBalances} onClose={() => setTxType(null)} onSubmit={handleTransactionSubmit} isAiLoading={isAiLoading} />}
      {showAddAccount && <AddAccountModal onClose={() => setShowAddAccount(false)} onSave={(data) => { const newAcc = { id: `acc_${user.id}_${Date.now()}`, ...data, userId: user.id }; saveStoreData('accounts', newAcc, user.id); setAccounts([...accounts, newAcc]); setShowAddAccount(false); }} />}
      {showAddBudget && <AddBudgetModal
        initialBudget={editingBudget}
        onClose={() => { setShowAddBudget(false); setEditingBudget(null); }}
        onSave={handleSaveBudget}
      />}
      {showAddGoal && <AddGoalModal onClose={() => setShowAddGoal(false)} onSave={(data) => { const newG = { id: `g_${user.id}_${Date.now()}`, ...data, userId: user.id }; saveStoreData('goals', newG, user.id); setGoals([...goals, newG]); setShowAddGoal(false); }} />}
      {showAddRecurring && <AddRecurringModal accounts={accounts} onClose={() => setShowAddRecurring(false)} onSave={(data) => { const newR = { id: `r_${user.id}_${Date.now()}`, ...data, userId: user.id }; saveStoreData('recurring', newR, user.id); setRecurring([...recurring, newR]); setShowAddRecurring(false); }} />}
    </div>
  );
}

