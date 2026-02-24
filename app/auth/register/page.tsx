'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FirebaseError } from 'firebase/app';
import {
  updateProfile
} from 'firebase/auth';
import { isFirebaseConfigValid } from '@/lib/firebase/config';
import { registerWithEmail } from '@/lib/firebase/auth';
import { registerUserProfile } from '@/services/userService';
import { setDashboardSessionCookie } from '@/lib/auth/sessionCookie';
import { usePublicSettings } from '@/hooks/usePublicSettings';
import { Loader2, Eye, EyeOff, User, Mail, Phone, MapPin, Lock, Gift, ShoppingBag, ArrowRight, Building2, GraduationCap, Store } from 'lucide-react';
import { statesAndCities } from '@/lib/indianLocations';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const router = useRouter();
  const { settings: publicSettings } = usePublicSettings();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    accountType: 'user' as 'user' | 'organization' | 'vendor',
    fullName: '',
    email: '',
    phone: '',
    state: '',
    city: '',
    password: '',
    confirmPassword: '',
    referralCode: '',
    agreeToTerms: false,
    // Organization-specific fields
    orgName: '',
    orgType: '' as '' | 'school' | 'college' | 'ngo' | 'company' | 'other',
    orgRegistrationNumber: '',
    // Vendor-specific fields
    businessName: '',
    businessCategory: '' as '' | 'electronics' | 'fashion' | 'home' | 'food' | 'health' | 'other',
    gstNumber: '',
    businessAddress: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' && e.target instanceof HTMLInputElement
      ? e.target.checked
      : false;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const validateForm = () => {
    if (!formData.fullName || !formData.email || !formData.password) {
      setError("Please fill in all required fields.");
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return false;
    }
    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return false;
    }
    if (formData.phone.length < 10) {
      setError("Please enter a valid 10-digit phone number.");
      return false;
    }
    if (!formData.agreeToTerms) {
      setError("You must agree to the Terms & Conditions.");
      return false;
    }
    // Organization validation
    if (formData.accountType === 'organization') {
      if (!formData.orgName.trim()) {
        setError("Organization name is required.");
        return false;
      }
      if (!formData.orgType) {
        setError("Please select organization type.");
        return false;
      }
    }
    // Vendor validation
    if (formData.accountType === 'vendor') {
      if (!formData.businessName.trim()) {
        setError("Business name is required.");
        return false;
      }
      if (!formData.businessCategory) {
        setError("Please select a business category.");
        return false;
      }
    }
    return true;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (publicSettings?.signupsEnabled === false) {
      setError('New registrations are temporarily disabled. Please try again later.');
      return;
    }

    if (!validateForm()) return;
    if (!isFirebaseConfigValid) {
      setError("Authentication is temporarily unavailable. Please contact support.");
      if (process.env.NODE_ENV !== "production") {
        console.error("Firebase public config is missing required values.");
      }
      return;
    }

    setLoading(true);

    try {
      // 1. Create Auth User
      const userCredential = await registerWithEmail(formData.email.trim(), formData.password);
      const user = userCredential.user;

      // 2. Update Auth Profile
      await updateProfile(user, { displayName: formData.fullName });

      // 3. Generate Own Referral Code
      const namePart = formData.fullName.replace(/[^a-zA-Z]/g, "").substring(0, 3).toUpperCase();
      const randomPart = Math.random().toString(36).substring(2, 5).toUpperCase();
      const ownReferralCode = `${namePart}${randomPart}`;

      // 4. Create User Profile (HYBRID: routes via feature flag)
      // When tm_users_write_api is OFF → Firestore setDoc (legacy)
      // When tm_users_write_api is ON  → POST /api/users/register
      const isOrg = formData.accountType === 'organization';
      const isVendor = formData.accountType === 'vendor';

      let role = 'user';
      if (isOrg) role = 'organization';
      if (isVendor) role = 'vendor';

      await registerUserProfile(user.uid, {
        name: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        state: formData.state,
        city: formData.city,
        referralCode: formData.referralCode || undefined,
        role,
        ownReferralCode,
        ...(isOrg && {
          orgConfig: {
            orgName: formData.orgName.trim(),
            orgType: formData.orgType,
            registrationNumber: formData.orgRegistrationNumber || null,
            verified: false,
            memberCount: 0,
            totalEarnings: 0,
          }
        }),
        ...(isVendor && {
          vendorConfig: {
            businessName: formData.businessName.trim(),
            businessCategory: formData.businessCategory,
            gstNumber: formData.gstNumber || null,
            businessAddress: formData.businessAddress || null,
            vendorId: user.uid,
            verified: false,
            productCount: 0,
            totalSales: 0,
          }
        }),
      });

      // 5. Redirect
      toast.success('Account created successfully!');
      setDashboardSessionCookie();
      const redirectPath = isOrg ? '/dashboard/organization' : isVendor ? '/dashboard/vendor' : '/dashboard/user';
      router.push(redirectPath);

    } catch (err) {
      const firebaseError = err as FirebaseError;
      console.error(firebaseError);

      if (firebaseError.code === 'auth/email-already-in-use') {
        setError("This email is already registered.");
      } else if (firebaseError.code === 'auth/invalid-email') {
        setError("Please enter a valid email address.");
      } else if (firebaseError.code === 'auth/weak-password') {
        setError("Password is too weak. Use at least 6 characters.");
      } else if (firebaseError.code === 'auth/network-request-failed') {
        setError("Network issue detected. Please try again.");
      } else {
        setError(firebaseError.message || "Failed to register. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#2b2f7a] relative flex items-center justify-center p-4 overflow-hidden selection:bg-indigo-500/30 selection:text-white">

      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-4xl relative z-10 grid md:grid-cols-5 gap-0 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">

        {/* Brand Side (Left) */}
        <div className="md:col-span-2 bg-indigo-600/90 p-8 flex flex-col justify-between relative overflow-hidden text-white">
          {/* Pattern */}
          <div className="absolute inset-0 opacity-20">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <circle cx="0" cy="100" r="50" fill="none" stroke="currentColor" strokeWidth="1" />
              <circle cx="100" cy="0" r="30" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          </div>

          <div className="relative z-10">
            <Link href="/" className="inline-flex items-center gap-2 mb-8">
              <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <span className="text-xl font-bold">ThinkMart</span>
            </Link>
            <h2 className="text-3xl font-bold mb-4">Join the<br />Revolution</h2>
            <p className="text-indigo-100/80">Experience the future of e-commerce with ThinkMart.</p>
          </div>

          <div className="relative z-10 space-y-4 text-sm text-indigo-100/80">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <Gift size={14} />
              </div>
              <span>Exclusive Rewards</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <User size={14} />
              </div>
              <span>Community Growth</span>
            </div>
          </div>
        </div>

        {/* Form Side (Right) */}
        <div className="md:col-span-3 p-8 bg-black/20 overflow-y-auto max-h-[85vh] custom-scrollbar">
          <h2 className="text-2xl font-bold text-white mb-6">Create Account</h2>

          {publicSettings?.maintenanceMode && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 text-amber-100 text-sm rounded-xl">
              Platform is in maintenance mode. Some features may be temporarily unavailable.
            </div>
          )}

          {publicSettings?.signupsEnabled === false && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 text-amber-100 text-sm rounded-xl">
              New registrations are currently disabled by the platform team.
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-200 text-sm rounded-xl flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              {error}
            </div>
          )}

          {/* Account Type Selector */}
          <div className="mb-6">
            <label className="text-xs font-medium text-white/60 ml-1 mb-2 block">Account Type</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, accountType: 'user' }))}
                className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${formData.accountType === 'user'
                  ? 'bg-indigo-500/20 border-indigo-400 text-white'
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
              >
                <User size={24} />
                <span className="text-sm font-medium">Individual</span>
                <span className="text-[10px] opacity-60">Personal</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, accountType: 'vendor' }))}
                className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${formData.accountType === 'vendor'
                  ? 'bg-emerald-500/20 border-emerald-400 text-white'
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
              >
                <Store size={24} />
                <span className="text-sm font-medium">Vendor</span>
                <span className="text-[10px] opacity-60">Sell Products</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, accountType: 'organization' }))}
                className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${formData.accountType === 'organization'
                  ? 'bg-purple-500/20 border-purple-400 text-white'
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
              >
                <Building2 size={24} />
                <span className="text-sm font-medium">Organization</span>
                <span className="text-[10px] opacity-60">School, NGO</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            {/* Full Name / Contact Person */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/60 ml-1">
                {formData.accountType === 'organization' ? 'Contact Person Name' : formData.accountType === 'vendor' ? 'Owner/Manager Name' : 'Full Name'}
              </label>
              <div className="relative group">
                <User className="absolute left-3 top-3 text-white/40 group-focus-within:text-white transition-colors" size={16} />
                <input
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none text-white placeholder-white/20 text-sm transition-all hover:bg-white/10"
                  placeholder={formData.accountType === 'organization' ? 'Admin/Contact Person' : formData.accountType === 'vendor' ? 'Business Owner Name' : 'John Doe'}
                />
              </div>
            </div>

            {/* Organization-specific fields */}
            {formData.accountType === 'organization' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/60 ml-1">Organization Name *</label>
                  <div className="relative group">
                    <Building2 className="absolute left-3 top-3 text-white/40 group-focus-within:text-white transition-colors" size={16} />
                    <input
                      name="orgName"
                      value={formData.orgName}
                      onChange={handleChange}
                      className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none text-white placeholder-white/20 text-sm transition-all hover:bg-white/10"
                      placeholder="ABC School / XYZ Foundation"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/60 ml-1">Organization Type *</label>
                    <div className="relative group">
                      <GraduationCap className="absolute left-3 top-3 text-white/40 group-focus-within:text-white transition-colors" size={16} />
                      <select
                        name="orgType"
                        value={formData.orgType}
                        onChange={handleChange}
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none text-white text-sm transition-all hover:bg-white/10 appearance-none [&>option]:text-black"
                      >
                        <option value="">Select Type</option>
                        <option value="school">School</option>
                        <option value="college">College / University</option>
                        <option value="ngo">NGO / Non-Profit</option>
                        <option value="company">Company / Business</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/60 ml-1">Registration No. (Optional)</label>
                    <div className="relative group">
                      <Building2 className="absolute left-3 top-3 text-white/40 group-focus-within:text-white transition-colors" size={16} />
                      <input
                        name="orgRegistrationNumber"
                        value={formData.orgRegistrationNumber}
                        onChange={handleChange}
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none text-white placeholder-white/20 text-sm transition-all hover:bg-white/10"
                        placeholder="GST / Reg. Number"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Vendor-specific fields */}
            {formData.accountType === 'vendor' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/60 ml-1">Business Name *</label>
                  <div className="relative group">
                    <Store className="absolute left-3 top-3 text-white/40 group-focus-within:text-white transition-colors" size={16} />
                    <input
                      name="businessName"
                      value={formData.businessName}
                      onChange={handleChange}
                      className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none text-white placeholder-white/20 text-sm transition-all hover:bg-white/10"
                      placeholder="Your Business / Store Name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/60 ml-1">Business Category *</label>
                    <div className="relative group">
                      <ShoppingBag className="absolute left-3 top-3 text-white/40 group-focus-within:text-white transition-colors" size={16} />
                      <select
                        name="businessCategory"
                        value={formData.businessCategory}
                        onChange={handleChange}
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none text-white text-sm transition-all hover:bg-white/10 appearance-none [&>option]:text-black"
                      >
                        <option value="">Select Category</option>
                        <option value="electronics">Electronics & Gadgets</option>
                        <option value="fashion">Fashion & Clothing</option>
                        <option value="home">Home & Living</option>
                        <option value="food">Food & Beverages</option>
                        <option value="health">Health & Beauty</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/60 ml-1">GST Number (Optional)</label>
                    <div className="relative group">
                      <Building2 className="absolute left-3 top-3 text-white/40 group-focus-within:text-white transition-colors" size={16} />
                      <input
                        name="gstNumber"
                        value={formData.gstNumber}
                        onChange={handleChange}
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none text-white placeholder-white/20 text-sm transition-all hover:bg-white/10"
                        placeholder="22AAAAA0000A1Z5"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/60 ml-1">Business Address (Optional)</label>
                  <div className="relative group">
                    <MapPin className="absolute left-3 top-3 text-white/40 group-focus-within:text-white transition-colors" size={16} />
                    <input
                      name="businessAddress"
                      value={formData.businessAddress}
                      onChange={handleChange}
                      className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none text-white placeholder-white/20 text-sm transition-all hover:bg-white/10"
                      placeholder="Shop address or warehouse location"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/60 ml-1">Email</label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-3 text-white/40 group-focus-within:text-white transition-colors" size={16} />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none text-white placeholder-white/20 text-sm transition-all hover:bg-white/10"
                    placeholder="name@email.com"
                  />
                </div>
              </div>
              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/60 ml-1">Phone</label>
                <div className="relative group">
                  <Phone className="absolute left-3 top-3 text-white/40 group-focus-within:text-white transition-colors" size={16} />
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    maxLength={10}
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none text-white placeholder-white/20 text-sm transition-all hover:bg-white/10"
                    placeholder="9876543210"
                  />
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/60 ml-1">State</label>
                <div className="relative group">
                  <MapPin className="absolute left-3 top-3 text-white/40 group-focus-within:text-white transition-colors" size={16} />
                  <select
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none text-white text-sm transition-all hover:bg-white/10 appearance-none [&>option]:text-black"
                  >
                    <option value="">Select State</option>
                    {Object.keys(statesAndCities).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/60 ml-1">City</label>
                <div className="relative group">
                  <MapPin className="absolute left-3 top-3 text-white/40 group-focus-within:text-white transition-colors" size={16} />
                  <select
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none text-white text-sm transition-all hover:bg-white/10 appearance-none [&>option]:text-black"
                    disabled={!formData.state}
                  >
                    <option value="">Select City</option>
                    {formData.state && statesAndCities[formData.state as keyof typeof statesAndCities]?.map((c: string) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Password */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/60 ml-1">Password</label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-3 text-white/40 group-focus-within:text-white transition-colors" size={16} />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full pl-10 pr-10 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none text-white placeholder-white/20 text-sm transition-all hover:bg-white/10"
                    placeholder="******"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-3 text-white/40 hover:text-white"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/60 ml-1">Confirm</label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-3 text-white/40 group-focus-within:text-white transition-colors" size={16} />
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none text-white placeholder-white/20 text-sm transition-all hover:bg-white/10"
                    placeholder="******"
                  />
                </div>
              </div>
            </div>

            {/* Referral */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/60 ml-1">Referral Code (Optional)</label>
              <div className="relative group">
                <Gift className="absolute left-3 top-3 text-white/40 group-focus-within:text-white transition-colors" size={16} />
                <input
                  name="referralCode"
                  value={formData.referralCode}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none text-white placeholder-white/20 text-sm transition-all hover:bg-white/10"
                  placeholder="Enter upline code"
                />
              </div>
            </div>

            {/* Terms */}
            <div className="flex items-start pt-2">
              <input
                type="checkbox"
                name="agreeToTerms"
                checked={formData.agreeToTerms}
                onChange={handleChange}
                id="terms"
                className="mt-1 w-4 h-4 rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-offset-0 focus:ring-indigo-500"
              />
              <label htmlFor="terms" className="ml-3 text-xs text-white/60 leading-relaxed cursor-pointer select-none">
                I agree to the <a href="#" className="text-white hover:underline">Terms & Conditions</a> and <a href="#" className="text-white hover:underline">Privacy Policy</a>.
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || publicSettings?.signupsEnabled === false}
              className="w-full bg-white text-thinkmart-deep hover:bg-indigo-50 py-3 rounded-xl font-bold text-sm shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center mt-4 group"
            >
              {loading ? (
                <Loader2 className="animate-spin w-5 h-5" />
              ) : (
                <span className="flex items-center gap-2">
                  Create Account
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </span>
              )}
            </button>
          </form>

          <p className="text-center mt-6 text-white/60 text-sm">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-white font-medium hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
