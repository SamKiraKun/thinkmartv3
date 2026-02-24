'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchVendorOrders } from '@/services/vendorService';
import {
  ShoppingCart,
  Package,
  Loader2,
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  Eye,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

interface VendorOrder {
  id: string;
  userId: string;
  userName?: string;
  items: OrderItem[];
  vendorItemCount: number;
  totalItemCount: number;
  status: string;
  createdAt: { seconds: number } | Date | string | null;
  shippingAddress?: string;
}

interface GetVendorOrdersResponse {
  success: boolean;
  orders: VendorOrder[];
  hasMore: boolean;
  lastOrderId: string | null;
}

const statusConfig = {
  pending: { color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  confirmed: { color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  processing: { color: 'bg-indigo-100 text-indigo-700', icon: Package },
  shipped: { color: 'bg-purple-100 text-purple-700', icon: Truck },
  delivered: { color: 'bg-green-100 text-green-700', icon: CheckCircle },
  cancelled: { color: 'bg-red-100 text-red-700', icon: XCircle },
};

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

function toDate(value: VendorOrder['createdAt']): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  return null;
}

export default function VendorOrders() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<VendorOrder | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const getErrorMessage = (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback;

  const fetchOrders = useCallback(
    async (reset: boolean, _cursorArg: string | null = null) => {
      if (!profile || profile.role !== 'vendor') {
        setOrders([]);
        setLoading(false);
        return;
      }

      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      setError(null);
      try {
        const targetPage = reset ? 1 : page + 1;
        const result = await fetchVendorOrders(targetPage, 25, statusFilter);
        const nextOrders = result.data || [];
        setOrders((prev) => (reset ? nextOrders : [...prev, ...nextOrders]));
        setHasMore(Boolean(result.pagination?.hasNext));
        setPage(targetPage);
        setLastOrderId(result.pagination?.hasNext ? String(targetPage + 1) : null);
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to load vendor orders'));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [page, profile, statusFilter]
  );

  useEffect(() => {
    setLastOrderId(null);
    setPage(1);
    setHasMore(false);
    void fetchOrders(true, null);
  }, [fetchOrders]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/vendor" className="p-2 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
            <p className="text-gray-500 text-sm">{orders.length} orders containing your products</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            onClick={() => void fetchOrders(true, null)}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl p-12 text-center">
          <ShoppingCart size={48} className="mx-auto text-gray-300 mb-4" />
          <h2 className="text-xl font-bold text-gray-700">No Orders Yet</h2>
          <p className="text-gray-500 mt-2">Orders containing your products will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const statusKey = order.status as keyof typeof statusConfig;
            const StatusIcon = statusConfig[statusKey]?.icon || Clock;
            const statusColors = statusConfig[statusKey]?.color || 'bg-gray-100 text-gray-700';
            const createdAt = toDate(order.createdAt);

            return (
              <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-gray-900">Order #{order.id.slice(-8)}</h3>
                      <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${statusColors}`}>
                        <StatusIcon size={12} />
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {createdAt
                        ? createdAt.toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                        : 'Date unknown'}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Vendor Items</p>
                      <p className="text-xl font-bold text-indigo-600">{order.vendorItemCount}</p>
                    </div>
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                    >
                      <Eye size={20} />
                    </button>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-500 mb-2">{order.vendorItemCount || order.items?.length || 0} items for your store</p>
                  <div className="flex flex-wrap gap-2">
                    {order.items?.slice(0, 3).map((item, idx) => (
                      <span key={idx} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                        {item.productName} x {item.quantity}
                      </span>
                    ))}
                    {(order.items?.length || 0) > 3 && (
                      <span className="text-xs text-gray-500">+{order.items.length - 3} more</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {hasMore && (
            <div className="flex justify-center">
              <button
                onClick={() => void fetchOrders(false, lastOrderId)}
                disabled={loadingMore}
                className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm font-medium text-gray-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loadingMore && <Loader2 className="animate-spin" size={16} />}
                Load More
              </button>
            </div>
          )}
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold">Order Details</h2>
              <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                x
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-500">Order ID</p>
                <p className="font-mono text-sm">{selectedOrder.id}</p>
              </div>

              <div>
                <p className="text-sm text-gray-500">Status</p>
                <p className="font-medium capitalize">{selectedOrder.status}</p>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-2">Your Items</p>
                <div className="space-y-2">
                  {selectedOrder.items?.map((item, idx) => (
                    <div key={idx} className="flex justify-between bg-gray-50 p-3 rounded-lg">
                      <div>
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                      </div>
                      <p className="font-bold">₹{(item.price * item.quantity).toLocaleString('en-IN')}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
