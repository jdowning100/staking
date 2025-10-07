'use client';
import Logo from '@/components/ui/logo';
import { requestAccounts, useGetAccounts } from '@/lib/wallet';
import { cn } from '@/lib/utils';
import IconContainer from '@/components/ui/iconContainer';
import { FaDiscord, FaXTwitter } from 'react-icons/fa6';
import { PiGlobe } from 'react-icons/pi';
import MarqueeTextLine from '@/components/ui/marqueeTextLine';
import Link from 'next/link';
import { useContext } from 'react';
import { DispatchContext, StateContext } from '@/store';
import { Button } from '@/components/ui/button';
import { shortenAddress } from '@/lib/utils';

export default function Header() {
  const { account, web3Provider } = useContext(StateContext);
  const dispatch = useContext(DispatchContext);
  useGetAccounts();

  const connectHandler = () => {
    requestAccounts(dispatch);
  };

  return (
    <div className={cn('fixed top-0 left-0 bg-gray-1 w-full z-50')}>
      <div
        className={cn('lg:px-8 md:pr-8 px-4 flex py-2', {
          'w-full ': true,
          'justify-between': true,
        })}
      >
        <Logo />
        <div className={cn('flex gap-2 items-center ml-auto')}>
          <Link target="_blank" href="https://x.com/QuaiNetwork">
            <IconContainer className="p-1.5" icon={<FaXTwitter />} />
          </Link>
          <Link target="_blank" href="https://discord.gg/quai">
            <IconContainer className="p-1.5" icon={<FaDiscord />} />
          </Link>
          <Link target="_blank" href="https://qu.ai">
            <IconContainer className="p-1.5" icon={<PiGlobe />} />
          </Link>
          {web3Provider === undefined ? (
            <a href="https://chromewebstore.google.com/detail/pelagus/nhccebmfjcbhghphpclcfdkkekheegop" target="_blank">
              <Button variant="downloadPelagus" size="sm" onClick={connectHandler} disabled={!!account}>
                Install Pelagus
              </Button>
            </a>
          ) : (
            <Button variant="downloadPelagus" size="sm" onClick={connectHandler} disabled={!!account}>
              {account ? (
                <div className="flex gap-[10px]">
                  <p className="text-white text-md font-semibold">Cyprus-1</p>
                  <p className="text-gray-300 font-light">{shortenAddress(account.addr)}</p>
                </div>
              ) : (
                'Connect'
              )}
            </Button>
          )}
        </div>
      </div>

      <MarqueeTextLine text="/ quai network token staking / stake your quai and claim your rewards /" />
    </div>
  );
}
