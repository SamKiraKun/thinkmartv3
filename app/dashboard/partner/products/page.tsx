'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { createProduct, deleteProduct, updateProduct } from '@/services/productService';
import { fetchPartnerProducts } from '@/services/partnerService';
import type { ApiProduct } from '@/lib/api/types';
import {
    Package, Plus, Edit2, Trash2, Loader2, Save, X,
    CheckCircle, AlertCircle, ArrowLeft
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface Product {
    id: string;
    name: string;
    description: string;
    price: number;
    category: string;
    imageUrl: string | null;
    stock: number;
    isActive: boolean;
    createdAt: any;
}

interface ProductFormData {
    name: string;
    description: string;
    price: string;
    category: string;
    imageUrl: string;
    stock: string;
    isActive: boolean;
}

const initialFormData: ProductFormData = {
    name: '',
    description: '',
    price: '',
    category: 'general',
    imageUrl: '',
    stock: '100',
    isActive: true
};

const categories = [
    { value: 'general', label: 'General' },
    { value: 'electronics', label: 'Electronics' },
    { value: 'fashion', label: 'Fashion' },
    { value: 'home', label: 'Home & Living' },
    { value: 'beauty', label: 'Beauty & Health' },
    { value: 'food', label: 'Food & Beverages' },
    { value: 'other', label: 'Other' }
];

export default function PartnerProducts() {
    const { profile } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
    const [formData, setFormData] = useState<ProductFormData>(initialFormData);
    const getErrorMessage = (error: unknown, fallback: string) => {
        return error instanceof Error ? error.message : fallback;
    };

    useEffect(() => {
        if (profile?.role === 'partner') {
            void fetchProducts();
        }
    }, [profile]);

    const mapApiProduct = (p: ApiProduct): Product => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        price: Number(p.price || 0),
        category: p.category || 'general',
        imageUrl: p.image || p.images?.[0] || null,
        stock: Number(p.stock || 0),
        isActive: Boolean(p.inStock),
        createdAt: p.createdAt,
    });

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const result = await fetchPartnerProducts(1, 200);
            setProducts((result.data || []).map(mapApiProduct));
        } catch (error: unknown) {
            console.error('Fetch products error:', error);
            toast.error('Failed to load products');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return;

        const price = parseFloat(formData.price);
        const stock = parseInt(formData.stock, 10);

        if (!formData.name || formData.name.trim().length < 3) {
            toast.error('Product name must be at least 3 characters');
            return;
        }
        if (isNaN(price) || price <= 0) {
            toast.error('Please enter a valid price');
            return;
        }
        if (!editingProduct && !formData.imageUrl.trim()) {
            toast.error('Image URL is required for new products');
            return;
        }

        setSaving(true);
        try {
            if (editingProduct) {
                await updateProduct(editingProduct.id, {
                    name: formData.name.trim(),
                    description: formData.description.trim(),
                    price,
                    category: formData.category,
                    image: formData.imageUrl || '',
                    stock: isNaN(stock) ? 100 : stock,
                    isActive: formData.isActive
                });
                toast.success('Product updated!');
            } else {
                await createProduct({
                    name: formData.name.trim(),
                    description: formData.description.trim(),
                    price,
                    category: formData.category,
                    image: formData.imageUrl || '',
                    stock: isNaN(stock) ? 100 : stock,
                    isActive: formData.isActive
                });
                toast.success('Product created!');
            }

            setShowForm(false);
            setEditingProduct(null);
            setFormData(initialFormData);
            fetchProducts();
        } catch (error: unknown) {
            console.error('Save error:', error);
            toast.error(getErrorMessage(error, 'Failed to save product'));
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (product: Product) => {
        setEditingProduct(product);
        setFormData({
            name: product.name,
            description: product.description || '',
            price: product.price.toString(),
            category: product.category || 'general',
            imageUrl: product.imageUrl || '',
            stock: product.stock?.toString() || '100',
            isActive: product.isActive ?? true
        });
        setShowForm(true);
    };

    const handleDelete = async (product: Product) => {
        setDeleteTarget(product);
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deleteProduct(deleteTarget.id);
            toast.success('Product deleted');
            setDeleteTarget(null);
            void fetchProducts();
        } catch (error: unknown) {
            console.error('Delete error:', error);
            toast.error(getErrorMessage(error, 'Failed to delete product'));
        }
    };

    const openCreateForm = () => {
        setEditingProduct(null);
        setFormData(initialFormData);
        setShowForm(true);
    };

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="animate-spin text-indigo-600" size={40} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                    <Link
                        href="/dashboard/partner"
                        className="p-2 hover:bg-gray-100 rounded-lg transition"
                    >
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">My Products</h1>
                        <p className="text-gray-500 text-sm">{products.length} products</p>
                    </div>
                </div>
                <button
                    onClick={openCreateForm}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-2 shadow-sm"
                >
                    <Plus size={18} /> Add Product
                </button>
            </div>

            {/* Product Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h2 className="text-xl font-bold">
                                {editingProduct ? 'Edit Product' : 'Add New Product'}
                            </h2>
                            <button
                                onClick={() => { setShowForm(false); setEditingProduct(null); }}
                                className="p-2 hover:bg-gray-100 rounded-lg"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Product Name *
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Enter product name"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Description
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    rows={3}
                                    placeholder="Product description..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Price (₹) *
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={formData.price}
                                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Stock
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.stock}
                                        onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="100"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Category
                                </label>
                                <select
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                    {categories.map((cat) => (
                                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Image URL
                                </label>
                                <input
                                    type="url"
                                    value={formData.imageUrl}
                                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="https://example.com/image.jpg"
                                />
                            </div>

                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="isActive"
                                    checked={formData.isActive}
                                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                    className="w-4 h-4 text-indigo-600 rounded"
                                />
                                <label htmlFor="isActive" className="text-sm text-gray-700">
                                    Product is active and visible to customers
                                </label>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => { setShowForm(false); setEditingProduct(null); }}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                    {editingProduct ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Products Grid */}
            {products.length === 0 ? (
                <div className="bg-gray-50 rounded-2xl p-12 text-center">
                    <Package size={48} className="mx-auto text-gray-300 mb-4" />
                    <h2 className="text-xl font-bold text-gray-700">No Products Yet</h2>
                    <p className="text-gray-500 mt-2 mb-6">
                        Start selling by adding your first product.
                    </p>
                    <button
                        onClick={openCreateForm}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition inline-flex items-center gap-2"
                    >
                        <Plus size={18} /> Add Your First Product
                    </button>
                </div>
            ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {products.map((product) => (
                        <div
                            key={product.id}
                            className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition"
                        >
                            {product.imageUrl ? (
                                <div className="relative w-full h-40">
                                    <Image
                                        src={product.imageUrl}
                                        alt={product.name}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                    />
                                </div>
                            ) : (
                                <div className="w-full h-40 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                                    <Package size={48} className="text-gray-300" />
                                </div>
                            )}

                            <div className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-bold text-gray-900 line-clamp-1">{product.name}</h3>
                                    {product.isActive ? (
                                        <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                                            <CheckCircle size={12} /> Active
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                                            <AlertCircle size={12} /> Inactive
                                        </span>
                                    )}
                                </div>

                                <p className="text-gray-500 text-sm line-clamp-2 mb-3">
                                    {product.description || 'No description'}
                                </p>

                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="text-xl font-bold text-indigo-600">
                                            ₹{product.price.toLocaleString('en-IN')}
                                        </p>
                                        <p className="text-xs text-gray-400">Stock: {product.stock}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleEdit(product)}
                                            className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(product)}
                                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {deleteTarget && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Product?</h3>
                        <p className="text-sm text-gray-600 mb-5">
                            This will delete <span className="font-medium">{deleteTarget.name}</span>. This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => void confirmDelete()}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
