// File: ThinkMart/app/dashboard/user/settings/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { updateProfile as updateFirebaseAuthProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { uploadFile } from '@/lib/firebase/storage';
import { apiClient } from '@/lib/api/client';
import { shouldUseApiWrite } from '@/lib/featureFlags';
import { updateProfile as updateProfileApi, updateUserProfile } from '@/services/userService';
import {
  Loader2,
  User,
  Lock,
  CreditCard,
  Save,
  Camera,
  MapPin,
  Hash,
  ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/Button'; // Assuming you have this component

async function uploadProfilePhoto(file: File, userId: string): Promise<string> {
  if (shouldUseApiWrite('users')) {
    const contentType = file.type || 'application/octet-stream';
    const presign = await apiClient.post<any>('/api/storage/presign', {
      filename: file.name,
      contentType,
      folder: `profiles/${userId}`,
    });
    const payload = presign.data?.data || presign.data || presign;
    const uploadRes = await fetch(payload.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': contentType },
    });
    if (!uploadRes.ok) throw new Error('Failed to upload profile image');
    const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_DOMAIN || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://pub-mock-thinkmart.r2.dev').replace(/\/+$/, '');
    return `${base}/${payload.key}`;
  }

  const path = `users/${userId}/profile_${Date.now()}`;
  return uploadFile(path, file);
}

