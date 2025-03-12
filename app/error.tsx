'use client';

import ErrorComponent from '@/components/errorComponent/ErrorComponent';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

const GetErrorPages = (status: string) => {
  const { replace } = useRouter();

  const relocateToHomePage = useCallback(() => {
    replace('/');
  }, []);

  switch (status) {
    case '500':
      return (
        <ErrorComponent errorMessage="Error 500 // Server Error" buttonText="Try Again" onClick={relocateToHomePage} />
      );
    case '401':
      return (
        <ErrorComponent
          errorMessage="Error 401 // You are not authenticated"
          onClick={relocateToHomePage}
          buttonText="Go Back"
        />
      );
    case '422':
      return (
        <ErrorComponent
          errorMessage="Signature does not match mainnet wallet address"
          onClick={relocateToHomePage}
          buttonText="Go Back"
          status={status}
        />
      );
    default:
      return <ErrorComponent onClick={relocateToHomePage} buttonText="Go Back" />;
  }
};

export default function Error({ error }: { error: Error & { digest?: string } }) {
  return GetErrorPages(error.message);
}
