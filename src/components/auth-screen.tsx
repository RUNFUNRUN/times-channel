'use client';

import { Hash, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { AppearanceDialog } from '@/components/appearance-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';

export const AuthScreen = () => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email')).trim();
    const password = String(form.get('password'));
    try {
      const result =
        mode === 'signup'
          ? await authClient.signUp.email({
              email,
              password,
              name: String(form.get('name')).trim(),
            })
          : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(
          result.error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' ||
            result.error.code === 'USER_ALREADY_EXISTS'
            ? 'このメールアドレスは登録済みです。ログインしてください。'
            : mode === 'signin'
              ? 'メールアドレスまたはパスワードを確認してください。'
              : '登録できませんでした。入力内容を確認してください。',
        );
      }
    } catch {
      setError('接続できませんでした。少し待ってからお試しください。');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className='auth-page'>
      <section className='auth-form-section'>
        <div className='absolute top-5 right-5'>
          <AppearanceDialog triggerClassName='bg-background text-foreground' />
        </div>
        <div className='w-full max-w-[360px]'>
          <a
            href='/'
            className='mb-8 inline-flex items-center gap-2 text-xl font-bold text-primary'
          >
            <Hash className='size-6' />
            times
          </a>
          <h1 className='text-2xl font-bold'>
            {mode === 'signup' ? 'アカウント作成' : 'ログイン'}
          </h1>
          <p className='mt-3 text-sm leading-6 text-muted-foreground'>
            {mode === 'signup'
              ? '登録後、自分の times チャンネルが作成されます。'
              : 'メールアドレスとパスワードを入力してください。'}
          </p>
          <form onSubmit={submit} className='mt-8 space-y-5'>
            {mode === 'signup' && (
              <div className='space-y-2'>
                <label htmlFor='name' className='text-sm font-medium'>
                  表示名
                </label>
                <Input
                  id='name'
                  name='name'
                  placeholder='山田 太郎'
                  required
                  maxLength={40}
                  autoComplete='nickname'
                  className='h-11'
                />
              </div>
            )}
            <div className='space-y-2'>
              <label htmlFor='email' className='text-sm font-medium'>
                メールアドレス
              </label>
              <Input
                id='email'
                name='email'
                type='email'
                placeholder='you@company.jp'
                autoComplete='email'
                required
                maxLength={254}
                className='h-11'
              />
            </div>
            <div className='space-y-2'>
              <label htmlFor='password' className='text-sm font-medium'>
                パスワード
              </label>
              <Input
                id='password'
                name='password'
                type='password'
                placeholder='8文字以上'
                autoComplete={
                  mode === 'signup' ? 'new-password' : 'current-password'
                }
                required
                minLength={8}
                maxLength={128}
                className='h-11'
              />
            </div>
            {error && (
              <p role='alert' className='text-sm text-destructive'>
                {error}
              </p>
            )}
            <Button
              type='submit'
              disabled={pending}
              className='h-11 w-full text-sm'
            >
              {pending && <LoaderCircle className='animate-spin' />}
              {mode === 'signup' ? 'アカウントを作成' : 'ログイン'}
            </Button>
          </form>
          <div className='mt-7 border-t pt-6 text-center text-sm text-muted-foreground'>
            {mode === 'signup'
              ? 'すでにアカウントをお持ちですか？'
              : 'アカウントをお持ちでない方'}
            <button
              type='button'
              className='ml-2 font-semibold text-primary hover:underline'
              onClick={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup');
                setError('');
              }}
            >
              {mode === 'signup' ? 'ログイン' : '新規登録'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
};
