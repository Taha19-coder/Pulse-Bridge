'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Navbar from '@/components/Navbar';
import ReportExplainerView from '@/components/ReportExplainerView';
import DoctorFinderView from '@/components/DoctorFinderView';
import BloodNetworkView from '@/components/BloodNetworkView';
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Activity,
  CheckCircle2,
  Droplets,
  FileText,
  HeartPulse,
  MapPin,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import { Language } from '@/types';

const copy = {
  en: {
    heroEyebrow: '',
    heroTitle: 'HEALTHCARE',
    heroSubtitle: 'MADE CLEARER.',
    heroDescription:
      'Understand your reports, explore doctors, and find blood donor support — all in one place.',
    primaryAction: 'Explore services',
    secondaryAction: 'How it works',
    heroNotes: [
      ['ENGLISH + اردو', 'Support in your language'],
      ['CARE, CONNECTED', 'Three useful tools. One place.'],
    ],
    serviceEyebrow: 'Care & wellness services',
    serviceHeading: 'The right support for your next step.',
    serviceDescription:
      'Start with what you need today. Each service is designed to make the next step easier to understand.',
    services: [
      {
        eyebrow: 'UNDERSTAND',
        title: 'Medical report guide',
        description:
          'Turn lab results into clear, approachable explanations in English or Urdu.',
        action: 'Explore report tools',
      },
      {
        eyebrow: 'DISCOVER',
        title: 'Find a doctor',
        description:
          'Explore doctor listings by specialty, city, consultation fee, and experience.',
        action: 'Browse doctors',
      },
      {
        eyebrow: 'CONNECT',
        title: 'Blood donor support',
        description:
          'Look for compatible donors or share an urgent blood request with the network.',
        action: 'Open blood support',
      },
    ],
    aboutEyebrow: 'About Pulse Bridge',
    aboutHeading: 'Healthcare designed around you.',
    aboutDescription:
      'Finding care can feel complicated. Pulse Bridge brings practical health tools together to help you understand information, explore your options, and take a more informed next step.',
    aboutPoints: [
      'Plain-language report guidance',
      'Doctor discovery by your preferences',
      'Community blood donor coordination',
    ],
    aboutAction: 'Learn about Pulse Bridge',
    processEyebrow: 'A simpler journey',
    processHeading: 'A little more clarity, at every step.',
    processSteps: [
      ['01', 'Choose what you need', 'Open reports, doctors, or blood support.'],
      ['02', 'Share the details', 'Add the information needed for your request.'],
      ['03', 'Review your next step', 'Use the results as a guide for what to do next.'],
    ],
    processAction: 'Get started',
    aboutPageDescription:
      'Pulse Bridge brings practical digital health tools together in one place. Our goal is to help people understand medical information and find useful care resources, while encouraging them to consult qualified healthcare professionals for medical decisions.',
    aboutValues: [
      ['Clear information', 'Understand reports with plain-language guidance in English or Urdu.'],
      ['Useful connections', 'Explore doctor listings and blood donor support in one place.'],
      ['People-first design', 'Access straightforward tools designed around everyday needs.'],
    ],
    footer:
      'Health information is educational and does not replace advice from a qualified healthcare professional.',
  },
  ur: {
    heroEyebrow: 'صحت کی بہتر اور مربوط سہولت',
    heroTitle: 'صحت کی سہولت',
    heroSubtitle: 'اب زیادہ آسان۔',
    heroDescription:
      'اپنی رپورٹس سمجھیں، ڈاکٹر تلاش کریں، اور خون کے عطیہ کنندگان کی مدد حاصل کریں — سب ایک جگہ۔',
    primaryAction: 'سہولیات دیکھیں',
    secondaryAction: 'طریقہ جانیں',
    heroNotes: [
      ['اردو + انگریزی', 'آپ کی زبان میں رہنمائی'],
      ['صحت کی سہولت', 'تین مفید خدمات، ایک جگہ'],
    ],
    serviceEyebrow: 'صحت اور دیکھ بھال کی خدمات',
    serviceHeading: 'آپ کے اگلے قدم کے لیے درست مدد۔',
    serviceDescription:
      'آج اپنی ضرورت کے مطابق سہولت منتخب کریں۔ ہر خدمت اگلا قدم سمجھنے میں آسانی کے لیے بنائی گئی ہے۔',
    services: [
      {
        eyebrow: 'سمجھیں',
        title: 'میڈیکل رپورٹ کی رہنمائی',
        description: 'لیب رپورٹس کی آسان وضاحت اردو یا انگریزی میں حاصل کریں۔',
        action: 'رپورٹ کی سہولت',
      },
      {
        eyebrow: 'تلاش کریں',
        title: 'ڈاکٹر تلاش کریں',
        description: 'شہر، تخصص، فیس اور تجربے کے مطابق ڈاکٹرز دیکھیں۔',
        action: 'ڈاکٹرز دیکھیں',
      },
      {
        eyebrow: 'رابطہ کریں',
        title: 'خون کے عطیہ کنندگان',
        description: 'مناسب عطیہ کنندہ تلاش کریں یا فوری درخواست بھیجیں۔',
        action: 'خون کی مدد',
      },
    ],
    aboutEyebrow: 'پلس بریج کے بارے میں',
    aboutHeading: 'آپ کی ضروریات کے مطابق صحت کی سہولت۔',
    aboutDescription:
      'صحت کی سہولت تلاش کرنا مشکل ہو سکتا ہے۔ پلس بریج مفید ڈیجیٹل خدمات ایک جگہ فراہم کرتا ہے تاکہ آپ معلومات سمجھ سکیں، اپنے اختیارات دیکھ سکیں اور بہتر رہنمائی کے ساتھ اگلا قدم اٹھا سکیں۔',
    aboutPoints: [
      'رپورٹس کی آسان زبان میں وضاحت',
      'آپ کی ترجیحات کے مطابق ڈاکٹرز کی تلاش',
      'خون کے عطیہ کنندگان سے رابطہ',
    ],
    aboutAction: 'مزید جانیں',
    processEyebrow: 'آسان طریقہ',
    processHeading: 'ہر قدم پر بہتر رہنمائی۔',
    processSteps: [
      ['۰۱', 'اپنی ضرورت منتخب کریں', 'رپورٹ، ڈاکٹر یا خون کی مدد کھولیں۔'],
      ['۰۲', 'ضروری معلومات دیں', 'اپنی درخواست کے لیے درکار تفصیل شامل کریں۔'],
      ['۰۳', 'اگلا قدم دیکھیں', 'نتائج کو اگلے اقدام کی رہنمائی کے طور پر استعمال کریں۔'],
    ],
    processAction: 'شروع کریں',
    aboutPageDescription:
      'پلس بریج عملی ڈیجیٹل صحت کی سہولیات کو ایک جگہ جمع کرتا ہے۔ ہمارا مقصد لوگوں کو طبی معلومات سمجھنے اور مفید صحت کی سہولیات تلاش کرنے میں مدد دینا ہے، جبکہ طبی فیصلوں کے لیے مستند طبی ماہرین سے مشورہ کرنے کی حوصلہ افزائی بھی کرنا ہے۔',
    aboutValues: [
      ['واضح معلومات', 'انگریزی یا اردو میں آسان رہنمائی کے ساتھ رپورٹس سمجھیں۔'],
      ['مفید رابطے', 'ڈاکٹرز کی فہرست اور خون کے عطیہ کنندگان کی مدد ایک جگہ تلاش کریں۔'],
      ['لوگوں کی ضروریات', 'روزمرہ کی ضروریات کے مطابق سادہ اور قابل رسائی سہولیات۔'],
    ],
    footer:
      'صحت سے متعلق یہ معلومات صرف رہنمائی کے لیے ہیں، طبی ماہر کے مشورے کا متبادل نہیں۔',
  },
};

