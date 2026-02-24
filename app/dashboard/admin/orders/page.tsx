// File: ThinkMart/app/dashboard/admin/orders/page.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAdminOrders, type AdminOrder } from '@/services/adminService';
import { fetchOrder, updateOrderStatus } from '@/services/orderService';
import {
  Package, Loader2, Clock, Truck, CheckCircle, XCircle,
  Search, Filter, X, User, MapPin, CreditCard, Download, Calendar
} from 'lucide-react';

interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

interface Order {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  vendorId?: string;
  items?: OrderItem[];
  productName?: string;
  firstItemName?: string;
  itemCount?: number;
  subtotal: number;
  amount?: number;
  cashPaid: number;
  coinsRedeemed: number;
  status: string;
  createdAt: string;
  city?: string;
  shippingAddress?: any;
  statusHistory?: any[];
}

interface OrdersPageCursor { page: number; }

interface GetOrdersPageRequest {
  userId?: string;
  vendorId?: string;
  fromDate?: string;
  toDate?: string;
  pageSize?: number;
  cursor?: OrdersPageCursor | null;
}

interface GetOrdersPageResponse {
  orders: Array<{
    id: string;
    userId: string;
    userName?: string;
    userEmail?: string;
    vendorId?: string;
    status: string;
    subtotal: number;
    cashPaid: number;
    coinsPaid: number;
    itemCount: number;
    firstItemName?: string;
    city?: string;
    createdAt: string;
  }>;
  nextCursor: OrdersPageCursor | null;
  hasMore: boolean;
}

interface GetOrderDetailsResponse {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  status: string;
  items?: OrderItem[];
  subtotal?: number;
  amount?: number;
  cashPaid?: number;
  coinsPaid?: number;
  shippingAddress?: any;
  statusHistory?: any[];
  createdAt?: string;
}

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

