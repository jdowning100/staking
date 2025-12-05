'use client';
import Logo from '@/components/ui/logo';
import { requestAccounts, useGetAccounts } from '@/lib/wallet';
import { cn } from '@/lib/utils';
import IconContainer from '@/components/ui/iconContainer';
import { FaDiscord, FaXTwitter, FaTelegram } from 'react-icons/fa6';
import { PiGlobe } from 'react-icons/pi';
import Link from 'next/link';
import { useContext } from 'react';
import { DispatchContext, StateContext } from '@/store';
import { Button } from '@/components/ui/button';
import { shortenAddress } from '@/lib/utils';
import { usePathname } from 'next/navigation';
import Image from 'next/image';

export default function Header() {
  const { account, web3Provider } = useContext(StateContext);
  const dispatch = useContext(DispatchContext);
  const pathname = usePathname();
  useGetAccounts();

  const connectHandler = () => {
    requestAccounts(dispatch);
  };

  const navItems = [
    { label: 'Stake', href: '/' },
    { label: 'Portfolio', href: '/portfolio' },
    { label: 'SOAP Calculator', href: '/calculator' },
    { label: 'How to Stake', href: '/how-to-stake' },
    { label: 'What is SOAP?', href: '/what-is-soap' },
  ];

  return (
    <div className={cn('fixed top-0 left-0 w-full z-50 glass')}>
      <div
        className={cn('lg:px-8 md:pr-8 px-3 sm:px-4 flex flex-col', {
          'w-full ': true,
        })}
      >
        <div className="flex py-2 justify-between items-center gap-2">
          <div className="min-w-[120px]"><Logo /></div>
          <div className={cn('flex gap-1 sm:gap-2 items-center ml-auto')}>
            <Link target="_blank" href="https://x.com/QuaiNetwork">
              <IconContainer className="p-1.5" icon={<FaXTwitter />} />
            </Link>
            <Link target="_blank" href="https://discord.gg/quai">
              <IconContainer className="p-1.5" icon={<FaDiscord />} />
            </Link>
            <Link target="_blank" href="https://t.me/QuaiNetwork">
              <IconContainer className="p-1.5" icon={<FaTelegram />} />
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
                  <div className="flex items-center gap-2">
                    <p className="text-white text-sm sm:text-md font-semibold hidden sm:block">Cyprus-1</p>
                    <p className="text-gray-300 font-light">{shortenAddress(account.addr)}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Image
                      src="/images/pelagus-logo.png"
                      alt="Pelagus"
                      width={20}
                      height={20}
                      className="rounded-sm"
                    />
                    Connect
                  </div>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4 pb-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'text-xs sm:text-sm font-medium transition-colors hover:text-red-9 pb-2 border-b-2 border-transparent',
                {
                  'text-red-9 border-red-9': pathname === item.href,
                  'text-[#999999]': pathname !== item.href,
                }
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
