'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X, ShoppingBag } from 'lucide-react';

export const PublicNavbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === '/';

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Dynamic Styles
  // If Home & Not Scrolled -> Transparent BG, White Text
  // Otherwise -> White BG, Dark Text
  const isTransparent = isHome && !scrolled;

  const navClass = isTransparent
    ? "fixed w-full z-50 transition-all duration-300 border-b border-white/5 bg-transparent"
    : "fixed w-full z-50 transition-all duration-300 border-b border-gray-100 bg-white/80 backdrop-blur-md shadow-sm";

  const textClass = isTransparent
    ? "text-white/90 hover:text-white"
    : "text-gray-600 hover:text-indigo-600";

  const logoTextClass = isTransparent
    ? "text-white"
    : "bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600";

  const buttonClass = isTransparent
    ? "bg-white text-indigo-900 hover:bg-indigo-50"
    : "bg-indigo-600 text-white hover:bg-indigo-700";

  const navItems = [
    { label: "Home", href: "/" },
    { label: "Shop", href: "/shop" },
    { label: "Leaderboard", href: "/leaderboard" },
    { label: "About Us", href: "/about" },
    { label: "Partners", href: "/partners" },
    { label: "Contact", href: "/contact" },
  ];

  return (
    <nav className={navClass}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className={`p-2 rounded-lg transition-colors ${isTransparent ? 'bg-white/10 text-white' : 'bg-indigo-600 text-white'}`}>
              <ShoppingBag size={20} />
            </div>
            <span className={`text-xl font-display font-bold tracking-tight transition-colors ${logoTextClass}`}>
              ThinkMart
            </span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${textClass} transition font-medium text-sm tracking-wide`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center gap-4">
            <Link
              href="/auth/login"
              className={`font-medium text-sm ${textClass}`}
            >
              Login
            </Link>
            <Link
              href="/auth/register"
              className={`px-5 py-2.5 rounded-full font-medium transition shadow-lg ${isTransparent ? 'shadow-black/10' : 'shadow-indigo-200'} ${buttonClass}`}
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center">
            <button onClick={() => setIsOpen(!isOpen)} className={isTransparent ? "text-white" : "text-gray-600"}>
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-white border-t p-4 space-y-4 shadow-lg absolute w-full">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block text-gray-600 hover:text-indigo-600 font-medium py-2"
              onClick={() => setIsOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <div className="pt-4 border-t flex flex-col gap-3">
            <Link
              href="/auth/login"
              className="w-full text-center py-2 border rounded-lg text-gray-600"
              onClick={() => setIsOpen(false)}
            >
              Login
            </Link>
            <Link
              href="/auth/register"
              className="w-full text-center py-2 bg-indigo-600 text-white rounded-lg"
              onClick={() => setIsOpen(false)}
            >
              Sign Up Free
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};