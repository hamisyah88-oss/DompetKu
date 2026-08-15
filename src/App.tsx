import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Printer, Download, TrendingUp, TrendingDown, Eye, X, Wallet, Landmark, 
  Receipt, Trash2, Bot, Loader2, CheckCircle2, PlusCircle, ArrowUpRight, 
  ArrowDownRight, BarChart3, Target, Settings, PieChart,
  ArrowRightLeft, Save, Upload, Home, Target as TargetIcon, User, Camera,
  Calendar, Check, AlertCircle, RefreshCw, SkipForward, ChevronRight,
  KeyRound, LogOut, UserPlus, Phone, ShieldCheck, Mail
} from 'lucide-react';
import { supabase } from './lib/supabase';

const injectPWA = () => {
  if (document.getElementById('dompetku-manifest')) return;
  const manifest = {
    name: "DompetKu: Catat. Kendalikan. Rencanakan.",
    short_name: "DompetKu",
    start_url: ".",
    display: "standalone",
    background_color: "#172033",
    theme_color: "#172033",
    icons: [
      { src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23D4A72C'%3E%3Cpath d='M21 18V19C21 20.1 20.1 21 19 21H5C3.89 21 3 20.1 3 19V5C3 3.9 3.89 3 5 3H19C20.1 3 21 3.9 21 5V6H12C10.89 6 10 6.9 10 8V16C10 17.1 10.89 18 12 18H21ZM12 16H22V8H12V16ZM16 13.5C15.17 13.5 14.5 12.83 14.5 12C14.5 11.17 15.17 10.5 16 10.5C16.83 10.5 17.5 11.17 17.5 12C17.5 12.83 16.83 13.5 16 13.5Z'/%3E%3C/svg%3E", sizes: "192x192", type: "image/svg+xml" },
      { src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23D4A72C'%3E%3Cpath d='M21 18V19C21 20.1 20.1 21 19 21H5C3.89 21 3 20.1 3 19V5C3 3.9 3.89 3 5 3H19C20.1 3 21 3.9 21 5V6H12C10.89 6 10 6.9 10 8V16C10 17.1 10.89 18 12 18H21ZM12 16H22V8H12V16ZM16 13.5C15.17 13.5 14.5 12.83 14.5 12C14.5 11.17 15.17 10.5 16 10.5C16.83 10.5 17.5 11.17 17.5 12C17.5 12.83 16.83 13.5 16 13.5Z'/%3E%3C/svg%3E", sizes: "512x512", type: "image/svg+xml" }
    ]
  };
  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
  const link = document.createElement('link');
  link.id = 'dompetku-manifest';
  link.rel = 'manifest';
  link.href = URL.createObjectURL(blob);
  document.head.appendChild(link);
};

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

  const calcData = [...data].sort((a, b) => a.timestamp - b.timestamp).map(t => {
    const amount = Number(t.amount) || 0;
    if (t.type === 'income') runBal += amount;
    if (t.type === 'expense') runBal -= amount;
    return { ...t, runBal };
  }).reverse();

  return (
    <>
      <div className={`${showPreview ? "block" : "hidden md:block"} overflow-x-auto print:overflow-visible`}>
        <table className="w-full text-left border-collapse bg-white">
          <thead>
            <tr className="bg-[#172033] text-white text-sm border-b-2 border-[#0F172A] print:bg-slate-200 print:text-slate-900 print:border-slate-800">
              <th className="p-3 font-bold w-28">Tanggal</th>
              <th className="p-3 font-bold">Keterangan</th>
              <th className="p-3 font-bold">Kategori</th>
              <th className="p-3 font-bold">Akun</th>
              <th className="p-3 font-bold text-right">Pemasukan</th>
              <th className="p-3 font-bold text-right">Pengeluaran</th>
              <th className="p-3 font-bold text-right border-l border-[#E2E8F0] print:border-slate-400">Saldo</th>
              {!showPreview && <th className="p-3 font-bold text-center w-12 print-hidden">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {calcData.length === 0 ? (
              <tr><td colSpan="8" className="p-8 text-center text-[#64748B] italic print:text-black">Belum ada transaksi.</td></tr>
            ) : (
              calcData.map(t => {
                 const isTransfer = t.type === 'transfer';
                 const accName = accounts.find(a=>a.id === t.accountId)?.name || 'Dihapus';
                 const toAccName = accounts.find(a=>a.id === t.toAccountId)?.name || 'Dihapus';
                 return (
                  <tr key={t.id} className="border-b border-[#E2E8F0] hover:bg-[#F7F8FA] transition print:border-slate-300 print:break-inside-avoid">
                    <td className="p-3 text-sm text-[#475569] align-top print:text-slate-800">{t.dateStr || new Date(t.timestamp).toLocaleDateString('id-ID')}</td>
                    <td className="p-3 align-top font-bold text-[#172033] print:text-slate-900">{t.note}</td>
                    <td className="p-3 align-top"><span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#F7F8FA] text-[#64748B] uppercase border border-[#E2E8F0] print:border-none print:p-0 print:bg-transparent print:text-slate-700">{t.category}</span></td>
                    <td className="p-3 text-xs font-bold align-top print:text-slate-800">
                      {isTransfer ? <span className="text-[#4F46E5] print:text-slate-900">{accName} → {toAccName}</span> : <span className="text-[#475569] print:text-slate-800">{accName}</span>}
                    </td>
                    <td className="p-3 text-sm font-black text-[#16A34A] text-right align-top print:text-slate-900">
                      {t.type === 'income' ? `Rp ${t.amount.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="p-3 text-sm font-black text-[#DC2626] text-right align-top print:text-slate-900">
                      {(t.type === 'expense' || t.type === 'transfer') ? `Rp ${t.amount.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="p-3 text-sm font-bold text-[#172033] text-right align-top border-l border-[#E2E8F0] bg-[#F7F8FA]/50 print:bg-transparent print:border-slate-300 print:text-slate-900">
                      {isTransfer ? 'Mutasi' : `Rp ${t.runBal.toLocaleString('id-ID')}`}
                    </td>
                    {!showPreview && (
                      <td className="p-3 text-center align-top print-hidden">
                        <button onClick={() => onDelete(t.id)} className="p-2 text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 rounded-lg transition"><Trash2 size={14}/></button>
                      </td>
                    )}
                  </tr>
                 );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className={`${showPreview ? "hidden" : "md:hidden"} space-y-3 p-4 bg-[#F7F8FA] print-hidden`}>
        {calcData.length === 0 ? (
           <div className="p-8 text-center text-[#64748B] italic">Belum ada transaksi.</div>
        ) : (
           calcData.map(t => {
              const isIncome = t.type === 'income';
              const isTransfer = t.type === 'transfer';
              const accName = accounts.find(a=>a.id === t.accountId)?.name || 'Dihapus';
              const toAccName = accounts.find(a=>a.id === t.toAccountId)?.name || 'Dihapus';
              return (
                <div key={t.id} className="bg-white p-4 rounded-xl shadow-sm border border-[#E2E8F0] flex flex-col gap-3 relative">
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${isIncome ? 'bg-[#16A34A]' : isTransfer ? 'bg-[#4F46E5]' : 'bg-[#DC2626]'}`}></div>
                  <div className="flex justify-between items-start pl-2">
                    <div className="pr-2">
                      <p className="font-bold text-[#172033] leading-tight break-words">{t.note}</p>
                      <p className="text-[10px] text-[#64748B] mt-1 uppercase font-bold">{t.category} • {t.dateStr || new Date(t.timestamp).toLocaleDateString('id-ID')}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-black text-sm ${isIncome ? 'text-[#16A34A]' : isTransfer ? 'text-[#4F46E5]' : 'text-[#DC2626]'}`}>
                        {isIncome ? '+' : '-' } Rp {t.amount.toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pl-2 pt-2 border-t border-[#E2E8F0]">
                    <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-[#F7F8FA] text-[#475569] border border-[#E2E8F0] flex items-center gap-1">
                      <Wallet size={10}/> {isTransfer ? `${accName} → ${toAccName}` : accName}
                    </span>
                    {!showPreview && (
                      <button onClick={() => onDelete(t.id)} className="text-[#64748B] hover:text-[#DC2626] p-1"><Trash2 size={16}/></button>
                    )}
                  </div>
                </div>
              );
           })
        )}
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
           <div className="grid grid-cols-2 gap-2">
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
           <div className="grid grid-cols-2 gap-2">
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
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} (Rp{(accountBalances[a.id] || 0).toLocaleString('id-ID')})</option>)}
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
    injectPWA();

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

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    return transactions.filter(t => {
      const d = new Date(t.timestamp);
      if (reportPeriod === 'Semua Waktu') return true;
      if (reportPeriod === 'Hari Ini') return d.toDateString() === now.toDateString();
      if (reportPeriod === 'Minggu Ini') {
         const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
         return d >= firstDay;
      }
      if (reportPeriod === 'Bulan Ini') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (reportPeriod === 'Bulan Lalu') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
      }
      if (reportPeriod === 'Tahun Ini') return d.getFullYear() === now.getFullYear();
      if (reportPeriod === 'Custom') {
        if (!customDates.start || !customDates.end) return true;
        const start = new Date(customDates.start).setHours(0,0,0,0);
        const end = new Date(customDates.end).setHours(23,59,59,999);
        return t.timestamp >= start && t.timestamp <= end;
      }
      return true;
    });
  }, [transactions, reportPeriod, customDates]);

  const summary = useMemo(() => {
    let income = 0; let expense = 0; let savings = 0;
    const sourceTxs = activeTab === 'dashboard' 
      ? transactions.filter(t => new Date(t.timestamp).getMonth() === new Date().getMonth() && new Date(t.timestamp).getFullYear() === new Date().getFullYear()) 
      : filteredTransactions;
    
    sourceTxs.forEach(t => {
       if (t.type === 'income') income += t.amount;
       if (t.type === 'expense') expense += t.amount;
       if (t.type === 'transfer') {
          const targetAcc = accounts.find(a => a.id === t.toAccountId);
          if(targetAcc && targetAcc.type === 'Tabungan') savings += t.amount;
       }
    });
    return { income, expense, savings, netWorth };
  }, [transactions, filteredTransactions, activeTab, accounts, netWorth]);

  const expenseChartData = useMemo(() => {
    const source = activeTab === 'reports' ? filteredTransactions : transactions.filter(t => new Date(t.timestamp).getMonth() === new Date().getMonth());
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
      setTransactions([newTx, ...transactions]);
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
       setTransactions(transactions.filter(t => t.id !== id));
     }
  };

  const exportCSV = () => {
    const headers = [
      "ID Transaksi",
      "Tanggal",
      "Tipe",
      "Keterangan",
      "Kategori",
      "Akun Sumber",
      "Akun Tujuan",
      "Pemasukan (Rp)",
      "Pengeluaran (Rp)",
      "Saldo Bersih Setelah Transaksi (Rp)"
    ];

    // Ekspor dalam urutan kronologis agar saldo mudah dibaca.
    const sortedTransactions = [...filteredTransactions].sort((a, b) => a.timestamp - b.timestamp);

    // Hitung saldo bersih keseluruhan berdasarkan saldo awal seluruh akun.
    let runningBalance = accounts.reduce(
      (total, account) => total + (Number(account.initialBalance) || 0),
      0
    );

    const escapeCSV = (value) => {
      const text = String(value ?? '');
      return `"${text.replace(/"/g, '""')}"`;
    };

    const formatDate = (timestamp, dateStr) => {
      if (dateStr) return dateStr;
      return new Date(timestamp).toLocaleDateString('id-ID');
    };

    const rows = sortedTransactions.map(t => {
      const srcAcc = accounts.find(a => a.id === t.accountId)?.name || '-';
      const destAcc = accounts.find(a => a.id === t.toAccountId)?.name || '-';
      const income = t.type === 'income' ? Number(t.amount) || 0 : 0;
      const expense = (t.type === 'expense' || t.type === 'transfer') ? Number(t.amount) || 0 : 0;

      // Transfer hanya memindahkan uang antar akun, sehingga tidak mengubah saldo bersih.
      if (t.type === 'income') runningBalance += income;
      if (t.type === 'expense') runningBalance -= expense;

      return [
        escapeCSV(t.id),
        escapeCSV(formatDate(t.timestamp, t.dateStr)),
        escapeCSV(t.type.toUpperCase()),
        escapeCSV(t.note),
        escapeCSV(t.category),
        escapeCSV(srcAcc),
        escapeCSV(destAcc),
        income,
        expense,
        runningBalance
      ].join(',');
    });

    // BOM membantu Excel membaca UTF-8 dengan benar.
    const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Laporan_DompetKu_${reportPeriod.replace(/ /g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const executePrint = () => {
     window.focus();
     setTimeout(() => window.print(), 50);
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
                   <p className="text-[#DC2626] font-black text-sm">Rp {rec.amount.toLocaleString('id-ID')} <span className="text-[10px] text-[#64748B] font-bold uppercase ml-1">({rec.category})</span></p>
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
         <h2 className="text-3xl md:text-4xl font-black text-white relative z-10 mb-6 drop-shadow-md break-all">Rp {summary.netWorth.toLocaleString('id-ID')}</h2>
         <div className="grid grid-cols-2 gap-4 relative z-10 border-t border-[#0F172A] pt-5">
            <div>
               <p className="text-[#94A3B8] text-[10px] font-bold uppercase flex items-center gap-1"><TrendingUp size={12} className="text-[#16A34A]"/> Pemasukan Bulan Ini</p>
               <p className="text-[#16A34A] font-bold text-lg mt-1 break-all">Rp {summary.income.toLocaleString('id-ID')}</p>
            </div>
            <div>
               <p className="text-[#94A3B8] text-[10px] font-bold uppercase flex items-center gap-1"><TrendingDown size={12} className="text-[#DC2626]"/> Pengeluaran Bulan Ini</p>
               <p className="text-[#DC2626] font-bold text-lg mt-1 break-all">Rp {summary.expense.toLocaleString('id-ID')}</p>
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
                 <p className="font-black text-[#B8860B] truncate" title={`Rp ${(accountBalances[acc.id] || 0).toLocaleString('id-ID')}`}>
                   Rp {(accountBalances[acc.id] || 0).toLocaleString('id-ID')}
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
        <div className="flex gap-3 overflow-x-auto pb-3 px-1 hide-scrollbar">
          {/* TOMBOL PEMASUKAN */}
          <button onClick={() => setTxType('income')} className="relative flex-1 min-w-[110px] p-4 rounded-2xl font-black text-white text-sm flex flex-col md:flex-row items-center justify-center gap-2 bg-gradient-to-b from-[#22C55E] to-[#16A34A] border border-[#14532D] shadow-[0_6px_0_#14532D,0_10px_10px_rgba(22,163,74,0.4),inset_0_1px_2px_rgba(255,255,255,0.8)] active:translate-y-[6px] active:shadow-[0_0px_0_#14532D,0_0px_0px_rgba(22,163,74,0.4),inset_0_1px_2px_rgba(255,255,255,0.8)] transition-all overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/40 to-transparent pointer-events-none group-active:from-white/20"></div>
            <div className="bg-white/20 p-1.5 rounded-full drop-shadow-md"><ArrowDownRight size={18} strokeWidth={3} /></div>
            <span className="drop-shadow-md tracking-wide">Pemasukan</span>
          </button>

          {/* TOMBOL PENGELUARAN */}
          <button onClick={() => setTxType('expense')} className="relative flex-1 min-w-[110px] p-4 rounded-2xl font-black text-white text-sm flex flex-col md:flex-row items-center justify-center gap-2 bg-gradient-to-b from-[#EF4444] to-[#DC2626] border border-[#7F1D1D] shadow-[0_6px_0_#7F1D1D,0_10px_10px_rgba(220,38,38,0.4),inset_0_1px_2px_rgba(255,255,255,0.8)] active:translate-y-[6px] active:shadow-[0_0px_0_#7F1D1D,0_0px_0px_rgba(220,38,38,0.4),inset_0_1px_2px_rgba(255,255,255,0.8)] transition-all overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/40 to-transparent pointer-events-none group-active:from-white/20"></div>
            <div className="bg-white/20 p-1.5 rounded-full drop-shadow-md"><ArrowUpRight size={18} strokeWidth={3} /></div>
            <span className="drop-shadow-md tracking-wide">Pengeluaran</span>
          </button>

          {/* TOMBOL TRANSFER */}
          <button onClick={() => setTxType('transfer')} className="relative flex-1 min-w-[110px] p-4 rounded-2xl font-black text-white text-sm flex flex-col md:flex-row items-center justify-center gap-2 bg-gradient-to-b from-[#6366F1] to-[#4F46E5] border border-[#312E81] shadow-[0_6px_0_#312E81,0_10px_10px_rgba(79,70,229,0.4),inset_0_1px_2px_rgba(255,255,255,0.8)] active:translate-y-[6px] active:shadow-[0_0px_0_#312E81,0_0px_0px_rgba(79,70,229,0.4),inset_0_1px_2px_rgba(255,255,255,0.8)] transition-all overflow-hidden group">
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
               <Printer size={16}/> Print / Cetak
             </button>
             <button onClick={exportCSV} className="flex-1 md:flex-none justify-center px-4 py-2 bg-white border-2 border-[#D4A72C] text-[#B8860B] hover:bg-[#F7F8FA] rounded-xl font-bold text-sm shadow-sm flex items-center gap-2 transition active:scale-95">
               <Download size={16}/> Ekspor CSV
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
             <h2 className="text-xl font-black text-[#16A34A] break-words">Rp {summary.income.toLocaleString('id-ID')}</h2>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#E2E8F0]">
             <p className="text-[10px] text-[#64748B] font-bold uppercase mb-1">Pengeluaran ({reportPeriod})</p>
             <h2 className="text-xl font-black text-[#DC2626] break-words">Rp {summary.expense.toLocaleString('id-ID')}</h2>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#E2E8F0]">
             <p className="text-[10px] text-[#64748B] font-bold uppercase mb-1">Transfer/Nabung ({reportPeriod})</p>
             <h2 className="text-xl font-black text-[#4F46E5] break-words">Rp {summary.savings.toLocaleString('id-ID')}</h2>
          </div>
          <div className="bg-[#172033] p-4 rounded-2xl shadow-sm border border-[#0F172A]">
             <p className="text-[10px] text-[#D4A72C] font-bold uppercase mb-1">Total Kekayaan (Semua Waktu)</p>
             <h2 className="text-xl font-black text-white break-words">Rp {summary.netWorth.toLocaleString('id-ID')}</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#E2E8F0] flex flex-col justify-center">
              <h3 className="font-bold text-[#172033] mb-6 flex items-center gap-2"><BarChart3 size={18} className="text-[#D4A72C]"/> Pemasukan vs Pengeluaran</h3>
              <div className="space-y-6">
                <div>
                   <div className="flex justify-between text-xs font-bold mb-1">
                     <span className="text-[#64748B]">PEMASUKAN</span>
                     <span className="text-[#16A34A]">Rp {incomeTotal.toLocaleString('id-ID')}</span>
                   </div>
                   <div className="w-full bg-[#F7F8FA] border border-[#E2E8F0] rounded-full h-4"><div className="bg-[#16A34A] h-full rounded-full" style={{width:`${incPct}%`}}></div></div>
                </div>
                <div>
                   <div className="flex justify-between text-xs font-bold mb-1">
                     <span className="text-[#64748B]">PENGELUARAN</span>
                     <span className="text-[#DC2626]">Rp {expenseTotal.toLocaleString('id-ID')}</span>
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
                         <span className="font-black text-[#172033]">Rp {d.amount.toLocaleString('id-ID')} <span className="text-[#64748B] font-bold ml-1">({d.percentage.toFixed(1)}%)</span></span>
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
                         <span>Terpakai: Rp {b.used.toLocaleString('id-ID')}</span>
                         <span>Batas: Rp {b.limit.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="w-full bg-[#F7F8FA] border border-[#E2E8F0] rounded-full h-4 overflow-hidden ml-3 pr-3">
                        <div className={`${statusColor} h-full rounded-full transition-all duration-1000`} style={{ width: `${Math.min(b.percent, 100)}%` }}></div>
                      </div>
                    </div>
                    <div className="flex justify-between items-end mt-3 pl-3">
                        <p className="text-[10px] text-[#475569] font-bold uppercase">Sisa: Rp {Math.max(0, b.limit - b.used).toLocaleString('id-ID')}</p>
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
                       <span>Terkumpul: <span className="text-[#172033]">Rp {g.collectedAmount.toLocaleString('id-ID')}</span></span>
                       <span>Dari: <span className="text-[#172033]">Rp {g.targetAmount.toLocaleString('id-ID')}</span></span>
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
                    <p className="text-xs font-bold text-[#475569] uppercase mt-1">{r.type} • Rp {r.amount.toLocaleString('id-ID')} • {r.frequency}</p>
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
      const currentUserId = user?.id;
      const data = {
        appName: 'DompetKu', version: '1.0', exportedAt: new Date().toISOString(),
        user: currentUserId ? [user] : [],
        accounts: currentUserId ? await getScopedData('accounts', currentUserId) : [],
        transactions: currentUserId ? await getScopedData('transactions', currentUserId) : [],
        budgets: currentUserId ? await getScopedData('budgets', currentUserId) : [],
        goals: currentUserId ? await getScopedData('goals', currentUserId) : [],
        recurring: currentUserId ? await getScopedData('recurring', currentUserId) : [],
        settings: []
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `DompetKu_Backup_${new Date().toLocaleDateString('id-ID').replace(/\//g, '-')}.json`;
      a.click();
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
                 <span className="font-bold text-[#172033] flex items-center gap-3"><Save size={20} className="text-[#D4A72C]"/> Backup Data (JSON)</span>
                 <ArrowUpRight size={16} className="text-[#94A3B8]"/>
              </button>
              <label className="w-full p-4 flex justify-between items-center hover:bg-[#F7F8FA] transition cursor-pointer border border-transparent rounded-xl">
                 <span className="font-bold text-[#172033] flex items-center gap-3"><Upload size={20} className="text-[#D4A72C]"/> Restore Data (JSON)</span>
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
            <div className="inline-flex w-16 h-16 items-center justify-center rounded-2xl bg-[#D4A72C] shadow-xl mb-4">
              <Wallet size={34} className="text-[#172033]" />
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
    return (
      <div className="min-h-screen bg-[#F7F8FA] font-sans p-4 md:p-8 flex justify-center print:p-0 print:bg-white relative">
        <style dangerouslySetInnerHTML={{__html: `
          @media print {
              body { background: white !important; margin: 0 !important; padding: 0 !important; }
              .print-hidden { display: none !important; }
              .print-container { display: block !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 16px !important; box-shadow: none !important; border: none !important; }
              #dompetku-report table { display: table !important; width: 100% !important; table-layout: fixed !important; }
              #dompetku-report thead { display: table-header-group !important; }
              #dompetku-report tbody { display: table-row-group !important; }
              #dompetku-report tr { display: table-row !important; break-inside: avoid !important; page-break-inside: avoid !important; }
              #dompetku-report th, #dompetku-report td { display: table-cell !important; font-size: 9px !important; padding: 6px !important; vertical-align: top !important; word-break: break-word !important; }
              #dompetku-report th:nth-child(1), #dompetku-report td:nth-child(1) { width: 12% !important; }
              #dompetku-report th:nth-child(2), #dompetku-report td:nth-child(2) { width: 18% !important; }
              #dompetku-report th:nth-child(3), #dompetku-report td:nth-child(3) { width: 14% !important; }
              #dompetku-report th:nth-child(4), #dompetku-report td:nth-child(4) { width: 21% !important; }
              #dompetku-report th:nth-child(5), #dompetku-report td:nth-child(5) { width: 12% !important; }
              #dompetku-report th:nth-child(6), #dompetku-report td:nth-child(6) { width: 12% !important; }
              #dompetku-report th:nth-child(7), #dompetku-report td:nth-child(7) { width: 11% !important; }
              #dompetku-report .print-hidden { display: none !important; }
              @page { size: A4 portrait; margin: 10mm; }
          }
        `}} />
        <div className="fixed top-4 inset-x-0 mx-auto max-w-4xl flex justify-between items-center bg-[#172033] text-white p-4 rounded-2xl shadow-2xl z-50 print-hidden">
          <h2 className="font-bold flex items-center gap-2 text-[#D4A72C]"><Eye size={18}/> Preview Cetak</h2>
          <div className="flex gap-2">
            <button onClick={() => setShowPreview(false)} className="px-4 py-2 bg-transparent border border-white text-white hover:bg-white/10 rounded-lg font-bold text-sm transition">Tutup</button>
            <button type="button" onClick={executePrint} className="px-4 py-2 bg-[#D4A72C] hover:bg-[#F2C94C] text-[#172033] rounded-lg font-bold text-sm flex items-center gap-2 transition">
              <Printer size={16} /> Print / Cetak
            </button>
          </div>
        </div>

        <div id="dompetku-report" className="print-container bg-white max-w-4xl w-full shadow-lg mt-20 print:mt-0 print:shadow-none p-10 md:p-14 border border-[#E2E8F0] print:border-none">
          <div className="border-b-4 border-[#172033] pb-6 mb-8 flex justify-between items-end">
            <div className="flex items-center gap-4">
              <UserAvatar user={user} size={16} textClass="text-2xl" />
              <div>
                <h1 className="text-4xl font-black uppercase tracking-widest text-[#172033]">DOMPETKU</h1>
                <p className="text-[#475569] mt-1 font-bold text-lg tracking-widest">LAPORAN KEUANGAN PRIBADI</p>
              </div>
            </div>
            <div className="text-right text-sm text-[#475569] font-medium bg-[#F7F8FA] p-3 rounded-lg border border-[#E2E8F0] print:border-none print:bg-transparent">
              <p>Pemilik Akun: <span className="font-bold text-[#172033] uppercase">{user?.name}</span></p>
              <p>Periode: <span className="font-bold text-[#172033] uppercase">{reportPeriod}</span></p>
              <p>Tanggal Cetak: <span className="font-bold text-[#172033]">{new Date().toLocaleDateString('id-ID')}</span></p>
            </div>
          </div>

          <h3 className="font-black text-xl text-[#172033] mb-4 uppercase tracking-wider">Ringkasan Keuangan</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
             <div className="border border-[#CBD5E1] p-4 rounded-xl bg-[#F7F8FA]">
               <p className="text-[10px] font-bold uppercase text-[#64748B] mb-1">Pemasukan</p>
               <h2 className="text-xl font-black text-[#16A34A]">Rp {summary.income.toLocaleString('id-ID')}</h2>
             </div>
             <div className="border border-[#CBD5E1] p-4 rounded-xl bg-[#F7F8FA]">
               <p className="text-[10px] font-bold uppercase text-[#64748B] mb-1">Pengeluaran</p>
               <h2 className="text-xl font-black text-[#DC2626]">Rp {summary.expense.toLocaleString('id-ID')}</h2>
             </div>
             <div className="border border-[#CBD5E1] p-4 rounded-xl bg-[#F7F8FA]">
               <p className="text-[10px] font-bold uppercase text-[#64748B] mb-1">Total Tabungan</p>
               <h2 className="text-xl font-black text-[#4F46E5]">Rp {summary.savings.toLocaleString('id-ID')}</h2>
             </div>
             <div className="border-2 border-[#172033] p-4 rounded-xl bg-[#172033] text-white print:border-4 print:border-[#172033] print:bg-white print:text-[#172033]">
               <p className="text-[10px] font-bold uppercase text-[#D4A72C] print:text-[#64748B] mb-1">Kekayaan Bersih (Total)</p>
               <h2 className="text-xl font-black">Rp {summary.netWorth.toLocaleString('id-ID')}</h2>
             </div>
          </div>

          <h3 className="font-black text-xl text-[#172033] mb-4 uppercase tracking-wider">Buku Besar Transaksi</h3>
          <div className="mb-8 border-2 border-[#172033] rounded-xl overflow-hidden">
             <div className="bg-[#172033] text-white p-3 print:bg-[#F7F8FA] print:text-[#172033] print:border-b-2 print:border-[#172033]">
                <h3 className="font-bold uppercase tracking-widest text-sm text-center">Rincian Transaksi ({reportPeriod})</h3>
             </div>
             <LedgerTableComponent data={filteredTransactions} accounts={accounts} showPreview={true} onDelete={()=>{}} />
          </div>

          <div className="mt-16 text-center text-xs text-[#64748B] font-bold border-t-2 border-[#E2E8F0] pt-6">
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
           <h1 className="text-2xl font-black text-white flex items-center gap-2"><Wallet className="text-[#D4A72C]"/> DompetKu</h1>
           <p className="text-[10px] uppercase tracking-widest text-[#D4A72C] font-bold mt-1">Catat. Kendalikan. Rencanakan.</p>
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
        <h1 className="text-lg font-black text-white flex items-center gap-2"><Wallet size={18} className="text-[#D4A72C]"/> DompetKu</h1>
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
