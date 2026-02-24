'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  approveAdminProduct,
  fetchAdminProductsForModeration,
  rejectAdminProduct,
} from '@/services/adminService';
import {
  Plus, Package, Loader2, RefreshCw, Search, Filter,
  CheckCircle, XCircle, Clock, AlertTriangle, Store,
  ChevronLeft, ChevronRight, Eye, Ban
} from 'lucide-react';

interface Product {
  id: string;
  name: string;
  price: number;
  vendorId: string;
  vendorName?: string;
  category: string;
  status: string;
  stock: number;
  createdAt: string;
}

interface ProductsCursor {
  page: number;
}

type StatusFilter = '' | 'pending' | 'approved' | 'rejected' | 'suspended';

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', icon: <Clock className="w-3 h-3" /> },
  approved: { bg: 'bg-green-100', text: 'text-green-700', icon: <CheckCircle className="w-3 h-3" /> },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: <XCircle className="w-3 h-3" /> },
  suspended: { bg: 'bg-gray-100', text: 'text-gray-600', icon: <Ban className="w-3 h-3" /> },
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<ProductsCursor | null>(null);
  const [cursorStack, setCursorStack] = useState<(ProductsCursor | null)[]>([null]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ productId: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const pageSize = 20;
  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  useEffect(() => {
    const initialStack: (ProductsCursor | null)[] = [null];
    setCursorStack(initialStack);
    void fetchProducts(null, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const fetchProducts = async (cursor: ProductsCursor | null, pageNum: number) => {
    setLoading(true);
    setError(null);
    try {
      const page = cursor?.page || pageNum || 1;
      const result = await fetchAdminProductsForModeration(page, pageSize, statusFilter || undefined);

      setProducts((result.data || []) as unknown as Product[]);
      setTotal(result.pagination?.total || 0);
      setHasMore(Boolean(result.pagination?.hasNext));
      setNextCursor(result.pagination?.hasNext ? { page: page + 1 } : null);
      setPage(pageNum);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load products'));
    } finally {
      setLoading(false);
    }
  };

  const handleNextPage = () => {
    if (!hasMore || !nextCursor) return;
    const nextStack = [...cursorStack, nextCursor];
    setCursorStack(nextStack);
    void fetchProducts(nextCursor, nextStack.length);
  };

  const handlePrevPage = () => {
    if (page <= 1) return;
    const prevStack = cursorStack.slice(0, -1);
    const normalizedStack = prevStack.length ? prevStack : [null];
    const prevCursor = normalizedStack[normalizedStack.length - 1] ?? null;
    setCursorStack(normalizedStack);
    void fetchProducts(prevCursor, normalizedStack.length);
  };

  const approveProduct = async (productId: string) => {
    setActionLoading(productId);
    setError(null);
    try {
      await approveAdminProduct(productId, `approve_${productId}_${Date.now()}`);

      setProducts(products.map(p => p.id === productId ? { ...p, status: 'approved' } : p));
      setSuccess('Product approved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to approve product'));
    } finally {
      setActionLoading(null);
    }
  };

  const openRejectModal = (productId: string, name: string) => {
    setRejectModal({ productId, name });
    setRejectReason('');
  };

  const rejectProduct = async () => {
    if (!rejectModal || !rejectReason.trim()) return;

    setActionLoading(rejectModal.productId);
    setError(null);
    try {
      await rejectAdminProduct(
        rejectModal.productId,
        rejectReason,
        `reject_${rejectModal.productId}_${Date.now()}`
      );

      setProducts(products.map(p => p.id === rejectModal.productId ? { ...p, status: 'rejected' } : p));
      setSuccess('Product rejected');
      setRejectModal(null);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to reject product'));
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusStyle = (status: string) => STATUS_STYLES[status] || STATUS_STYLES.pending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Package className="w-8 h-8 text-indigo-600" />
          <h1 className="text-3xl font-bold text-gray-900">Product Moderation</h1>
        </div>
        <Link
          href="/dashboard/admin/products/add"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition text-sm font-medium"
        >
          <Plus size={18} /> Add Product
        </Link>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-700 text-xl leading-none">×</button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span className="text-green-700">{success}</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setPage(1); }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        <div className="flex items-center gap-4 ml-auto text-sm text-gray-500">
          <span>Total: <strong className="text-gray-900">{total}</strong> products</span>
          <button
            onClick={() => {
              const currentCursor = cursorStack[cursorStack.length - 1] ?? null;
              void fetchProducts(currentCursor, cursorStack.length);
            }}
            disabled={loading}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-gray-600 text-sm">
            <tr>
              <th className="px-6 py-4">Product</th>
              <th className="px-6 py-4">Vendor</th>
              <th className="px-6 py-4">Price</th>
              <th className="px-6 py-4">Stock</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
                  <span className="text-gray-500">Loading products...</span>
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No products found</p>
                </td>
              </tr>
            ) : (
              products.map((product) => {
                const statusStyle = getStatusStyle(product.status);
                return (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
                          <Package className="w-5 h-5 text-gray-400" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{product.name}</div>
                          <div className="text-xs text-gray-500">{product.category}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Store className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">{product.vendorName || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      ₹{product.price.toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {product.stock}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                        {statusStyle.icon}
                        {product.status.charAt(0).toUpperCase() + product.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {product.status === 'pending' && (
                          <>
                            <button
                              onClick={() => approveProduct(product.id)}
                              disabled={actionLoading === product.id}
                              className="px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 rounded-lg transition disabled:opacity-50"
                            >
                              {actionLoading === product.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                'Approve'
                              )}
                            </button>
                            <button
                              onClick={() => openRejectModal(product.id, product.name)}
                              disabled={actionLoading === product.id}
                              className="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 rounded-lg transition disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {product.status === 'approved' && (
                          <span className="text-xs text-gray-400">Active</span>
                        )}
                        {product.status === 'rejected' && (
                          <button
                            onClick={() => approveProduct(product.id)}
                            disabled={actionLoading === product.id}
                            className="px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition disabled:opacity-50"
                          >
                            Re-approve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={handlePrevPage}
            disabled={page <= 1 || loading}
            className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="px-4 py-2 text-sm text-gray-500">Page {page}</span>
          <button
            onClick={handleNextPage}
            disabled={!hasMore || loading}
            className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Reject Product</h3>
            <p className="text-sm text-gray-500 mb-4">
              Provide a reason for rejecting &quot;{rejectModal.name}&quot;:
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
              rows={3}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRejectModal(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={rejectProduct}
                disabled={!rejectReason.trim() || actionLoading === rejectModal.productId}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading === rejectModal.productId && <Loader2 className="w-4 h-4 animate-spin" />}
                Reject Product
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
