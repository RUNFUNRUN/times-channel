'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ApiResponse, readResponse } from '@/lib/api-client';

export const useMessageAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: () => Promise<ApiResponse>) =>
      readResponse<unknown>(await request()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
      void queryClient.invalidateQueries({ queryKey: ['thread'] });
    },
  });
};
