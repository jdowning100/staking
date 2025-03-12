import { cn } from '@/lib/utils';
import { IconColor } from '@/components/icons';
import React from 'react';

interface IconContainerProps {
  icon: React.ReactElement;
  className?: string;
  color?: IconColor;
  size?: string;
  onClick?: () => void;
}

export default function IconContainer({
  icon,
  className,
  color = IconColor.GREY,
  size = '24px',
  ...props
}: IconContainerProps) {
  const iconWithProps = React.cloneElement(icon, {
    color: color,
    size: size,
    ...props,
  });

  return (
    <div
      className={cn(
        `p-2 border border-gray-8 rounded-lg cursor-pointer hover:bg-gray-5 active:bg-gray-6 duration-300 ${className}`
      )}
      {...props}
    >
      {iconWithProps}
    </div>
  );
}
