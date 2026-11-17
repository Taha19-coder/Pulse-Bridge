'use client';

import React, { useState } from 'react';
import Navbar from '@/components/Navbar';
import ReportExplainerView from '@/components/ReportExplainerView';
import DoctorFinderView from '@/components/DoctorFinderView';
import BloodNetworkView from '@/components/BloodNetworkView';
import {
  FileText,
  Stethoscope,
  Heart,
  ShieldCheck,
  Globe2,
  Sparkles,
  ArrowRight,
  Activity,
  CheckCircle2,
  Users,
  MapPin,
  Clock
} from 'lucide-react';
import { Language } from '@/types';

export default function Home() {
  const [activeTab, setActiveTab] = useState<string>('home');
  const [language, setLanguage] = useState<Language>('en');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-teal-500 selection:text-white">
      {/* Top Sticky Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        language={language}
        setLanguage={setLanguage}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {/* TAB: HOME LANDING PAGE */}
        {activeTab === 'home' && (
          <div className="space-y-16">
            {/* Hero Section */}
            <section className="relative overflow-hidden bg-gradient-to-b from-teal-950 via-slate-900 to-slate-900 text-white pt-16 pb-24 px-4 sm:px-6 lg:px-8">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-500/15 via-transparent to-transparent pointer-events-none" />
              <div className="max-w-5xl mx-auto text-center relative z-10 space-y-6">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-300 text-xs font-semibold shadow-inner">
                  <ShieldCheck className="w-4 h-4 text-teal-400" />
                  UN Sustainable Development Goal 03: Good Health & Well-Being
                </div>

                <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.15]">
                  Bridging Health Literacy, Specialist Care &{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-teal-200 to-rose-400">
                    Emergency Blood Access
                  </span>
                </h1>

                <p className="max-w-2xl mx-auto text-slate-300 text-base sm:text-lg leading-relaxed font-normal">
                  Pakistan's premier multimodal healthcare platform. Translate diagnostic lab reports into plain
                  English and Urdu, connect with 2,652 verified doctors, and mobilize voluntary blood donors in seconds.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                  <button
                    onClick={() => setActiveTab('reports')}
                    className="px-6 py-3.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold text-sm shadow-lg shadow-teal-500/25 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <FileText className="w-4 h-4" /> Explain Medical Report
                  </button>
                  <button
                    onClick={() => setActiveTab('doctors')}
                    className="px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-extrabold text-sm border border-white/10 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Stethoscope className="w-4 h-4 text-teal-300" /> Find Verified Doctor
                  </button>
                  <button
                    onClick={() => setActiveTab('blood')}
                    className="px-6 py-3.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white font-extrabold text-sm shadow-lg shadow-rose-600/25 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Heart className="w-4 h-4 fill-white" /> Emergency Blood
                  </button>
                </div>
              </div>
            </section>

            {/* Impact Metric Strip */}
            <section className="max-w-6xl mx-auto px-4 -mt-12 relative z-20">
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 p-6 sm:p-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                <div className="space-y-1">
                  <span className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">2,652</span>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Verified Doctors</p>
                </div>
                <div className="space-y-1">
                  <span className="text-3xl sm:text-4xl font-black text-teal-600 tracking-tight">117</span>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pakistani Cities</p>
                </div>
                <div className="space-y-1">
                  <span className="text-3xl sm:text-4xl font-black text-rose-600 tracking-tight">100%</span>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Zero Hallucinations</p>
                </div>
                <div className="space-y-1">
                  <span className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">EN / UR</span>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Bilingual Support</p>
                </div>
              </div>
            </section>

            {/* 3 Core Pillars Section */}
            <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
              <div className="text-center max-w-2xl mx-auto">
                <h2 className="text-xs font-bold uppercase tracking-wider text-teal-600 mb-2">Three Integrated Pillars</h2>
                <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  Engineered to Eliminate Healthcare Inequity
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Pillar 1 */}
                <div
                  onClick={() => setActiveTab('reports')}
                  className="bg-white rounded-2xl border border-slate-200/80 p-7 shadow-xs hover:shadow-lg hover:border-teal-400 transition-all cursor-pointer flex flex-col justify-between group"
                >
                  <div className="space-y-4">
                    <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold group-hover:scale-105 transition-transform">
                      <FileText className="w-6 h-6" />
                    </div>
                    <h4 className="text-lg font-extrabold text-slate-900 group-hover:text-teal-700 transition-colors">
                      Medical Report Explainer
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Upload PDF or photographed lab reports (CBC, LFT, Lipid, Blood Sugar). Receive structured biomarker
                      ranges, plain-language meanings in English or Urdu, and actionable questions for your physician.
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center text-xs font-bold text-teal-700 gap-1.5 group-hover:gap-2.5 transition-all">
                    Analyze Your Report <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* Pillar 2 */}
                <div
                  onClick={() => setActiveTab('doctors')}
                  className="bg-white rounded-2xl border border-slate-200/80 p-7 shadow-xs hover:shadow-lg hover:border-teal-400 transition-all cursor-pointer flex flex-col justify-between group"
                >
                  <div className="space-y-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center font-bold group-hover:scale-105 transition-transform">
                      <Stethoscope className="w-6 h-6" />
                    </div>
                    <h4 className="text-lg font-extrabold text-slate-900 group-hover:text-teal-700 transition-colors">
                      Doctor Finder (RAG)
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Semantic natural-language query engine grounded in 2,652 verified Pakistani doctors. Filter by city,
                      budget, reviews, and clinical experience with zero artificial fabrication.
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center text-xs font-bold text-teal-700 gap-1.5 group-hover:gap-2.5 transition-all">
                    Find Specialists <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* Pillar 3 */}
                <div
                  onClick={() => setActiveTab('blood')}
                  className="bg-white rounded-2xl border border-slate-200/80 p-7 shadow-xs hover:shadow-lg hover:border-rose-400 transition-all cursor-pointer flex flex-col justify-between group"
                >
                  <div className="space-y-4">
                    <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold group-hover:scale-105 transition-transform">
                      <Heart className="w-6 h-6 fill-rose-600" />
                    </div>
                    <h4 className="text-lg font-extrabold text-slate-900 group-hover:text-rose-700 transition-colors">
                      Smart Blood Network
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Emergency blood matching using ABO/Rh compatibility rules and neighborhood proximity. Connect with
                      active donors via direct pre-filled WhatsApp links with privacy-safe masked phone numbers.
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center text-xs font-bold text-rose-700 gap-1.5 group-hover:gap-2.5 transition-all">
                    Emergency Matcher <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB: MEDICAL REPORT EXPLAINER */}
        {activeTab === 'reports' && (
          <div className="px-4 sm:px-6 lg:px-8">
            <ReportExplainerView language={language} />
          </div>
        )}

        {/* TAB: DOCTOR FINDER (RAG) */}
        {activeTab === 'doctors' && (
          <div className="px-4 sm:px-6 lg:px-8">
            <DoctorFinderView />
          </div>
        )}

        {/* TAB: BLOOD DONOR NETWORK */}
        {activeTab === 'blood' && (
          <div className="px-4 sm:px-6 lg:px-8">
            <BloodNetworkView />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 text-xs py-10 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-white text-sm">PULSE<span className="text-teal-400">BRIDGE</span></span>
            <span>•</span>
            <span>AI for Accessible Healthcare & Well-Being</span>
          </div>

          <div className="text-center sm:text-right text-[11px] leading-relaxed text-slate-500">
            Minhaj University Lahore STCS AI Hackathon 2026 • Aligned with UN SDG 03
            <p className="text-slate-600">Strictly Non-Diagnostic & Non-Prescriptive Educational Platform</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
