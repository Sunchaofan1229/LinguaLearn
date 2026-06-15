import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Input, Button, Card } from '../components/ui';
import { Sparkles, Mail, Lock } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('请填写邮箱和密码'); return; }
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-12">
      {/* Logo */}
      <div className="mb-8 text-center animate-slide-down">
        <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-4">
          <Sparkles size={28} className="text-brand-400" />
        </div>
        <h1 className="text-2xl font-bold text-ink-100 font-[family-name:var(--font-display)]">
          LinguaLearn
        </h1>
        <p className="text-sm text-ink-400 mt-1.5 font-[family-name:var(--font-display)]">
          AI 驱动的英语学习助手
        </p>
      </div>

      {/* Form */}
      <Card padding="lg" className="w-full max-w-sm animate-slide-up">
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-lg font-semibold text-ink-100 text-center font-[family-name:var(--font-display)]">
            登录账户
          </h2>

          <Input
            inputSize="lg"
            label="邮箱"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            autoComplete="email"
            fullWidth
          />

          <Input
            inputSize="lg"
            label="密码"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="输入密码"
            autoComplete="current-password"
            fullWidth
          />

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-sm text-red-300 animate-fade-in">
              {error}
            </div>
          )}

          <Button variant="primary" size="lg" fullWidth loading={loading} type="submit">
            登录
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-sm text-ink-500 font-[family-name:var(--font-display)]">
        还没有账户？{' '}
        <Link to="/register" className="text-brand-400 hover:text-brand-300 font-semibold transition-colors">
          立即注册
        </Link>
      </p>
    </div>
  );
}
