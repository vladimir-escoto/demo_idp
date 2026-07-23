import { useCallback } from 'react';

const documentationSiteUrl = 'https://docs.logto.io';

const useDocumentationUrl = () => {
  const getDocumentationUrl = useCallback(
    (pathname: string) =>
      pathname.startsWith('http')
        ? pathname
        : `${documentationSiteUrl}${pathname.startsWith('/') ? '' : '/'}${pathname}`,
    []
  );

  return { documentationSiteUrl, getDocumentationUrl };
};

export default useDocumentationUrl;
