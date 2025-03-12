import { IconColor } from '@/components/icons/index';
import { IoChevronDown } from 'react-icons/io5';

const ArrowIcon = ({ color = IconColor.GREY, size = '24px', ...props }) => {
  return <IoChevronDown size={size} color={color} {...props} />;
};

export { ArrowIcon };
