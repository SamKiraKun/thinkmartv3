// File: ThinkMart/app/dashboard/user/orders/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { fetchOrders } from '@/services/orderService';
import {
    Package, Clock, Truck, CheckCircle, XCircle, AlertTriangle,
    ChevronRight, ShoppingBag, Loader2, RefreshCw
} from 'lucide-react';
import Link from 'next/link';

interface OrderItem {
    productId: string;
    productName: string;
    productImage?: string;
    quantity: number;
    unitPrice: number;
}

interface Order {
    id: string;
    items: OrderItem[];
    subtotal: number;
    cashPaid: number;
    coinsRedeemed: number;
    status: string;
    createdAt: any;
    shippingAddress?: any;
}

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

export default function UserOrdersPage() {
    const { user } = useAuth();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

    useEffect(() => {
        if (!user?.uid) return;

        let active = true;
        let intervalId: NodeJS.Timeout;
        const loadOrders = async () => {
            try {
                const res = await fetchOrders(user.uid, 1, 50);
                if (active) {
                    setOrders(res.data as unknown as Order[]);
                    setLoading(false);
                }
            } catch (error) {
                console.error('Orders fetch error:', error);
                if (active) setLoading(false);
            }
        };

        void loadOrders();
        intervalId = setInterval(() => {
            void loadOrders();
        }, 15000);

        return () => {
            active = false;
            clearInterval(intervalId);
        };
    }, [user?.uid]);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'pending': return <Clock size={16} className="text-yellow-500" />;
            case 'confirmed': return <Package size={16} className="text-blue-500" />;
            case 'shipped': return <Truck size={16} className="text-purple-500" />;
            case 'delivered': return <CheckCircle size={16} className="text-green-500" />;
            case 'cancelled': return <XCircle size={16} className="text-red-500" />;
            case 'refunded': return <AlertTriangle size={16} className="text-orange-500" />;
            default: return <Clock size={16} className="text-gray-400" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-yellow-100 text-yellow-700';
            case 'confirmed': return 'bg-blue-100 text-blue-700';
            case 'shipped': return 'bg-purple-100 text-purple-700';
            case 'delivered': return 'bg-green-100 text-green-700';
            case 'cancelled': return 'bg-red-100 text-red-700';
            case 'refunded': return 'bg-orange-100 text-orange-700';
            default: return 'bg-gray-100 text-gray-700';
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

    const filteredOrders = statusFilter === 'all'
        ? orders
        : orders.filter(o => o.status === statusFilter);

    const statusCounts = {
        all: orders.length,
        pending: orders.filter(o => o.status === 'pending').length,
        confirmed: orders.filter(o => o.status === 'confirmed').length,
        shipped: orders.filter(o => o.status === 'shipped').length,
        delivered: orders.filter(o => o.status === 'delivered').length,
        cancelled: orders.filter(o => o.status === 'cancelled' || o.status === 'refunded').length
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Package className="text-indigo-600" /> My Orders
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Track and manage your orders</p>
                </div>
                <Link
                    href="/dashboard/user/shop"
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-2"
                >
                    <ShoppingBag size={18} /> Shop More
                </Link>
            </div>

            {/* Status Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {(['all', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as StatusFilter[]).map(status => (
                    <button
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        className={`px-4 py-2 rounded-full font-medium text-sm whitespace-nowrap transition ${statusFilter === status
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                    >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                        <span className="ml-1.5 px-1.5 py-0.5 bg-white/20 rounded text-xs">
                            {statusCounts[status]}
                        </span>
                    </button>
                ))}
            </div>

            {/* Orders List */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="animate-spin text-indigo-600" size={40} />
                </div>
            ) : filteredOrders.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
                    <Package size={48} className="mx-auto text-gray-300 mb-4" />
                    <h3 className="text-lg font-medium text-gray-700">No orders found</h3>
                    <p className="text-gray-500 mt-1">
                        {statusFilter === 'all' ? 'Start shopping to see your orders here' : `No ${statusFilter} orders`}
                    </p>
                    {statusFilter === 'all' && (
                        <Link
                            href="/dashboard/user/shop"
                            className="inline-flex items-center gap-2 mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg"
                        >
                            Browse Shop
                        </Link>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredOrders.map(order => (
                        <Link
                            key={order.id}
                            href={`/dashboard/user/orders/${order.id}`}
                            className="block bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition group"
                        >
                            <div className="flex items-start gap-4">
                                {/* First Item Image */}
                                <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                    {order.items?.[0]?.productImage ? (
                                        <Image
                                            src={order.items[0].productImage}
                                            alt={order.items[0].productName}
                                            width={80}
                                            height={80}
                                            className="w-full h-full object-cover"
                                            unoptimized
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Package size={32} className="text-gray-300" />
                                        </div>
                                    )}
                                </div>

                                {/* Order Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <h3 className="font-bold text-gray-900 truncate">
                                                {order.items?.length === 1
                                                    ? order.items[0].productName
                                                    : `${order.items?.[0]?.productName || 'Order'} + ${(order.items?.length || 1) - 1} more`}
                                            </h3>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                Order #{order.id.slice(-8).toUpperCase()}
                                            </p>
                                        </div>
                                        <span className={`px-2 py-1 text-xs font-bold rounded-full flex items-center gap-1 ${getStatusColor(order.status)}`}>
                                            {getStatusIcon(order.status)}
                                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                        </span>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
                                        <div>
                                            <span className="text-gray-500">Total: </span>
                                            <span className="font-bold text-gray-900">₹{order.subtotal?.toLocaleString('en-IN')}</span>
                                        </div>
                                        {order.coinsRedeemed > 0 && (
                                            <div className="text-yellow-600">
                                                🪙 {order.coinsRedeemed.toLocaleString()} coins used
                                            </div>
                                        )}
                                        <div className="text-gray-400 text-xs">
                                            {formatDate(order.createdAt)}
                                        </div>
                                    </div>
                                </div>

                                {/* Arrow */}
                                <ChevronRight size={20} className="text-gray-300 group-hover:text-indigo-600 transition flex-shrink-0" />
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
