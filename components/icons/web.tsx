import { IconColor } from '@/components/icons/index';
import { PiGlobe } from 'react-icons/pi';

const WebIcon = ({ color = IconColor.GREY, size = '24px', ...props }) => {
  return <PiGlobe size={size} color={color} {...props} />;
};

export { WebIcon };
