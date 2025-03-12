import { useMemo } from 'react';

type TestNetProps = {
  variant?: 'variant' | 'variant2' | 'variant3' | 'variant4';
};

const TestNet = ({ variant }: TestNetProps) => {
  const variantComponent = useMemo(() => {
    switch (variant) {
      case 'variant4':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 25 25" fill="none">
            <path
              d="M5.94969 19.5164L0.981689 6.3584H3.42969L6.30969 13.9364C6.45369 14.3204 6.59169 14.7224 6.72369 15.1424C6.85569 15.5624 6.99369 16.0364 7.13769 16.5644C7.29369 15.9884 7.44369 15.4904 7.58769 15.0704C7.73169 14.6504 7.86369 14.2724 7.98369 13.9364L10.8277 6.3584H13.2217L8.32569 19.5164H5.94969Z"
              fill="#7B7B7B"
            />
            <path d="M16.7447 6.3584V19.5164H14.4407V6.3584H16.7447Z" fill="#7B7B7B" />
            <path d="M20.69 6.3584V19.5164H18.386V6.3584H20.69Z" fill="#7B7B7B" />
            <path d="M24.6353 6.3584V19.5164H22.3313V6.3584H24.6353Z" fill="#7B7B7B" />
          </svg>
        );
      case 'variant3':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 25 25" fill="none">
            <path d="M10.0149 6.3584V19.5164H7.71094V6.3584H10.0149Z" fill="#7B7B7B" />
            <path d="M13.9602 6.3584V19.5164H11.6562V6.3584H13.9602Z" fill="#7B7B7B" />
            <path d="M17.9056 6.3584V19.5164H15.6016V6.3584H17.9056Z" fill="#7B7B7B" />
          </svg>
        );
      case 'variant2':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 25 25" fill="none">
            <path d="M11.9876 6.3584V19.5164H9.68359V6.3584H11.9876Z" fill="#7B7B7B" />
            <path d="M15.9329 6.3584V19.5164H13.6289V6.3584H15.9329Z" fill="#7B7B7B" />
          </svg>
        );
      default:
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 25 25" fill="none">
            <path d="M13.9603 6.3584V19.5164H11.6562V6.3584H13.9603Z" fill="#7B7B7B" />
          </svg>
        );
    }
  }, [variant]);

  return (
    <div
      className={`flex items-center justify-center border-[1px] border-solid border-[#313131] rounded-full h-[40px] w-[40px] bg-[#131313]`}
    >
      {variantComponent}
    </div>
  );
};

export default TestNet;
