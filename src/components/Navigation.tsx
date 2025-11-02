'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';

export default function Navigation() {
  const [user, setUser] = useState<{ name: string|null, email: string|null } | null>(null);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        const data = await res.json();
        if (mounted) setUser(data?.authenticated ? { name: data.user?.name ?? null, email: data.user?.email ?? null } : null);
      } catch { if (mounted) setUser(null); }
    };
    load();
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b">
      <div className="container-page px-4 py-3 flex flex-row gap-x-3 items-center h-16">
        <div className="flex-1 min-w-0 flex items-center gap-8 overflow-hidden">
          <Link href="/" className="flex items-center space-x-3 min-w-0">
            <span className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 p-1 flex items-center justify-center">
              <Image src="/logo.svg" alt="JobPilot AI" width={1044} height={1044} />
            </span>
            <span className="flex flex-col leading-tight min-w-0">
              <span className="heading text-lg md:text-xl font-extrabold text-gray-900 truncate">JobPilot <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-teal-600">AI</span></span>
              <span className="text-[10px] md:text-xs text-gray-500 truncate">Build · Tailor · Apply — on autopilot</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 flex-shrink-0">
            <Link href="#features" className="text-gray-600 hover:text-gray-900 transition-colors">Features</Link>
            <Link href="#how-it-works" className="text-gray-600 hover:text-gray-900 transition-colors">How it Works</Link>
            <Link href="/jobs" className="text-gray-600 hover:text-gray-900 transition-colors">Find Jobs</Link>
            <Link href="/jdBuilder" className="text-gray-600 hover:text-gray-900 transition-colors">Resume Builder</Link>
          </nav>
        </div>
        <div className="flex items-center flex-shrink-0">
          <Link href="/jobs" className="px-5 py-2 rounded-lg text-white font-medium bg-gradient-to-r from-blue-600 to-teal-600 shadow hover:shadow-md hover:scale-[1.02] active:scale-[0.99] transition-all">Get Started</Link>
        </div>
        <div className="flex flex-row flex-nowrap items-center gap-2 ml-2 flex-shrink-0 max-w-xs">
          {user ? (
            <>
              <span className="hidden md:inline-block text-sm text-gray-600 truncate max-w-[120px]">{user.name || user.email}</span>
              <button
                onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/jdBuilder'; }}
                className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-50"
              >Logout</button>
            </>
          ) : (
            <button
              onClick={() => (window.location.href = '/api/auth/login')}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
            >Login</button>
          )}
        </div>
      </div>
    </header>
  );
}
