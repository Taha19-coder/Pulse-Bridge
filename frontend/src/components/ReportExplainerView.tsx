'use client';

import React, { useState } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, HelpCircle, Apple, ShieldAlert, Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { explainReport } from '@/lib/api';
import { ReportExplanationResponse, Language } from '@/types';

interface Props {
  language: Language;
}

const SAMPLE_CBC_REPORT = `
PATIENT DIAGNOSTIC LABORATORY REPORT
Test: Complete Blood Picture (CBC)
Specimen: Whole Blood EDTA

PARAMETER                RESULT      UNIT        REFERENCE RANGE
Hemoglobin               9.2         g/dL        12.0 - 15.5
WBC Count                6,800       /uL         4,000 - 11,000
Platelet Count           210,000     /uL         150,000 - 450,000
RBC Count                3.8         x10^6/uL    4.2 - 5.4
Hematocrit (PCV)         31.5        %           36.0 - 46.0
`;

const SAMPLE_LIPID_REPORT = `
BIOCHEMISTRY LABORATORY REPORT
Test: Fasting Lipid Profile & Glucose
Specimen: Serum

PARAMETER                RESULT      UNIT        REFERENCE RANGE
Total Cholesterol        245         mg/dL       < 200
Triglycerides            190         mg/dL       < 150
Blood Glucose (Fasting)  95          mg/dL       70 - 100
Serum Creatinine         0.9         mg/dL       0.6 - 1.2
`;

