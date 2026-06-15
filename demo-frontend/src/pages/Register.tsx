import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Input, Button, Card } from '../components/ui';
import { Sparkles } from 'lucide-react';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname || !email || !password) { setError('请填写所有字段'); return; }
    if (password.length < 6) { setError('密码至少 6 位'); return; }
    setLoading(true);
    setError('');
    try {
      await register(email, password, nickname);
      const onboardingDone = localStorage.getItem('lingualearn_onboarding_done');
      navigate(onboardingDone ? '/' : '/onboarding', { replace: true });
    } catch (err: any) {
      setError(err.message || '注册失败');
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
          创建账户
        </h1>
        <p className="text-sm text-ink-400 mt-1.5 font-[family-name:var(--font-display)]">
          开始你的英语学习之旅
        </p>
      </div>

      {/* Form */}
      <Card padding="lg" className="w-full max-w-sm animate-slide-up">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            inputSize="lg"
            label="昵称"
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="你的昵称"
            autoComplete="name"
            fullWidth
          />

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
            placeholder="至少 6 位"
            autoComplete="new-password"
            helper="密码长度至少 6 位"
            fullWidth
          />

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-sm text-red-300 animate-fade-in">
              {error}
            </div>
          )}

          <Button variant="primary" size="lg" fullWidth loading={loading} type="submit">
            注册
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-sm text-ink-500 font-[family-name:var(--font-display)]">
        已有账户？{' '}
        <Link to="/login" className="text-brand-400 hover:text-brand-300 font-semibold transition-colors">
          立即登录
        </Link>
      </p>
    </div>
  );
}
