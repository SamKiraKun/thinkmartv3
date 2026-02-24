'use client';

import { useEffect, useRef, useState } from 'react';

const FRAME_COUNT = 4;
const IMAGES = [
    '/hero/sequence-1.png',
    '/hero/sequence-2.png',
    '/hero/sequence-3.png',
    '/hero/sequence-4.png',
];

export default function ThinkMartScroll() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [imagesLoaded, setImagesLoaded] = useState(false);
    const imageRefs = useRef<HTMLImageElement[]>([]);

    // Preload images
    useEffect(() => {
        let loadedCount = 0;
        const imgs: HTMLImageElement[] = [];

        IMAGES.forEach((src, index) => {
            const img = new Image();
            img.src = src;
            img.onload = () => {
                loadedCount++;
                if (loadedCount === FRAME_COUNT) {
                    setImagesLoaded(true);
                }
            };
            imgs[index] = img;
        });
        imageRefs.current = imgs;
    }, []);

    // Canvas Drawing Logic
    useEffect(() => {
        if (!imagesLoaded || !canvasRef.current || !containerRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false }); // Optimize for no transparency if possible, but we need blending
        if (!ctx) return;

        let animationFrameId: number;

        const render = () => {
            // 1. Calculate scroll progress relative to the container
            // The container is 400vh tall (defined in parent page), so we track how far we are.
            // However, since this component effectively IS the sticky container, we need to look at window scroll
            // vs the top of the section. 
            // Assuming this component is at the very top of the page:
            const scrollY = window.scrollY;
            const windowHeight = window.innerHeight;
            const totalScrollHeight = windowHeight * 3; // 400vh total -> 300vh scrollable distance

            // Clamp progress 0 to 1
            const progress = Math.min(Math.max(scrollY / totalScrollHeight, 0), 1);

            // 2. Determine frame index
            // We have 4 images. Map 0.0-1.0 to 0-3.
            // We want to crossfade.
            // 0.0 - 0.33: Image 0 -> 1
            // 0.33 - 0.66: Image 1 -> 2
            // 0.66 - 1.0: Image 2 -> 3

            // Scaled progress for segments
            const segmentSize = 1 / (FRAME_COUNT - 1);
            const currentSegment = progress / segmentSize;
            const index1 = Math.floor(currentSegment);
            const index2 = Math.min(index1 + 1, FRAME_COUNT - 1);
            const blend = currentSegment - index1;

            // 3. Clear and Draw
            // Handle resizing
            if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
                // Handle High DPI
                const dpr = window.devicePixelRatio || 1;
                canvas.width = window.innerWidth * dpr;
                canvas.height = window.innerHeight * dpr;
                ctx.scale(dpr, dpr);
                canvas.style.width = `${window.innerWidth}px`;
                canvas.style.height = `${window.innerHeight}px`;
            }

            const width = canvas.width / (window.devicePixelRatio || 1);
            const height = canvas.height / (window.devicePixelRatio || 1);

            // Draw Logic
            const img1 = imageRefs.current[index1];
            const img2 = imageRefs.current[index2];

            if (!img1) return;

            // Object fit: contain logic
            const drawImageProp = (img: HTMLImageElement, globalAlpha = 1) => {
                ctx.globalAlpha = globalAlpha;
                const hRatio = width / img.width;
                const vRatio = height / img.height;
                const ratio = Math.min(hRatio, vRatio); // Contain
                // const ratio = Math.max(hRatio, vRatio); // Cover (if preferred)

                const centerShift_x = (width - img.width * ratio) / 2;
                const centerShift_y = (height - img.height * ratio) / 2;

                ctx.drawImage(
                    img,
                    0,
                    0,
                    img.width,
                    img.height,
                    centerShift_x,
                    centerShift_y,
                    img.width * ratio,
                    img.height * ratio
                );
            };

            // Clear (using theme background for seamless blend)
            ctx.fillStyle = '#2b2f7a';
            ctx.fillRect(0, 0, width, height);

            // Draw base frame
            drawImageProp(img1, 1);

            // Draw next frame with opacity if blending
            if (index1 !== index2) {
                drawImageProp(img2, blend);
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [imagesLoaded]);

    return (
        <div ref={containerRef} className="sticky top-0 h-screen w-full overflow-hidden">
            {/* Placeholder / Loading State */}
            {!imagesLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#2b2f7a]">
                    <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
            )}
            <canvas
                ref={canvasRef}
                className="block h-full w-full object-contain"
                style={{ width: '100%', height: '100vh' }}
            />
        </div>
    );
}
