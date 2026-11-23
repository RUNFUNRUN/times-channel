'use client';

import { Download, FileText } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { Message } from '@/lib/api-client';
import { formatFileSize } from '@/lib/files';

type Attachment = Message['attachments'][number];

const AttachedFile = ({ file }: { file: Attachment }) => {
  const [failed, setFailed] = useState(false);
  const url = `/api/uploads/${file.id}`;
  const image = file.contentType.startsWith('image/') && !failed;
  return (
    <div className='max-w-[420px] overflow-hidden rounded-lg border bg-background'>
      {image && (
        <Dialog>
          <DialogTrigger asChild>
            <button
              type='button'
              className='block w-full bg-muted/30 text-left'
              aria-label={`${file.name} を拡大表示`}
            >
              <Image
                unoptimized
                width={840}
                height={630}
                src={url}
                alt={file.name}
                loading='lazy'
                className='max-h-64 w-full object-contain'
                onError={() => setFailed(true)}
              />
            </button>
          </DialogTrigger>
          <DialogContent className='w-[calc(100%-2rem)] sm:max-w-4xl'>
            <DialogHeader>
              <DialogTitle className='truncate pr-6'>{file.name}</DialogTitle>
              <DialogDescription>{formatFileSize(file.size)}</DialogDescription>
            </DialogHeader>
            <Image
              unoptimized
              width={1600}
              height={1200}
              src={url}
              alt={file.name}
              className='max-h-[70dvh] w-full object-contain'
            />
            <Button variant='outline' asChild className='w-fit'>
              <a href={`${url}?download=1`} download={file.name}>
                <Download />
                ダウンロード
              </a>
            </Button>
          </DialogContent>
        </Dialog>
      )}
      <a
        href={`${url}?download=1`}
        download={file.name}
        aria-label={`${file.name} をダウンロード`}
        className='flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50'
      >
        <FileText className='size-6 shrink-0 text-primary' />
        <div className='min-w-0 flex-1'>
          <p className='truncate text-sm font-medium'>{file.name}</p>
          <p className='mt-0.5 text-xs text-muted-foreground'>
            {formatFileSize(file.size)}
          </p>
        </div>
        <Download className='size-4 shrink-0 text-muted-foreground' />
      </a>
    </div>
  );
};

export const MessageAttachments = ({ files }: { files: Attachment[] }) =>
  files.length > 0 && (
    <div className='mt-3 grid max-w-full gap-3'>
      {files.map((file) => (
        <AttachedFile key={file.id} file={file} />
      ))}
    </div>
  );