export default function SettingsPage() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'payment'>('profile');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Profile State
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Security State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Payment State
  const [upiId, setUpiId] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [ifsc, setIfsc] = useState('');

  // Initialize state from 'profile' (Real-time data from useAuth)
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.name || '');
      setPhone(profile.phone || '');
      setPhotoPreview(profile.photoURL || null);

      // Payment methods might be nested in the profile doc
      // Note: We cast to 'any' here because paymentMethods isn't strictly typed in UserProfile yet
      const paymentData = (profile as any).paymentMethods || {};
      setUpiId(paymentData.upi || '');
      setAccountNo(paymentData.bank?.accountNo || '');
      setIfsc(paymentData.bank?.ifsc || '');
    }
  }, [profile]);

  const getErrorMessage = (error: unknown, fallback: string) => {
    return error instanceof Error ? error.message : fallback;
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !user) return;
    setLoading(true);
    setMessage(null);

    try {
      let photoURL = auth.currentUser.photoURL;

      if (photoFile) {
        photoURL = await uploadProfilePhoto(photoFile, user.uid);
      }

      // Update Auth Profile
      await updateFirebaseAuthProfile(auth.currentUser, {
        displayName,
        photoURL
      });

      // Update Turso-backed profile
      await updateProfileApi({
        name: displayName,
        phone,
        photoURL: photoURL || undefined
      });

      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (error: unknown) {
      console.error(error);
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to update profile') });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !auth.currentUser.email) return;

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: "New passwords don't match" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // Re-authenticate first
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);

      await updatePassword(auth.currentUser, newPassword);

      setMessage({ type: 'success', text: 'Password changed successfully!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: unknown) {
      console.error(error);
      setMessage({ type: 'error', text: 'Incorrect current password or weak new password.' });
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setMessage(null);

    try {
      await updateUserProfile(user.uid, {
        paymentMethods: {
          upi: upiId || null,
          bank: {
            accountNo: accountNo || null,
            ifsc: ifsc || null
          }
        }
      });
      setMessage({ type: 'success', text: 'Payment details saved!' });
    } catch (error: unknown) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to save payment details') });
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPhotoFile(e.target.files[0]);
      setPhotoPreview(URL.createObjectURL(e.target.files[0]));
    }
  };

  if (!profile) return <div className="p-8 text-center text-gray-500"><Loader2 className="animate-spin inline mr-2" /> Loading settings...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Account Settings</h1>
        <p className="text-gray-500">Manage your profile and preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white rounded-t-xl overflow-hidden shadow-sm">
        <button
          onClick={() => { setActiveTab('profile'); setMessage(null); }}
          className={`flex-1 py-4 text-sm font-medium flex items-center justify-center gap-2 transition ${activeTab === 'profile' ? 'bg-indigo-50 text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
        >
          <User size={18} /> Profile
        </button>
        <button
          onClick={() => { setActiveTab('security'); setMessage(null); }}
          className={`flex-1 py-4 text-sm font-medium flex items-center justify-center gap-2 transition ${activeTab === 'security' ? 'bg-indigo-50 text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
        >
          <Lock size={18} /> Security
        </button>
        <button
          onClick={() => { setActiveTab('payment'); setMessage(null); }}
          className={`flex-1 py-4 text-sm font-medium flex items-center justify-center gap-2 transition ${activeTab === 'payment' ? 'bg-indigo-50 text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
        >
          <CreditCard size={18} /> Payment Methods
        </button>
      </div>

      <div className="bg-white p-8 rounded-b-xl shadow-sm border border-t-0 border-gray-200">

        {message && (
          <div className={`p-4 mb-6 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message.text}
          </div>
        )}

        {/* --- PROFILE TAB --- */}
        {activeTab === 'profile' && (
          <div className="space-y-8">
            {/* 1. Platform Details (Read-Only) */}
            <div className="bg-indigo-50/50 p-6 rounded-xl border border-indigo-100">
              <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wider mb-4">Platform Details</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">My Referral Code</label>
                  <div className="mt-1 relative">
                    <Hash className="absolute left-3 top-3 text-indigo-400" size={16} />
                    <input
                      value={profile.ownReferralCode || 'Generating...'}
                      disabled
                      className="w-full pl-9 pr-3 py-2.5 bg-white border border-indigo-200 rounded-lg text-indigo-700 font-bold font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Region (Locked)</label>
                  <div className="mt-1 relative">
                    <MapPin className="absolute left-3 top-3 text-gray-400" size={16} />
                    <input
                      value={`${profile.city || ''}, ${profile.state || ''}`}
                      disabled
                      className="w-full pl-9 pr-3 py-2.5 bg-gray-100 border border-gray-200 rounded-lg text-gray-600"
                    />
                  </div>
                </div>
              </div>

              {/* Membership Status Badge */}
              <div className="mt-6 flex items-center justify-between bg-white p-4 rounded-lg border border-indigo-100">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${profile.membershipActive ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      {profile.membershipActive ? 'Premium Membership Active' : 'Standard Free Membership'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {profile.membershipActive ? 'You are earning from 6 levels.' : 'Upgrade to unlock team income.'}
                    </p>
                  </div>
                </div>
                {!profile.membershipActive && (
                  <Button href="/dashboard/user/upgrade" size="sm" variant="primary">Upgrade Now</Button>
                )}
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* 2. Personal Details Form */}
            <form onSubmit={handleProfileUpdate} className="space-y-6">
              <div className="flex flex-col items-center">
                <div className="relative group cursor-pointer">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-lg bg-gray-100">
                    {photoPreview ? (
                      <Image
                        src={photoPreview}
                        alt="Profile"
                        width={96}
                        height={96}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <User size={40} />
                      </div>
                    )}
                  </div>
                  <label htmlFor="photo-upload" className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition rounded-full">
                    <Camera size={24} />
                  </label>
                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">Click to change photo</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="w-full p-3 border rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <Save size={18} />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        )}

        {/* --- SECURITY TAB --- */}
        {activeTab === 'security' && (
          <form onSubmit={handlePasswordUpdate} className="space-y-6 max-w-md mx-auto">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Lock size={18} />}
              Update Password
            </button>
          </form>
        )}

        {/* --- PAYMENT TAB --- */}
        {activeTab === 'payment' && (
          <form onSubmit={handlePaymentUpdate} className="space-y-6 max-w-2xl mx-auto">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> These details will be auto-filled when you request a withdrawal. Ensure they are correct to prevent payout delays.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">UPI Details</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default UPI ID</label>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="username@oksbi"
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none"
                />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Bank Details</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                  <input
                    type="text"
                    value={accountNo}
                    onChange={(e) => setAccountNo(e.target.value)}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IFSC Code</label>
                  <input
                    type="text"
                    value={ifsc}
                    onChange={(e) => setIfsc(e.target.value)}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" /> : <Save size={18} />}
                Save Payment Methods
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
