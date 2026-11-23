'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { avatarObjectKey } from '@/lib/profile';
import { cn } from '@/lib/utils';

const colors = [
  'bg-[#e1d4ec] text-[#69417e]',
  'bg-[#d4e9e2] text-[#326953]',
  'bg-[#dce5f5] text-[#425b84]',
  'bg-[#f2dccf] text-[#8c583e]',
];
export const UserAvatar = ({
  name,
  className,
  image,
}: {
  name: string;
  image?: string | null;
  className?: string;
}) => {
  const color =
    colors[
      Array.from(name).reduce(
        (sum, character) => sum + (character.codePointAt(0) ?? 0),
        0,
      ) % colors.length
    ];
  return (
    <Avatar className={cn('size-10 rounded-lg after:rounded-lg', className)}>
      {image && (avatarObjectKey(image) || image.startsWith('blob:')) && (
        <AvatarImage src={image} alt='' className='rounded-lg' />
      )}
      <AvatarFallback className={cn('rounded-lg font-semibold', color)}>
        {Array.from(name.trim()).slice(0, 2).join('').toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
};
