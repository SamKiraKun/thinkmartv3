'use client';

import HeroSection from '@/components/landing/HeroSection';
import ValuePropsGrid from '@/components/landing/ValuePropsGrid';
import FeatureCards from '@/components/landing/FeatureCards';
import CategoryCircles from '@/components/landing/CategoryCircles';
import ProblemSection from '@/components/landing/ProblemSection';
import TestimonialsSection from '@/components/landing/TestimonialsSection';
import ProductShowcase from '@/components/landing/ProductShowcase';
import ComparisonSection from '@/components/landing/ComparisonSection';
import CTABanner from '@/components/landing/CTABanner';
import InfoSection from '@/components/landing/InfoSection';
import FinalCTA from '@/components/landing/FinalCTA'; // Using FinalCTA as Footer ending or modifying

export default function HomePage() {
  return (
    <main className="bg-thinkmart-deep min-h-screen selection:bg-thinkmart-light selection:text-white">
      {/* 1. Header is Global */}

      {/* 2. Hero Section */}
      <HeroSection />

      {/* 3. Value Props (Icons) */}
      <ValuePropsGrid />

      {/* 4. Services/Features (Cards) */}
      <FeatureCards />

      {/* 5. Expert/Categories (Circles) */}
      <CategoryCircles />

      {/* 6. Problem/Concern */}
      <ProblemSection />

      {/* 7. Testimonials (Split) */}
      <TestimonialsSection />

      {/* 8. Products (Grid) */}
      <ProductShowcase />

      {/* 9. Comparison (Before/After) */}
      <ComparisonSection />

      {/* 10. CTA Banner */}
      <CTABanner />

      {/* 11. Info/About Section */}
      <InfoSection />

      {/* 12. Footer is Global, but adding final spacer/CTA if needed */}
      <div className="pb-12" />
    </main>
  );
}