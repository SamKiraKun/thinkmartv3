// File: ThinkMart/app/dashboard/admin/products/add/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { productService } from '@/services/product.service';
import { Loader2, UploadCloud, X, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function AddProductPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    commission: '',
    category: 'electronics',
    inStock: true
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageFile) {
      setNotice({ type: 'error', text: 'Please select a product image.' });
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      await productService.addProduct({
        name: formData.name,
        description: formData.description,
        price: parseFloat(formData.price),
        commission: parseFloat(formData.commission),
        category: formData.category,
        inStock: formData.inStock,
      }, imageFile);
      setNotice({ type: 'success', text: 'Product created successfully. Redirecting...' });
      router.push('/dashboard/admin/products');
    } catch (error) {
      console.error("Error adding product:", error);
      setNotice({ type: 'error', text: 'Failed to add product.' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' && e.target instanceof HTMLInputElement ? e.target.checked : false;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Add New Product</h1>

      {notice && (
        <div className={`mb-6 p-4 rounded-lg border flex items-center justify-between gap-3 ${notice.type === 'success'
          ? 'bg-green-50 border-green-200 text-green-700'
          : 'bg-red-50 border-red-200 text-red-700'
          }`}>
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span className="text-sm font-medium">{notice.text}</span>
          </div>
          <button onClick={() => setNotice(null)} className="p-1 rounded hover:bg-black/5">
            <X size={14} />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 space-y-6">

        {/* Name */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Product Name</label>
          <input
            type="text" name="name" required
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none"
            onChange={handleChange}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
          <textarea
            name="description" required rows={3}
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none"
            onChange={handleChange}
          />
        </div>

        {/* Price & Commission (UPDATED LABELS) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Price (₹)</label>
            <input
              type="number" name="price" required min="0" step="0.01"
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none"
              onChange={handleChange}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Ref Commission (₹)</label>
            <input
              type="number" name="commission" required min="0" step="0.01"
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none"
              onChange={handleChange}
            />
          </div>
        </div>

        {/* Category & Stock */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Category</label>
            <select
              name="category"
              className="w-full p-3 border rounded-lg bg-white"
              onChange={handleChange}
            >
              <option value="electronics">Electronics</option>
              <option value="fashion">Fashion</option>
              <option value="home">Home & Living</option>
              <option value="digital">Digital Assets</option>
            </select>
          </div>
          <div className="flex items-center pt-6">
            <input
              type="checkbox" name="inStock" id="stock"
              checked={formData.inStock} onChange={handleChange}
              className="w-5 h-5 text-indigo-600 rounded"
            />
            <label htmlFor="stock" className="ml-2 text-gray-700 font-medium">Available in Stock</label>
          </div>
        </div>

        {/* Image Upload */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Product Image</label>

          {!imagePreview ? (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition cursor-pointer relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <UploadCloud className="mx-auto h-10 w-10 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">Click to upload or drag and drop</p>
              <p className="text-xs text-gray-400">SVG, PNG, JPG or GIF (max. 2MB)</p>
            </div>
          ) : (
            <div className="relative w-full h-48 bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
              <Image
                src={imagePreview}
                alt="Preview"
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 700px"
                className="object-contain"
              />
              <button
                type="button"
                onClick={removeImage}
                className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-md hover:bg-red-50 text-red-500 transition"
              >
                <X size={18} />
              </button>
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition flex justify-center items-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'Create Product'}
        </button>

      </form>
    </div>
  );
}
