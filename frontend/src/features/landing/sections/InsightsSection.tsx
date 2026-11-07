import React from 'react';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { CategoryPill } from '../../../components/ui/CategoryPill';
import { GlowCard } from '../../../components/ui/GlowCard';
import { ArrowUpRight, Clock, BookOpen, Tag } from 'lucide-react';

interface InsightArticle {
  id: string;
  category: string;
  title: string;
  excerpt: string;
  readTime: string;
  date: string;
  tagColor: string;
}

const ARTICLES: InsightArticle[] = [
  {
    id: 'invariants-vs-llms',
    category: 'RESEARCH',
    title: 'Why Mathematical Invariants Beat Stochastic LLMs in Financial Operations',
    excerpt: 'Examining why prompt-engineered LLMs suffer from numerical drift, and how formal arithmetic checksums enforce deterministic accuracy in invoice auditing.',
    readTime: '6 min read',
    date: 'OCT 2024',
    tagColor: 'text-ops-cyan border-ops-cyan/30'
  },
  {
    id: 'sod-cryptography',
    category: 'COMPLIANCE',
    title: 'Segregation of Duties (SoD) in Autonomous Financial Systems: An Architectural Blueprint',
    excerpt: 'How to implement zero-trust dual-custody verification with PostgreSQL Row-Level Security, preventing payment authorization by original document submitters.',
    readTime: '8 min read',
    date: 'NOV 2024',
    tagColor: 'text-ops-blue border-ops-blue/30'
  },
  {
    id: '3way-graph-matching',
    category: 'SYSTEMS',
    title: 'Three-Way Reconciliation at Scale: Graph Matching Algorithms vs Relational Joins',
    excerpt: 'Why topological graph models outperform traditional SQL joins when resolving many-to-many partial shipments, line items, and multi-currency exchange variances.',
    readTime: '10 min read',
    date: 'DEC 2024',
    tagColor: 'text-ops-yellow border-ops-yellow/30'
  },
  {
    id: 'edge-gpu-quantization',
    category: 'ENGINEERING',
    title: 'Optimizing Quantized OCR & HNSW Vector Retrieval on 6GB VRAM Consumer Hardware',
    excerpt: 'Detailed benchmarks and memory budgeting strategies for serving deep learning extraction models on NVIDIA RTX 3050 without cloud data leakage.',
    readTime: '5 min read',
    date: 'JAN 2025',
    tagColor: 'text-emerald-400 border-emerald-400/30'
  }
];

export const InsightsSection: React.FC = () => {
  return (
    <section id="insights" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-white/[0.05] overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-ops-cyan/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div>
            <SectionBadge number="10" total="11" label="OPERATIONAL INSIGHTS" className="mb-4" />
            <CategoryPill label="OUR VALUABLE INSIGHTS" className="mb-4" />
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white max-w-2xl leading-[1.15]">
              Modern Perspectives on <span className="text-ops-gradient">AI-Driven Operations</span>
            </h2>
          </div>
          <p className="text-white/60 text-base sm:text-lg max-w-md font-sans leading-relaxed">
            Deep-dives, whitepapers, and engineering benchmarks on autonomous financial infrastructure and dual-custody compliance.
          </p>
        </div>

        {/* 4 Article Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {ARTICLES.map((art) => (
            <GlowCard key={art.id} className="p-8 sm:p-10 flex flex-col justify-between group cursor-pointer">
              <div>
                <div className="flex items-center justify-between mb-6">
                  <span className={`text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded border bg-white/[0.04] ${art.tagColor}`}>
                    {art.category}
                  </span>
                  <div className="flex items-center gap-3 text-xs font-mono text-white/40">
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {art.readTime}</span>
                    <span>•</span>
                    <span>{art.date}</span>
                  </div>
                </div>

                <h3 className="text-xl sm:text-2xl font-bold text-white mb-4 group-hover:text-ops-cyan transition-colors leading-snug">
                  {art.title}
                </h3>

                <p className="text-sm text-white/60 leading-relaxed mb-8">
                  {art.excerpt}
                </p>
              </div>

              <div className="pt-6 border-t border-white/[0.06] flex items-center justify-between">
                <span className="text-xs font-mono text-white/40 uppercase tracking-wider group-hover:text-white transition-colors">
                  READ FULL WHITEPAPER
                </span>
                <div className="w-8 h-8 rounded-full bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-white/60 group-hover:text-ops-cyan group-hover:border-ops-cyan/40 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
            </GlowCard>
          ))}
        </div>
      </div>
    </section>
  );
};
