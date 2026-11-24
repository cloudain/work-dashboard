import { useState, type FormEvent } from 'react';
import { Lock, Stethoscope } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function AuthGate() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setErrorMsg(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setErrorMsg('Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra lại.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 via-slate-50 to-emerald-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200/80 p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-11 w-11 rounded-xl bg-teal-700 text-white flex items-center justify-center shadow-sm">
            <Stethoscope className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Work Dashboard</h1>
            <p className="text-xs text-slate-500">Lịch làm việc & Tổng kết tài chính</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="doctor@example.com"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          {errorMsg && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold py-2.5 text-sm transition cursor-pointer"
          >
            <Lock className="h-4 w-4" />
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <p className="mt-5 text-[11px] text-center text-slate-400">
          Không gian cá nhân riêng tư — bảo vệ bởi Supabase Auth & Row-Level Security.
        </p>
      </div>
    </div>
  );
}
