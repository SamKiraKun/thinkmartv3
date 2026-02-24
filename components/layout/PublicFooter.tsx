// File: ThinkMart/components/layout/PublicFooter.tsx
import Link from 'next/link';
import { ShoppingBag, Facebook, Twitter, Instagram, Linkedin } from 'lucide-react';

export const PublicFooter = () => {
  return (
    <footer className="bg-thinkmart-deep text-white/80 py-12 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8">

        {/* Brand */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-white">
            <ShoppingBag className="text-indigo-500" />
            <span className="text-xl font-bold">ThinkMart</span>
          </div>
          <p className="text-sm opacity-70 leading-relaxed">
            The next-gen e-commerce platform that rewards you for shopping and sharing. Join the revolution today.
          </p>
        </div>

        {/* Quick Links */}
        <div>
          <h3 className="text-white font-bold mb-4">Platform</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="/shop" className="hover:text-indigo-400">Shop Products</Link></li>
            <li><Link href="/partners" className="hover:text-indigo-400">Become a Partner</Link></li>
            <li><Link href="/auth/register" className="hover:text-indigo-400">Earn Money</Link></li>
            <li><Link href="/about" className="hover:text-indigo-400">Our Story</Link></li>
          </ul>
        </div>

        {/* Support */}
        <div>
          <h3 className="text-white font-bold mb-4">Support</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="/contact" className="hover:text-indigo-400">Help Center</Link></li>
            <li><Link href="/contact" className="hover:text-indigo-400">Contact Us</Link></li>
            <li><Link href="#" className="hover:text-indigo-400">Privacy Policy</Link></li>
            <li><Link href="#" className="hover:text-indigo-400">Terms of Service</Link></li>
          </ul>
        </div>

        {/* Contact */}
        <div>
          <h3 className="text-white font-bold mb-4">Connect</h3>
          <div className="flex gap-4">
            <a href="#" className="hover:text-indigo-400"><Facebook size={20} /></a>
            <a href="#" className="hover:text-indigo-400"><Twitter size={20} /></a>
            <a href="#" className="hover:text-indigo-400"><Instagram size={20} /></a>
            <a href="#" className="hover:text-indigo-400"><Linkedin size={20} /></a>
          </div>
          <p className="mt-4 text-sm">Email: support@thinkmart.com</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-12 pt-8 border-t border-gray-800 text-center text-sm opacity-50">
        © {new Date().getFullYear()} ThinkMart. All rights reserved.
      </div>
    </footer>
  );
};