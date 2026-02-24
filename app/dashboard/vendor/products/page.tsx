'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { createProduct, deleteProduct, updateProduct } from '@/services/productService';
import { fetchMyProducts, uploadVendorProductImage } from '@/services/vendorService';
import type { ApiProduct } from '@/lib/api/types';
import {
    Package, Plus, Edit2, Trash2, Loader2, Save, X,
    CheckCircle, AlertCircle, ArrowLeft, Upload, Image as ImageIcon
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
    images?: string[];
    stock: number;
    isActive: boolean;
    status?: string;
    createdAt: any;
}

interface ProductFormData {
    name: string;
    description: string;
    price: string;
    category: string;
    stock: string;
    isActive: boolean;
}

interface ImageFile {
    file: File;
    preview: string;
}

const initialFormData: ProductFormData = {
    name: '',
    description: '',
    price: '',
    category: 'general',
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

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export default function VendorProducts() {
    const { profile, user } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
    const [formData, setFormData] = useState<ProductFormData>(initialFormData);

    // Image upload state
    const [newImages, setNewImages] = useState<ImageFile[]>([]);
    const [existingImages, setExistingImages] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const getErrorMessage = (error: unknown, fallback: string) => {
        return error instanceof Error ? error.message : fallback;
    };

    useEffect(() => {
        if (profile?.role === 'vendor') {
            void fetchProducts();
        }
    }, [profile]);

    const mapApiProduct = (product: ApiProduct): Product => ({
        id: product.id,
        name: product.name,
        description: product.description || '',
        price: Number(product.price || 0),
        category: product.category || 'general',
        imageUrl: product.image || product.images?.[0] || null,
        images: Array.isArray(product.images) ? product.images : [],
        stock: Number(product.stock || 0),
        isActive: Boolean(product.inStock),
        status: product.status,
        createdAt: product.createdAt,
    });

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const result = await fetchMyProducts(1, 200);
            setProducts((result.data || []).map(mapApiProduct));
        } catch (error: unknown) {
            console.error('Fetch products error:', error);
            toast.error('Failed to load products');
        } finally {
            setLoading(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const totalImages = newImages.length + existingImages.length;
        const remaining = MAX_IMAGES - totalImages;

        if (files.length > remaining) {
            toast.error(`You can only add ${remaining} more image(s)`);
            return;
        }

        const validFiles: ImageFile[] = [];

        for (let i = 0; i < Math.min(files.length, remaining); i++) {
            const file = files[i];

            if (!file.type.startsWith('image/')) {
                toast.error(`${file.name} is not an image`);
                continue;
            }

            if (file.size > MAX_FILE_SIZE) {
                toast.error(`${file.name} exceeds 2MB limit`);
                continue;
            }

            validFiles.push({
                file,
                preview: URL.createObjectURL(file)
            });
        }

        setNewImages([...newImages, ...validFiles]);

        // Reset input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const removeNewImage = (index: number) => {
        const updated = [...newImages];
        URL.revokeObjectURL(updated[index].preview);
        updated.splice(index, 1);
        setNewImages(updated);
    };

    const removeExistingImage = (index: number) => {
        const updated = [...existingImages];
        updated.splice(index, 1);
        setExistingImages(updated);
    };

    const uploadImages = async (_productId: string, _startPosition = 0): Promise<string[]> => {
        const uploadedUrls: string[] = [];
        if (!user?.uid) {
            throw new Error('Authentication required');
        }

        for (let index = 0; index < newImages.length; index++) {
            const imgFile = newImages[index];
            const url = await uploadVendorProductImage(imgFile.file, user.uid);
            uploadedUrls.push(url);
        }

        return uploadedUrls;
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

        const totalImages = newImages.length + existingImages.length;
        if (totalImages === 0) {
            toast.error('Please add at least one product image');
            return;
        }

        setSaving(true);
        try {
            let allImages = [...existingImages];

            if (editingProduct) {
                // Upload new images first
                if (newImages.length > 0) {
                    setUploading(true);
                    const uploadedUrls = await uploadImages(editingProduct.id, existingImages.length);
                    allImages = [...allImages, ...uploadedUrls];
                    setUploading(false);
                }

                await updateProduct(editingProduct.id, {
                    name: formData.name.trim(),
                    description: formData.description.trim(),
                    price,
                    category: formData.category,
                    images: allImages,
                    image: allImages[0] || '',
                    stock: isNaN(stock) ? 100 : stock,
                    isActive: formData.isActive
                });
                toast.success('Product updated!');
            } else {
                setUploading(true);
                const uploadedUrls = await uploadImages('new', 0);
                setUploading(false);

                await createProduct({
                    name: formData.name.trim(),
                    description: formData.description.trim(),
                    price,
                    category: formData.category,
                    stock: isNaN(stock) ? 100 : stock,
                    isActive: formData.isActive,
                    images: uploadedUrls,
                    image: uploadedUrls[0] || ''
                });

                toast.success('Product created!');
            }

            // Cleanup
            newImages.forEach(img => URL.revokeObjectURL(img.preview));
            setShowForm(false);
            setEditingProduct(null);
            setFormData(initialFormData);
            setNewImages([]);
            setExistingImages([]);
            void fetchProducts();
        } catch (error: unknown) {
            console.error('Save error:', error);
            toast.error(getErrorMessage(error, 'Failed to save product'));
        } finally {
            setSaving(false);
            setUploading(false);
        }
    };

    const handleEdit = (product: Product) => {
        setEditingProduct(product);
        setFormData({
            name: product.name,
            description: product.description || '',
            price: product.price.toString(),
            category: product.category || 'general',
            stock: product.stock?.toString() || '100',
            isActive: product.isActive ?? true
        });
        // Load existing images
        const imgs = product.images || (product.imageUrl ? [product.imageUrl] : []);
        setExistingImages(imgs);
        setNewImages([]);
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
        setNewImages([]);
        setExistingImages([]);
        setShowForm(true);
    };

    const closeForm = () => {
        newImages.forEach(img => URL.revokeObjectURL(img.preview));
        setShowForm(false);
        setEditingProduct(null);
        setNewImages([]);
        setExistingImages([]);
    };

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="animate-spin text-indigo-600" size={40} />
            </div>
        );
    }

    const totalSelectedImages = newImages.length + existingImages.length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                    <Link
                        href="/dashboard/vendor"
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
                                onClick={closeForm}
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

                            {/* Image Upload Section */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Product Images * ({totalSelectedImages}/{MAX_IMAGES})
                                </label>

                                {/* Image Previews Grid */}
                                <div className="grid grid-cols-5 gap-2 mb-3">
                                    {existingImages.map((url, idx) => (
                                        <div key={`existing-${idx}`} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 group">
                                            <Image src={url} alt="" fill className="object-cover" unoptimized />
                                            <button
                                                type="button"
                                                onClick={() => removeExistingImage(idx)}
                                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                    {newImages.map((img, idx) => (
                                        <div key={`new-${idx}`} className="relative aspect-square rounded-lg overflow-hidden border-2 border-indigo-300 group">
                                            <Image src={img.preview} alt="" fill className="object-cover" unoptimized />
                                            <div className="absolute top-1 left-1 bg-indigo-500 text-white text-xs px-1 rounded">New</div>
                                            <button
                                                type="button"
                                                onClick={() => removeNewImage(idx)}
                                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Add Image Button */}
                                    {totalSelectedImages < MAX_IMAGES && (
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-indigo-400 flex flex-col items-center justify-center text-gray-400 hover:text-indigo-500 transition"
                                        >
                                            <Upload size={20} />
                                            <span className="text-xs mt-1">Add</span>
                                        </button>
                                    )}
                                </div>

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />

                                <p className="text-xs text-gray-500">
                                    Upload 1-5 images (max 2MB each). First image will be the cover.
                                </p>
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
                                    onClick={closeForm}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {saving ? (
                                        <>
                                            <Loader2 className="animate-spin" size={18} />
                                            {uploading ? 'Uploading...' : 'Saving...'}
                                        </>
                                    ) : (
                                        <>
                                            <Save size={18} />
                                            {editingProduct ? 'Update' : 'Create'}
                                        </>
                                    )}
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
                    {products.map((product) => {
                        const displayImage = product.images?.[0] || product.imageUrl;
                        const imageCount = product.images?.length || (product.imageUrl ? 1 : 0);

                        return (
                            <div
                                key={product.id}
                                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition"
                            >
                                {displayImage ? (
                                    <div className="relative">
                                        <div className="relative w-full h-40">
                                            <Image
                                                src={displayImage}
                                                alt={product.name}
                                                fill
                                                className="object-cover"
                                                unoptimized
                                            />
                                        </div>
                                        {imageCount > 1 && (
                                            <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                                <ImageIcon size={12} /> {imageCount}
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <div className="w-full h-40 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                                        <Package size={48} className="text-gray-300" />
                                    </div>
                                )}

                                <div className="p-4">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-gray-900 line-clamp-1">{product.name}</h3>
                                        <div className="flex flex-col gap-1 items-end">
                                            {product.status === 'pending' && (
                                                <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                                                    <AlertCircle size={12} /> Pending Review
                                                </span>
                                            )}
                                            {product.status === 'rejected' && (
                                                <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                                                    <AlertCircle size={12} /> Rejected
                                                </span>
                                            )}
                                            {(product.status === 'approved' || !product.status) && (
                                                product.isActive ? (
                                                    <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                                                        <CheckCircle size={12} /> Active
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">
                                                        <AlertCircle size={12} /> Inactive
                                                    </span>
                                                )
                                            )}
                                        </div>
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
                        );
                    })}
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
