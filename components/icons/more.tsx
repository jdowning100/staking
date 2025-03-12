import { IconColor } from '@/components/icons/index';
import { HiOutlineDotsVertical } from 'react-icons/hi';

const MoreIcon = ({ color = IconColor.GREY, size = '24px', ...props }) => {
  return <HiOutlineDotsVertical size={size} color={color} {...props} />;
};

export { MoreIcon };
