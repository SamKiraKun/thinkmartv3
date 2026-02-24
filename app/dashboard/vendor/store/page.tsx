'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Building2, Loader2, Save, Store } from 'lucide-react';
import { fetchVendorStoreProfile, updateVendorStoreProfile } from '@/services/vendorService';

interface StoreProfile {
  vendorId: string;
  businessName: string;
  contactEmail: string;
  contactPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  payoutMethod: string;
  payoutAccount: string;
  logoUrl: string;
  bannerUrl: string;
}

const EMPTY_PROFILE: StoreProfile = {
  vendorId: '',
  businessName: '',
  contactEmail: '',
  contactPhone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  pincode: '',
  payoutMethod: '',
  payoutAccount: '',
  logoUrl: '',
  bannerUrl: '',
};

export default function VendorStoreProfilePage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<StoreProfile>(EMPTY_PROFILE);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchProfile = useCallback(async () => {
    if (profile?.role !== 'vendor') {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const profileData = await fetchVendorStoreProfile();
      setForm({ ...EMPTY_PROFILE, ...(profileData || {}) });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Failed to load store profile';
      setNotice({ type: 'error', text });
    } finally {
      setLoading(false);
    }
  }, [profile?.role]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  const onChange = (key: keyof StoreProfile, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    setNotice(null);
    setSaving(true);
    try {
      await updateVendorStoreProfile({
        businessName: form.businessName,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        payoutMethod: form.payoutMethod,
        payoutAccount: form.payoutAccount,
        logoUrl: form.logoUrl,
        bannerUrl: form.bannerUrl,
      });
      setNotice({ type: 'success', text: 'Store profile saved.' });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Failed to save store profile';
      setNotice({ type: 'error', text });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={36} />
      </div>
    );
  }

  if (profile?.role !== 'vendor') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
        Vendor access required.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Store className="text-indigo-600" /> Store Profile
        </h1>
        <p className="text-gray-500 mt-1">Manage your public store details and payout settings.</p>
      </div>

      {notice && (
        <div
          className={`rounded-lg border p-3 text-sm ${notice.type === 'success'
            ? 'border-green-200 bg-green-50 text-green-700'
            : 'border-red-200 bg-red-50 text-red-700'
            }`}
        >
          {notice.text}
        </div>
      )}

      <form onSubmit={onSave} className="space-y-6">
        <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Building2 size={18} className="text-gray-500" /> Business
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextInput label="Business Name" value={form.businessName} onChange={(v) => onChange('businessName', v)} required />
            <TextInput label="Vendor ID" value={form.vendorId} readOnly />
            <TextInput label="Contact Email" type="email" value={form.contactEmail} onChange={(v) => onChange('contactEmail', v)} />
            <TextInput label="Contact Phone" value={form.contactPhone} onChange={(v) => onChange('contactPhone', v)} />
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Address</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextInput label="Address Line 1" value={form.addressLine1} onChange={(v) => onChange('addressLine1', v)} />
            <TextInput label="Address Line 2" value={form.addressLine2} onChange={(v) => onChange('addressLine2', v)} />
            <TextInput label="City" value={form.city} onChange={(v) => onChange('city', v)} />
            <TextInput label="State" value={form.state} onChange={(v) => onChange('state', v)} />
            <TextInput label="Pincode" value={form.pincode} onChange={(v) => onChange('pincode', v)} />
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Payout Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextInput label="Payout Method" value={form.payoutMethod} onChange={(v) => onChange('payoutMethod', v)} placeholder="UPI, Bank Transfer" />
            <TextInput label="Payout Account" value={form.payoutAccount} onChange={(v) => onChange('payoutAccount', v)} placeholder="UPI ID or Account Number" />
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Branding</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextInput label="Logo URL" value={form.logoUrl} onChange={(v) => onChange('logoUrl', v)} />
            <TextInput label="Banner URL" value={form.bannerUrl} onChange={(v) => onChange('bannerUrl', v)} />
          </div>
        </section>

        <div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = 'text',
  readOnly = false,
  required = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  readOnly?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input
        type={type}
        value={value || ''}
        onChange={(event) => onChange?.(event.target.value)}
        readOnly={readOnly}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 read-only:bg-gray-50 read-only:text-gray-500"
      />
    </label>
  );
}
