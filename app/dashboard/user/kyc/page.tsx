'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase/config';
import {
    Shield, Upload, CheckCircle, Clock, XCircle, AlertTriangle,
    User, CreditCard, Building, Phone, FileText, Loader2, Info, Image
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

// Helper to upload file to Firebase Storage
import { apiClient } from '@/lib/api/client';
import { shouldUseApiWrite } from '@/lib/featureFlags';
import { submitKyc } from '@/services/userService';

async function uploadToStorage(file: File, userId: string, docType: string): Promise<string> {
    if (shouldUseApiWrite('users')) {
        const presignRes = await apiClient.post<any>('/api/storage/presign', { filename: file.name, contentType: file.type || 'application/octet-stream', folder: `kyc/${userId}/${docType}` });
        const { uploadUrl, key } = presignRes.data.data || presignRes.data;
        const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
        if (!uploadRes.ok) throw new Error('Failed');
        const pub = process.env.NEXT_PUBLIC_R2_PUBLIC_DOMAIN || 'https://pub-mock-thinkmart.r2.dev';
        return `${pub}/${key}`;
    }
    const fileExt = file.name.split('.').pop();
    const fileName = `kyc_documents/${userId}/${docType}_${Date.now()}.${fileExt}`;
    const storageRef = ref(storage, fileName);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
}
interface KYCData {
    status: 'not_submitted' | 'pending' | 'verified' | 'rejected';
    fullName: string;
    dateOfBirth: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    idType: string;
    idNumber: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    idDocumentUrl?: string;
    addressProofUrl?: string;
    submittedAt?: any;
    verifiedAt?: any;
    rejectionReason?: string;
}

export default function KYCPage() {
    const { user, profile, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [kycStatus, setKycStatus] = useState<string>('not_submitted');
    const [rejectionReason, setRejectionReason] = useState<string>('');
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        fullName: '',
        dateOfBirth: '',
        address: '',
        city: '',
        state: '',
        pincode: '',
        idType: 'aadhaar',
        idNumber: '',
        bankName: '',
        accountNumber: '',
        ifscCode: '',
    });

    // Document URLs (in production, these would be uploaded to storage)
    const [idDocument, setIdDocument] = useState<File | null>(null);
    const [addressProof, setAddressProof] = useState<File | null>(null);
    const getErrorMessage = (error: unknown, fallback: string) => {
        return error instanceof Error ? error.message : fallback;
    };

    useEffect(() => {
        if (authLoading) return;
        if (!user) return;

        try {
            setKycStatus(profile?.kycStatus || 'not_submitted');
            setRejectionReason((profile as any)?.kycRejectionReason || '');
            if (profile?.kycData) {
                setFormData(prev => ({
                    ...prev,
                    ...profile.kycData,
                }));
            }
        } finally {
            setLoading(false);
        }
    }, [user, authLoading, profile]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setNotice(null);

        // Validation
        if (!formData.fullName || !formData.dateOfBirth || !formData.idNumber) {
            setNotice({ type: 'error', text: 'Please fill in all required fields.' });
            return;
        }

        if (!formData.accountNumber || !formData.ifscCode) {
            setNotice({ type: 'error', text: 'Bank details are required for withdrawals.' });
            return;
        }

        setSubmitting(true);
        try {
            // Upload documents to Firebase Storage
            let idDocumentUrl = '';
            let addressProofUrl = '';

            if (idDocument) {
                idDocumentUrl = await uploadToStorage(idDocument, user.uid, 'id_document');
            }

            if (addressProof) {
                addressProofUrl = await uploadToStorage(addressProof, user.uid, 'address_proof');
            }

            await submitKyc({
                ...formData,
                idDocumentUrl: idDocumentUrl || null,
                addressProofUrl: addressProofUrl || null,
            });

            setKycStatus('pending');
            setNotice({ type: 'success', text: 'KYC submitted successfully! It will be reviewed within 24-48 hours.' });
        } catch (error: unknown) {
            console.error('KYC submission failed:', error);
            setNotice({ type: 'error', text: getErrorMessage(error, 'Submission failed. Please try again.') });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading || authLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin text-indigo-600" size={32} />
            </div>
        );
    }

    // Status Display Component
    const StatusCard = () => {
        const statusConfig = {
            'not_submitted': {
                icon: AlertTriangle,
                color: 'gray',
                title: 'KYC Not Submitted',
                description: 'Complete your KYC to enable withdrawals.'
            },
            'pending': {
                icon: Clock,
                color: 'yellow',
                title: 'KYC Under Review',
                description: 'Your documents are being verified. This usually takes 24-48 hours.'
            },
            'verified': {
                icon: CheckCircle,
                color: 'green',
                title: 'KYC Verified',
                description: 'Your identity has been verified. You can now withdraw funds.'
            },
            'rejected': {
                icon: XCircle,
                color: 'red',
                title: 'KYC Rejected',
                description: rejectionReason || 'Please resubmit with correct documents.'
            }
        };

        const config = statusConfig[kycStatus as keyof typeof statusConfig] || statusConfig['not_submitted'];
        const Icon = config.icon;

        return (
            <div className={`bg-${config.color}-50 border border-${config.color}-200 rounded-2xl p-6 mb-8`}>
                <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 bg-${config.color}-100 rounded-full flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`text-${config.color}-600`} size={24} />
                    </div>
                    <div>
                        <h2 className={`text-xl font-bold text-${config.color}-800`}>{config.title}</h2>
                        <p className={`text-${config.color}-600 mt-1`}>{config.description}</p>
                    </div>
                </div>
            </div>
        );
    };

    // If verified, show success state
    if (kycStatus === 'verified') {
        return (
            <div className="max-w-2xl mx-auto">
                <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <Shield className="text-green-600" /> KYC Verification
                </h1>
                <StatusCard />
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <div className="text-center py-8">
                        <CheckCircle className="mx-auto text-green-500 mb-4" size={64} />
                        <h3 className="text-xl font-bold text-gray-900">You&apos;re All Set!</h3>
                        <p className="text-gray-500 mt-2">Your KYC is verified. You can now request withdrawals.</p>
                        <a
                            href="/dashboard/user/withdraw"
                            className="inline-block mt-6 px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition"
                        >
                            Go to Withdrawals
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    // If pending, show waiting state
    if (kycStatus === 'pending') {
        return (
            <div className="max-w-2xl mx-auto">
                <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <Shield className="text-yellow-600" /> KYC Verification
                </h1>
                <StatusCard />
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <div className="text-center py-8">
                        <Clock className="mx-auto text-yellow-500 mb-4 animate-pulse" size={64} />
                        <h3 className="text-xl font-bold text-gray-900">Under Review</h3>
                        <p className="text-gray-500 mt-2">Our team is reviewing your documents. Please check back later.</p>
                        <div className="mt-6 p-4 bg-yellow-50 rounded-xl text-sm text-yellow-700">
                            <Info size={16} className="inline mr-2" />
                            You&apos;ll receive a notification once your KYC is processed.
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Show form for not_submitted or rejected
    return (
        <div className="max-w-3xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Shield className="text-indigo-600" /> KYC Verification
            </h1>

            {notice && (
                <div className={`p-4 rounded-xl border mb-6 text-sm font-medium ${notice.type === 'success'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                    }`}>
                    {notice.text}
                </div>
            )}

            <StatusCard />

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Personal Information */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <User size={18} className="text-gray-500" />
                        Personal Information
                    </h3>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name (as per ID) *</label>
                            <input
                                type="text"
                                name="fullName"
                                value={formData.fullName}
                                onChange={handleInputChange}
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="John Doe"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth *</label>
                            <input
                                type="date"
                                name="dateOfBirth"
                                value={formData.dateOfBirth}
                                onChange={handleInputChange}
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                required
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                            <textarea
                                name="address"
                                value={formData.address}
                                onChange={handleInputChange}
                                rows={2}
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                                placeholder="Full address..."
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                            <input
                                type="text"
                                name="city"
                                value={formData.city}
                                onChange={handleInputChange}
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                            <input
                                type="text"
                                name="state"
                                value={formData.state}
                                onChange={handleInputChange}
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Pincode *</label>
                            <input
                                type="text"
                                name="pincode"
                                value={formData.pincode}
                                onChange={handleInputChange}
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                pattern="[0-9]{6}"
                                required
                            />
                        </div>
                    </div>
                </div>

                {/* ID Verification */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <CreditCard size={18} className="text-gray-500" />
                        ID Verification
                    </h3>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">ID Type *</label>
                            <select
                                name="idType"
                                value={formData.idType}
                                onChange={handleInputChange}
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="aadhaar">Aadhaar Card</option>
                                <option value="pan">PAN Card</option>
                                <option value="passport">Passport</option>
                                <option value="voter_id">Voter ID</option>
                                <option value="driving_license">Driving License</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">ID Number *</label>
                            <input
                                type="text"
                                name="idNumber"
                                value={formData.idNumber}
                                onChange={handleInputChange}
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="Enter ID number"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Upload ID Document</label>
                            <div className="relative">
                                <input
                                    type="file"
                                    accept="image/*,.pdf"
                                    onChange={(e) => setIdDocument(e.target.files?.[0] || null)}
                                    className="hidden"
                                    id="id-upload"
                                />
                                <label
                                    htmlFor="id-upload"
                                    className="flex items-center gap-2 p-3 border border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition"
                                >
                                    <Upload size={18} className="text-gray-400" />
                                    <span className="text-sm text-gray-600">
                                        {idDocument ? idDocument.name : 'Choose file...'}
                                    </span>
                                </label>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Upload Address Proof</label>
                            <div className="relative">
                                <input
                                    type="file"
                                    accept="image/*,.pdf"
                                    onChange={(e) => setAddressProof(e.target.files?.[0] || null)}
                                    className="hidden"
                                    id="address-upload"
                                />
                                <label
                                    htmlFor="address-upload"
                                    className="flex items-center gap-2 p-3 border border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition"
                                >
                                    <Upload size={18} className="text-gray-400" />
                                    <span className="text-sm text-gray-600">
                                        {addressProof ? addressProof.name : 'Choose file...'}
                                    </span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bank Details */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Building size={18} className="text-gray-500" />
                        Bank Details (for Withdrawals)
                    </h3>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name *</label>
                            <input
                                type="text"
                                name="bankName"
                                value={formData.bankName}
                                onChange={handleInputChange}
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="e.g. State Bank of India"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Account Number *</label>
                            <input
                                type="text"
                                name="accountNumber"
                                value={formData.accountNumber}
                                onChange={handleInputChange}
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="Enter account number"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">IFSC Code *</label>
                            <input
                                type="text"
                                name="ifscCode"
                                value={formData.ifscCode}
                                onChange={handleInputChange}
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="e.g. SBIN0001234"
                                pattern="[A-Z]{4}0[A-Z0-9]{6}"
                                required
                            />
                        </div>
                    </div>
                </div>

                {/* Submit */}
                <div className="flex gap-4">
                    <Button
                        type="submit"
                        disabled={submitting}
                        className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                    >
                        {submitting ? (
                            <><Loader2 className="animate-spin" /> Submitting...</>
                        ) : (
                            <><FileText size={18} /> Submit KYC for Review</>
                        )}
                    </Button>
                </div>

                <p className="text-xs text-gray-400 text-center">
                    By submitting, you confirm that all information provided is accurate.
                    False information may result in account suspension.
                </p>
            </form>
        </div>
    );
}
