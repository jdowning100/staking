import { IconColor } from '@/components/icons/index';
import { GoPeople } from 'react-icons/go';

const PeopleIcon = ({ color = IconColor.GREY, size = '24px', ...props }) => {
  return <GoPeople size={size} color={color} {...props} />;
};

export { PeopleIcon };
