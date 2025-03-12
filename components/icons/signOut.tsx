import { IconColor } from '@/components/icons/index';
import { RxExit } from 'react-icons/rx';

const SignOutIcon = ({ color = IconColor.GREY, size = '24px', ...props }) => {
  return <RxExit size={size} color={color} {...props} />;
};

export { SignOutIcon };
