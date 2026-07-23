import { RequestError } from '@/hooks/use-api';

type ShouldRetryOnErrorOptions = {
  ignore?: number[];
};

export const shouldRetryOnError =
  ({ ignore = [] }: ShouldRetryOnErrorOptions = {}) =>
  (error: unknown): boolean => {
    if (error instanceof RequestError) {
      return !ignore.includes(error.status);
    }
    return true;
  };