const PAGE_SIZE = 20;

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<OrdersPageCursor | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [cancelOrderTarget, setCancelOrderTarget] = useState<Order | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [updating, setUpdating] = useState(false);

  // Date range filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const mapListOrder = (row: AdminOrder): Order => ({
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    vendorId: row.vendorId,
    status: row.status,
    subtotal: row.subtotal || 0,
    amount: row.subtotal || 0,
    cashPaid: row.cashPaid || 0,
    coinsRedeemed: Number((row as any).coinsRedeemed || 0),
    itemCount: Array.isArray(row.items) ? row.items.length : 0,
    firstItemName: Array.isArray(row.items) && row.items[0]
      ? ((row.items[0] as any).productName || (row.items[0] as any).name || '')
      : '',
    city: row.city || '',
    createdAt: row.createdAt,
  });

  const fetchOrdersPage = useCallback(async ({ reset, cursor }: { reset: boolean; cursor: OrdersPageCursor | null }) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const fromDate = startDate ? `${startDate}T00:00:00.000Z` : undefined;
      const toDate = endDate ? `${endDate}T23:59:59.999Z` : undefined;

      const page = reset ? 1 : (cursor?.page || 1);
      const result = await fetchAdminOrders(page, PAGE_SIZE, { fromDate, toDate });
      const rows = result.data.map(mapListOrder);
      setOrders((prev) => (reset ? rows : [...prev, ...rows]));
      setHasMore(Boolean(result.pagination?.hasNext));
      setNextCursor(result.pagination?.hasNext ? { page: page + 1 } : null);
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err, 'Failed to load orders') });
      if (reset) {
        setOrders([]);
        setHasMore(false);
        setNextCursor(null);
      }
    } finally {
      if (reset) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, [endDate, startDate]);

  useEffect(() => {
    void fetchOrdersPage({ reset: true, cursor: null });
  }, [fetchOrdersPage]);

  const handleStatusUpdate = async (orderId: string, newStatus: string, note?: string) => {
    setUpdating(true);
    try {
      await updateOrderStatus(orderId, newStatus, note);
      setOrders((prev) => prev.map((order) => (
        order.id === orderId ? { ...order, status: newStatus } : order
      )));
      setSelectedOrder((prev) => (prev && prev.id === orderId ? { ...prev, status: newStatus } : prev));
      setCancelOrderTarget((prev) => (prev && prev.id === orderId ? { ...prev, status: newStatus } : prev));
      setNotice({ type: 'success', text: `Order marked as ${newStatus}.` });
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err, 'Failed to update status') });
    } finally {
      setUpdating(false);
    }
  };

  const handleViewOrder = async (order: Order) => {
    setLoadingOrderId(order.id);
    try {
      const data = await fetchOrder(order.id);
      if (!data) throw new Error('Order not found');
      const orderAny = data as any;

      setSelectedOrder({
        ...order,
        userName: data.userName || order.userName,
        userEmail: data.userEmail || order.userEmail,
        status: data.status || order.status,
        items: data.items || [],
        subtotal: data.subtotal || orderAny.amount || order.subtotal || 0,
        amount: orderAny.amount || data.subtotal || order.amount || 0,
        cashPaid: data.cashPaid || order.cashPaid || 0,
        coinsRedeemed: orderAny.coinsPaid || data.coinsRedeemed || order.coinsRedeemed || 0,
        shippingAddress: data.shippingAddress,
        statusHistory: data.statusHistory,
        createdAt: data.createdAt || order.createdAt,
      });
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err, 'Failed to load order details') });
      setSelectedOrder(order);
    } finally {
      setLoadingOrderId(null);
    }
  };

  const handleLoadMore = async () => {
    if (!hasMore || loading || loadingMore) {
      return;
    }

    await fetchOrdersPage({ reset: false, cursor: nextCursor });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock size={14} className="text-yellow-500" />;
      case 'confirmed': return <Package size={14} className="text-blue-500" />;
      case 'shipped': return <Truck size={14} className="text-purple-500" />;
      case 'delivered': return <CheckCircle size={14} className="text-green-500" />;
      case 'cancelled': return <XCircle size={14} className="text-red-500" />;
      default: return <Clock size={14} className="text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'confirmed': return 'bg-blue-100 text-blue-700';
      case 'shipped': return 'bg-purple-100 text-purple-700';
      case 'delivered': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getNextStatus = (current: string): string | null => {
    switch (current) {
      case 'pending': return 'confirmed';
      case 'confirmed': return 'shipped';
      case 'shipped': return 'delivered';
      default: return null;
    }
  };

  const formatDate = (value: string | { seconds?: number } | null | undefined) => {
    if (!value) return 'N/A';

    const date = typeof value === 'string'
      ? new Date(value)
      : value.seconds
        ? new Date(value.seconds * 1000)
        : null;

    if (!date || Number.isNaN(date.getTime())) {
      return 'N/A';
    }

    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredOrders = useMemo(() => {
    let data = statusFilter === 'all'
      ? orders
      : orders.filter((o) => o.status === statusFilter);

    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      data = data.filter((o) =>
        o.id.toLowerCase().includes(query) ||
        o.userName?.toLowerCase().includes(query) ||
        o.userEmail?.toLowerCase().includes(query) ||
        o.city?.toLowerCase().includes(query)
      );
    }

    return data;
  }, [orders, searchTerm, statusFilter]);

  const statusCounts = {
    all: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    shipped: orders.filter(o => o.status === 'shipped').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length
  };

  // Export CSV function
  const exportToCSV = () => {
    const headers = ['Order ID', 'Customer', 'Email', 'City', 'Items', 'Subtotal', 'Cash Paid', 'Coins Used', 'Status', 'Date'];
    const rows = filteredOrders.map((o) => [
      o.id,
      o.userName || 'N/A',
      o.userEmail || 'N/A',
      o.city || 'N/A',
      o.itemCount || o.items?.length || 1,
      o.subtotal || o.amount || 0,
      o.cashPaid || 0,
      o.coinsRedeemed || 0,
      o.status,
      o.createdAt ? new Date(o.createdAt).toISOString() : 'N/A'
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="text-indigo-600" /> Order Management
          </h1>
          <p className="text-gray-500 text-sm">{filteredOrders.length} of {orders.length} loaded orders</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2 rounded-lg border flex items-center gap-2 text-sm font-medium transition ${showFilters ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            <Filter size={16} />
            Filters
            {(startDate || endDate) && <span className="w-2 h-2 bg-indigo-600 rounded-full"></span>}
          </button>

          {/* Export CSV */}
          <button
            onClick={exportToCSV}
            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2 text-sm font-medium"
          >
            <Download size={16} />
            Export CSV
          </button>

          {/* Search */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>
      </div>

      {notice && (
        <div className={`p-4 rounded-lg border flex items-center justify-between gap-3 ${notice.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <span className="text-sm font-medium">{notice.text}</span>
          <button onClick={() => setNotice(null)} className="p-1 rounded hover:bg-black/5">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Date Range Filters Panel */}
      {showFilters && (
        <div className="bg-white rounded-xl border p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Date Range:</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          {(startDate || endDate) && (
            <button
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
            >
              <X size={14} /> Clear
            </button>
          )}
        </div>
      )}

      {/* Status Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {(['all', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as StatusFilter[]).map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-full font-medium text-sm whitespace-nowrap transition flex items-center gap-1 ${statusFilter === status ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
          >
            {getStatusIcon(status)}
            {status.charAt(0).toUpperCase() + status.slice(1)}
            <span className={`ml-1 px-1.5 py-0.5 rounded text-xs ${statusFilter === status ? 'bg-white/20' : 'bg-gray-100'}`}>
              {statusCounts[status]}
            </span>
          </button>
        ))}
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center">
                    <Loader2 className="animate-spin mx-auto text-indigo-600" size={32} />
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400">
                    No orders found
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-gray-500">#{order.id.slice(-8).toUpperCase()}</p>
                      <p className="text-xs text-gray-400">{formatDate(order.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-[120px]">
                        {order.userName || 'N/A'}
                      </p>
                      <p className="text-xs text-gray-400 truncate max-w-[120px]">
                        {order.userEmail || order.userId.slice(0, 8)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-900">
                        {order.itemCount || order.items?.length || 1} item(s)
                      </p>
                      <p className="text-xs text-gray-500 truncate max-w-[150px]">
                        {order.firstItemName || order.items?.[0]?.productName || order.productName || 'N/A'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">
                        ₹{(order.subtotal || order.amount || 0).toLocaleString('en-IN')}
                      </p>
                      {order.coinsRedeemed > 0 && (
                        <p className="text-xs text-yellow-600">
                          +{order.coinsRedeemed.toLocaleString()} coins
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {order.city || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${getStatusColor(order.status)}`}>
                        {getStatusIcon(order.status)}
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {getNextStatus(order.status) && (
                          <button
                            onClick={() => handleStatusUpdate(order.id, getNextStatus(order.status)!)}
                            disabled={updating}
                            className="px-3 py-1 text-xs font-bold text-indigo-600 border border-indigo-200 rounded hover:bg-indigo-50 disabled:opacity-50"
                          >
                            {'->'} {getNextStatus(order.status)}
                          </button>
                        )}
                        <button
                          onClick={() => void handleViewOrder(order)}
                          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-60"
                          disabled={loadingOrderId === order.id}
                        >
                          {loadingOrderId === order.id ? <Loader2 size={12} className="animate-spin" /> : 'View'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <div className="border-t px-4 py-3 flex justify-center">
            <button
              onClick={() => void handleLoadMore()}
              disabled={loadingMore}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 flex items-center gap-2"
            >
              {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
              Load more
            </button>
          </div>
        )}
      </div>

      {/* Order Detail Drawer */}
      {selectedOrder && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSelectedOrder(null)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">Order #{selectedOrder.id.slice(-8).toUpperCase()}</h2>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold mt-1 ${getStatusColor(selectedOrder.status)}`}>
                  {getStatusIcon(selectedOrder.status)} {selectedOrder.status}
                </span>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Customer Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <User size={16} /> Customer
                </h3>
                <p className="text-gray-900">{selectedOrder.userName || 'N/A'}</p>
                <p className="text-sm text-gray-500">{selectedOrder.userEmail}</p>
                <p className="text-xs text-gray-400 mt-1">ID: {selectedOrder.userId}</p>
              </div>

              {/* Items */}
              <div>
                <h3 className="font-bold text-gray-900 mb-3">Items</h3>
                <div className="space-y-2">
                  {selectedOrder.items?.length ? selectedOrder.items.map((item, i) => (
                    <div key={i} className="flex justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                      </div>
                      <p className="font-bold">₹{(item.unitPrice * item.quantity).toLocaleString('en-IN')}</p>
                    </div>
                  )) : (
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="font-medium">{selectedOrder.firstItemName || selectedOrder.productName || 'N/A'}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <CreditCard size={16} /> Payment
                </h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-bold">₹{(selectedOrder.subtotal || selectedOrder.amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Cash Paid</span>
                    <span>₹{selectedOrder.cashPaid.toLocaleString('en-IN')}</span>
                  </div>
                  {selectedOrder.coinsRedeemed > 0 && (
                    <div className="flex justify-between text-yellow-600">
                      <span>Coins Used</span>
                      <span>{selectedOrder.coinsRedeemed.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Shipping Address */}
              {selectedOrder.shippingAddress && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <MapPin size={16} /> Shipping
                  </h3>
                  <p className="font-medium">{selectedOrder.shippingAddress.fullName}</p>
                  <p className="text-sm text-gray-600">
                    {selectedOrder.shippingAddress.addressLine1}, {selectedOrder.shippingAddress.city}
                  </p>
                  <p className="text-sm text-gray-500">Phone: {selectedOrder.shippingAddress.phone}</p>
                </div>
              )}

              {/* Status Actions */}
              {getNextStatus(selectedOrder.status) && (
                <div className="border-t pt-4">
                  <button
                    onClick={() => {
                      void handleStatusUpdate(selectedOrder.id, getNextStatus(selectedOrder.status)!);
                      setSelectedOrder(null);
                    }}
                    disabled={updating}
                    className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Mark as {getNextStatus(selectedOrder.status)}
                  </button>
                </div>
              )}

              {/* Cancel Button (for non-final states) */}
              {['pending', 'confirmed', 'shipped'].includes(selectedOrder.status) && (
                <button
                  onClick={() => {
                    setCancelOrderTarget(selectedOrder);
                  }}
                  disabled={updating}
                  className="w-full py-2 text-red-600 font-bold border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-50"
                >
                  Cancel Order & Refund
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {cancelOrderTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCancelOrderTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Cancel Order & Refund?</h2>
            <p className="text-sm text-gray-600 mb-4">
              This will cancel order <span className="font-mono">#{cancelOrderTarget.id.slice(-8).toUpperCase()}</span> and trigger refund handling.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setCancelOrderTarget(null)}
                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
              >
                Keep Order
              </button>
              <button
                onClick={async () => {
                  await handleStatusUpdate(cancelOrderTarget.id, 'cancelled', 'Admin cancelled');
                  setCancelOrderTarget(null);
                  setSelectedOrder(null);
                }}
                disabled={updating}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {updating ? <Loader2 size={16} className="animate-spin" /> : null}
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
