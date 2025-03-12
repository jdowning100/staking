import Image from 'next/image';

import LogoImageMobile from '@/public/images/logo_mobile.svg';
import LogoImage from '@/public/images/logo.svg';

const Logo = () => {
  return (
    <>
      <Image className="min-[475px]:hidden" src={LogoImageMobile} alt="logo" priority />
      <Image className="hidden min-[475px]:block" src={LogoImage} alt="logo" priority />
    </>
  );
};

export default Logo;
