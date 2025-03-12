import React from 'react';
import { cn } from '@/lib/utils';
import { IoIosWarning } from 'react-icons/io';
import { Button } from '@/components/ui';
import { PiDotsThreeOutlineThin } from 'react-icons/pi';
import Link from 'next/link';

interface ErrorComponentProps {
  errorMessage?: string;
  onClick: () => void;
  buttonText: string;
  status?: string;
}

const ErrorComponent = ({ errorMessage, onClick, buttonText, status }: ErrorComponentProps) => {
  return (
    <div className="flex flex-col  item-center  mt-[72px]  w-[100%] h-[calc(100vh-72px)] bg-gray-1 overflow-hidden">
      <div className="flex flex-col gap-8 item-center justify-center w-[90%] md:w-[600px] m-auto">
        {status === '422' ? (
          <>
            <PiDotsThreeOutlineThin className={cn('w-full h-20 shrink-0  mx-auto')} />
            <h2 className={cn('w-max !text-display-xs font-medium text-gray-12 text-center mb-2')}>
              Signature does not match mainnet wallet address{' '}
            </h2>
            <div className=" text-red-9 text-center">{errorMessage}</div>
          </>
        ) : (
          <div className={cn('flex flex-col gap-3 items-center ')}>
            <IoIosWarning className={cn('w-12 h-12 shrink-0 mb-2')} />
            <h2 className={cn('w-max text-4xl font-medium text-center')}>Hmmm... Something went wrong</h2>
            <div className="text-red-9 text-center">{errorMessage}</div>
          </div>
        )}

        <p className={cn('!text-text-md font-medium text-gray-11 text-justify')}>
          Please wait a few moments and try again. If this problem persists, please go to
          <Link target="_blank" className="underline hover:text-gray-10 pl-1" href="https://support.qu.ai/">
            support.qu.ai
          </Link>{' '}
          to get help.
        </p>
        <Button variant="downloadPelagus" onClick={onClick}>
          {buttonText}
        </Button>
      </div>
    </div>
  );
};

export default ErrorComponent;
