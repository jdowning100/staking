import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'w-full inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 duration-200 select-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        downloadPelagus:
          'border rounded-lg border-border hover:border-border hover:bg-gray-7 active:border-accent accent-active-gradient active:text-border',
        connectWallet:
          'bg-gray-1 rounded-lg border border-gray-1 hover:bg-red-6 hover:border-red-9 active:bg-red-10 active:border-red-10',
        connectWalletV2:
          'bg-red-9 text-md border border-red-9 hover:bg-red-6 active:bg-red-5 active:border-red-5 active:text-red-11',
        submitButtonV2: 'rounded-lg bg-gray-8 text-gray-12 hover:bg-gray-9 active:bg-gray-10 font-medium',
        submitButtonV3:
          'bg-red-9 text-md border border-red-9 hover:bg-red-6 active:bg-red-5 active:border-red-5 disabled:bg-gray-10 disabled:border-0 active:text-red-11',
        submitButton: 'rounded-lg bg-accent-gradient text-border hover:text-white hover:bg-gray-8 active:text-border',
        iconButton: 'rounded-lg',
        selectedIconButton: 'rounded-lg bg-accent',
        nightModeButton: 'rounded-lg border-accent border hover:bg-accent',
        selectedNightModeButton: 'rounded-lg border-border border bg-border',
        dropdownTrigger: 'data-[state=open]:bg-accent hover:bg-accent',
        addNewAddress: '',
        kyc: 'bg-red-9 text-md border border-red-9 hover:bg-red-6 active:bg-red-5 active:border-red-5 active:text-red-11 text-text-sm rounded',
        learnMore: 'border border-gray-9 rounded text-text-sm hover:bg-red-10 active:bg-red-10',
      },
      size: {
        default: 'h-12 px-[25px] py-2.5',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'p-[7px] h-10 w-10',
        kyc: 'h-10 px-6 py-2.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