const serviceIcons = [FileText, Stethoscope, Droplets];
const serviceStyles = [
  {
    icon: 'bg-[#dff2e9] text-[#167a68]',
    number: 'text-[#187863]',
  },
  {
    icon: 'bg-[#dcecf4] text-[#326d8b]',
    number: 'text-[#326d8b]',
  },
  {
    icon: 'bg-[#f8e6e2] text-[#ad5148]',
    number: 'text-[#ad5148]',
  },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<string>('home');
  const [language, setLanguage] = useState<Language>('en');
  const [showBackToTop, setShowBackToTop] = useState(false);
  const text = copy[language];

  useEffect(() => {
    const updateBackToTopVisibility = () => setShowBackToTop(window.scrollY > 400);
    updateBackToTopVisibility();
    window.addEventListener('scroll', updateBackToTopVisibility, { passive: true });

    return () => window.removeEventListener('scroll', updateBackToTopVisibility);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ur' ? 'rtl' : 'ltr';

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.12 }
    );

    const elements = document.querySelectorAll('.reveal');
    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [activeTab, language]);

  const openTab = (tab: string) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#f4f6f4] text-[#102b3c]">
      <Navbar
        activeTab={activeTab}
        setActiveTab={openTab}
        language={language}
        setLanguage={setLanguage}
      />

      <main className="flex-1 pb-16">
        {activeTab === 'home' && (
          <div>
            <section className="hero-shell px-3 py-3 sm:px-5 sm:py-5 lg:px-8 lg:py-7">
              <div className="hero-panel relative mx-auto flex min-h-[650px] max-w-[1440px] flex-col overflow-hidden rounded-[1.7rem] border-[3px] border-white/35 px-5 pb-8 pt-8 text-white shadow-[0_26px_80px_rgba(27,65,91,0.2)] sm:min-h-[700px] sm:px-10 sm:pt-10 lg:min-h-[740px] lg:px-14">
                <div className="hero-grid pointer-events-none absolute inset-0 opacity-50" />
                <div className="hero-glow hero-glow-one pointer-events-none absolute -left-28 -top-32 h-96 w-96 rounded-full" />
                <div className="hero-glow hero-glow-two pointer-events-none absolute -bottom-36 -right-20 h-[30rem] w-[30rem] rounded-full" />

                {text.heroEyebrow && (
                  <div className="relative z-10 flex items-center justify-center">
                    <span className={`inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[10px] font-bold tracking-[0.2em] text-white/90 uppercase backdrop-blur-md sm:text-xs ${language === 'ur' ? 'font-urdu tracking-normal' : ''}`}>
                      <Sparkles className="h-3.5 w-3.5 text-[#d3f36b]" />
                      {text.heroEyebrow}
                    </span>
                  </div>
                )}

                <div className="relative z-10 mx-auto mt-10 w-full max-w-6xl text-center sm:mt-12">
                  <div className="relative">
                    <h1 className={`hero-title relative z-10 ${language === 'ur' ? 'font-display text-5xl font-medium uppercase leading-[1.8] text-white sm:text-6xl lg:text-7xl font-urdu' : 'hero-title-english flex items-center justify-center gap-[0.025em] whitespace-nowrap font-display text-[clamp(2rem,10vw,10rem)] font-medium uppercase leading-none text-white'}`}>
                      {language === 'ur' ? (
                        text.heroTitle
                      ) : (
                        <>
                          <span>HEALTH</span>
                          <Image
                            src="/images/heart-red.png"
                            alt="Red anatomical heart"
                            width={452}
                            height={684}
                            className="h-[1.35em] w-auto shrink-0 object-contain drop-shadow-[0_14px_28px_rgba(239,68,68,0.42)]"
                          />
                          <span>CARE</span>
                        </>
                      )}
                    </h1>
                  </div>
                  <p className={`relative z-10 mt-5 font-display text-2xl font-semibold tracking-[0.14em] text-[#d5f36c] sm:text-4xl lg:text-5xl ${language === 'ur' ? 'font-urdu tracking-normal' : ''}`}>
                    {text.heroSubtitle}
                  </p>
                  <p className={`relative z-10 mx-auto mt-5 max-w-xl text-sm leading-7 text-blue-50/85 sm:text-base ${language === 'ur' ? 'font-urdu text-base leading-[2.2]' : ''}`}>
                    {text.heroDescription}
                  </p>

                  <div className="relative z-10 mt-7 flex flex-wrap items-center justify-center gap-3 sm:mt-9">
                    <button
                      type="button"
                      onClick={() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })}
                      className={`group inline-flex items-center gap-2 rounded-full bg-[#d4f36b] px-6 py-3.5 text-sm font-bold text-[#18354a] shadow-[0_8px_24px_rgba(212,243,107,0.18)] transition hover:-translate-y-0.5 hover:bg-[#e2ff80] focus:outline-none focus:ring-2 focus:ring-white/80 focus:ring-offset-2 focus:ring-offset-[#28577a] ${language === 'ur' ? 'font-urdu' : ''}`}
                    >
                      {text.primaryAction}
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
                      className={`inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15 ${language === 'ur' ? 'font-urdu' : ''}`}
                    >
                      {text.secondaryAction}
                    </button>
                  </div>
                </div>

                <div className="relative z-10 mt-auto grid gap-3 pt-10 sm:grid-cols-2 sm:pt-14">
                  {text.heroNotes.map(([title, detail], index) => (
                    <div
                      key={title}
                      className={`flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.09] px-4 py-3 backdrop-blur-md sm:max-w-[275px] ${index === 1 ? 'sm:ms-auto' : ''}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d4f36b]/15 text-[#d4f36b]">
                        {index === 0 ? <ShieldCheck className="h-5 w-5" /> : <HeartPulse className="h-5 w-5" />}
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-[10px] font-extrabold tracking-[0.13em] text-white uppercase ${language === 'ur' ? 'font-urdu tracking-normal' : ''}`}>{title}</span>
                        <span className={`mt-1 block text-xs text-blue-100/80 ${language === 'ur' ? 'font-urdu' : ''}`}>{detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section id="services" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
              <div className="mx-auto max-w-7xl">
                <div className="reveal mx-auto mb-10 max-w-2xl text-center sm:mb-14">
                  <p className={`text-xs font-extrabold tracking-[0.2em] text-[#267965] uppercase ${language === 'ur' ? 'font-urdu tracking-normal' : ''}`}>{text.serviceEyebrow}</p>
                  <h2 className={`mt-3 font-display text-3xl font-semibold tracking-tight text-[#183b50] sm:text-5xl ${language === 'ur' ? 'font-urdu leading-[2]' : ''}`}>{text.serviceHeading}</h2>
                  <p className={`mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-600 sm:text-base ${language === 'ur' ? 'font-urdu text-base leading-[2.2]' : ''}`}>{text.serviceDescription}</p>
                </div>

                <div className="grid gap-5 md:grid-cols-3">
                  {text.services.map((service, index) => {
                    const Icon = serviceIcons[index];
                    const style = serviceStyles[index];
                    const tab = ['reports', 'doctors', 'blood'][index];

                    return (
                      <button
                        key={service.title}
                        type="button"
                        onClick={() => openTab(tab)}
                        className={`reveal group relative min-h-[285px] overflow-hidden rounded-[2rem] border-2 border-[#d5e0e7] bg-white p-6 text-start shadow-[0_16px_44px_rgba(28,64,78,0.07)] transition duration-500 ease-out hover:z-10 hover:-translate-y-3 hover:scale-[1.02] hover:border-[#416f90] hover:shadow-[0_28px_64px_rgba(28,64,78,0.18)] focus-visible:z-10 focus:outline-none focus:ring-2 focus:ring-[#267965] focus:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100 sm:p-8`}
                      >
                        <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${style.icon}`}>
                          <Icon className="h-6 w-6" strokeWidth={1.8} />
                        </span>
                        <span className={`mt-7 block text-[10px] font-extrabold tracking-[0.18em] ${style.number} ${language === 'ur' ? 'font-urdu tracking-normal' : ''}`}>{service.eyebrow}</span>
                        <span className={`mt-2 block font-display text-2xl font-semibold text-[#183b50] ${language === 'ur' ? 'font-urdu' : ''}`}>{service.title}</span>
                        <span className={`mt-3 block text-sm leading-6 text-slate-600 ${language === 'ur' ? 'font-urdu text-base leading-[2.1]' : ''}`}>{service.description}</span>
                        <span className={`mt-7 inline-flex items-center gap-2 text-sm font-bold text-[#176d5c] ${language === 'ur' ? 'font-urdu' : ''}`}>
                          {service.action}
                          <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="overflow-hidden bg-[#e8eef0] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
              <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
                <div className="reveal">
                  <p className={`text-xs font-extrabold tracking-[0.2em] text-[#267965] uppercase ${language === 'ur' ? 'font-urdu tracking-normal' : ''}`}>{text.aboutEyebrow}</p>
                  <h2 className={`mt-4 max-w-xl font-display text-4xl font-semibold leading-tight tracking-tight text-[#183b50] sm:text-5xl ${language === 'ur' ? 'font-urdu leading-[1.8]' : ''}`}>{text.aboutHeading}</h2>
                  <p className={`mt-5 max-w-xl text-sm leading-7 text-slate-600 sm:text-base ${language === 'ur' ? 'font-urdu text-base leading-[2.2]' : ''}`}>{text.aboutDescription}</p>
                  <ul className="mt-7 space-y-3">
                    {text.aboutPoints.map((point) => (
                      <li key={point} className={`flex items-start gap-3 text-sm font-medium text-[#315164] ${language === 'ur' ? 'font-urdu text-base' : ''}`}>
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#23826d]" />
                        {point}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => openTab('about')}
                    className={`mt-8 inline-flex items-center gap-2 rounded-full bg-[#183b50] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#245a70] ${language === 'ur' ? 'font-urdu' : ''}`}
                  >
                    {text.aboutAction}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="reveal relative mx-auto w-full max-w-2xl">
                  <div className="relative min-h-[390px] overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#4f7f9e] via-[#366b8a] to-[#1d4968] p-5 shadow-[0_25px_60px_rgba(29,73,104,0.2)] sm:min-h-[460px] sm:p-8">
                    <div className="hero-grid pointer-events-none absolute inset-0 opacity-40" />
                    <div className="absolute -right-12 -top-14 h-56 w-56 rounded-full bg-[#c4e87a]/15 blur-3xl" />
                    <div className="relative grid min-h-[350px] grid-cols-2 grid-rows-2 gap-3 sm:min-h-[400px] sm:gap-4">
                      <div className="flex flex-col justify-between rounded-[1.5rem] border border-white/15 bg-white/10 p-4 backdrop-blur-md sm:p-6">
                        <FileText className="h-7 w-7 text-[#d4f36b]" />
                        <div>
                          <p className="text-[10px] font-bold tracking-[0.16em] text-blue-100/70 uppercase">01 / Understand</p>
                          <p className={`mt-2 font-display text-lg font-semibold text-white sm:text-2xl ${language === 'ur' ? 'font-urdu' : ''}`}>{text.services[0].title}</p>
                        </div>
                      </div>
                      <div className="mt-7 flex flex-col justify-between rounded-[1.5rem] border border-white/15 bg-[#d4f36b] p-4 text-[#19394b] sm:mt-10 sm:p-6">
                        <Activity className="h-7 w-7 text-[#217563]" />
                        <div>
                          <p className="text-[10px] font-bold tracking-[0.16em] text-[#427267] uppercase">02 / Explore</p>
                          <p className={`mt-2 font-display text-lg font-semibold sm:text-2xl ${language === 'ur' ? 'font-urdu' : ''}`}>{text.services[1].title}</p>
                        </div>
                      </div>
                      <div className="-mt-7 flex flex-col justify-between rounded-[1.5rem] border border-white/15 bg-[#f4f7f2] p-4 text-[#19394b] sm:-mt-10 sm:p-6">
                        <MapPin className="h-7 w-7 text-[#397c90]" />
                        <div>
                          <p className="text-[10px] font-bold tracking-[0.16em] text-slate-500 uppercase">03 / Connect</p>
                          <p className={`mt-2 font-display text-lg font-semibold sm:text-2xl ${language === 'ur' ? 'font-urdu' : ''}`}>{text.services[2].title}</p>
                        </div>
                      </div>
                      <div className="flex flex-col justify-between rounded-[1.5rem] border border-white/15 bg-white/10 p-4 backdrop-blur-md sm:p-6">
                        <HeartPulse className="h-7 w-7 text-[#d4f36b]" />
                        <div>
                          <p className={`text-sm leading-6 text-white/90 sm:text-base ${language === 'ur' ? 'font-urdu' : ''}`}>{text.heroDescription}</p>
                        </div>
                      </div>
                    </div>
                    <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[5px] border-[#e8eef0] bg-[#183b50] text-[#d4f36b] shadow-lg sm:h-20 sm:w-20">
                      <HeartPulse className="h-7 w-7 sm:h-9 sm:w-9" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section id="how-it-works" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
              <div className="mx-auto max-w-7xl">
                <div className="reveal mb-10 flex flex-col gap-4 sm:mb-12 sm:flex-row sm:items-end sm:justify-between">
                  <div className="max-w-2xl">
                    <p className={`text-xs font-extrabold tracking-[0.2em] text-[#267965] uppercase ${language === 'ur' ? 'font-urdu tracking-normal' : ''}`}>{text.processEyebrow}</p>
                    <h2 className={`mt-3 font-display text-3xl font-semibold tracking-tight text-[#183b50] sm:text-5xl ${language === 'ur' ? 'font-urdu leading-[2]' : ''}`}>{text.processHeading}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => openTab('reports')}
                    className={`inline-flex w-fit items-center gap-2 rounded-full border border-[#cbd8d9] bg-white px-5 py-3 text-sm font-bold text-[#183b50] transition hover:border-[#267965] hover:text-[#176d5c] ${language === 'ur' ? 'font-urdu' : ''}`}
                  >
                    {text.processAction}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {text.processSteps.map(([number, title, description]) => (
                    <article key={number} className="reveal rounded-[1.5rem] border border-[#dce5e4] bg-white p-6 shadow-[0_12px_36px_rgba(28,64,78,0.05)] sm:p-8">
                      <span className="font-display text-sm font-bold tracking-[0.16em] text-[#3d8a75]">{number}</span>
                      <h3 className={`mt-7 font-display text-xl font-semibold text-[#183b50] sm:text-2xl ${language === 'ur' ? 'font-urdu' : ''}`}>{title}</h3>
                      <p className={`mt-3 text-sm leading-6 text-slate-600 ${language === 'ur' ? 'font-urdu text-base leading-[2.1]' : ''}`}>{description}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="px-4 sm:px-6 lg:px-8">
            <ReportExplainerView language={language} />
          </div>
        )}

        {activeTab === 'doctors' && (
          <div className="px-4 sm:px-6 lg:px-8">
            <DoctorFinderView />
          </div>
        )}

        {activeTab === 'blood' && (
          <div className="px-4 sm:px-6 lg:px-8">
            <BloodNetworkView />
          </div>
        )}

        {activeTab === 'about' && (
          <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <div className="reveal grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
              <div>
                <p className={`text-xs font-extrabold tracking-[0.2em] text-[#267965] uppercase ${language === 'ur' ? 'font-urdu tracking-normal' : ''}`}>{text.aboutEyebrow}</p>
                <h1 className={`mt-4 font-display text-4xl font-semibold leading-tight tracking-tight text-[#183b50] sm:text-5xl ${language === 'ur' ? 'font-urdu leading-[1.8]' : ''}`}>{text.aboutHeading}</h1>
              </div>
              <div>
                <p className={`text-base leading-8 text-slate-600 ${language === 'ur' ? 'font-urdu text-lg leading-[2.2]' : ''}`}>{text.aboutPageDescription}</p>
                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  {text.aboutValues.map(([title, description]) => (
                    <article key={title} className="rounded-2xl border border-[#dce5e4] bg-white p-5 shadow-sm">
                      <h2 className={`font-display text-lg font-semibold text-[#183b50] ${language === 'ur' ? 'font-urdu' : ''}`}>{title}</h2>
                      <p className={`mt-2 text-sm leading-6 text-slate-600 ${language === 'ur' ? 'font-urdu' : ''}`}>{description}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {showBackToTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label={language === 'ur' ? 'اوپر جائیں' : 'Back to top'}
          title={language === 'ur' ? 'اوپر جائیں' : 'Back to top'}
          className="fixed bottom-24 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#183b50] text-white shadow-lg transition hover:-translate-y-1 hover:bg-[#267965] focus:outline-none focus:ring-2 focus:ring-[#267965] focus:ring-offset-2"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}

      <footer className="bg-[#163c56] px-4 py-9 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-start">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#d4f36b] text-[#183b50]">
              <HeartPulse className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-bold tracking-[0.12em]">
              PULSE<span className="text-[#d4f36b]">BRIDGE</span>
            </span>
          </div>
          <p className={`max-w-2xl text-xs leading-6 text-blue-100/80 sm:text-sm ${language === 'ur' ? 'font-urdu' : ''}`}>{text.footer}</p>
        </div>
      </footer>
    </div>
  );
}
