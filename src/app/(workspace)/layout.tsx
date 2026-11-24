import { Suspense } from 'react';
import { TimesApp } from '@/components/times-app';

const Layout = ({ children }: { children: React.ReactNode }) => (
  <Suspense
    fallback={
      <div className='flex h-dvh items-center justify-center' role='status'>
        読み込み中…
      </div>
    }
  >
    <TimesApp>{children}</TimesApp>
  </Suspense>
);

export default Layout;
