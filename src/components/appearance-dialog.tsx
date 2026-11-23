'use client';

import { Check, Hash, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAppearance } from '@/components/appearance-provider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { type Appearance, COLORS } from '@/lib/appearance';
import { cn } from '@/lib/utils';

const modes = [
  { value: 'light', label: 'ライト', icon: Sun },
  { value: 'dark', label: 'ダーク', icon: Moon },
  { value: 'system', label: 'システム', icon: Monitor },
] as const;

export const AppearanceDialog = ({
  triggerClassName,
}: {
  triggerClassName?: string;
}) => {
  const { appearance, setAppearance } = useAppearance();
  const { theme, setTheme } = useTheme();
  const change = (next: Partial<Appearance>) =>
    setAppearance({ ...appearance, ...next });
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className={triggerClassName}
          aria-label='テーマ設定'
        >
          <Palette className='size-4' />
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-[440px]'>
        <DialogHeader>
          <DialogTitle>テーマ設定</DialogTitle>
          <DialogDescription>
            画面の明るさとテーマカラーを選べます。設定はこのブラウザーに保存されます。
          </DialogDescription>
        </DialogHeader>
        <fieldset className='mt-2'>
          <legend className='mb-3 text-sm font-semibold'>表示モード</legend>
          <div className='grid grid-cols-3 gap-3'>
            {modes.map(({ value, label, icon: Icon }) => (
              <label
                key={value}
                className={cn(
                  'appearance-option',
                  theme === value && 'selected',
                )}
              >
                <input
                  className='sr-only'
                  type='radio'
                  name='appearance-mode'
                  value={value}
                  checked={theme === value}
                  onChange={() => setTheme(value)}
                />
                <Icon className='size-5' />
                <span>{label}</span>
                {theme === value && (
                  <Check className='absolute top-2 right-2 size-3' />
                )}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className='mt-3'>
          <legend className='mb-3 text-sm font-semibold'>テーマカラー</legend>
          <div className='grid grid-cols-3 gap-3'>
            {COLORS.map(({ value, label, swatch }) => (
              <label
                key={value}
                className={cn(
                  'appearance-color',
                  appearance.color === value && 'selected',
                )}
              >
                <input
                  className='sr-only'
                  type='radio'
                  name='appearance-color'
                  value={value}
                  checked={appearance.color === value}
                  onChange={() => change({ color: value })}
                />
                <span
                  style={{ background: swatch }}
                  className='flex size-7 items-center justify-center rounded-full text-white'
                >
                  {appearance.color === value && <Check className='size-4' />}
                </span>
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className='appearance-preview mt-4'>
          <div className='appearance-preview-sidebar'>
            <Hash className='size-5' />
            <span>times</span>
            <span className='rounded bg-white/15 px-2 py-1'># general</span>
          </div>
          <div className='min-w-0 flex-1 px-4 py-5'>
            <div className='mb-2 text-sm font-bold'>メッセージ</div>
            <p className='text-xs leading-6 text-muted-foreground'>
              メッセージの表示例
            </p>
            <div className='mt-3 h-2 w-2/3 rounded-full bg-primary/20' />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
