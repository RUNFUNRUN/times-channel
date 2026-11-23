export const AVATAR_MAX_SIZE = 2 * 1024 * 1024;
export const avatarObjectKey = (image: string | null | undefined) => {
  const match = /^\/api\/profile\/avatar\/([a-f0-9-]{36})$/.exec(image ?? '');
  return match ? `avatars/${match[1]}` : null;
};
