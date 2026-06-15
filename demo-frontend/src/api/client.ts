const BASE = '/api/v1';

interface ApiOptions extends RequestInit {
  token?: string;
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { token, ...fetchOpts } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOpts.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...fetchOpts, headers });
  const data = await res.json();

  if (!res.ok) {
    // Token expired or invalid → clear auth and redirect
    if (res.status === 401) {
      localStorage.removeItem('ll_token');
      localStorage.removeItem('ll_user');
      return null as T;
    }
    const detail = data.detail;
    // Handle validation error arrays (422 Unprocessable Entity)
    if (Array.isArray(detail)) {
      const msgs = detail.map((d: any) => d.msg || JSON.stringify(d)).slice(0, 3);
      throw new Error(msgs.join('; '));
    }
    throw new Error(typeof detail === 'string' ? detail : (data.message || `HTTP ${res.status}`));
  }

  return data;
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ access_token: string; token_type: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string, nickname?: string) =>
    request<{ id: string; email: string; nickname: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, nickname }),
    }),

  // User
  getMe: (token: string) =>
    request<{ id: string; email: string; nickname: string; cefr_level: string }>('/users/me', { token }),

  // Assessment
  getQuestions: (token: string) =>
    request<Array<{
      id: string; type: string; prompt: string;
      options?: Array<{ key: string; text: string }>;
    }>>('/assessment/questions', { token }),

  submitAssessment: (token: string, answers: Array<{ question_id: string; user_answer: string }>) =>
    request<{ cefr_level: string; listening_score: number; reading_score: number; speaking_score: number; writing_score: number; grammar_score: number; recommendations: string[] }>('/assessment/submit', {
      method: 'POST', token,
      body: JSON.stringify({ answers }),
    }),

  getResults: (token: string) =>
    request<Array<{ id: string; cefr_level: string; score: number; total: number; created_at: string }>>('/assessment/results', { token }),

  // Chat
  chat: (token: string, message: string, cefrLevel: string) =>
    request<{ reply: string }>('/llm/chat', {
      method: 'POST', token,
      body: JSON.stringify({ message, cefr_level: cefrLevel }),
    }),

  // Translate
  translate: (token: string, text: string, direction: string) =>
    request<{ translation: string; explanation?: string }>('/llm/translate', {
      method: 'POST', token,
      body: JSON.stringify({ text, direction }),
    }),

  // WordBank — User's personal vocabulary
  getWordQueue: (token: string, status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.set('status', status);
    if (search) params.set('search', search);
    const qs = params.toString();
    return request<{ words: Array<{ word: string; translation: string; cefr_level: string; topic: string; status: string; correct_uses: number; next_review: string | null }>; total: number }>(`/wordbank/queue${qs ? '?' + qs : ''}`, { token });
  },

  getWordStats: (token: string) =>
    request<{
      total: number;
      mastered: number;
      learning: number;
      new_count: number;
      by_level: Record<string, number>;
      by_status: Record<string, number>;
      by_cefr: Record<string, number>;
      by_source: Record<string, number>;
      streak_days: number;
    }>('/wordbank/stats', { token }),

  addWordsToBank: (token: string, words: Array<{ word: string; translation?: string; phonetic?: string; part_of_speech?: string; cefr_level?: string; example_sentence?: string; example_translation?: string; topic_tags?: string[]; source?: string }>) =>
    request<{ added: number; total_in_bank: number }>('/wordbank/add-to-bank', {
      method: 'POST', token,
      body: JSON.stringify({ words }),
    }),

  updateWordProgress: (token: string, word: string, status: string) =>
    request<{ word: string; status: string; updated_at: string }>('/wordbank/progress', {
      method: 'POST', token,
      body: JSON.stringify({ word, status }),
    }),

  getPresets: (token: string) =>
    request<{ presets: Array<{ id: string; name: string; description: string; target_level: string; word_count: number; category: string }> }>('/wordbank/presets', { token }),

  getPresetWords: (token: string, presetId: string, page?: number, pageSize?: number) => {
    const params = new URLSearchParams();
    if (page) params.set('page', String(page));
    if (pageSize) params.set('page_size', String(pageSize));
    const qs = params.toString();
    return request<{ items: Array<{ lemma: string; part_of_speech: string; basic_definition: string }>; total: number; page: number; page_size: number; total_pages: number }>(`/wordbank/presets/${presetId}${qs ? '?' + qs : ''}`, { token });
  },
};

export default api;
