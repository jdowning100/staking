import { Button } from '@/components/ui/button';

const WalletNotification = () => {
  return (
    <div
      className={`flex flex-col lg:flex-row lg:justify-between lg:items-center max-w-[1376px] rounded-[8px] border-[1px] border-[#131313] bg-[#313131] gap-[24px] py-[12px] px-[16px]`}
    >
      <div className="flex gap-4 items-center">
        <svg
          className="hidden lg:block"
          xmlns="http://www.w3.org/2000/svg"
          width="40"
          height="41"
          viewBox="0 0 40 41"
          fill="none"
        >
          <circle cx="20" cy="20.5625" r="19.5" fill="#303030" />
          <circle cx="20" cy="20.5625" r="19.5" fill="black" fill-opacity="0.2" />
          <circle cx="20" cy="20.5625" r="19.5" stroke="#6E6E6E" />
        </svg>
        <div className="flex flex-col gap-2">
          <p className="text-md lg:text-lg text-gray-12 font-bold">
            You must connect a mainnet wallet for your rewards to be claimed.
          </p>
          <p className="text-xs lg:text-sm text-gray-11 font-medium">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam eu turpis molestie, dictum est a
          </p>
        </div>
      </div>

      <div className="flex lg:justify-between gap-2">
        <Button variant={'downloadPelagus'}>Download Pelagus</Button>
        <Button variant={'connectWallet'}>Connect Wallet</Button>
      </div>
    </div>
  );
};

export default WalletNotification;
