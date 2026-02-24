// File: ThinkMart/app/dashboard/user/orders/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { featureFlags } from '@/lib/featureFlags';
import { cancelOrder, fetchOrder } from '@/services/orderService';
import {
    Package, ArrowLeft, Clock, Truck, CheckCircle, XCircle,
    MapPin, CreditCard, Coins, Wallet, Loader2, AlertTriangle, FileDown
} from 'lucide-react';
import Link from 'next/link';
import { downloadInvoice } from '@/lib/utils/invoice';

interface OrderItem {
    productId: string;
    productName: string;
    productImage?: string;
    quantity: number;
    unitPrice: number;
}

interface StatusEntry {
    status: string;
    at: any;
    note?: string;
}

interface Order {
    id: string;
    userId: string;
    items: OrderItem[];
    subtotal: number;
    cashPaid: number;
    coinsRedeemed: number;
    coinValue: number;
    status: string;
    statusHistory: StatusEntry[];
    shippingAddress?: {
        fullName: string;
        phone: string;
        addressLine1: string;
        addressLine2?: string;
        city: string;
        state: string;
        pincode: string;
    };
    createdAt: any;
    refundReason?: string;
}

export default function OrderDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const orderId = params.id as string;

    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [notice, setNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
    const getErrorMessage = (error: unknown, fallback: string) => {
        return error instanceof Error ? error.message : fallback;
    };

    const normalizeOrder = (raw: any): Order => ({
        ...raw,
        id: raw.id,
        items: Array.isArray(raw.items)
            ? raw.items.map((item: any) => ({
                  ...item,
                  productName: item.productName || item.name || 'Product',
                  productImage: item.productImage || item.image,
                  unitPrice: Number(item.unitPrice ?? item.price ?? 0),
              }))
            : [],
        statusHistory: Array.isArray(raw.statusHistory)
            ? raw.statusHistory.map((entry: any) => ({
                  status: entry.status,
                  note: entry.note,
                  at: entry.at || entry.date || raw.updatedAt || raw.createdAt,
              }))
            : [],
    });

    useEffect(() => {
        if (!orderId) return;

        let active = true;
        let ws: WebSocket | null = null;
        const load = async () => {
            try {
                const data = await fetchOrder(orderId);
                if (!active) return;
                if (!data) {
                    router.push('/dashboard/user/orders');
                    return;
                }
                if (data.userId === user?.uid) {
                    setOrder(normalizeOrder(data));
                } else {
                    router.push('/dashboard/user/orders');
                }
                setLoading(false);
            } catch {
                if (active) {
                    setNotice({ type: 'error', text: 'Failed to fetch order.' });
                    router.push('/dashboard/user/orders');
                }
            }
        };

        void load();

        if (featureFlags.realtimeEnabled) {
            void (async () => {
                try {
                    const token = user ? await user.getIdToken() : null;
                    if (!token || !active) return;

                    let wsUrl = process.env.NEXT_PUBLIC_API_URL?.replace('http', 'ws') || 'ws://localhost:3001';
                    if (!wsUrl.endsWith('/')) wsUrl += '/';
                    wsUrl += `api/ws/realtime?token=${encodeURIComponent(token)}`;

                    ws = new WebSocket(wsUrl);
                    ws.onopen = () => {
                        ws?.send(JSON.stringify({
                            type: 'subscribe',
                            payload: { rooms: [`order:${orderId}`] }
                        }));
                    };
                    ws.onmessage = (event) => {
                        try {
                            const data = JSON.parse(event.data);
                            if (data.type === 'order_update' && data.payload) {
                                setOrder(prev => normalizeOrder(prev ? { ...prev, ...data.payload } : { id: orderId, ...data.payload }));
                            }
                        } catch {}
                    };
                } catch {
                    // Realtime is best-effort; polling/API fetch is the source of truth.
                }
            })();
        }

        return () => {
            active = false;
            if (ws) ws.close();
        };
    }, [orderId, user?.uid, router]);

    const handleCancelOrder = async () => {
        if (!order) return;

        setCancelling(true);
        try {
            await cancelOrder(order.id, cancelReason || 'User requested cancellation');
            setOrder((prev) => prev ? {
                ...prev,
                status: 'cancelled',
                refundReason: cancelReason || 'User requested cancellation',
                statusHistory: [
                    ...(prev.statusHistory || []),
                    {
                        status: 'cancelled',
                        note: cancelReason || 'User requested cancellation',
                        at: new Date().toISOString(),
                    },
                ],
            } : prev);
            setShowCancelModal(false);
            setNotice({ type: 'success', text: 'Order cancelled successfully.' });
        } catch (error: unknown) {
            setNotice({ type: 'error', text: getErrorMessage(error, 'Failed to cancel order') });
        } finally {
            setCancelling(false);
        }
    };

    const handleDownloadInvoice = () => {
        if (!order || !order.shippingAddress) return;

        downloadInvoice({
            orderId: order.id,
            orderDate:
                typeof order.createdAt === 'string'
                    ? new Date(order.createdAt)
                    : new Date(order.createdAt?.seconds * 1000 || Date.now()),
            customerName: order.shippingAddress.fullName,
            customerPhone: order.shippingAddress.phone,
            shippingAddress: {
                addressLine1: order.shippingAddress.addressLine1,
                addressLine2: order.shippingAddress.addressLine2,
                city: order.shippingAddress.city,
                state: order.shippingAddress.state,
                pincode: order.shippingAddress.pincode
            },
            items: order.items.map(item => ({
                name: item.productName,
                quantity: item.quantity,
                unitPrice: item.unitPrice
            })),
            subtotal: order.subtotal,
            cashPaid: order.cashPaid,
            coinsRedeemed: order.coinsRedeemed,
            coinValue: order.coinValue || 0
        });
    };

    const getStatusIcon = (status: string, size = 18) => {
        switch (status) {
            case 'pending': return <Clock size={size} className="text-yellow-500" />;
            case 'confirmed': return <Package size={size} className="text-blue-500" />;
            case 'shipped': return <Truck size={size} className="text-purple-500" />;
            case 'delivered': return <CheckCircle size={size} className="text-green-500" />;
            case 'cancelled': return <XCircle size={size} className="text-red-500" />;
            case 'refunded': return <AlertTriangle size={size} className="text-orange-500" />;
            default: return <Clock size={size} className="text-gray-400" />;
        }
    };

    const formatDate = (timestamp: any) => {
        if (typeof timestamp === 'string') {
            const d = new Date(timestamp);
            if (!Number.isNaN(d.getTime())) {
                return d.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        }
        if (!timestamp?.seconds) return 'N/A';
        return new Date(timestamp.seconds * 1000).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="animate-spin text-indigo-600" size={40} />
            </div>
        );
    }

    if (!order) {
        return (
            <div className="text-center py-20">
                <p className="text-gray-500">Order not found</p>
                <Link href="/dashboard/user/orders" className="text-indigo-600 mt-2 inline-block">
                    Go back to orders
                </Link>
            </div>
        );
    }

    const canCancel = order.status === 'pending';

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {notice && (
                <div className={`p-4 rounded-xl border text-sm font-medium ${notice.type === 'success'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                    }`}>
                    {notice.text}
                </div>
            )}
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link
                    href="/dashboard/user/orders"
                    className="p-2 hover:bg-gray-100 rounded-lg transition"
                >
                    <ArrowLeft size={20} />
                </Link>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-gray-900">Order Details</h1>
                    <p className="text-sm text-gray-500">#{order.id.slice(-8).toUpperCase()}</p>
                </div>
                <div className={`px-3 py-1.5 rounded-full font-bold text-sm flex items-center gap-2 ${order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    order.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                        order.status === 'shipped' ? 'bg-purple-100 text-purple-700' :
                            order.status === 'delivered' ? 'bg-green-100 text-green-700' :
                                'bg-red-100 text-red-700'
                    }`}>
                    {getStatusIcon(order.status, 16)}
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="md:col-span-2 space-y-6">
                    {/* Order Items */}
                    <div className="bg-white rounded-xl shadow-sm border p-4">
                        <h2 className="font-bold text-gray-900 mb-4">Items ({order.items?.length || 0})</h2>
                        <div className="space-y-4">
                            {order.items?.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-4">
                                    <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                        {item.productImage ? (
                                            <Image
                                                src={item.productImage}
                                                alt={item.productName}
                                                width={64}
                                                height={64}
                                                className="w-full h-full object-cover"
                                                unoptimized
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Package size={24} className="text-gray-300" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-medium text-gray-900">{item.productName}</h3>
                                        <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                                    </div>
                                    <p className="font-bold text-gray-900">
                                        ₹{(item.unitPrice * item.quantity).toLocaleString('en-IN')}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Status Timeline */}
                    <div className="bg-white rounded-xl shadow-sm border p-4">
                        <h2 className="font-bold text-gray-900 mb-4">Order Timeline</h2>
                        <div className="space-y-4">
                            {order.statusHistory?.map((entry, idx) => (
                                <div key={idx} className="flex gap-3">
                                    <div className="flex flex-col items-center">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${idx === 0 ? 'bg-indigo-100' : 'bg-gray-100'
                                            }`}>
                                            {getStatusIcon(entry.status, 16)}
                                        </div>
                                        {idx < (order.statusHistory?.length || 0) - 1 && (
                                            <div className="w-0.5 h-8 bg-gray-200 mt-1"></div>
                                        )}
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900">
                                            {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                                        </p>
                                        {entry.note && <p className="text-sm text-gray-500">{entry.note}</p>}
                                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(entry.at)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Shipping Address */}
                    {order.shippingAddress && (
                        <div className="bg-white rounded-xl shadow-sm border p-4">
                            <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                                <MapPin size={18} className="text-gray-400" /> Shipping Address
                            </h2>
                            <div className="text-sm text-gray-600">
                                <p className="font-medium text-gray-900">{order.shippingAddress.fullName}</p>
                                <p>{order.shippingAddress.addressLine1}</p>
                                {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
                                <p>{order.shippingAddress.city}, {order.shippingAddress.state} - {order.shippingAddress.pincode}</p>
                                <p className="mt-1">📞 {order.shippingAddress.phone}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                <div className="space-y-4">
                    {/* Payment Summary */}
                    <div className="bg-white rounded-xl shadow-sm border p-4">
                        <h3 className="font-bold text-gray-900 mb-3">Payment Summary</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Subtotal</span>
                                <span className="font-medium">₹{order.subtotal?.toLocaleString('en-IN')}</span>
                            </div>
                            {order.cashPaid > 0 && (
                                <div className="flex justify-between text-green-600">
                                    <span className="flex items-center gap-1">
                                        <Wallet size={14} /> Cash Paid
                                    </span>
                                    <span>₹{order.cashPaid.toLocaleString('en-IN')}</span>
                                </div>
                            )}
                            {order.coinsRedeemed > 0 && (
                                <div className="flex justify-between text-yellow-600">
                                    <span className="flex items-center gap-1">
                                        <Coins size={14} /> Coins Used
                                    </span>
                                    <span>{order.coinsRedeemed.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="border-t pt-2 mt-2 flex justify-between font-bold text-lg">
                                <span>Total</span>
                                <span className="text-indigo-600">₹{order.subtotal?.toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                    </div>

                    {/* Download Invoice */}
                    {order.shippingAddress && (
                        <button
                            onClick={handleDownloadInvoice}
                            className="w-full py-3 bg-indigo-50 text-indigo-600 font-bold rounded-xl hover:bg-indigo-100 transition flex items-center justify-center gap-2"
                        >
                            <FileDown size={18} /> Download Invoice
                        </button>
                    )}

                    {/* Cancel Order */}
                    {canCancel && (
                        <button
                            onClick={() => setShowCancelModal(true)}
                            className="w-full py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition flex items-center justify-center gap-2"
                        >
                            <XCircle size={18} /> Cancel Order
                        </button>
                    )}

                    {/* Refund Info */}
                    {(order.status === 'cancelled' || order.status === 'refunded') && order.refundReason && (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                            <h3 className="font-bold text-orange-800 mb-1">Cancellation Reason</h3>
                            <p className="text-sm text-orange-700">{order.refundReason}</p>
                        </div>
                    )}

                    {/* Order Date */}
                    <div className="bg-gray-50 rounded-xl p-4 text-center">
                        <p className="text-xs text-gray-500">Order placed on</p>
                        <p className="font-medium text-gray-900">{formatDate(order.createdAt)}</p>
                    </div>
                </div>
            </div>

            {/* Cancel Modal */}
            {showCancelModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setShowCancelModal(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Cancel Order?</h2>
                        <p className="text-gray-500 text-sm mb-4">
                            Your wallet will be refunded: ₹{order.cashPaid?.toLocaleString('en-IN')} cash
                            {order.coinsRedeemed > 0 && ` + ${order.coinsRedeemed.toLocaleString()} coins`}
                        </p>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
                            <textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Why are you cancelling?"
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                                rows={2}
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCancelModal(false)}
                                className="flex-1 py-2 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition"
                            >
                                Keep Order
                            </button>
                            <button
                                onClick={handleCancelOrder}
                                disabled={cancelling}
                                className="flex-1 py-2 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {cancelling ? (
                                    <><Loader2 className="animate-spin" size={16} /> Cancelling...</>
                                ) : (
                                    'Yes, Cancel'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
