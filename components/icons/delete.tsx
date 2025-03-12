import { IconColor } from '@/components/icons/index';
import { IoTrashOutline } from 'react-icons/io5';

const DeleteIcon = ({ color = IconColor.GREY, size = '24px', ...props }) => {
  return <IoTrashOutline size={size} color={color} {...props} />;
};

export { DeleteIcon };
