// File: ThinkMart/app/dashboard/user/checkout/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useCart } from '@/contexts/CartContext';
import { useStore } from '@/store/useStore';
import { useAuth } from '@/hooks/useAuth'; // Import useAuth
import { createOrder } from '@/services/orderService';
import { updateUserProfile } from '@/services/userService';
import {
    ShoppingBag, MapPin, CreditCard, Coins, Wallet, ArrowLeft,
    CheckCircle, Loader2, AlertCircle, Package, Truck, Plus, Star
} from 'lucide-react';
import Link from 'next/link';
import { SavedAddress } from '@/types/user';

interface ShippingAddress {
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
}

type PaymentMode = 'coins' | 'cash' | 'split';

export default function CheckoutPage() {
    const { items, subtotal, coinTotal, clearCart } = useCart();
    const { wallet } = useStore();
    const { user, profile } = useAuth();

    const [step, setStep] = useState<'address' | 'payment' | 'confirm'>('address');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [orderId, setOrderId] = useState('');

    // Address State
    const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
    const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
    const [showNewAddressForm, setShowNewAddressForm] = useState(false);
    const [saveNewAddress, setSaveNewAddress] = useState(true);

    // Initial Address Form State
    const [address, setAddress] = useState<ShippingAddress>({
        fullName: '',
        phone: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        pincode: ''
    });

    // Load saved addresses from profile
    useEffect(() => {
        if (profile?.savedAddresses && profile.savedAddresses.length > 0) {
            setSavedAddresses(profile.savedAddresses);
            // Auto-select default or first address
            const defaultAddr = profile.savedAddresses.find(a => a.isDefault) || profile.savedAddresses[0];
            if (defaultAddr) {
                selectAddress(defaultAddr);
            }
        } else {
            setShowNewAddressForm(true);
        }
    }, [profile]);

    const selectAddress = (addr: SavedAddress) => {
        setSelectedAddressId(addr.id);
        setAddress({
            fullName: addr.fullName,
            phone: addr.phone,
            addressLine1: addr.addressLine1,
            addressLine2: addr.addressLine2 || '',
            city: addr.city,
            state: addr.state,
            pincode: addr.pincode
        });
        setShowNewAddressForm(false);
    };

    // Payment selection
    const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
    const [splitPercentage, setSplitPercentage] = useState(50); // % paid in coins

    // Calculate payment breakdown
    const coinBalance = wallet?.coinBalance || 0;
    const cashBalance = wallet?.cashBalance || 0;
    const COIN_RATE = 0.001; // 1 coin = ₹0.001
    const getErrorMessage = (error: unknown, fallback: string) => {
        return error instanceof Error ? error.message : fallback;
    };

    const calculatePayment = () => {
        if (paymentMode === 'coins') {
            const coinsNeeded = coinTotal;
            return {
                coinsUsed: Math.min(coinsNeeded, coinBalance),
                cashUsed: 0,
                canAfford: coinBalance >= coinsNeeded
            };
        } else if (paymentMode === 'cash') {
            return {
                coinsUsed: 0,
                cashUsed: subtotal,
                canAfford: cashBalance >= subtotal
            };
        } else {
            // Split payment
            const coinValue = Math.floor(subtotal * (splitPercentage / 100));
            const coinsNeeded = Math.floor(coinValue / COIN_RATE);
            const cashNeeded = subtotal - coinValue;
            return {
                coinsUsed: Math.min(coinsNeeded, coinBalance),
                cashUsed: cashNeeded,
                canAfford: coinBalance >= coinsNeeded && cashBalance >= cashNeeded
            };
        }
    };

    const payment = calculatePayment();

    const validateAddress = () => {
        if (!address.fullName.trim()) return 'Full name is required';
        if (!address.phone.match(/^[6-9]\d{9}$/)) return 'Valid 10-digit phone is required';
        if (!address.addressLine1.trim()) return 'Address is required';
        if (!address.city.trim()) return 'City is required';
        if (!address.state.trim()) return 'State is required';
        if (!address.pincode.match(/^\d{6}$/)) return 'Valid 6-digit PIN is required';
        return null;
    };

    const handleAddressSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const err = validateAddress();
        if (err) {
            setError(err);
            return;
        }

        // Save address if new and requested
        if (showNewAddressForm && saveNewAddress && user) {
            try {
                const newAddress: SavedAddress = {
                    id: Date.now().toString(),
                    ...address,
                    isDefault: savedAddresses.length === 0 // Make default if first address
                };

                await updateUserProfile(user.uid, {
                    savedAddresses: [...savedAddresses, newAddress] as any
                });

                // Update local state immediately for better UX
                setSavedAddresses([...savedAddresses, newAddress]);

            } catch (error) {
                console.error("Failed to save address:", error);
                // Don't block checkout if save fails, just log it
            }
        }

        setError('');
        setStep('payment');
    };

    const handlePlaceOrder = async () => {
        if (!payment.canAfford) {
            setError('Insufficient balance');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const result = await createOrder({
                items: items.map(item => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    price: item.price,
                    coinPrice: (item as any).coinPrice ?? 0,
                    productName: item.name,
                    productImage: item.image,
                    unitPrice: item.price,
                })) as any,
                shippingAddress: address,
                subtotal,
                cashPaid: Number(payment.cashUsed || 0),
                coinsRedeemed: Number(payment.coinsUsed || 0),
                coinValue: Number(((payment.coinsUsed || 0) * COIN_RATE).toFixed(3)),
            });

            setOrderId(result.id);
            setSuccess(true);
            clearCart();
        } catch (error: unknown) {
            setError(getErrorMessage(error, 'Order failed. Please try again.'));
        } finally {
            setLoading(false);
        }
    };

    // Redirect if cart empty
    if (items.length === 0 && !success) {
        return (
            <div className="max-w-2xl mx-auto py-12 text-center">
                <ShoppingBag size={64} className="mx-auto text-gray-300 mb-4" />
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Your cart is empty</h1>
                <p className="text-gray-500 mb-6">Add products from the shop to checkout</p>
                <Link
                    href="/dashboard/user/shop"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition"
                >
                    <ArrowLeft size={18} /> Go to Shop
                </Link>
            </div>
        );
    }

    // Success screen
    if (success) {
        return (
            <div className="max-w-2xl mx-auto py-12 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle size={48} className="text-green-600" />
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Order Placed!</h1>
                <p className="text-gray-500 mb-2">Your order has been confirmed</p>
                <p className="text-sm text-gray-400 mb-8">Order ID: {orderId}</p>
                <div className="flex justify-center gap-4">
                    <Link
                        href="/dashboard/user/orders"
                        className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition"
                    >
                        View Orders
                    </Link>
                    <Link
                        href="/dashboard/user/shop"
                        className="px-6 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition"
                    >
                        Continue Shopping
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link
                    href="/dashboard/user/shop"
                    className="p-2 hover:bg-gray-100 rounded-lg transition"
                >
                    <ArrowLeft size={20} />
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-4 py-4">
                {['address', 'payment', 'confirm'].map((s, i) => (
                    <div key={s} className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step === s ? 'bg-indigo-600 text-white' :
                            ['address', 'payment', 'confirm'].indexOf(step) > i ? 'bg-green-500 text-white' :
                                'bg-gray-200 text-gray-500'
                            }`}>
                            {i + 1}
                        </div>
                        <span className={`text-sm font-medium ${step === s ? 'text-indigo-600' : 'text-gray-500'}`}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                        </span>
                        {i < 2 && <div className="w-8 h-0.5 bg-gray-200 mx-2"></div>}
                    </div>
                ))}
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="md:col-span-2 space-y-6">
                    {/* Step 1: Address */}
                    {step === 'address' && (
                        <div className="bg-white rounded-xl shadow-sm border p-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <MapPin className="text-indigo-600" size={20} /> Shipping Address
                            </h2>

                            {/* Saved Addresses List */}
                            {!showNewAddressForm && savedAddresses.length > 0 && (
                                <div className="mb-6 space-y-3">
                                    {savedAddresses.map(addr => (
                                        <div
                                            key={addr.id}
                                            onClick={() => selectAddress(addr)}
                                            className={`p-4 border rounded-xl cursor-pointer transition flex items-start gap-3 ${selectedAddressId === addr.id
                                                ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600'
                                                : 'border-gray-200 hover:border-indigo-300'
                                                }`}
                                        >
                                            <div className={`mt-1 w-5 h-5 rounded-full border flex items-center justify-center ${selectedAddressId === addr.id
                                                ? 'border-indigo-600 bg-white'
                                                : 'border-gray-400'
                                                }`}>
                                                {selectedAddressId === addr.id && <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-bold text-gray-900">{addr.fullName}</span>
                                                    {addr.isDefault && <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full flex items-center gap-1"><Star size={10} fill="currentColor" /> Default</span>}
                                                </div>
                                                <p className="text-sm text-gray-600">{addr.addressLine1}{addr.addressLine2 ? `, ${addr.addressLine2}` : ''}</p>
                                                <p className="text-sm text-gray-600">{addr.city}, {addr.state} - {addr.pincode}</p>
                                                <p className="text-sm text-gray-600 mt-1">Phone: {addr.phone}</p>
                                            </div>
                                        </div>
                                    ))}

                                    <button
                                        onClick={() => {
                                            setShowNewAddressForm(true);
                                            setSelectedAddressId(null);
                                            setAddress({
                                                fullName: '', phone: '', addressLine1: '', addressLine2: '',
                                                city: '', state: '', pincode: ''
                                            });
                                        }}
                                        className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-medium hover:border-indigo-500 hover:text-indigo-600 transition flex items-center justify-center gap-2"
                                    >
                                        <Plus size={18} /> Add New Address
                                    </button>
                                </div>
                            )}

                            {/* New Address Form */}
                            {(showNewAddressForm || savedAddresses.length === 0) && (
                                <form onSubmit={handleAddressSubmit} className="space-y-4">
                                    {savedAddresses.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowNewAddressForm(false);
                                                // Select first available address
                                                if (savedAddresses.length > 0) selectAddress(savedAddresses[0]);
                                            }}
                                            className="mb-4 text-sm text-indigo-600 hover:underline flex items-center gap-1"
                                        >
                                            <ArrowLeft size={14} /> Back to saved addresses
                                        </button>
                                    )}
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                                            <input
                                                type="text"
                                                value={address.fullName}
                                                onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
                                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                placeholder="John Doe"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                                            <input
                                                type="tel"
                                                value={address.phone}
                                                onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                placeholder="9876543210"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1 *</label>
                                        <input
                                            type="text"
                                            value={address.addressLine1}
                                            onChange={(e) => setAddress({ ...address, addressLine1: e.target.value })}
                                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                            placeholder="House/Flat No, Street"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
                                        <input
                                            type="text"
                                            value={address.addressLine2}
                                            onChange={(e) => setAddress({ ...address, addressLine2: e.target.value })}
                                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                            placeholder="Landmark (optional)"
                                        />
                                    </div>
                                    <div className="grid md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                                            <input
                                                type="text"
                                                value={address.city}
                                                onChange={(e) => setAddress({ ...address, city: e.target.value })}
                                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                                            <input
                                                type="text"
                                                value={address.state}
                                                onChange={(e) => setAddress({ ...address, state: e.target.value })}
                                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">PIN Code *</label>
                                            <input
                                                type="text"
                                                value={address.pincode}
                                                onChange={(e) => setAddress({ ...address, pincode: e.target.value })}
                                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                maxLength={6}
                                            />
                                        </div>
                                    </div>
                                    {error && (
                                        <p className="text-red-600 text-sm flex items-center gap-1">
                                            <AlertCircle size={14} /> {error}
                                        </p>
                                    )}

                                    {user && (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="saveAddress"
                                                checked={saveNewAddress}
                                                onChange={(e) => setSaveNewAddress(e.target.checked)}
                                                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                            />
                                            <label htmlFor="saveAddress" className="text-sm text-gray-700">
                                                Save this address for future orders
                                            </label>
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition"
                                    >
                                        Continue to Payment
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    {/* Step 2: Payment */}
                    {step === 'payment' && (
                        <div className="bg-white rounded-xl shadow-sm border p-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <CreditCard className="text-indigo-600" size={20} /> Payment Method
                            </h2>

                            {/* Wallet Balance Display */}
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                    <div className="flex items-center gap-2 text-yellow-700">
                                        <Coins size={18} />
                                        <span className="font-medium">Coin Balance</span>
                                    </div>
                                    <p className="text-2xl font-bold text-yellow-800 mt-1">
                                        {coinBalance.toLocaleString()}
                                    </p>
                                </div>
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                    <div className="flex items-center gap-2 text-green-700">
                                        <Wallet size={18} />
                                        <span className="font-medium">Cash Balance</span>
                                    </div>
                                    <p className="text-2xl font-bold text-green-800 mt-1">
                                        ₹{cashBalance.toLocaleString('en-IN')}
                                    </p>
                                </div>
                            </div>

                            {/* Payment Options */}
                            <div className="space-y-3 mb-6">
                                {[
                                    { id: 'cash', label: 'Pay with Cash', icon: Wallet, desc: `₹${subtotal.toLocaleString('en-IN')}` },
                                    { id: 'coins', label: 'Pay with Coins', icon: Coins, desc: `${coinTotal.toLocaleString()} coins` },
                                    { id: 'split', label: 'Split Payment', icon: CreditCard, desc: 'Coins + Cash' }
                                ].map(opt => (
                                    <button
                                        key={opt.id}
                                        onClick={() => setPaymentMode(opt.id as PaymentMode)}
                                        className={`w-full p-4 rounded-xl border-2 flex items-center gap-4 transition ${paymentMode === opt.id
                                            ? 'border-indigo-600 bg-indigo-50'
                                            : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        <opt.icon size={24} className={paymentMode === opt.id ? 'text-indigo-600' : 'text-gray-400'} />
                                        <div className="text-left">
                                            <p className="font-bold text-gray-900">{opt.label}</p>
                                            <p className="text-sm text-gray-500">{opt.desc}</p>
                                        </div>
                                        <div className={`ml-auto w-5 h-5 rounded-full border-2 ${paymentMode === opt.id ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'
                                            }`}>
                                            {paymentMode === opt.id && <CheckCircle size={16} className="text-white" />}
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {/* Split Slider */}
                            {paymentMode === 'split' && (
                                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                                    <label className="block text-sm font-medium text-gray-700 mb-3">
                                        Pay {splitPercentage}% with Coins, {100 - splitPercentage}% with Cash
                                    </label>
                                    <input
                                        type="range"
                                        min="10"
                                        max="90"
                                        step="10"
                                        value={splitPercentage}
                                        onChange={(e) => setSplitPercentage(parseInt(e.target.value))}
                                        className="w-full"
                                    />
                                    <div className="flex justify-between text-sm text-gray-500 mt-2">
                                        <span>{payment.coinsUsed.toLocaleString()} coins</span>
                                        <span>₹{payment.cashUsed.toLocaleString('en-IN')}</span>
                                    </div>
                                </div>
                            )}

                            {!payment.canAfford && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-red-700 flex items-center gap-2">
                                    <AlertCircle size={18} />
                                    Insufficient balance for this payment method
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setStep('address')}
                                    className="px-6 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={() => setStep('confirm')}
                                    disabled={!payment.canAfford}
                                    className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition disabled:opacity-50"
                                >
                                    Review Order
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Confirm */}
                    {step === 'confirm' && (
                        <div className="bg-white rounded-xl shadow-sm border p-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <Package className="text-indigo-600" size={20} /> Confirm Order
                            </h2>

                            {/* Address Summary */}
                            <div className="bg-gray-50 rounded-lg p-4 mb-4">
                                <div className="flex items-start gap-3">
                                    <Truck size={20} className="text-gray-400 mt-1" />
                                    <div>
                                        <p className="font-bold text-gray-900">{address.fullName}</p>
                                        <p className="text-sm text-gray-600">
                                            {address.addressLine1}, {address.addressLine2 && `${address.addressLine2}, `}
                                            {address.city}, {address.state} - {address.pincode}
                                        </p>
                                        <p className="text-sm text-gray-500">{address.phone}</p>
                                    </div>
                                    <button
                                        onClick={() => setStep('address')}
                                        className="text-indigo-600 text-sm font-medium ml-auto"
                                    >
                                        Edit
                                    </button>
                                </div>
                            </div>

                            {/* Payment Summary */}
                            <div className="bg-gray-50 rounded-lg p-4 mb-6">
                                <h3 className="font-medium text-gray-700 mb-2">Payment</h3>
                                {payment.coinsUsed > 0 && (
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-600">Coins</span>
                                        <span className="text-yellow-600">{payment.coinsUsed.toLocaleString()} coins</span>
                                    </div>
                                )}
                                {payment.cashUsed > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">Cash</span>
                                        <span className="text-green-600">₹{payment.cashUsed.toLocaleString('en-IN')}</span>
                                    </div>
                                )}
                            </div>

                            {error && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-red-700 flex items-center gap-2">
                                    <AlertCircle size={18} /> {error}
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setStep('payment')}
                                    className="px-6 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handlePlaceOrder}
                                    disabled={loading}
                                    className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl hover:from-indigo-700 hover:to-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <><Loader2 className="animate-spin" size={18} /> Placing Order...</>
                                    ) : (
                                        <>Place Order</>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Order Summary Sidebar */}
                <div className="md:col-span-1">
                    <div className="bg-white rounded-xl shadow-sm border p-4 sticky top-24">
                        <h3 className="font-bold text-gray-900 mb-4">Order Summary</h3>
                        <div className="space-y-3 max-h-60 overflow-y-auto mb-4">
                            {items.map(item => (
                                <div key={item.productId} className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden">
                                        {item.image && (
                                            <Image
                                                src={item.image}
                                                alt={item.name}
                                                width={48}
                                                height={48}
                                                className="w-full h-full object-cover"
                                                unoptimized
                                            />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                                        <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                                    </div>
                                    <p className="text-sm font-bold">₹{(item.price * item.quantity).toLocaleString('en-IN')}</p>
                                </div>
                            ))}
                        </div>
                        <div className="border-t pt-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Subtotal</span>
                                <span className="font-medium">₹{subtotal.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Shipping</span>
                                <span className="text-green-600 font-medium">FREE</span>
                            </div>
                            <div className="flex justify-between text-lg font-bold pt-2 border-t">
                                <span>Total</span>
                                <span className="text-indigo-600">₹{subtotal.toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
