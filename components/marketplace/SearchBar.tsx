'use client';

/**
 * SearchBar Component
 * 
 * Full-featured search bar with autocomplete suggestions,
 * debounced search, and keyboard navigation.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2 } from 'lucide-react';
import { getSuggestions } from '@/services/search.service';

interface SearchBarProps {
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
    onSearch?: (query: string) => void;
}

export function SearchBar({
    placeholder = 'Search products...',
    className = '',
    autoFocus = false,
    onSearch,
}: SearchBarProps) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<{ text: string; highlighted: string }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    // Debounced suggestion fetch
    useEffect(() => {
        if (query.length < 2) {
            setSuggestions([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsLoading(true);
            try {
                const results = await getSuggestions(query, 5);
                setSuggestions(results);
            } catch (error) {
                console.error('Suggestion error:', error);
            } finally {
                setIsLoading(false);
            }
        }, 200); // 200ms debounce

        return () => clearTimeout(timer);
    }, [query]);

    const handleSubmit = useCallback((searchQuery: string) => {
        if (!searchQuery.trim()) return;

        setShowSuggestions(false);

        if (onSearch) {
            onSearch(searchQuery);
        } else {
            router.push(`/dashboard/user/marketplace/search?q=${encodeURIComponent(searchQuery)}`);
        }
    }, [onSearch, router]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showSuggestions || suggestions.length === 0) {
            if (e.key === 'Enter') {
                handleSubmit(query);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, -1));
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0) {
                    handleSubmit(suggestions[selectedIndex].text);
                } else {
                    handleSubmit(query);
                }
                break;
            case 'Escape':
                setShowSuggestions(false);
                setSelectedIndex(-1);
                break;
        }
    };

    const handleClear = () => {
        setQuery('');
        setSuggestions([]);
        inputRef.current?.focus();
    };

    return (
        <div className={`relative ${className}`}>
            <div className="relative">
                {/* Search Icon */}
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {isLoading ? (
                        <Loader2 size={20} className="animate-spin" />
                    ) : (
                        <Search size={20} />
                    )}
                </div>

                {/* Input */}
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setShowSuggestions(true);
                        setSelectedIndex(-1);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => {
                        // Delay to allow click on suggestion
                        setTimeout(() => setShowSuggestions(false), 200);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    className="w-full pl-10 pr-10 py-3 bg-gray-100 border border-gray-200 rounded-xl 
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                     text-gray-800 placeholder-gray-400 transition-all"
                />

                {/* Clear Button */}
                {query && (
                    <button
                        onClick={handleClear}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                    >
                        <X size={18} />
                    </button>
                )}
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {suggestions.map((suggestion, index) => (
                        <button
                            key={suggestion.text}
                            onClick={() => handleSubmit(suggestion.text)}
                            onMouseEnter={() => setSelectedIndex(index)}
                            className={`w-full px-4 py-3 text-left flex items-center gap-3 transition
                ${index === selectedIndex ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                        >
                            <Search size={16} className="text-gray-400 flex-shrink-0" />
                            <span
                                className="text-gray-700"
                                dangerouslySetInnerHTML={{ __html: suggestion.highlighted }}
                            />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Compact SearchBar for header/navbar
 */
export function CompactSearchBar() {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!isExpanded) {
        return (
            <button
                onClick={() => setIsExpanded(true)}
                className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition"
                aria-label="Search"
            >
                <Search size={20} className="text-gray-600" />
            </button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start pt-20 px-4">
            <div className="w-full max-w-xl mx-auto bg-white rounded-2xl shadow-2xl p-4">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-gray-800">Search Products</h3>
                    <button
                        onClick={() => setIsExpanded(false)}
                        className="p-1 rounded-full hover:bg-gray-100 transition"
                    >
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>
                <SearchBar autoFocus onSearch={() => setIsExpanded(false)} />
            </div>
        </div>
    );
}
