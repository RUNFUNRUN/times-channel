'use client';

import { Check, Link as LinkIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export const ShareLink = ({ path, label }: { path: string; label: string }) => {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <Button
        size='icon-sm'
        variant='ghost'
        aria-label={label}
        title={label}
        onClick={() => {
          setUrl(new URL(path, window.location.origin).href);
          setCopied(false);
          setError('');
          setOpen(true);
        }}
      >
        <LinkIcon />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              リンクを見るには times へのログインが必要です。
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label='共有リンク'
            value={url}
            readOnly
            onFocus={(event) => event.target.select()}
          />
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setError('');
              } catch {
                setError(
                  'コピーできませんでした。リンクを選択してコピーしてください。',
                );
              }
            }}
          >
            {copied ? <Check /> : <LinkIcon />}
            {copied ? 'コピーしました' : 'リンクをコピー'}
          </Button>
          <p className='sr-only' role='status'>
            {copied ? 'リンクをコピーしました' : ''}
          </p>
          {error && (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
