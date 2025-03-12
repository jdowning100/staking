import { IconColor } from '@/components/icons/index';
import { IoClose } from 'react-icons/io5';

const ExitIcon = ({ color = IconColor.GREY, size = '24px', ...props }) => {
  return <IoClose size={size} color={color} {...props} />;
};

export { ExitIcon };
