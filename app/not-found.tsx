'use client';

import { useRouter } from 'next/navigation';
import ErrorComponent from '@/components/errorComponent/ErrorComponent';
import { useCallback } from 'react';
export default function NotFound() {
  const { replace } = useRouter();

  const relocateToHomePage = useCallback(() => {
    replace('/');
  }, []);

  return (
    <ErrorComponent errorMessage="Error 404 // Page_not_found" onClick={relocateToHomePage} buttonText="Go Back" />
  );
}
