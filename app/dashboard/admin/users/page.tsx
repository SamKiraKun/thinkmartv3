'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  adjustAdminUserWallet,
  fetchAdminUsers,
  updateAdminPartnerConfig,
  updateAdminUserRole,
  updateAdminUserStatus,
} from '@/services/adminService';
import {
  Search, User, Ban, Shield, Users, X, MapPin, Percent,
  Loader2, RefreshCw, Settings, Crown, ChevronDown, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface UserData {
  id: string;
  name: string;
  email: string;
  phone?: string;
  city?: string;
  role: 'user' | 'admin' | 'partner' | 'vendor' | 'organization' | 'sub_admin';
  membershipActive: boolean;
  isBanned?: boolean;
  partnerConfig?: {
    assignedCity: string;
    commissionPercentage: number;
    assignedAt?: any;
    assignedBy?: string;
  };
}

interface UsersPageCursor {
  page: number;
}

export default function AdminUsersPage() {
  const { user: adminUser } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<UsersPageCursor | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [cityFilter, setCityFilter] = useState('');
  const [kycFilter, setKycFilter] = useState('');

  // Edit Modal State
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [editRole, setEditRole] = useState<'user' | 'admin' | 'partner' | 'vendor' | 'organization' | 'sub_admin'>('user');
  const [editCity, setEditCity] = useState('');
  const [editPercentage, setEditPercentage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Ban/Unban Modal State
  const [banModalUser, setBanModalUser] = useState<UserData | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banSubmitting, setBanSubmitting] = useState(false);

  // Wallet Modal State
  const [walletModal, setWalletModal] = useState(false);
  const [walletForm, setWalletForm] = useState({
    amount: 0,
    currency: 'CASH' as 'CASH' | 'COIN',
    reason: '',
    referenceId: ''
  });
  const [adjusting, setAdjusting] = useState(false);
  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const fetchUsers = useCallback(async (reset = false, nextCursor: UsersPageCursor | null = null) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const page = reset ? 1 : (nextCursor?.page || 1);
      const result = await fetchAdminUsers(page, 30, {
        search: searchTerm.trim() || undefined,
        role: roleFilter || undefined,
        city: cityFilter || undefined,
        kycStatus: kycFilter || undefined,
      });
      const nextUsers = (result.data || []).map((u: any) => ({
        id: u.id || u.uid,
        name: u.name,
        email: u.email,
        phone: u.phone || undefined,
        city: u.city || undefined,
        role: u.role,
        membershipActive: Boolean(u.membershipActive),
        isBanned: Boolean(u.isBanned),
        partnerConfig: u.partnerConfig || undefined,
      })) as UserData[];
      setUsers((prev) => (reset ? nextUsers : [...prev, ...nextUsers]));
      setCursor(result.pagination?.hasNext ? { page: page + 1 } : null);
      setHasMore(Boolean(result.pagination?.hasNext));
    } catch (err) {
      console.error(err);
      setNotice({ type: 'error', text: getErrorMessage(err, 'Failed to load users') });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [cityFilter, kycFilter, roleFilter, searchTerm]);

  useEffect(() => {
    fetchUsers(true, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter, cityFilter, kycFilter]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetchUsers(true, null);
  };

  const openBanModal = (targetUser: UserData) => {
    setBanModalUser(targetUser);
    setBanReason('');
  };

  const handleToggleBan = async () => {
    if (!banModalUser) return;

    const currentlyBanned = !!banModalUser.isBanned;
    const reason = banReason.trim();

    if (!currentlyBanned && !reason) {
      setNotice({ type: 'error', text: 'Ban reason is required.' });
      return;
    }

    setBanSubmitting(true);
    try {
      await updateAdminUserStatus(
        banModalUser.id,
        currentlyBanned ? 'active' : 'banned',
        currentlyBanned ? undefined : reason
      );

      setUsers(users.map(u => u.id === banModalUser.id ? { ...u, isBanned: !currentlyBanned } : u));
      setNotice({
        type: 'success',
        text: currentlyBanned ? 'User unbanned successfully.' : 'User banned successfully.'
      });
      setBanModalUser(null);
      setBanReason('');
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err, 'Action failed') });
    } finally {
      setBanSubmitting(false);
    }
  };

  const openEditModal = (user: UserData) => {
    setSelectedUser(user);
    setEditRole(user.role);
    setEditCity(user.partnerConfig?.assignedCity || user.city || '');
    setEditPercentage(user.partnerConfig?.commissionPercentage || 0);
    setWalletModal(false);
  };

  const openWalletModal = (user: UserData) => {
    setSelectedUser(user);
    setWalletForm({ amount: 0, currency: 'CASH', reason: '', referenceId: '' });
    setWalletModal(true);
  };

  const handleWalletAdjustment = async () => {
    if (!selectedUser) return;
    if (walletForm.amount === 0) {
      setNotice({ type: 'error', text: 'Amount cannot be zero.' });
      return;
    }
    if (!walletForm.reason.trim()) {
      setNotice({ type: 'error', text: 'Reason is required.' });
      return;
    }

    setAdjusting(true);
    try {
      await adjustAdminUserWallet(selectedUser.id, {
        deltaAmount: walletForm.amount,
        currency: walletForm.currency,
        reason: walletForm.reason,
        referenceId: walletForm.referenceId,
        requestId: `adjust_${selectedUser.id}_${Date.now()}`
      });
      setNotice({ type: 'success', text: 'Wallet adjusted successfully.' });
      setWalletModal(false);
      // Ideally refresh user data here or just close
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err, 'Adjustment failed') });
    } finally {
      setAdjusting(false);
    }
  };

  const saveUserConfig = async () => {
    if (!selectedUser) return;

    // Validate partner config
    if (editRole === 'partner') {
      if (!editCity.trim()) {
        setNotice({ type: 'error', text: 'City is required for partners.' });
        return;
      }
      if (editPercentage < 1 || editPercentage > 20) {
        setNotice({ type: 'error', text: 'Commission must be between 1% and 20%.' });
        return;
      }

      // Check city allocation doesn't exceed 20%
      const cityPartners = users.filter(u =>
        u.id !== selectedUser.id &&
        u.role === 'partner' &&
        u.partnerConfig?.assignedCity === editCity.trim()
      );
      const currentCityTotal = cityPartners.reduce(
        (sum, p) => sum + (p.partnerConfig?.commissionPercentage || 0), 0
      );
      if (currentCityTotal + editPercentage > 20) {
        setNotice({ type: 'error', text: `Cannot assign ${editPercentage}% - city already has ${currentCityTotal}% allocated (max 20%).` });
        return;
      }
    }

    setSaving(true);
    try {
      await updateAdminUserRole(selectedUser.id, editRole);

      if (editRole === 'partner') {
        await updateAdminPartnerConfig(selectedUser.id, {
          assignedCity: editCity.trim(),
          commissionPercentage: editPercentage,
        });
      }

      // Update local state
      setUsers(users.map(u => u.id === selectedUser.id ? {
        ...u,
        role: editRole,
        partnerConfig: editRole === 'partner' ? {
          assignedCity: editCity.trim(),
          commissionPercentage: editPercentage
        } : undefined
      } : u));

      setSelectedUser(null);
      setNotice({ type: 'success', text: 'User updated successfully.' });
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err, 'Update failed') });
    } finally {
      setSaving(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">Admin</span>;
      case 'partner':
        return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">Partner</span>;
      default:
        return <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">User</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="text-indigo-600" /> User Management
          </h1>
          <p className="text-gray-500 text-sm mt-1">Manage users, roles, and partner assignments</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchUsers(true, null)}
            disabled={loading}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition flex items-center gap-2"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`p-4 rounded-lg border flex items-center justify-between gap-3 ${notice.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
            }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span className="text-sm font-medium">{notice.text}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="p-1 rounded hover:bg-black/5"
            aria-label="Dismiss notice"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filters Row */}
      <div className="flex flex-wrap gap-4 items-center">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Search by email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 w-64"
            />
          </div>
          <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition">
            Search
          </button>
        </form>

        {/* Role Filter */}
        <div className="relative">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="appearance-none pl-4 pr-8 py-2.5 border rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">All Roles</option>
            <option value="user">Users</option>
            <option value="partner">Partners</option>
            <option value="admin">Admins</option>
          </select>
          <ChevronDown size={16} className="absolute right-2 top-3 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Partner Info</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center">
                    <Loader2 className="animate-spin mx-auto text-gray-400" size={32} />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-gray-400">No users found.</td>
                </tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} className={`hover:bg-gray-50 transition ${user.isBanned ? 'bg-red-50' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${user.role === 'admin' ? 'bg-purple-500' :
                          user.role === 'partner' ? 'bg-blue-500' : 'bg-gray-400'
                          }`}>
                          {user.name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{user.name}</p>
                          <p className="text-xs text-gray-500">{user.email}</p>
                          {user.city && <p className="text-xs text-gray-400">{user.city}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getRoleBadge(user.role)}
                    </td>
                    <td className="px-6 py-4">
                      {user.role === 'partner' && user.partnerConfig ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-sm">
                            <MapPin size={12} className="text-blue-500" />
                            <span className="font-medium">{user.partnerConfig.assignedCity}</span>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-green-600">
                            <Percent size={12} />
                            <span>{user.partnerConfig.commissionPercentage}% commission</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {user.membershipActive && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                            <Crown size={10} /> Premium
                          </span>
                        )}
                        {user.isBanned && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                            Banned
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openWalletModal(user)}
                          className="p-1.5 rounded hover:bg-emerald-100 text-emerald-600"
                          title="Adjust Wallet"
                        >
                          <div className="w-4 h-4 text-center font-bold">₹</div>
                        </button>
                        <button
                          onClick={() => openEditModal(user)}
                          className="p-1.5 rounded hover:bg-indigo-100 text-indigo-600"
                          title="Configure User"
                        >
                          <Settings size={16} />
                        </button>
                        <button
                          onClick={() => openBanModal(user)}
                          className={`p-1.5 rounded hover:bg-gray-100 ${user.isBanned ? 'text-green-600' : 'text-red-600'}`}
                          title={user.isBanned ? "Unban User" : "Ban User"}
                        >
                          {user.isBanned ? <Shield size={16} /> : <Ban size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => fetchUsers(false, cursor)}
            disabled={loadingMore}
            className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm font-medium text-gray-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loadingMore && <Loader2 className="animate-spin" size={16} />}
            Load More
          </button>
        </div>
      )}

      {/* Ban / Unban Modal */}
      {banModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !banSubmitting && setBanModalUser(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {banModalUser.isBanned ? 'Unban User' : 'Ban User'}
              </h2>
              <button
                onClick={() => setBanModalUser(null)}
                disabled={banSubmitting}
                className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                {banModalUser.isBanned
                  ? `This will restore access for ${banModalUser.name}.`
                  : `This will block ${banModalUser.name} from accessing the platform.`}
              </p>
              {!banModalUser.isBanned && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ban Reason *</label>
                  <textarea
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    rows={3}
                    placeholder="Provide a reason for ban..."
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                  />
                </div>
              )}
              <button
                onClick={handleToggleBan}
                disabled={banSubmitting || (!banModalUser.isBanned && !banReason.trim())}
                className={`w-full py-3 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50 ${banModalUser.isBanned ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
              >
                {banSubmitting ? <Loader2 className="animate-spin" size={18} /> : null}
                {banModalUser.isBanned ? 'Confirm Unban' : 'Confirm Ban'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {selectedUser && !walletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedUser(null)} />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
            {/* Modal Header */}
            <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Configure User</h2>
                <p className="text-sm text-gray-500">{selectedUser.name}</p>
              </div>
              <button onClick={() => setSelectedUser(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Role Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">User Role</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['user', 'partner', 'admin'] as const).map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setEditRole(role)}
                      className={`p-3 rounded-lg border font-medium text-sm transition capitalize ${editRole === role
                        ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                        : 'hover:bg-gray-50 text-gray-600'
                        }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              {/* Partner Configuration */}
              {editRole === 'partner' && (
                <div className="bg-blue-50 rounded-xl p-4 space-y-4 border border-blue-100">
                  <h3 className="font-medium text-blue-900 flex items-center gap-2">
                    <MapPin size={16} /> Partner Configuration
                  </h3>

                  {/* City */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assigned City *</label>
                    <input
                      type="text"
                      value={editCity}
                      onChange={(e) => setEditCity(e.target.value)}
                      placeholder="Enter city name..."
                      className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  {/* Commission Percentage */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Commission Percentage * (1-20%)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="1"
                        max="20"
                        value={editPercentage}
                        onChange={(e) => setEditPercentage(parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <div className="flex items-center gap-1 w-20">
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={editPercentage}
                          onChange={(e) => setEditPercentage(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
                          className="w-14 p-2 border rounded text-center font-mono"
                        />
                        <Percent size={14} className="text-gray-400" />
                      </div>
                    </div>
                    <p className="text-xs text-blue-600 mt-1">
                      This is the partner&apos;s share of the 20% commission pool.
                    </p>
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600">
                {editRole === 'user' && "Standard user with access to tasks, shop, and withdrawals."}
                {editRole === 'partner' && "Partner earns commission from city transactions. Max 20% total per city."}
                {editRole === 'admin' && "Full admin access to manage users, products, orders, and withdrawals."}
              </div>

              {/* Save Button */}
              <button
                onClick={saveUserConfig}
                disabled={saving}
                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <><Loader2 className="animate-spin" size={18} /> Saving...</>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Adjustment Modal */}
      {walletModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setWalletModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="bg-emerald-600 px-6 py-4 flex justify-between items-center text-white">
              <div>
                <h2 className="text-xl font-bold">Adjust Wallet</h2>
                <p className="text-emerald-100 text-sm">For {selectedUser.name}</p>
              </div>
              <button onClick={() => setWalletModal(false)} className="p-2 hover:bg-emerald-700 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-emerald-50 text-emerald-800 rounded-lg text-sm border border-emerald-100 flex gap-2">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="font-bold">Admin Action Logged</p>
                  <p>This action creates an immutable ledger entry and is visible in the audit logs.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <div className="flex rounded-lg border overflow-hidden">
                    {['CASH', 'COIN'].map(curr => (
                      <button
                        key={curr}
                        onClick={() => setWalletForm({ ...walletForm, currency: curr as 'CASH' | 'COIN' })}
                        className={`flex-1 py-2 text-sm font-medium transition ${walletForm.currency === curr ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                          }`}
                      >
                        {curr}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (+/-)</label>
                  <input
                    type="number"
                    value={walletForm.amount}
                    onChange={(e) => setWalletForm({ ...walletForm, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (Required)</label>
                <textarea
                  value={walletForm.reason}
                  onChange={(e) => setWalletForm({ ...walletForm, reason: e.target.value })}
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  rows={2}
                  placeholder="e.g. Refund for cancelled order #1234..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference ID (Optional)</label>
                <input
                  type="text"
                  value={walletForm.referenceId}
                  onChange={(e) => setWalletForm({ ...walletForm, referenceId: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="e.g. TXN-998877"
                />
              </div>

              <button
                onClick={handleWalletAdjustment}
                disabled={adjusting || walletForm.amount === 0 || !walletForm.reason}
                className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
              >
                {adjusting ? <Loader2 className="animate-spin" /> : 'Confirm Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