export default function ReportExplainerView({ language }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(language);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportExplanationResponse | null>(null);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(true);

  // Sync prop language when changed in navbar
  React.useEffect(() => {
    setSelectedLanguage(language);
  }, [language]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError('Please select or drag a medical report file (PDF, PNG, JPG).');
      return;
    }
    if (!disclaimerAccepted) {
      setError('You must acknowledge the clinical safety disclaimer.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await explainReport(file, selectedLanguage);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'An error occurred while analyzing the report.');
    } finally {
      setLoading(false);
    }
  };

  const loadSample = (sampleText: string, sampleFilename: string) => {
    const blob = new Blob([sampleText], { type: 'text/plain' });
    const sampleFile = new File([blob], sampleFilename, { type: 'text/plain' });
    setFile(sampleFile);
    setError(null);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto py-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-slate-800 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-300 text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5 text-teal-400" /> Multimodal Clinical Document AI
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Medical Report Explainer
          </h1>
          <p className="mt-3 text-slate-300 text-sm sm:text-base leading-relaxed">
            Translate complex lab test values into clear, compassionate language in English or Urdu.
            Understand out-of-range indicators and receive educated questions for your physician.
          </p>
        </div>
      </div>

      {/* Main Upload Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Upload Diagnostic Document</h2>
            <p className="text-xs text-slate-500">Supports PDF, PNG, JPG or WebP up to 10MB</p>
          </div>

          {/* Quick Demo Pre-load Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">Demo Presets:</span>
            <button
              onClick={() => loadSample(SAMPLE_CBC_REPORT, 'cbc_sample_anemia.txt')}
              className="text-xs px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 font-semibold transition-colors"
            >
              📄 Sample CBC (Low Hb)
            </button>
            <button
              onClick={() => loadSample(SAMPLE_LIPID_REPORT, 'lipid_profile_sample.txt')}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 font-semibold transition-colors"
            >
              📄 Sample Lipid Profile
            </button>
          </div>
        </div>

        {/* Dropzone */}
        <div className="mt-6">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-teal-500 rounded-2xl p-8 cursor-pointer transition-all bg-slate-50/50 hover:bg-teal-50/20 group">
            <div className="w-14 h-14 rounded-2xl bg-teal-100/80 text-teal-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <UploadCloud className="w-7 h-7" />
            </div>
            <p className="mt-4 text-sm font-bold text-slate-800">
              {file ? file.name : 'Click to select or drag and drop your report here'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {file ? `${(file.size / 1024).toFixed(1)} KB selected` : 'Encrypted & analyzed in-memory. Zero patient data sold.'}
            </p>
            <input
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
              onChange={handleFileUpload}
            />
          </label>
        </div>

        {/* Options & Action Row */}
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4">
          {/* Language Toggle */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-600">Explanation Language:</span>
            <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setSelectedLanguage('en')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                  selectedLanguage === 'en' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setSelectedLanguage('ur')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                  selectedLanguage === 'ur' ? 'bg-teal-700 text-white shadow-xs' : 'text-slate-500'
                }`}
              >
                اردو (Nastaliq)
              </button>
            </div>
          </div>

          {/* Analyze Button */}
          <button
            onClick={handleAnalyze}
            disabled={loading || !file}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold text-sm shadow-md shadow-teal-600/20 transition-all cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Analyzing Report...
              </>
            ) : (
              <>
                Explain Report <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {/* Disclaimer Checkbox */}
        <div className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            id="disclaimer-check"
            checked={disclaimerAccepted}
            onChange={(e) => setDisclaimerAccepted(e.target.checked)}
            className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
          />
          <label htmlFor="disclaimer-check" className="text-xs text-slate-500 cursor-pointer">
            I acknowledge that this AI provides educational literacy only and is not a medical diagnosis.
          </label>
        </div>

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Analysis Results View */}
      {result && (
        <div className="space-y-6 animate-in fade-in duration-500">
          {/* Title & Category Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-600">
                {result.detected_category}
              </span>
              <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">
                {result.report_title}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {result.biomarkers.length} Parameters Measured
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">
                Language: {result.language.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Structured Biomarkers Grid */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-teal-600" /> Extracted Laboratory Parameters
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {result.biomarkers.map((b, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border transition-all ${
                    b.status === 'LOW'
                      ? 'bg-amber-50/60 border-amber-200'
                      : b.status === 'ELEVATED'
                      ? 'bg-rose-50/60 border-rose-200'
                      : 'bg-slate-50/60 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800">{b.name}</span>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        b.status === 'LOW'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : b.status === 'ELEVATED'
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>
                  <div className="mt-2 text-lg font-extrabold text-slate-900">
                    {b.observed_value}
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    Normal Reference: <span className="font-semibold text-slate-700">{b.reference_range}</span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-600 leading-snug">
                    {b.clinical_note_layman}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Bilingual Layperson Explanation Card */}
          <div
            className={`bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 ${
              result.language === 'ur' ? 'font-urdu' : ''
            }`}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {result.language === 'ur' ? 'آسان زبان میں طبی خلاصہ' : 'Layperson Understanding Summary'}
              </h3>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  {result.language === 'ur' ? 'غیر معمولی نتائج کا جائزہ' : 'Review of Out-of-Range Markers'}
                </h4>
                <p className="text-sm text-slate-800 leading-relaxed font-medium">
                  {result.abnormal_findings_summary}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-teal-50/50 border border-teal-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-teal-700 mb-1">
                  {result.language === 'ur' ? 'عمومی طبی تجزیہ' : 'Overall Health Insight'}
                </h4>
                <p className="text-sm text-slate-800 leading-relaxed">
                  {result.overall_health_insight}
                </p>
              </div>
            </div>

            {/* Questions to Ask Doctor */}
            {result.suggested_questions_for_doctor && result.suggested_questions_for_doctor.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-teal-600" />
                  {result.language === 'ur' ? 'اپنے معالج (ڈاکٹر) سے پوچھنے کے لیے سوالات' : 'Smart Questions to Ask Your Doctor'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {result.suggested_questions_for_doctor.map((q, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 flex items-start gap-2"
                    >
                      <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 font-bold text-[10px]">
                        {idx + 1}
                      </span>
                      <span>{q}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Mandatory Safety Notice Banner */}
          <div className="p-5 rounded-2xl bg-amber-50/90 border border-amber-300 text-amber-950 flex items-start gap-3 shadow-xs">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed font-medium">
              <span className="font-bold">MANDATORY CLINICAL SAFETY NOTICE: </span>
              {result.mandatory_disclaimer}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
