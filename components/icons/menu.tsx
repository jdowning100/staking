import { IconColor } from '@/components/icons/index';
import { HiMenu } from 'react-icons/hi';

const MenuIcon = ({ color = IconColor.GREY, size = '24px', ...props }) => {
  return <HiMenu size={size} color={color} {...props} />;
};

export { MenuIcon };
