'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageCarouselProps {
    images: string[];
    alt?: string;
}

export function ImageCarousel({ images, alt = 'Product' }: ImageCarouselProps) {
    const [currentIndex, setCurrentIndex] = useState(0);

    if (!images || images.length === 0) {
        return (
            <div className="aspect-square bg-gray-100 rounded-xl flex items-center justify-center">
                <span className="text-gray-400">No image</span>
            </div>
        );
    }

    if (images.length === 1) {
        return (
            <div className="relative aspect-square rounded-xl overflow-hidden border border-gray-200">
                <Image
                    src={images[0]}
                    alt={alt}
                    fill
                    className="object-cover"
                    unoptimized
                />
            </div>
        );
    }

    const goToPrevious = () => {
        setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
    };

    const goToNext = () => {
        setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
    };

    const goToSlide = (index: number) => {
        setCurrentIndex(index);
    };

    return (
        <div className="space-y-3">
            {/* Main Image */}
            <div className="aspect-square rounded-xl overflow-hidden border border-gray-200 relative group">
                <Image
                    src={images[currentIndex]}
                    alt={`${alt} ${currentIndex + 1}`}
                    fill
                    className="object-cover transition-opacity duration-300"
                    unoptimized
                />

                {/* Navigation Arrows */}
                <button
                    onClick={goToPrevious}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Previous image"
                >
                    <ChevronLeft size={20} className="text-gray-700" />
                </button>
                <button
                    onClick={goToNext}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Next image"
                >
                    <ChevronRight size={20} className="text-gray-700" />
                </button>

                {/* Image Counter */}
                <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                    {currentIndex + 1} / {images.length}
                </div>
            </div>

            {/* Thumbnail Strip */}
            <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, idx) => (
                    <button
                        key={idx}
                        onClick={() => goToSlide(idx)}
                        className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition ${idx === currentIndex
                                ? 'border-indigo-600 ring-2 ring-indigo-200'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                    >
                        <Image
                            src={img}
                            alt={`${alt} thumbnail ${idx + 1}`}
                            fill
                            className="object-cover"
                            unoptimized
                        />
                    </button>
                ))}
            </div>
        </div>
    );
}
